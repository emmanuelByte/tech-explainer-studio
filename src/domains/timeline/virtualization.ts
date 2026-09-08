/**
 * Shared windowing math for Phase 7.2's row/clip virtualization. Given a list
 * of items with precomputed absolute positions (Timeline.tsx already
 * computes exact per-row `top`/`height` via `rowLayouts` for keyframe/marquee
 * hit-testing — this reuses that same data rather than re-measuring the DOM),
 * returns which indices fall within the visible scroll window plus overscan.
 */
export interface VirtualizableItem {
  top: number
  height: number
}

export function visibleItemIndices(
  items: VirtualizableItem[],
  scrollOffset: number,
  viewportSize: number,
  overscan: number,
): number[] {
  const start = scrollOffset - overscan
  const end = scrollOffset + viewportSize + overscan
  const indices: number[] = []
  items.forEach((item, index) => {
    if (item.top + item.height >= start && item.top <= end) indices.push(index)
  })
  return indices
}
