import type { Layer, Scene, ScriptSegment } from '../../types'

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
