import type { Scene, ScriptDocument, ScriptSegment } from '../../types'
import { createSceneId, createScriptSegmentId } from './model'

type StructuredScene = {
  title: string
  narration: string
  durationSeconds?: number
  visual?: string
}

type StructuredScript = { title?: string; scenes: StructuredScene[] }

export type StructuredScriptImport = {
  script: ScriptDocument
  scenes: Scene[]
  totalFrames: number
  title?: string
}

function positiveDuration(value: unknown, fallback: number, index: number) {
  if (value === undefined) return fallback
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new Error(`Scene ${index + 1}: durationSeconds must be a positive number.`)
  }
  return value
}

/** Parses the internal JSON lesson-plan format into the editor's normal project data. */
export function parseStructuredScript(input: string, fps: number): StructuredScriptImport {
  let value: unknown
  try {
    value = JSON.parse(input)
  } catch {
    throw new Error('Invalid JSON. Check commas, quotes, and brackets.')
  }
  if (!value || typeof value !== 'object' || Array.isArray(value) || !Array.isArray((value as StructuredScript).scenes)) {
    throw new Error('Expected an object with a scenes array.')
  }
  const plan = value as StructuredScript
  if (!plan.scenes.length) throw new Error('The scenes array must contain at least one scene.')

  const defaultDuration = 4
  let startFrame = 0
  const segments: ScriptSegment[] = []
  const scenes = plan.scenes.map((scene, index) => {
    if (!scene || typeof scene !== 'object' || typeof scene.title !== 'string' || !scene.title.trim()) {
      throw new Error(`Scene ${index + 1}: title is required.`)
    }
    if (typeof scene.narration !== 'string' || !scene.narration.trim()) {
      throw new Error(`Scene ${index + 1}: narration is required.`)
    }
    if (scene.visual !== undefined && typeof scene.visual !== 'string') {
      throw new Error(`Scene ${index + 1}: visual must be text.`)
    }
    const durationFrames = Math.max(1, Math.round(positiveDuration(scene.durationSeconds, defaultDuration, index) * fps))
    const id = createSceneId()
    const segmentId = createScriptSegmentId()
    const result: Scene = {
      id,
      title: scene.title.trim(),
      startFrame,
      endFrame: startFrame + durationFrames,
      scriptSegmentIds: [segmentId],
      ...(scene.visual?.trim() ? { visual: scene.visual.trim() } : {}),
    }
    segments.push({ id: segmentId, text: scene.narration.trim(), sceneId: id, startFrame, endFrame: startFrame + durationFrames })
    startFrame += durationFrames
    return result
  })

  return {
    script: { rawText: segments.map((segment) => segment.text).join('\n\n'), segments },
    scenes,
    totalFrames: startFrame,
    ...(typeof plan.title === 'string' && plan.title.trim() ? { title: plan.title.trim() } : {}),
  }
}
