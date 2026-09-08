import type { Layer } from '../../types'

/**
 * Resolves whether an audio layer should actually be silent during
 * preview/export, reconciling `audioMuted` with any active solo.
 *
 * Solo semantics (matching common DAW/NLE conventions): when at least one
 * audio layer has `solo: true`, every audio layer that is not itself soloed
 * is effectively muted, regardless of its own `audioMuted` value. A soloed
 * layer that is also individually muted stays muted (mute always wins for
 * the layer it's set on). With no solo active anywhere, this simply falls
 * back to the layer's own `audioMuted`.
 *
 * Only meaningful for `type === 'audio'` layers; non-audio layers (or a
 * video layer's embedded audio) are untouched by solo and should keep using
 * `layer.audioMuted` directly.
 */
export function isEffectivelyMuted(layer: Pick<Layer, 'audioMuted' | 'solo'>, allLayers: Pick<Layer, 'type' | 'audioMuted' | 'solo'>[]): boolean {
  if (layer.audioMuted) return true
  const anySolo = allLayers.some((l) => l.type === 'audio' && l.solo)
  if (!anySolo) return false
  return !layer.solo
}
