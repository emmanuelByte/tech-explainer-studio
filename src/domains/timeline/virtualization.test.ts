import { describe, expect, it } from 'vitest'
import { visibleItemIndices } from './virtualization'

function uniformItems(count: number, height: number) {
  return Array.from({ length: count }, (_, i) => ({ top: i * height, height }))
}

describe('visibleItemIndices', () => {
  it('returns nothing for an empty list', () => {
    expect(visibleItemIndices([], 0, 300, 0)).toEqual([])
  })

  it('at scroll 0 with no overscan, returns only the rows that fit the viewport', () => {
    const items = uniformItems(100, 30) // 100 rows, 30px each -> 3000px total
    const indices = visibleItemIndices(items, 0, 300, 0)
    // 300px viewport / 30px rows = 10 full rows (0..9), plus row 10 whose top
    // edge exactly touches the viewport boundary (inclusive on both ends,
    // matching the existing keyframe/marquee hit-testing style elsewhere).
    expect(indices).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
  })

  it('excludes far-off rows at scale (100 rows), proving virtualization actually prunes', () => {
    const items = uniformItems(100, 30)
    const indices = visibleItemIndices(items, 0, 300, 0)
    expect(indices.length).toBeLessThan(items.length)
    expect(indices).not.toContain(50)
    expect(indices).not.toContain(99)
  })

  it('shifts the visible window when scrolled to the middle of a large list', () => {
    const items = uniformItems(100, 30)
    const indices = visibleItemIndices(items, 1500, 300, 0) // scrolled to row 50
    // Boundary rows 49 and 60 touch the window edges inclusively; the point
    // is what matters here — the window tracks the scroll position and
    // excludes everything far from it.
    expect(indices[0]).toBe(49)
    expect(indices[indices.length - 1]).toBe(60)
    expect(indices).not.toContain(0)
    expect(indices).not.toContain(99)
  })

  it('overscan widens the range on both sides', () => {
    const items = uniformItems(100, 30)
    const withoutOverscan = visibleItemIndices(items, 1500, 300, 0)
    const withOverscan = visibleItemIndices(items, 1500, 300, 90) // +3 rows each side
    expect(withOverscan[0]).toBe(withoutOverscan[0] - 3)
    expect(withOverscan[withOverscan.length - 1]).toBe(withoutOverscan[withoutOverscan.length - 1] + 3)
  })

  it('includes a row whose bottom edge only partially overlaps the visible start', () => {
    const items = [{ top: 0, height: 50 }, { top: 50, height: 50 }]
    // scrollOffset 40 means the first row (0-50) still shows its last 10px
    expect(visibleItemIndices(items, 40, 20, 0)).toEqual([0, 1])
  })

  it('supports variable-height rows (expanded property tracks), not just uniform ones', () => {
    const items = [
      { top: 0, height: 30 },
      { top: 30, height: 200 }, // an expanded row with many property sub-tracks
      { top: 230, height: 30 },
    ]
    expect(visibleItemIndices(items, 0, 40, 0)).toEqual([0, 1])
    expect(visibleItemIndices(items, 250, 40, 0)).toEqual([2])
  })
})
