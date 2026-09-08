import type { Layer, ScriptSegment, TrackFilterKey } from '../../types'

/**
 * Track filter chips for the Timeline/LayersPanel row lists. "Warnings"
 * reuses the existing stale-narration signal (see `ScriptScenesPanel.tsx`'s
 * `staleNarrationCount`) rather than a new warning subsystem — a full
 * warning/status model is explicitly Phase 7.4, not this phase.
 */
export type { TrackFilterKey }

export const TRACK_FILTER_KEYS: TrackFilterKey[] = ['selected', 'animated', 'visible', 'audio', 'warnings']

export function matchesSearchQuery(layer: Pick<Layer, 'name'>, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return layer.name.toLowerCase().includes(q)
}

export function isLayerAnimated(layer: Pick<Layer, 'keyframes' | 'propertyKeyframes'>): boolean {
  if (layer.keyframes.length > 0) return true
  const props = layer.propertyKeyframes
  if (!props) return false
  return Object.values(props).some((kfs) => (kfs?.length ?? 0) > 0)
}

/** A narration layer whose text was edited after its audio was generated. */
export function hasStaleNarration(
  layer: Pick<Layer, 'type' | 'scriptSegmentId' | 'narrationGeneration'>,
  scriptSegments: ScriptSegment[],
): boolean {
  if (layer.type !== 'audio' || !layer.scriptSegmentId || !layer.narrationGeneration) return false
  const segment = scriptSegments.find((s) => s.id === layer.scriptSegmentId)
  return Boolean(segment && segment.text.trim() !== layer.narrationGeneration.sourceText)
}

export interface TrackFilterContext {
  selectedLayerIds: string[]
  scriptSegments: ScriptSegment[]
}

export function matchesTrackFilter(filter: TrackFilterKey, layer: Layer, context: TrackFilterContext): boolean {
  switch (filter) {
    case 'selected': return context.selectedLayerIds.includes(layer.id)
    case 'animated': return isLayerAnimated(layer)
    case 'visible': return !!layer.visible
    case 'audio': return layer.type === 'audio'
    case 'warnings': return hasStaleNarration(layer, context.scriptSegments)
    default: return true
  }
}

/**
 * Filters a flat row list (as produced by `visibleLayerRows`) by search text
 * and active filter chips. Rows are independent entries (each already
 * carries its own depth), so removing a non-matching parent row does not
 * hide a still-matching descendant's row — matching descendants can appear
 * without their ancestor, the same trade-off most flat-list tree search UIs
 * make.
 */
export function filterLayerRows<T extends { layer: Layer }>(
  rows: T[],
  query: string,
  activeFilters: TrackFilterKey[],
  context: TrackFilterContext,
): T[] {
  return rows.filter((row) => (
    matchesSearchQuery(row.layer, query) && activeFilters.every((filter) => matchesTrackFilter(filter, row.layer, context))
  ))
}
