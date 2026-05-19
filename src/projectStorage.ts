import { CANVAS_PRESETS, Layer, MotionProject, ProjectHistorySnapshot, ProjectIndexItem } from './types'
import { useStore } from './store'

export const PROJECT_INDEX_KEY = 'projects:index'

export function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID()
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

export function getCanvasSize(presetName: string, customWidth: number, customHeight: number) {
  const preset = CANVAS_PRESETS.find((p) => p.name === presetName)
  if (!preset || preset.name === 'Custom') return { width: customWidth, height: customHeight, presetName: 'Custom' }
  return { width: preset.width, height: preset.height, presetName: preset.name }
}

export function readProjectIndex(): ProjectIndexItem[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(PROJECT_INDEX_KEY) || '[]') as ProjectIndexItem[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function writeProjectIndex(items: ProjectIndexItem[]) {
  localStorage.setItem(PROJECT_INDEX_KEY, JSON.stringify(items))
}

export function readProject(id: string): MotionProject | null {
  try {
    const raw = localStorage.getItem(`project:${id}`)
    return raw ? JSON.parse(raw) as MotionProject : null
  } catch {
    return null
  }
}

function layerCount(layers: Layer[]) {
  return layers.filter((l) => l.type !== 'group').length
}

function thumbnailFor(project: MotionProject) {
  const visible = [...project.layers].reverse().find((l) => l.visible && l.type !== 'group')
  const color = visible?.fillColor && visible.fillColor !== 'transparent' ? visible.fillColor : '#6366f1'
  const label = project.name.slice(0, 18).replace(/[<>&]/g, '')
  return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180"><rect width="320" height="180" fill="${project.canvas.backgroundColor || '#111827'}"/><rect x="70" y="42" width="180" height="96" rx="10" fill="${color}"/><text x="160" y="164" text-anchor="middle" font-family="Inter,Arial" font-size="18" fill="#f9fafb">${label}</text></svg>`)}`
}

export function indexItemFromProject(project: MotionProject): ProjectIndexItem {
  return {
    id: project.id,
    name: project.name,
    thumbnail: project.thumbnail || thumbnailFor(project),
    updatedAt: project.updatedAt,
    createdAt: project.createdAt,
    canvasWidth: project.canvas.width,
    canvasHeight: project.canvas.height,
    presetName: project.canvas.presetName,
    fps: project.canvas.fps,
    duration: project.canvas.durationFrames,
    layerCount: layerCount(project.layers),
  } as ProjectIndexItem
}

export function upsertProject(project: MotionProject) {
  localStorage.setItem(`project:${project.id}`, JSON.stringify(project))
  const item = indexItemFromProject(project)
  const index = readProjectIndex().filter((p) => p.id !== project.id)
  writeProjectIndex([item, ...index])
}

export function deleteProject(id: string) {
  localStorage.removeItem(`project:${id}`)
  localStorage.removeItem(`project:${id}:history`)
  writeProjectIndex(readProjectIndex().filter((p) => p.id !== id))
}

export function saveHistorySnapshot(project: MotionProject, label?: string) {
  const key = `project:${project.id}:history`
  const snapshots = readHistory(project.id)
  const snapshot: ProjectHistorySnapshot = {
    id: uuid(),
    timestamp: new Date().toISOString(),
    label: label || inferSnapshotLabel(project),
    project,
  }
  localStorage.setItem(key, JSON.stringify([snapshot, ...snapshots].slice(0, 20)))
}

export function readHistory(projectId: string): ProjectHistorySnapshot[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(`project:${projectId}:history`) || '[]') as ProjectHistorySnapshot[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function inferSnapshotLabel(project: MotionProject) {
  const last = project.layers[project.layers.length - 1]
  if (last) return `After editing ${last.name}`
  return 'Manual save'
}

export function projectFromStore(idOverride?: string, nameOverride?: string): MotionProject {
  const s = useStore.getState()
  const size = getCanvasSize(s.canvasPreset.name, s.customWidth, s.customHeight)
  const now = new Date().toISOString()
  const id = idOverride || s.projectId || uuid()
  return {
    id,
    name: nameOverride || s.projectName || 'Untitled Project',
    createdAt: s.projectCreatedAt || now,
    updatedAt: now,
    canvas: {
      width: size.width,
      height: size.height,
      fps: s.fps,
      durationFrames: s.totalFrames,
      backgroundColor: s.canvasBackgroundColor,
      presetName: size.presetName,
    },
    layers: s.layers,
    guides: s.guides,
    timeline: { zoom: s.timelineZoom, scrollX: s.timelineScrollX },
    editor: {
      zoom: s.editorZoom,
      panX: s.editorPanX,
      panY: s.editorPanY,
      selectedLayerIds: s.selectedLayerIds,
      playheadFrame: s.currentFrame,
    },
  }
}

export function createBlankProject(options: {
  name: string
  presetName: string
  width: number
  height: number
  fps: number
  durationSeconds: number
}): MotionProject {
  const now = new Date().toISOString()
  const preset = CANVAS_PRESETS.find((p) => p.name === options.presetName)
  const isCustom = !preset || preset.name === 'Custom'
  return {
    id: uuid(),
    name: options.name.trim() || 'Untitled Project',
    createdAt: now,
    updatedAt: now,
    canvas: {
      width: isCustom ? options.width : preset.width,
      height: isCustom ? options.height : preset.height,
      fps: options.fps,
      durationFrames: Math.max(1, Math.round(options.durationSeconds * options.fps)),
      backgroundColor: '#1a1a2e',
      presetName: isCustom ? 'Custom' : preset.name,
    },
    layers: [],
    guides: [],
    timeline: { zoom: 1, scrollX: 0 },
    editor: { zoom: 1, panX: 0, panY: 0, selectedLayerIds: [], playheadFrame: 0 },
  }
}

export function duplicateProject(id: string) {
  const source = readProject(id)
  if (!source) return null
  const clone = structuredClone(source) as MotionProject
  clone.id = uuid()
  clone.name = `${source.name} (copy)`
  clone.createdAt = new Date().toISOString()
  clone.updatedAt = clone.createdAt
  upsertProject(clone)
  return clone
}

export function exportJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function estimateLocalStorageBytes() {
  let total = 0
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i) || ''
    total += key.length + (localStorage.getItem(key)?.length ?? 0)
  }
  return total * 2
}
