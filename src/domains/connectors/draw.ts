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

export const PULSE_PERIOD_FRAMES = 54
export const PULSE_COUNT = 2
const PULSE_FADE_FRAMES = 12

/**
 * Flow dots for a connector: progress 0..1 along the path and an opacity for each.
 * Dots are evenly spaced, loop every PULSE_PERIOD_FRAMES, and fade in and out
 * at the ends of the pulse range. Pure, so preview and export agree.
 */
export function connectorPulses(frame: number, startFrame?: number, endFrame?: number) {
  if (startFrame === undefined || endFrame === undefined || frame < startFrame || frame > endFrame) return []
  const fade = Math.min(1, (frame - startFrame) / PULSE_FADE_FRAMES, (endFrame - frame) / PULSE_FADE_FRAMES)
  return Array.from({ length: PULSE_COUNT }, (_, index) => {
    const phase = ((frame - startFrame) / PULSE_PERIOD_FRAMES + index / PULSE_COUNT) % 1
    return { progress: phase, opacity: Math.max(0, fade) }
  })
}
