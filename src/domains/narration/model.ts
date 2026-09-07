import type { Layer, LocalVoiceSettings, Scene, ScriptSegment } from '../../types'

export const DEFAULT_LOCAL_VOICE_SETTINGS: LocalVoiceSettings = {
  baseVoiceId: '',
  exaggeration: 0.5,
  cfgWeight: 0.5,
  pauseFrames: 6,
}

export function normalizeLocalVoiceSettings(settings?: Partial<LocalVoiceSettings>): LocalVoiceSettings {
  const numberOr = (value: number | undefined, fallback: number) => Number.isFinite(value) ? value! : fallback
  return {
    baseVoiceId: typeof settings?.baseVoiceId === 'string' ? settings.baseVoiceId : '',
    exaggeration: Math.max(0, Math.min(2, numberOr(settings?.exaggeration, 0.5))),
    cfgWeight: Math.max(0, Math.min(1, numberOr(settings?.cfgWeight, 0.5))),
    pauseFrames: Math.max(0, Math.round(numberOr(settings?.pauseFrames, 6))),
  }
}

export interface GeneratedNarrationClip {
  segmentId: string
  src: string
  name: string
  durationSeconds: number
  sourceText: string
}

export interface NarrationPlacement extends GeneratedNarrationClip {
  startFrame: number
  endFrame: number
  sourceDurationFrames: number
}

export function segmentAtFrame(segments: ScriptSegment[], frame: number) {
  return segments.find((segment) => (
    Number.isFinite(segment.startFrame)
    && Number.isFinite(segment.endFrame)
    && frame >= segment.startFrame!
    && frame < segment.endFrame!
  )) ?? null
}

export function normalizeSegmentRange(startFrame: number, endFrame: number, totalFrames: number) {
  const start = Math.max(0, Math.min(Math.max(0, totalFrames - 1), Math.round(Number.isFinite(startFrame) ? startFrame : 0)))
  const end = Math.max(start + 1, Math.min(totalFrames, Math.round(Number.isFinite(endFrame) ? endFrame : start + 1)))
  return { startFrame: start, endFrame: end }
}

export function alignSegmentsToScenes(segments: ScriptSegment[], scenes: Scene[], totalFrames: number) {
  const sceneById = new Map(scenes.map((scene) => [scene.id, scene]))
  return segments.map((segment) => {
    const scene = segment.sceneId ? sceneById.get(segment.sceneId) : undefined
    if (!scene) return segment
    return { ...segment, ...normalizeSegmentRange(scene.startFrame, scene.endFrame, totalFrames) }
  })
}

export function narrationTimelineBounds(layers: Layer[]) {
  const narration = layers.filter((layer) => layer.type === 'audio' && layer.audioRole === 'narration')
  if (!narration.length) return null
  return {
    startFrame: Math.min(...narration.map((layer) => layer.startFrame ?? 0)),
    endFrame: Math.max(...narration.map((layer) => layer.endFrame ?? 1)),
  }
}

export function sequenceNarrationClips(
  segments: ScriptSegment[],
  clips: GeneratedNarrationClip[],
  fps: number,
  pauseFrames: number,
) {
  const clipBySegment = new Map(clips.map((clip) => [clip.segmentId, clip]))
  const firstTimedStart = segments.find((segment) => Number.isFinite(segment.startFrame))?.startFrame ?? 0
  let cursor = Math.max(0, Math.round(firstTimedStart))
  const gap = Math.max(0, Math.round(pauseFrames))
  const placements: NarrationPlacement[] = []

  segments.forEach((segment) => {
    const clip = clipBySegment.get(segment.id)
    if (!clip) return
    const sourceDurationFrames = Math.max(1, Math.round(clip.durationSeconds * Math.max(1, fps)))
    const startFrame = cursor
    const endFrame = startFrame + sourceDurationFrames
    placements.push({ ...clip, sourceDurationFrames, startFrame, endFrame })
    cursor = endFrame + gap
  })

  return placements
}

export function applyNarrationTiming(
  segments: ScriptSegment[],
  scenes: Scene[],
  placements: NarrationPlacement[],
) {
  const placementBySegment = new Map(placements.map((placement) => [placement.segmentId, placement]))
  const nextSegments = segments.map((segment) => {
    const placement = placementBySegment.get(segment.id)
    return placement
      ? { ...segment, startFrame: placement.startFrame, endFrame: placement.endFrame }
      : segment
  })
  const segmentById = new Map(nextSegments.map((segment) => [segment.id, segment]))
  const nextScenes = scenes.map((scene) => {
    const timed = scene.scriptSegmentIds
      .map((segmentId) => segmentById.get(segmentId))
      .filter((segment): segment is ScriptSegment => Boolean(segment && Number.isFinite(segment.startFrame) && Number.isFinite(segment.endFrame)))
    if (!timed.length) return scene
    return {
      ...scene,
      startFrame: Math.min(...timed.map((segment) => segment.startFrame!)),
      endFrame: Math.max(...timed.map((segment) => segment.endFrame!)),
    }
  })
  return { segments: nextSegments, scenes: nextScenes }
}
