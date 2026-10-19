import { execFileSync } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { MotionProject } from '../../src/types'
import { inspectVideo, judgeFrame, measureFrame, planProbes } from './outputChecks'

const project = (width: number, height: number): MotionProject => ({
  canvas: { width, height, fps: 30, durationFrames: 300 },
  scenes: [{ id: 'scene_a', title: 'A', startFrame: 0, endFrame: 150 }, { id: 'scene_b', title: 'B', startFrame: 150, endFrame: 300 }],
  script: { rawText: '', segments: [
    { id: 'p1', text: 'First phrase', sceneId: 'scene_a', startFrame: 10, endFrame: 60 },
    { id: 'p2', text: 'Second phrase', sceneId: 'scene_a', startFrame: 60, endFrame: 120 },
    { id: 'p3', text: 'Third phrase', sceneId: 'scene_b', startFrame: 160, endFrame: 250 },
  ] },
} as unknown as MotionProject)

describe('planProbes', () => {
  it('samples each scene middle and the first, middle and last caption of every scene', () => {
    const probes = planProbes(project(1920, 1080))
    expect(probes.filter((p) => p.kind === 'scene').map((p) => p.time)).toEqual([2.5, 7.5])
    expect(probes.filter((p) => p.kind === 'caption').map((p) => p.label)).toEqual(['caption "First phrase"', 'caption "Second phrase"', 'caption "Third phrase"'])
    // Mid-phrase, so the caption is fully faded in.
    expect(probes.find((p) => p.label.includes('First'))!.time).toBeCloseTo(35 / 30, 3)
  })

  it('puts the caption region inside the frame in both formats', () => {
    for (const [w, h] of [[1920, 1080], [1080, 1920]]) {
      const region = planProbes(project(w, h)).find((p) => p.region)!.region!
      expect(region.x).toBeGreaterThanOrEqual(0)
      expect(region.x + region.width).toBeLessThanOrEqual(w)
      expect(region.y).toBeGreaterThan(h * 0.4)
      expect(region.y + region.height).toBeLessThanOrEqual(h)
    }
  })
})

describe('judgeFrame', () => {
  const scene = { time: 1, label: 'scene a', kind: 'scene' as const }
  const caption = { time: 1, label: 'caption "x"', kind: 'caption' as const }
  it('calls a flat scene frame blank, but not one with content', () => {
    expect(judgeFrame(scene, { ymin: 16, ymax: 18, yavg: 17 })).toContain('blank')
    expect(judgeFrame(scene, { ymin: 16, ymax: 235, yavg: 30 })).toBeUndefined()
  })
  it('requires bright caption text where a caption is due', () => {
    expect(judgeFrame(caption, { ymin: 16, ymax: 60, yavg: 20 })).toContain('no caption text')
    expect(judgeFrame(caption, { ymin: 16, ymax: 235, yavg: 40 })).toBeUndefined()
  })
})

const hasFfmpeg = (() => { try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); return true } catch { return false } })()
describe.skipIf(!hasFfmpeg)('inspectVideo on a real file', () => {
  it('measures a flat frame and a frame with bright text in the caption region', async () => {
    const dir = await mkdtemp(resolve(tmpdir(), 'inspect-'))
    try {
      const flat = resolve(dir, 'flat.mp4')
      execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=0x0d0f14:s=1920x1080:d=11:r=30', '-pix_fmt', 'yuv420p', flat])
      const stats = await measureFrame(flat, { time: 2.5, label: 's', kind: 'scene' })
      expect(stats.ymax - stats.ymin).toBeLessThan(5)
      const problems = await inspectVideo(flat, project(1920, 1080))
      expect(problems.some((problem) => problem.includes('blank'))).toBe(true)
      expect(problems.some((problem) => problem.includes('no caption text'))).toBe(true)

      const lit = resolve(dir, 'lit.mp4')
      // A bright bar where the caption sits, plus content elsewhere.
      execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=0x0d0f14:s=1920x1080:d=11:r=30', '-vf', 'drawbox=x=300:y=300:w=400:h=200:color=white:t=fill,drawbox=x=500:y=820:w=900:h=40:color=white:t=fill', '-pix_fmt', 'yuv420p', lit])
      expect(await inspectVideo(lit, project(1920, 1080))).toEqual([])

      // A half-size draft render is measured at half-size coordinates, not cropped off the frame.
      const draft = resolve(dir, 'draft.mp4')
      execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', lit, '-vf', 'scale=960:540', '-pix_fmt', 'yuv420p', draft])
      expect(await inspectVideo(draft, project(1920, 1080), 0.5)).toEqual([])
    } finally { await rm(dir, { recursive: true, force: true }) }
  })
})
