import { describe, expect, it } from 'vitest'
import type { Scene } from '../../types'
import { crossfadeOpacity, sceneOpacityFactors } from './transitions'

const scene: Scene = { id: 's1', title: 'Scene', startFrame: 100, endFrame: 130, scriptSegmentIds: [], transitionIn: 10, transitionOut: 5 }

describe('crossfadeOpacity', () => {
  it('is fully opaque outside the scene range', () => {
    expect(crossfadeOpacity(99, scene)).toBe(1)
    expect(crossfadeOpacity(130, scene)).toBe(1)
    expect(crossfadeOpacity(200, scene)).toBe(1)
  })

  it('ramps 0 to 1 over the first transitionIn frames', () => {
    expect(crossfadeOpacity(100, scene)).toBe(0)
    expect(crossfadeOpacity(105, scene)).toBeCloseTo(0.5)
    expect(crossfadeOpacity(110, scene)).toBe(1)
  })

  it('ramps 1 to 0 over the last transitionOut frames', () => {
    expect(crossfadeOpacity(125, scene)).toBe(1)
    expect(crossfadeOpacity(127.5, scene)).toBeCloseTo(0.5)
    expect(crossfadeOpacity(129, scene)).toBeCloseTo(0.2)
  })

  it('is fully opaque throughout when no transitions are configured', () => {
    const plain: Scene = { id: 's2', title: 'Scene', startFrame: 0, endFrame: 30, scriptSegmentIds: [] }
    expect(crossfadeOpacity(0, plain)).toBe(1)
    expect(crossfadeOpacity(15, plain)).toBe(1)
    expect(crossfadeOpacity(29, plain)).toBe(1)
  })

  it('clamps to the lower of transitionIn/transitionOut ramps in overlapping short scenes', () => {
    const short: Scene = { id: 's3', title: 'Scene', startFrame: 0, endFrame: 10, scriptSegmentIds: [], transitionIn: 8, transitionOut: 8 }
    // Frame 4 is 4/8=0.5 into the in-ramp and (10-4)/8=0.75 into the out-ramp — the lower wins.
    expect(crossfadeOpacity(4, short)).toBeCloseTo(0.5)
  })
})

describe('sceneOpacityFactors', () => {
  it('omits scenes with no transitions configured, and maps the rest by id', () => {
    const plain: Scene = { id: 's2', title: 'Scene', startFrame: 130, endFrame: 160, scriptSegmentIds: [] }
    const factors = sceneOpacityFactors([scene, plain], 100)
    expect(factors.get('s1')).toBe(0)
    expect(factors.has('s2')).toBe(false)
  })
})
