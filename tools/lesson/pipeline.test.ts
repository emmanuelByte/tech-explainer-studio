import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { TECHNICAL_COMPONENT_KINDS } from '../../src/types'
import type { ComponentArtwork } from '../../src/domains/lesson-spec/compile'
import type { LessonSpec } from '../../src/domains/lesson-spec/types'
import { narrateLesson } from './narrate'
import { produce, StageError, type ProduceDeps, type ProduceOptions } from './pipeline'
import { expectedVideo, type Probe } from './render'
import { stillsDir } from './stills'
import { encodeWav } from './wav'

let root: string
beforeEach(async () => { root = await mkdtemp(resolve(tmpdir(), 'produce-')) })
afterEach(async () => { await rm(root, { recursive: true, force: true }) })

const artwork = Object.fromEntries(TECHNICAL_COMPONENT_KINDS.map((kind) => [kind, '<svg xmlns="http://www.w3.org/2000/svg"/>'])) as ComponentArtwork

function voice(text: string) {
  const samples = Math.round(Math.max(0.6, text.length / 15) * 8000)
  const data = Buffer.alloc(samples * 2)
  for (let i = 0; i < samples; i += 1) data.writeInt16LE(Math.round(Math.sin(i / 9) * 8000), i * 2)
  return encodeWav({ format: 1, channels: 1, sampleRate: 8000, bitsPerSample: 16, data })
}

const lesson = (first = 'A client sends a request to the server.'): LessonSpec => ({
  version: 1, id: 'demo', title: 'Demo',
  nodes: [{ id: 'c', kind: 'client', label: 'Client' }, { id: 's', kind: 'server', label: 'Server' }],
  edges: [{ id: 'c-s', from: 'c', to: 's' }],
  scenes: [
    { id: 'one', title: 'One', narration: first, reveal: ['c'] },
    { id: 'two', title: 'Two', narration: 'The server answers it.', reveal: ['s', 'c-s'] },
  ],
})

interface Calls { narrate: number; stills: number; render: number }
let inspectProblems: string[] = []

function setup(options: { failRenderTimes?: number } = {}) {
  const calls: Calls = { narrate: 0, stills: 0, render: 0 }
  let failures = options.failRenderTimes ?? 0
  const deps: ProduceDeps = {
    loadArtwork: async () => artwork,
    workerHealthy: async () => true,
    narrate: async (spec, opts) => { calls.narrate += 1; return narrateLesson(spec, { ...opts, generate: async (text) => voice(text) }) },
    renderStills: async (rootDir, _path, project) => {
      calls.stills += 1
      await mkdir(stillsDir(rootDir, project.id), { recursive: true })
      for (const [i, scene] of (project.scenes ?? []).entries()) await writeFile(resolve(stillsDir(rootDir, project.id), `${i}-${scene.id}.png`), 'png')
      return []
    },
    renderVideo: async (_root, input) => {
      calls.render += 1
      if (failures > 0) { failures -= 1; throw new Error('remotion crashed') }
      await writeFile(input.outPath, JSON.stringify({ project: input.projectPath, quality: input.quality }))
    },
    inspectVideo: async () => inspectProblems,
    contactSheet: async () => undefined,
    probeVideo: async (_root, file) => {
      const { project, quality } = JSON.parse(await readFile(file, 'utf-8')) as { project: string; quality: 'standard' }
      const built = JSON.parse(await readFile(project, 'utf-8')) as { canvas: { width: number; height: number; fps: number; durationFrames: number }; layers: { type: string }[] }
      const hasAudio = built.layers.some((layer) => layer.type === 'audio')
      const want = expectedVideo(built.canvas, quality, hasAudio)
      return {
        streams: [{ codec_type: 'video', codec_name: 'h264', width: want.width, height: want.height, r_frame_rate: `${want.fps}/1`, pix_fmt: 'yuv420p' }, ...(hasAudio ? [{ codec_type: 'audio', codec_name: 'aac' }] : [])],
        format: { duration: String(want.durationFrames / want.fps) },
      } satisfies Probe
    },
  }
  const run = async (spec: LessonSpec, over: Partial<ProduceOptions> = {}) => {
    const specPath = resolve(root, 'demo.lesson.json')
    await writeFile(specPath, JSON.stringify(spec))
    return produce({
      root, specPath, aspects: ['16:9'], voice: 'v', exaggeration: 0.5, cfgWeight: 0.5, workerUrl: 'http://worker', narration: 'local',
      quality: 'standard', stills: true, force: false, allowLintErrors: false, log: () => undefined, ...over,
    }, deps)
  }
  return { calls, run }
}

describe('produce', () => {
  it('runs every stage the first time and reuses them all the second', async () => {
    const { calls, run } = setup()
    const [first] = await run(lesson())
    expect(first.ran).toEqual(['narrate', 'build', 'stills', 'render'])
    expect(first.projectId).toBe('lesson_demo')
    const [second] = await run(lesson())
    expect(second.ran).toEqual([])
    expect(second.reused).toEqual(['narrate', 'build', 'stills', 'render'])
    expect(calls).toEqual({ narrate: 1, stills: 1, render: 1 })
  })

  it('reuses the narration when only the theme changes, and redoes the visuals', async () => {
    const { calls, run } = setup()
    await run(lesson(), { theme: 'dark-sketch' })
    const [again] = await run(lesson(), { theme: 'clean-technical' })
    expect(calls.narrate).toBe(1)
    expect(again.reused).toContain('narrate')
    expect(again.ran).toEqual(['build', 'stills', 'render'])
  })

  it('renders each aspect ratio under its own id without repeating the narration', async () => {
    const { calls, run } = setup()
    const results = await run(lesson(), { aspects: ['16:9', '9:16'] })
    expect(results.map((r) => r.projectId)).toEqual(['lesson_demo', 'lesson_demo-9x16'])
    expect(new Set(results.map((r) => r.videoPath)).size).toBe(2)
    expect(calls.narrate).toBe(1)
    expect(calls.render).toBe(2)
  })

  it('invalidates narration and everything after it when the narration text changes', async () => {
    const { calls, run } = setup()
    await run(lesson())
    const [changed] = await run(lesson('A browser sends a request to the server.'))
    expect(calls.narrate).toBe(2)
    expect(changed.ran).toEqual(['narrate', 'build', 'stills', 'render'])
  })

  it('re-renders only when the quality changes', async () => {
    const { calls, run } = setup()
    await run(lesson())
    const [draft] = await run(lesson(), { quality: 'draft' })
    expect(draft.ran).toEqual(['render'])
    expect(calls.stills).toBe(1)
  })

  it('resumes at the failed stage after a crash, keeping earlier work', async () => {
    const { calls, run } = setup({ failRenderTimes: 1 })
    await expect(run(lesson())).rejects.toMatchObject({ stage: 'render' })
    const [resumed] = await run(lesson())
    expect(resumed.reused).toEqual(['narrate', 'build', 'stills'])
    expect(resumed.ran).toEqual(['render'])
    expect(calls).toEqual({ narrate: 1, stills: 1, render: 2 })
  })

  it('does not trust a missing output: a deleted video is rendered again', async () => {
    const { calls, run } = setup()
    const [first] = await run(lesson())
    await rm(first.videoPath)
    await run(lesson())
    expect(calls.render).toBe(2)
  })

  it('--force redoes every stage', async () => {
    const { calls, run } = setup()
    await run(lesson())
    await run(lesson(), { force: true })
    expect(calls).toEqual({ narrate: 2, stills: 2, render: 2 })
  })

  it('makes a silent video without calling the voice worker', async () => {
    const { calls, run } = setup()
    const [silent] = await run(lesson(), { narration: 'none' })
    expect(calls.narrate).toBe(0)
    expect(silent.ran).toContain('build')
  })

  it('explains how to start the worker when it is not running', async () => {
    const specPath = resolve(root, 'dead.lesson.json')
    await writeFile(specPath, JSON.stringify(lesson()))
    const deps = { loadArtwork: async () => artwork, workerHealthy: async () => false } as unknown as ProduceDeps
    const error = await produce({
      root, specPath, aspects: ['16:9'], voice: 'v', exaggeration: 0.5, cfgWeight: 0.5, workerUrl: 'http://worker', narration: 'local',
      quality: 'standard', stills: false, force: false, allowLintErrors: false, log: () => undefined,
    }, deps).catch((e: unknown) => e)
    expect((error as StageError).stage).toBe('narrate')
    expect((error as StageError).hint).toContain('uvicorn')
  })

  it('fails the run when the decoded video has a blank scene or missing captions', async () => {
    const { run } = setup()
    inspectProblems = ['scene one at 2.5s is blank (nothing drawn).']
    try {
      const error = await run(lesson()).catch((e: unknown) => e)
      expect(error).toBeInstanceOf(StageError)
      expect((error as StageError).stage).toBe('inspect')
      expect((error as StageError).message).toContain('blank')
    } finally { inspectProblems = [] }
  })

  it('stops with a useful message when the spec is invalid', async () => {
    const { run } = setup()
    const bad = lesson()
    bad.scenes[1].reveal = ['nope']
    const error = await run(bad).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(StageError)
    expect((error as StageError).stage).toBe('validate')
    expect((error as StageError).message).toContain('nope')
    expect((error as StageError).hint).toContain('demo.lesson.json')
  })
})
