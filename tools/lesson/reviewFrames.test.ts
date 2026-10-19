import { describe, expect, it } from 'vitest'
import type { MotionProject } from '../../src/types'
import { pickReviewFrames } from './reviewFrames'

const project = {
  canvas: { fps: 30 },
  scenes: [
    { id: 'scene_intro', startFrame: 0, endFrame: 90 },
    { id: 'scene_cache-hit', startFrame: 90, endFrame: 390 },
    { id: 'scene_outro', startFrame: 390, endFrame: 480 },
  ],
} as unknown as MotionProject

describe('pickReviewFrames', () => {
  const frames = pickReviewFrames(project)
  it('takes one frame per scene, named by scene', () => {
    expect(frames.map((frame) => frame.name)).toEqual(['intro', 'cache-hit', 'outro'])
  })
  it('takes the middle of title cards and a point late in other scenes, always inside the scene', () => {
    expect(frames[0].time).toBeCloseTo(1.5, 3)
    expect(frames[1].time).toBeCloseTo((90 + 300 * 0.85) / 30, 3)
    for (const [i, scene] of project.scenes!.entries()) {
      expect(frames[i].time * 30).toBeGreaterThanOrEqual(scene.startFrame)
      expect(frames[i].time * 30).toBeLessThan(scene.endFrame)
    }
  })
})
