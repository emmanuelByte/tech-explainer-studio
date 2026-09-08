import type { Scene } from '../../types'

/**
 * Crossfade opacity factor (0-1) for a scene at a given global `frame`
 * (Phase 7.4). Ramps 0→1 over the scene's first `transitionIn` frames and
 * 1→0 over its last `transitionOut` frames; frames outside the scene's
 * range (or with no transition configured) return 1 (fully opaque) so this
 * is a no-op for scenes that don't use transitions. This is a small
 * hand-rolled clamp+lerp rather than Remotion's `interpolate` — this
 * codebase doesn't depend on that helper anywhere else (see
 * `resolveLayerAnimation`'s own hand-rolled keyframe interpolation).
 */
export function crossfadeOpacity(frame: number, scene: Pick<Scene, 'startFrame' | 'endFrame' | 'transitionIn' | 'transitionOut'>): number {
  const { startFrame, endFrame, transitionIn = 0, transitionOut = 0 } = scene
  if (frame < startFrame || frame >= endFrame) return 1
  let factor = 1
  if (transitionIn > 0) {
    const progress = (frame - startFrame) / transitionIn
    factor = Math.min(factor, Math.max(0, Math.min(1, progress)))
  }
  if (transitionOut > 0) {
    const progress = (endFrame - frame) / transitionOut
    factor = Math.min(factor, Math.max(0, Math.min(1, progress)))
  }
  return factor
}

/** Builds a `sceneId -> opacity factor` map for every scene at `frame`,
 * the single lookup `EditorComposition` needs per render. Scenes without
 * either transition configured are omitted (implicit factor of 1). */
export function sceneOpacityFactors(scenes: Scene[], frame: number): Map<string, number> {
  const factors = new Map<string, number>()
  for (const scene of scenes) {
    if (!scene.transitionIn && !scene.transitionOut) continue
    factors.set(scene.id, crossfadeOpacity(frame, scene))
  }
  return factors
}
