export function connectorDrawProgress(frame: number, startFrame?: number, endFrame?: number) {
  if (startFrame === undefined || endFrame === undefined || endFrame <= startFrame) return 1
  return Math.max(0, Math.min(1, (frame - startFrame) / (endFrame - startFrame)))
}

export const CONNECTOR_HIDE_FADE_FRAMES = 12

/** 1 until `hideFrame`, then fades linearly to 0 over CONNECTOR_HIDE_FADE_FRAMES. */
export function connectorHideOpacity(frame: number, hideFrame?: number) {
  if (hideFrame === undefined) return 1
  return Math.max(0, Math.min(1, 1 - (frame - hideFrame) / CONNECTOR_HIDE_FADE_FRAMES))
}

export function connectorDash(length: number, progress: number) {
  const safeLength = Math.max(0, length)
  const safeProgress = Math.max(0, Math.min(1, progress))
  return { dashArray: safeLength, dashOffset: safeLength * (1 - safeProgress) }
}

export function connectorLineDash(strokeWidth: number) {
  const safeWidth = Math.max(1, Math.min(16, strokeWidth))
  return `${safeWidth * 3} ${safeWidth * 2}`
}
