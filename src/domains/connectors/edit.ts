import type { Connector, Layer } from '../../types'

/** Invalid reattachments are ignored; adjusting a start preserves a valid range. */
export function editConnector(connector: Connector, patch: Partial<Omit<Connector, 'id'>>, layers: Layer[]): Connector {
  const next = { ...connector, ...patch }
  if (next.sourceLayerId === next.targetLayerId
    || !layers.some((layer) => layer.id === next.sourceLayerId)
    || !layers.some((layer) => layer.id === next.targetLayerId)) return connector
  if (next.drawStartFrame !== undefined) next.drawStartFrame = Math.max(0, Math.round(next.drawStartFrame))
  if (next.drawEndFrame !== undefined) next.drawEndFrame = Math.max((next.drawStartFrame ?? 0) + 1, Math.round(next.drawEndFrame))
  if (!Number.isFinite(next.strokeWidth)
    || (next.drawStartFrame !== undefined && !Number.isFinite(next.drawStartFrame))
    || (next.drawEndFrame !== undefined && !Number.isFinite(next.drawEndFrame))) return connector
  next.strokeWidth = Math.max(1, Math.min(16, next.strokeWidth))
  if (next.sketchRoughness !== undefined) {
    if (!Number.isFinite(next.sketchRoughness)) return connector
    next.sketchRoughness = Math.max(0.25, Math.min(3, next.sketchRoughness))
  }
  return next
}
