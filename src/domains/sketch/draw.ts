export function clampDrawProgress(progress: number) {
  if (!Number.isFinite(progress)) return 0
  return Math.max(0, Math.min(1, progress))
}
/** SVG's pathLength=1 makes the same draw math work for every path shape. */
export function normalizedDrawStroke(progress: number) {
  const clamped = clampDrawProgress(progress)
  return {
    pathLength: 1,
    strokeDasharray: 1,
    strokeDashoffset: 1 - clamped,
  }
}
