import type { Keyframe, Layer, PropertyKeyframe, Scene, SpeedKeyframe, VideoSegment } from '../../types'

/**
 * Phase 7.3 scene-owned timing. A `scope: 'scene'` layer's `startFrame`/
 * `endFrame` and every other frame-bearing field are stored **relative to
 * its owning scene's own start** (0 = the scene's start), not the project's
 * global timeline. `scope: 'global'` (or `undefined`, for legacy layers)
 * layers are untouched — same global frames as before this phase.
 *
 * The rest of the app (renderer, timeline, canvas, connectors, thumbnails)
 * only ever needs to read global frames, exactly as it did before this
 * phase. Rather than teach 40+ existing call sites about scene-local
 * timing, `resolveLayersToGlobalFrames` converts once, at the point layers
 * enter any of those call sites, and callers use the returned array exactly
 * like they used the raw `layers` array before.
 */

function shiftVideoSegment(segment: VideoSegment, delta: number): VideoSegment {
  return {
    ...segment,
    timelineStartFrame: segment.timelineStartFrame + delta,
    timelineEndFrame: segment.timelineEndFrame + delta,
    // sourceStartFrame/sourceEndFrame index into the source media, not the
    // timeline — never shifted.
    speedKeyframes: segment.speedKeyframes?.map((kf) => shiftSpeedKeyframe(kf, delta)),
  }
}

function shiftSpeedKeyframe(keyframe: SpeedKeyframe, delta: number): SpeedKeyframe {
  return { ...keyframe, frame: keyframe.frame + delta }
}

function shiftKeyframe(keyframe: Keyframe, delta: number): Keyframe {
  return { ...keyframe, frame: keyframe.frame + delta }
}

function shiftPropertyKeyframe(keyframe: PropertyKeyframe, delta: number): PropertyKeyframe {
  return { ...keyframe, frame: keyframe.frame + delta }
}

/**
 * Returns a copy of `layer` with every frame-bearing field shifted by
 * `delta`. Used in both directions: the schema migration shifts by
 * `-scene.startFrame` once (global → local, persisted); the resolver below
 * shifts by `+scene.startFrame` on every read (local → global, never
 * persisted).
 */
export function shiftLayerFrames(layer: Layer, delta: number): Layer {
  if (delta === 0) return layer
  return {
    ...layer,
    startFrame: layer.startFrame + delta,
    endFrame: layer.endFrame + delta,
    keyframes: layer.keyframes.map((kf) => shiftKeyframe(kf, delta)),
    propertyKeyframes: layer.propertyKeyframes && Object.fromEntries(
      Object.entries(layer.propertyKeyframes).map(([prop, kfs]) => [prop, kfs?.map((kf) => shiftPropertyKeyframe(kf, delta))]),
    ) as Layer['propertyKeyframes'],
    videoSegments: layer.videoSegments?.map((segment) => shiftVideoSegment(segment, delta)),
  }
}

/**
 * Converts every `scope: 'scene'` layer's frame-bearing fields to global
 * project frames by adding its owning scene's global `startFrame`.
 * `scope: 'global'`/undefined layers, and a `scope: 'scene'` layer whose
 * `sceneId` no longer resolves to a real scene, pass through unchanged —
 * this is the single integration point every render/display call site uses
 * instead of reading `layers` directly.
 */
export function resolveLayersToGlobalFrames(layers: Layer[], scenes: Scene[]): Layer[] {
  if (!layers.some((layer) => layer.scope === 'scene')) return layers
  const scenesById = new Map(scenes.map((scene) => [scene.id, scene]))
  return layers.map((layer) => {
    if (layer.scope !== 'scene') return layer
    const scene = layer.sceneId ? scenesById.get(layer.sceneId) : undefined
    if (!scene) return layer
    return shiftLayerFrames(layer, scene.startFrame)
  })
}

/** Converts a global project frame to a frame local to `scene` (0 = the
 * scene's own start). Used only at the write boundary, when persisting a
 * `scope: 'scene'` layer's timing back to the store. */
export function sceneLocalFrame(globalFrame: number, scene: Scene): number {
  return globalFrame - scene.startFrame
}
