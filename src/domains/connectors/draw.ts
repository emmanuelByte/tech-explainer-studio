export function connectorDrawProgress(frame: number, startFrame?: number, endFrame?: number) {
  if (startFrame === undefined || endFrame === undefined || endFrame <= startFrame) return 1
  return Math.max(0, Math.min(1, (frame - startFrame) / (endFrame - startFrame)))
}

export function connectorDash(length: number, progress: number) {
  const safeLength = Math.max(0, length)
  const safeProgress = Math.max(0, Math.min(1, progress))
  return { dashArray: safeLength, dashOffset: safeLength * (1 - safeProgress) }
}
