import { describe, expect, it } from 'vitest'
import { DEFAULT_TRANSFORM, type Keyframe } from '../types'
import { interpolateProps } from './interpolateProps'

function keyframe(frame: number, x: number): Keyframe {
  return {
    frame,
    easing: 'linear',
    props: { ...DEFAULT_TRANSFORM, x },
  }
}

describe('interpolateProps', () => {
  it('uses default transform values with no keyframes', () => {
    expect(interpolateProps(12, [])).toEqual(DEFAULT_TRANSFORM)
  })

  it('clamps to the first and final keyframes', () => {
    const frames = [keyframe(10, 20), keyframe(20, 80)]

    expect(interpolateProps(0, frames).x).toBe(20)
    expect(interpolateProps(30, frames).x).toBe(80)
  })

  it('interpolates a property deterministically between sorted frames', () => {
    const frames = [keyframe(20, 80), keyframe(10, 20)]

    expect(interpolateProps(15, frames).x).toBe(50)
    expect(interpolateProps(15, frames).opacity).toBe(1)
  })
})
