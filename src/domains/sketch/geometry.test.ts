import { describe, expect, it } from 'vitest'
import { clampSketchRoughness, sketchPathVariants, sketchPolylineVariants, sketchPrimitiveVariants } from './geometry'

describe('deterministic sketch geometry', () => {
  it('returns identical strokes for the same stable id', () => {
    const first = sketchPrimitiveVariants('rectangle', 240, 120, 'server-body', 1.4)
    const second = sketchPrimitiveVariants('rectangle', 240, 120, 'server-body', 1.4)
    expect(second).toEqual(first)
  })

  it('changes the stroke for a different stable id', () => {
    const first = sketchPrimitiveVariants('ellipse', 160, 100, 'cache-a', 1)
    const second = sketchPrimitiveVariants('ellipse', 160, 100, 'cache-b', 1)
    expect(second).not.toEqual(first)
  })

  it('keeps semantic endpoints exact for open connector paths', () => {
    const variants = sketchPolylineVariants([
      { x: 10, y: 20 },
      { x: 80, y: 45 },
      { x: 140, y: 90 },
    ], 'connector-1', 2)
    variants.forEach(({ d }) => {
      expect(d).toMatch(/^M 10 20 /)
      expect(d).toMatch(/L 140 90$/)
    })
  })

  it('clamps roughness to the supported deterministic range', () => {
    expect(clampSketchRoughness(-20)).toBe(0.25)
    expect(clampSketchRoughness(10)).toBe(3)
    expect(clampSketchRoughness(Number.NaN)).toBe(1)
  })

  it('keeps authored path endpoints while perturbing its inner geometry', () => {
    const variants = sketchPathVariants('M 0 0 C 30 5 70 95 100 100', 'path-1', 1.5)
    expect(variants[0].d).toMatch(/^M 0 0 C /)
    expect(variants[0].d).toMatch(/100 100$/)
    expect(variants[0].d).not.toBe('M 0 0 C 30 5 70 95 100 100')
  })
})
