import type { Scene, ScriptDocument, ScriptSegment } from '../../types'

export const EMPTY_SCRIPT_DOCUMENT: ScriptDocument = { rawText: '', segments: [] }

export function createSceneId() {
  return `scene_${crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)}`
}

export function createScriptSegmentId() {
  return `segment_${crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)}`
}

function clampFrame(frame: number, min: number, max: number) {
  if (!Number.isFinite(frame)) return min
  return Math.max(min, Math.min(max, Math.round(frame)))
}

export function normalizeScenes(scenes: Scene[], totalFrames: number): Scene[] {
  const maxFrame = Math.max(1, totalFrames)
  let previousEnd = 0
  return [...scenes]
    .sort((a, b) => a.startFrame - b.startFrame || a.endFrame - b.endFrame || a.id.localeCompare(b.id))
    .flatMap((scene) => {
      const startFrame = clampFrame(scene.startFrame, previousEnd, maxFrame - 1)
      const endFrame = clampFrame(scene.endFrame, startFrame + 1, maxFrame)
      previousEnd = endFrame
      return endFrame > startFrame
        ? [{
            ...scene,
            title: scene.title.trim() || 'Untitled scene',
            startFrame,
            endFrame,
            scriptSegmentIds: [...new Set(scene.scriptSegmentIds)],
          }]
        : []
    })
}

export function sceneAtFrame(scenes: Scene[], frame: number) {
  return scenes.find((scene) => frame >= scene.startFrame && frame < scene.endFrame) ?? null
}

export function addScene(scenes: Scene[], totalFrames: number, startFrame?: number): Scene[] {
  const normalized = normalizeScenes(scenes, totalFrames)
  const maxFrame = Math.max(1, totalFrames)
  const lastScene = normalized[normalized.length - 1]
  const start = clampFrame(startFrame ?? lastScene?.endFrame ?? 0, 0, maxFrame - 1)
  const activeScene = sceneAtFrame(normalized, start)
  if (activeScene && start > activeScene.startFrame && start < activeScene.endFrame) {
    const index = normalized.findIndex((scene) => scene.id === activeScene.id)
    const next = [...normalized]
    next.splice(index, 1,
      { ...activeScene, endFrame: start },
      {
        id: createSceneId(),
        title: `Scene ${normalized.length + 1}`,
        startFrame: start,
        endFrame: activeScene.endFrame,
        scriptSegmentIds: [],
      },
    )
    return next
  }
  const next = normalized.find((scene) => scene.startFrame >= start)
  const end = Math.max(start + 1, next?.startFrame ?? maxFrame)
  return normalizeScenes([
    ...normalized,
    {
      id: createSceneId(),
      title: `Scene ${normalized.length + 1}`,
      startFrame: start,
      endFrame: end,
      scriptSegmentIds: [],
    },
  ], totalFrames)
}

export function updateScene(scenes: Scene[], id: string, patch: Partial<Pick<Scene, 'title' | 'startFrame' | 'endFrame' | 'scriptSegmentIds'>>, totalFrames: number): Scene[] {
  const normalized = normalizeScenes(scenes, totalFrames)
  const index = normalized.findIndex((scene) => scene.id === id)
  if (index < 0) return normalized
  const current = normalized[index]
  const previousEnd = normalized[index - 1]?.endFrame ?? 0
  const nextStart = normalized[index + 1]?.startFrame ?? totalFrames
  const startFrame = clampFrame(patch.startFrame ?? current.startFrame, previousEnd, Math.max(previousEnd, nextStart - 1))
  const endFrame = clampFrame(patch.endFrame ?? current.endFrame, startFrame + 1, Math.max(startFrame + 1, nextStart))
  const next = [...normalized]
  next[index] = {
    ...current,
    ...patch,
    startFrame,
    endFrame,
    title: (patch.title ?? current.title).trim() || current.title,
    scriptSegmentIds: patch.scriptSegmentIds ? [...new Set(patch.scriptSegmentIds)] : current.scriptSegmentIds,
  }
  return next
}

export function deleteScene(scenes: Scene[], id: string, totalFrames: number): Scene[] {
  return normalizeScenes(scenes.filter((scene) => scene.id !== id), totalFrames)
}

export function splitScene(scenes: Scene[], id: string, frame: number, totalFrames: number): Scene[] {
  const normalized = normalizeScenes(scenes, totalFrames)
  const index = normalized.findIndex((scene) => scene.id === id)
  if (index < 0) return normalized
  const scene = normalized[index]
  const splitFrame = clampFrame(frame, scene.startFrame + 1, scene.endFrame - 1)
  if (splitFrame <= scene.startFrame || splitFrame >= scene.endFrame) return normalized
  const next = [...normalized]
  next.splice(index, 1,
    { ...scene, endFrame: splitFrame },
    {
      id: createSceneId(),
      title: `${scene.title} (part 2)`,
      startFrame: splitFrame,
      endFrame: scene.endFrame,
      scriptSegmentIds: [],
    },
  )
  return next
}

export function mergeSceneWithNext(scenes: Scene[], id: string, totalFrames: number): Scene[] {
  const normalized = normalizeScenes(scenes, totalFrames)
  const index = normalized.findIndex((scene) => scene.id === id)
  const nextScene = normalized[index + 1]
  if (index < 0 || !nextScene) return normalized
  const next = [...normalized]
  next.splice(index, 2, {
    ...normalized[index],
    endFrame: nextScene.endFrame,
    scriptSegmentIds: [...new Set([...normalized[index].scriptSegmentIds, ...nextScene.scriptSegmentIds])],
  })
  return next
}

/** Moves a scene's content to its adjacent timeline slot while preserving all scene ids and segment ownership. */
export function moveScene(scenes: Scene[], id: string, direction: -1 | 1, totalFrames: number): Scene[] {
  const normalized = normalizeScenes(scenes, totalFrames)
  const index = normalized.findIndex((scene) => scene.id === id)
  const targetIndex = index + direction
  if (index < 0 || targetIndex < 0 || targetIndex >= normalized.length) return normalized
  const current = normalized[index]
  const target = normalized[targetIndex]
  const next = [...normalized]
  next[index] = { ...target, startFrame: current.startFrame, endFrame: current.endFrame }
  next[targetIndex] = { ...current, startFrame: target.startFrame, endFrame: target.endFrame }
  return normalizeScenes(next, totalFrames)
}

export function segmentsFromScript(rawText: string): ScriptSegment[] {
  return rawText
    .split(/\n\s*\n+/)
    .map((text) => text.trim())
    .filter(Boolean)
    .map((text) => ({ id: createScriptSegmentId(), text }))
}

export function createScenesForScript(script: ScriptDocument, totalFrames: number): { script: ScriptDocument; scenes: Scene[] } {
  const segments = segmentsFromScript(script.rawText)
  if (!segments.length) return { script: { ...script, segments: [] }, scenes: [] }
  const frameCount = Math.max(1, totalFrames)
  const scenes = segments.map((segment, index) => {
    const startFrame = Math.floor((index / segments.length) * frameCount)
    const endFrame = index === segments.length - 1
      ? frameCount
      : Math.max(startFrame + 1, Math.floor(((index + 1) / segments.length) * frameCount))
    return {
      id: createSceneId(),
      title: `Scene ${index + 1}`,
      startFrame,
      endFrame,
      scriptSegmentIds: [segment.id],
    }
  })
  const segmentToScene = new Map(scenes.flatMap((scene) => scene.scriptSegmentIds.map((segmentId) => [segmentId, scene.id] as const)))
  return {
    script: {
      rawText: script.rawText,
      segments: segments.map((segment) => ({ ...segment, sceneId: segmentToScene.get(segment.id) })),
    },
    scenes,
  }
}

export function splitScriptSegment(script: ScriptDocument, id: string, offset: number): ScriptDocument {
  const index = script.segments.findIndex((segment) => segment.id === id)
  if (index < 0) return script
  const segment = script.segments[index]
  const splitAt = clampFrame(offset, 1, Math.max(1, segment.text.length - 1))
  if (splitAt <= 0 || splitAt >= segment.text.length) return script
  const first = { ...segment, text: segment.text.slice(0, splitAt).trimEnd() }
  const second = { ...segment, id: createScriptSegmentId(), text: segment.text.slice(splitAt).trimStart(), sceneId: undefined, startFrame: undefined, endFrame: undefined }
  return { ...script, segments: [...script.segments.slice(0, index), first, second, ...script.segments.slice(index + 1)] }
}

/** Picks a readable manual split point near the middle of a segment. */
export function suggestedScriptSplitOffset(text: string): number {
  const middle = Math.floor(text.length / 2)
  const sentenceBreaks = [...text.matchAll(/[.!?](?=\s|$)/g)]
    .map((match) => (match.index ?? 0) + 1)
    .filter((offset) => offset > 0 && offset < text.length)
  const wordBreaks = [...text.matchAll(/\s+/g)]
    .map((match) => match.index ?? 0)
    .filter((offset) => offset > 0 && offset < text.length)
  const candidates = sentenceBreaks.length ? sentenceBreaks : wordBreaks
  if (!candidates.length) return middle
  return candidates.reduce(
    (closest, offset) => Math.abs(offset - middle) < Math.abs(closest - middle) ? offset : closest,
    candidates[0],
  )
}

export function updateScriptSegment(script: ScriptDocument, id: string, text: string): ScriptDocument {
  const segments = script.segments.map((segment) => segment.id === id ? { ...segment, text } : segment)
  return { ...script, rawText: segments.map((segment) => segment.text.trim()).filter(Boolean).join('\n\n'), segments }
}

export function mergeScriptSegmentWithNext(script: ScriptDocument, id: string): { script: ScriptDocument; removedSegmentId?: string } {
  const index = script.segments.findIndex((segment) => segment.id === id)
  const nextSegment = script.segments[index + 1]
  if (index < 0 || !nextSegment) return { script }
  const merged = {
    ...script.segments[index],
    text: `${script.segments[index].text.trim()} ${nextSegment.text.trim()}`.trim(),
  }
  const segments = [...script.segments]
  segments.splice(index, 2, merged)
  return {
    script: { ...script, rawText: segments.map((segment) => segment.text.trim()).filter(Boolean).join('\n\n'), segments },
    removedSegmentId: nextSegment.id,
  }
}
