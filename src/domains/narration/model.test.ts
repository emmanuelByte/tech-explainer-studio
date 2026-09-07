import { describe, expect, it } from 'vitest'
import {
  alignSegmentsToScenes,
  applyNarrationTiming,
  narrationTimelineBounds,
  normalizeLocalVoiceSettings,
  normalizeSegmentRange,
  segmentAtFrame,
  sequenceNarrationClips,
} from './model'

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

  it('sequences generated clips and updates segment and scene timing', () => {
    const sourceSegments = [
      { id: 'one', text: 'First', sceneId: 'scene-one', startFrame: 10, endFrame: 30 },
      { id: 'two', text: 'Second', sceneId: 'scene-two', startFrame: 30, endFrame: 60 },
    ]
    const placements = sequenceNarrationClips(sourceSegments, [
      { segmentId: 'one', src: '/one.wav', name: 'One', durationSeconds: 1, sourceText: 'First' },
      { segmentId: 'two', src: '/two.wav', name: 'Two', durationSeconds: 2, sourceText: 'Second' },
    ], 30, 6)

    expect(placements).toMatchObject([
      { segmentId: 'one', startFrame: 10, endFrame: 40, sourceDurationFrames: 30 },
      { segmentId: 'two', startFrame: 46, endFrame: 106, sourceDurationFrames: 60 },
    ])

    const timed = applyNarrationTiming(sourceSegments, [
      { id: 'scene-one', title: 'One', startFrame: 10, endFrame: 30, scriptSegmentIds: ['one'] },
      { id: 'scene-two', title: 'Two', startFrame: 30, endFrame: 60, scriptSegmentIds: ['two'] },
    ], placements)
    expect(timed.segments).toMatchObject([
      { id: 'one', startFrame: 10, endFrame: 40 },
      { id: 'two', startFrame: 46, endFrame: 106 },
    ])
    expect(timed.scenes).toMatchObject([
      { id: 'scene-one', startFrame: 10, endFrame: 40 },
      { id: 'scene-two', startFrame: 46, endFrame: 106 },
    ])
  })

  it('normalizes persisted local voice settings', () => {
    expect(normalizeLocalVoiceSettings({
      baseVoiceId: 'baseVoice',
      exaggeration: 5,
      cfgWeight: -1,
      pauseFrames: 4.6,
    })).toEqual({
      baseVoiceId: 'baseVoice',
      exaggeration: 2,
      cfgWeight: 0,
      pauseFrames: 5,
    })
  })
})
