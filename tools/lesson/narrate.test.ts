import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { LessonSpec } from '../../src/domains/lesson-spec/types'
import { assertNarrationAssets, loadNarrationManifest, narrateLesson, pruneNarrationAssets, type NarrateOptions } from './narrate'
import { encodeWav } from './wav'

let root: string
beforeEach(async () => { root = await mkdtemp(resolve(tmpdir(), 'narrate-')) })
afterEach(async () => { await rm(root, { recursive: true, force: true }) })

/** A tone whose length follows the text, so different phrases give different audio. */
function fakeVoice(text: string) {
  const seconds = Math.max(0.5, text.length / 15)
  const samples = Math.round(seconds * 8000)
  const data = Buffer.alloc(samples * 2)
  for (let i = 0; i < samples; i += 1) data.writeInt16LE(Math.round(Math.sin(i / (5 + text.length % 7)) * 9000), i * 2)
  return encodeWav({ format: 1, channels: 1, sampleRate: 8000, bitsPerSample: 16, data })
}

const lesson = (id: string, first: string, second: string): LessonSpec => ({
  version: 1, id, title: id,
  nodes: [{ id: 'a', kind: 'client', label: 'A' }],
  edges: [],
  scenes: [
    { id: 'one', title: 'One', narration: first, durationSeconds: 5, reveal: ['a'] },
    { id: 'two', title: 'Two', narration: second, durationSeconds: 5 },
  ],
})

const options = (generate?: NarrateOptions['generate']): NarrateOptions => ({
  root, workerUrl: 'unused', voice: 'v', exaggeration: 0.5, cfgWeight: 0.5, log: () => undefined,
  generate: generate ?? (async (text) => fakeVoice(text)),
})

const wavFiles = async () => (await readdir(resolve(root, 'data', 'assets', 'files'))).filter((name) => name.endsWith('.wav')).sort()
const indexIds = async () => (JSON.parse(await readFile(resolve(root, 'data', 'assets', 'index.json'), 'utf-8')) as { id: string }[]).map((a) => a.id).sort()

describe('narration timing', () => {
  const uniform: NarrateOptions['align'] = async (items) => items.map((item) => ({
    error: null,
    words: item.text.split(' ').map((text, index) => ({ text, start: 0.05 + index * 0.4, end: 0.05 + index * 0.4 + 0.3, score: 0.95 })),
  }))
  const spoken: string[] = []
  const recording: NarrateOptions['generate'] = async (text) => { spoken.push(text); return fakeVoice(text) }

  it('speaks whole sentences and takes cue times from the aligned words', async () => {
    spoken.length = 0
    const spec = lesson('t', 'The client asks [[server]]the server for data today. It answers back very quickly today.', 'Short scene here, then done.')
    spec.scenes[0].reveal = ['a']
    const manifest = await narrateLesson(spec, { ...options(recording), align: uniform })
    expect(spoken).toContain('The client asks the server for data today.')
    expect(spoken.some((text) => text === 'The client asks')).toBe(false)
    const scene = manifest.scenes.one
    expect(scene.words!.every((word) => word.timing === 'aligned')).toBe(true)
    expect(scene.cues.server).toBe(scene.words![3].start)
    // Words are in order and inside the audio.
    for (let i = 1; i < scene.words!.length; i += 1) expect(scene.words![i].start).toBeGreaterThanOrEqual(scene.words![i - 1].start)
    expect(scene.words![scene.words!.length - 1].end).toBeLessThanOrEqual(scene.durationSeconds + 0.01)
  })

  it('marks words estimated, not aligned, when the aligner is unavailable or untrustworthy', async () => {
    const none = await narrateLesson(lesson('t2', 'First sentence is here today. Second one follows right after.', 'Another short scene to say.'), { ...options(), align: async () => undefined })
    expect(none.scenes.one.words!.every((word) => word.timing === 'estimated')).toBe(true)
    const lowScore: NarrateOptions['align'] = async (items) => items.map((item) => ({ error: null, words: item.text.split(' ').map((text, i) => ({ text, start: i * 0.3, end: i * 0.3 + 0.2, score: 0.05 })) }))
    const bad = await narrateLesson(lesson('t3', 'First sentence is here today. Second one follows right after.', 'Another short scene to say.'), { ...options(), align: lowScore })
    expect(bad.scenes.one.words!.every((word) => word.timing === 'estimated')).toBe(true)
  })

  it('places a pause between sentences and evens out loudness', async () => {
    const manifest = await narrateLesson(lesson('t4', 'First sentence is here today. Second one follows right after.', 'Another short scene to say.'), { ...options(), align: uniform })
    const words = manifest.scenes.one.words!
    const firstEnd = words.findIndex((word) => word.text === 'today.')
    expect(words[firstEnd + 1].start - words[firstEnd].end).toBeGreaterThan(0.25)
  })
})

describe('narration commit', () => {
  it('keeps the last working audio when a regeneration fails part-way', async () => {
    const first = await narrateLesson(lesson('x', 'The client sends a request out.', 'The server answers it back.'), options())
    const failing = options(async (text) => {
      if (text.includes('answers')) throw new Error('worker crashed')
      return fakeVoice(text)
    })
    await expect(narrateLesson(lesson('x', 'A brand new opening sentence here.', 'The server answers it differently now.'), failing)).rejects.toThrow('worker crashed')

    // The committed manifest is unchanged and every asset it names still exists.
    const manifest = await loadNarrationManifest(root, 'x')
    expect(manifest).toEqual(first)
    await expect(assertNarrationAssets(root, manifest!)).resolves.toBeUndefined()
  })

  it('removes superseded audio only after the new manifest is committed', async () => {
    const before = await narrateLesson(lesson('x', 'The client sends a request out.', 'The server answers it back.'), options())
    const after = await narrateLesson(lesson('x', 'A brand new opening sentence here.', 'The server answers it back.'), options())
    expect(after.scenes.one.assetId).not.toBe(before.scenes.one.assetId)
    expect(after.scenes.two.assetId).toBe(before.scenes.two.assetId)
    const expected = Object.values(after.scenes).map((scene) => `${scene.assetId}.wav`).sort()
    expect(await wavFiles()).toEqual(expected)
    expect(await indexIds()).toEqual(Object.values(after.scenes).map((scene) => scene.assetId).sort())
  })

  it('recovers from an interrupted run by pruning orphans and temp files', async () => {
    const good = await narrateLesson(lesson('x', 'The client sends a request out.', 'The server answers it back.'), options())
    // Interrupted run: new audio registered, manifest never committed.
    const interrupted = options(async (text) => {
      if (text.includes('lands')) throw new Error('killed')
      return fakeVoice(text)
    })
    await expect(narrateLesson(lesson('x', 'Something completely different to say.', 'The reply lands at the client.'), interrupted)).rejects.toThrow('killed')
    expect((await wavFiles()).length).toBeGreaterThan(2) // the orphan is on disk
    await writeFile(resolve(root, 'data', 'assets', 'files', 'half.wav.abc.tmp'), 'partial')

    expect(await pruneNarrationAssets(root, 'x')).toBe(1)
    expect(await wavFiles()).toEqual(Object.values(good.scenes).map((scene) => `${scene.assetId}.wav`).sort())
    expect((await readdir(resolve(root, 'data', 'assets', 'files'))).some((name) => name.endsWith('.tmp'))).toBe(false)
  })

  it('never removes audio used by another lesson', async () => {
    const other = await narrateLesson(lesson('y', 'Shared words for both lessons.', 'Only the other lesson says this.'), options())
    await narrateLesson(lesson('x', 'The client sends a request out.', 'The server answers it back.'), options())
    await narrateLesson(lesson('x', 'A brand new opening sentence here.', 'Another brand new second sentence.'), options())
    await expect(assertNarrationAssets(root, other)).resolves.toBeUndefined()
  })

  it('reports missing audio instead of trusting a stale manifest', async () => {
    const manifest = await narrateLesson(lesson('x', 'The client sends a request out.', 'The server answers it back.'), options())
    await rm(resolve(root, 'data', 'assets', 'files', `${manifest.scenes.one.assetId}.wav`))
    await expect(assertNarrationAssets(root, manifest)).rejects.toThrow('Run `lesson narrate')
  })
})
