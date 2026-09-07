import { describe, expect, it } from 'vitest'
import { alignSegmentsToScenes, narrationTimelineBounds, normalizeSegmentRange, segmentAtFrame } from './model'

describe('narration timing', () => {
  const segments = [
    { id: 'one', text: 'First', startFrame: 0, endFrame: 30 },
    { id: 'two', text: 'Second', startFrame: 30, endFrame: 60 },
  ]

  it('selects one caption at half-open frame boundaries', () => {
    expect(segmentAtFrame(segments, 29)?.id).toBe('one')
    expect(segmentAtFrame(segments, 30)?.id).toBe('two')
    expect(segmentAtFrame(segments, 60)).toBeNull()
  })

  it('clamps segment ranges while preserving at least one frame', () => {
    expect(normalizeSegmentRange(120, 20, 100)).toEqual({ startFrame: 99, endFrame: 100 })
  })

  it('aligns linked script segments to their scenes', () => {
    const aligned = alignSegmentsToScenes(
      [{ id: 'one', text: 'First', sceneId: 'scene', startFrame: 10, endFrame: 20 }],
      [{ id: 'scene', title: 'Intro', startFrame: 40, endFrame: 90, scriptSegmentIds: ['one'] }],
      120,
    )
    expect(aligned[0]).toMatchObject({ startFrame: 40, endFrame: 90 })
  })

  it('returns the combined narration audio range', () => {
    expect(narrationTimelineBounds([
      { type: 'audio', audioRole: 'music', startFrame: 0, endFrame: 100 },
      { type: 'audio', audioRole: 'narration', startFrame: 12, endFrame: 80 },
    ] as never)).toEqual({ startFrame: 12, endFrame: 80 })
  })
})
