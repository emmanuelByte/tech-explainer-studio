import { describe, expect, it } from 'vitest'
import { clampDrawProgress, normalizedDrawStroke } from './draw'

describe('path drawing', () => {
  it('clamps progress and exposes normalized SVG dash values', () => {
    expect(clampDrawProgress(-1)).toBe(0)
    expect(clampDrawProgress(2)).toBe(1)
    expect(normalizedDrawStroke(0.25)).toEqual({ pathLength: 1, strokeDasharray: 1, strokeDashoffset: 0.75 })
  })
})
