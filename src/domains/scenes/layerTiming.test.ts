import { describe, expect, it } from 'vitest'
import { resolveLayersToGlobalFrames, sceneLocalFrame, shiftLayerFrames } from './layerTiming'
import type { Layer, Scene, VideoSegment } from '../../types'

const scene: Scene = { id: 'scene-2', title: 'Scene 2', startFrame: 100, endFrame: 160, scriptSegmentIds: [] }

function layer(overrides: Partial<Layer> = {}): Layer {
  return {
    id: 'l1', name: 'l1', type: 'rectangle',
    startFrame: 10, endFrame: 30, visible: true, locked: false,
    keyframes: [{ frame: 10, easing: 'linear', props: {} as never }, { frame: 20, easing: 'linear', props: {} as never }],
    ...overrides,
  } as Layer
}

const videoSegment: VideoSegment = {
  id: 'seg1', timelineStartFrame: 10, timelineEndFrame: 30, sourceStartFrame: 0, sourceEndFrame: 20,
  speedKeyframes: [{ frame: 10, value: 1, easing: 'step' }],
}

describe('shiftLayerFrames', () => {
  it('shifts startFrame, endFrame, and every keyframe', () => {
    const shifted = shiftLayerFrames(layer(), 100)
    expect(shifted.startFrame).toBe(110)
    expect(shifted.endFrame).toBe(130)
    expect(shifted.keyframes.map((kf) => kf.frame)).toEqual([110, 120])
  })

  it('shifts propertyKeyframes across every property', () => {
    const withProps = layer({ propertyKeyframes: { opacity: [{ id: 'k1', frame: 10, value: 1, easing: 'linear' }] } })
    const shifted = shiftLayerFrames(withProps, 100)
    expect(shifted.propertyKeyframes?.opacity?.[0].frame).toBe(110)
  })

  it('shifts videoSegments timeline frames and their speed keyframes, but not source frames', () => {
    const withVideo = layer({ videoSegments: [videoSegment] })
    const shifted = shiftLayerFrames(withVideo, 100)
    const seg = shifted.videoSegments?.[0]
    expect(seg?.timelineStartFrame).toBe(110)
    expect(seg?.timelineEndFrame).toBe(130)
    expect(seg?.speedKeyframes?.[0].frame).toBe(110)
    // Source frames index into the source media, not the timeline.
    expect(seg?.sourceStartFrame).toBe(0)
    expect(seg?.sourceEndFrame).toBe(20)
  })

  it('is a no-op (same reference) for delta 0', () => {
    const original = layer()
    expect(shiftLayerFrames(original, 0)).toBe(original)
  })

  it('does not mutate the input layer', () => {
    const original = layer()
    const originalKeyframes = original.keyframes
    shiftLayerFrames(original, 100)
    expect(original.startFrame).toBe(10)
    expect(original.keyframes).toBe(originalKeyframes)
  })
})

describe('resolveLayersToGlobalFrames', () => {
  it('leaves scope: global (and legacy undefined-scope) layers completely unchanged', () => {
    const globalLayer = layer({ scope: 'global' })
    const legacyLayer = layer({ id: 'legacy' })
    const result = resolveLayersToGlobalFrames([globalLayer, legacyLayer], [scene])
    expect(result[0]).toBe(globalLayer)
    expect(result[1]).toBe(legacyLayer)
  })

  it('shifts a scope: scene layer by its owning scene\'s global startFrame', () => {
    const sceneLayer = layer({ scope: 'scene', sceneId: 'scene-2', startFrame: 5, endFrame: 15 })
    const [resolved] = resolveLayersToGlobalFrames([sceneLayer], [scene])
    expect(resolved.startFrame).toBe(105) // 100 (scene start) + 5 (local)
    expect(resolved.endFrame).toBe(115)
  })

  it('falls back to unchanged when sceneId does not resolve to a real scene (defensive)', () => {
    const orphan = layer({ scope: 'scene', sceneId: 'missing-scene' })
    const [resolved] = resolveLayersToGlobalFrames([orphan], [scene])
    expect(resolved).toBe(orphan)
  })

  it('returns the same array reference when no layer is scene-scoped (fast path)', () => {
    const layers = [layer({ scope: 'global' }), layer({ id: 'l2' })]
    expect(resolveLayersToGlobalFrames(layers, [scene])).toBe(layers)
  })
})

describe('sceneLocalFrame', () => {
  it('subtracts the scene\'s global startFrame', () => {
    expect(sceneLocalFrame(105, scene)).toBe(5)
    expect(sceneLocalFrame(100, scene)).toBe(0)
  })
})
