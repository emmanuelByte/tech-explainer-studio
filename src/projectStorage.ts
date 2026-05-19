import { CANVAS_PRESETS, Layer, MotionProject, ProjectHistorySnapshot, ProjectIndexItem } from './types'
import { useStore } from './store'
import { interpolateProps } from './remotion/interpolateProps'
import { styledSvgDataUrl } from './svgImage'

export interface ProjectStorageStats {
  totalBytes: number
  projects: Array<{ id: string; name: string; bytes: number }>
}

const PROJECT_INDEX_KEY = 'projects:index'
let legacyMigrationPromise: Promise<void> | null = null

async function requestJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options)
  if (!response.ok) {
    let message = 'Project storage request failed.'
    try {
      const data = await response.json() as { error?: string }
      if (data.error) message = data.error
    } catch {
      // Keep the generic message when the server did not return JSON.
    }
    throw new Error(message)
  }
  return response.json() as Promise<T>
}

async function migrateLegacyLocalStorageProjects() {
  if (legacyMigrationPromise) return legacyMigrationPromise
  legacyMigrationPromise = (async () => {
    try {
      const parsed = JSON.parse(localStorage.getItem(PROJECT_INDEX_KEY) || '[]') as ProjectIndexItem[]
      if (!Array.isArray(parsed) || parsed.length === 0) return
      const existing = await readProjectIndex()
      const existingIds = new Set(existing.map((project) => project.id))
      await Promise.all(parsed.map(async (item) => {
        if (existingIds.has(item.id)) return
        const raw = localStorage.getItem(`project:${item.id}`)
        if (!raw) return
        await upsertProject(JSON.parse(raw) as MotionProject)
        const historyRaw = localStorage.getItem(`project:${item.id}:history`)
        if (!historyRaw) return
        const snapshots = JSON.parse(historyRaw) as ProjectHistorySnapshot[]
        if (!Array.isArray(snapshots)) return
        await Promise.all([...snapshots].reverse().map((snapshot) => (
          requestJson<{ ok: true }>(`/api/projects/${encodeURIComponent(item.id)}/history`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(snapshot),
          })
        )))
      }))
    } catch {
      // Legacy migration is best-effort; the JSON file store remains the source of truth.
    }
  })()
  return legacyMigrationPromise
}

export function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID()
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

export function getCanvasSize(presetName: string, customWidth: number, customHeight: number) {
  const preset = CANVAS_PRESETS.find((p) => p.name === presetName)
  if (!preset || preset.name === 'Custom') return { width: customWidth, height: customHeight, presetName: 'Custom' }
  return { width: preset.width, height: preset.height, presetName: preset.name }
}

export function readProjectIndex(): Promise<ProjectIndexItem[]> {
  return requestJson<ProjectIndexItem[]>('/api/projects')
}

export async function readProjectIndexWithLegacyMigration(): Promise<ProjectIndexItem[]> {
  await migrateLegacyLocalStorageProjects()
  return readProjectIndex()
}

export async function readProject(id: string): Promise<MotionProject | null> {
  try {
    return await requestJson<MotionProject>(`/api/projects/${encodeURIComponent(id)}`)
  } catch {
    return null
  }
}

function layerCount(layers: Layer[]) {
  return layers.filter((l) => l.type !== 'group').length
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function fillForLayer(layer: Layer, fallback = 'transparent') {
  if (layer.fillType === 'none') return 'transparent'
  if (layer.fillType === 'solid') return layer.fillColor || fallback
  return layer.gradientStops[0]?.color || layer.fillColor || fallback
}

function thumbnailLayerSvg(layer: Layer, frame: number, canvasWidth: number, canvasHeight: number) {
  if (!layer.visible || frame < (layer.startFrame ?? 0) || frame > (layer.endFrame ?? Infinity)) return ''
  if (layer.type === 'group') return ''

  const p = interpolateProps(frame, layer.keyframes)
  const width = layer.sizeMode === 'fill-canvas' ? canvasWidth : layer.width
  const height = layer.sizeMode === 'fill-canvas' ? canvasHeight : layer.type === 'line' ? layer.strokeWidth || 2 : layer.height
  const x = canvasWidth / 2 + p.x - width / 2
  const y = canvasHeight / 2 + p.y - height / 2
  const common = [
    `opacity="${Math.max(0, Math.min(1, p.opacity))}"`,
    `transform="translate(${x} ${y}) rotate(${p.rotateZ} ${width / 2} ${height / 2}) skewX(${p.skewX}) skewY(${p.skewY}) scale(${p.scale * p.scaleX} ${p.scale * p.scaleY})"`,
  ].join(' ')
  const stroke = layer.strokeEnabled && layer.strokeWidth > 0
    ? ` stroke="${escapeXml(layer.strokeColor)}" stroke-width="${layer.strokeWidth}"`
    : ''
  const fill = escapeXml(fillForLayer(layer, '#6366f1'))

  if (layer.type === 'ellipse') {
    return `<ellipse cx="${width / 2}" cy="${height / 2}" rx="${width / 2}" ry="${height / 2}" fill="${fill}"${stroke} ${common}/>`
  }
  if (layer.type === 'triangle') {
    return `<polygon points="${width / 2},0 0,${height} ${width},${height}" fill="${fill}"${stroke} ${common}/>`
  }
  if (layer.type === 'line') {
    return `<rect width="${width}" height="${height}" rx="${height / 2}" fill="${escapeXml(layer.strokeColor)}" ${common}/>`
  }
  if (layer.type === 'path') {
    const pathFill = layer.fillType !== 'none' ? escapeXml(fillForLayer(layer, 'transparent')) : 'none'
    const pathStroke = layer.strokeEnabled ? ` stroke="${escapeXml(layer.strokeColor)}" stroke-width="${layer.strokeWidth}" stroke-linecap="round" stroke-linejoin="round"` : ''
    return `<path d="${escapeXml(layer.pathData || '')}" fill="${pathFill}"${pathStroke} ${common}/>`
  }
  if (layer.type === 'text') {
    const size = Math.max(4, layer.fontSize)
    const anchor = layer.textAlign === 'center' ? 'middle' : layer.textAlign === 'right' ? 'end' : 'start'
    const tx = layer.textAlign === 'center' ? width / 2 : layer.textAlign === 'right' ? width - 8 : 8
    const ty = height / 2 + size * 0.35
    return `<g ${common}><rect width="${width}" height="${height}" rx="${layer.borderRadius}" fill="${layer.fillType !== 'none' ? fill : 'transparent'}"/><text x="${tx}" y="${ty}" text-anchor="${anchor}" font-family="${escapeXml(layer.fontFamily || 'Inter')},Arial" font-size="${size}" font-weight="${escapeXml(layer.fontWeight || '400')}" fill="${escapeXml(layer.textColor)}">${escapeXml(layer.text || '')}</text></g>`
  }
  if (layer.type === 'image' && layer.src) {
    const fit = layer.imageFit === 'cover' ? 'xMidYMid slice' : layer.imageFit === 'fill' ? 'none' : 'xMidYMid meet'
    const imageSrc = layer.imageKind === 'svg' ? styledSvgDataUrl(layer.src, layer) : layer.src
    return `<image href="${escapeXml(imageSrc || layer.src)}" width="${width}" height="${height}" preserveAspectRatio="${fit}" ${common}/>`
  }
  return `<rect width="${width}" height="${height}" rx="${layer.borderRadius}" fill="${fill}"${stroke} ${common}/>`
}

export function thumbnailFor(project: MotionProject) {
  const width = project.canvas.width
  const height = project.canvas.height
  const frame = Math.max(0, Math.min(project.canvas.durationFrames - 1, project.editor.playheadFrame ?? 0))
  const bg = escapeXml(project.canvas.backgroundColor || '#111827')
  const content = [...project.layers].reverse().map((layer) => thumbnailLayerSvg(layer, frame, width, height)).join('')
  const emptyLabel = project.layers.length
    ? ''
    : `<text x="${width / 2}" y="${height / 2}" text-anchor="middle" font-family="Inter,Arial" font-size="${Math.max(16, width / 24)}" fill="#94a3b8">${escapeXml(project.name)}</text>`
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}"><rect width="${width}" height="${height}" fill="${bg}"/>${content}${emptyLabel}</svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

export function indexItemFromProject(project: MotionProject): ProjectIndexItem {
  return {
    id: project.id,
    name: project.name,
    thumbnail: thumbnailFor(project),
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

export async function upsertProject(project: MotionProject) {
  project.thumbnail = thumbnailFor(project)
  await requestJson<MotionProject>(`/api/projects/${encodeURIComponent(project.id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(project),
  })
}

export function deleteProject(id: string) {
  return requestJson<{ ok: true }>(`/api/projects/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export async function saveHistorySnapshot(project: MotionProject, label?: string) {
  const snapshot: ProjectHistorySnapshot = {
    id: uuid(),
    timestamp: new Date().toISOString(),
    label: label || inferSnapshotLabel(project),
    project,
  }
  await requestJson<{ ok: true }>(`/api/projects/${encodeURIComponent(project.id)}/history`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(snapshot),
  })
}

export async function readHistory(projectId: string): Promise<ProjectHistorySnapshot[]> {
  try {
    return await requestJson<ProjectHistorySnapshot[]>(`/api/projects/${encodeURIComponent(projectId)}/history`)
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
  const project: MotionProject = {
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
  project.thumbnail = thumbnailFor(project)
  return project
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
  const project: MotionProject = {
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
  project.thumbnail = thumbnailFor(project)
  return project
}

export async function duplicateProject(id: string) {
  const source = await readProject(id)
  if (!source) return null
  const clone = structuredClone(source) as MotionProject
  clone.id = uuid()
  clone.name = `${source.name} (copy)`
  clone.createdAt = new Date().toISOString()
  clone.updatedAt = clone.createdAt
  clone.thumbnail = thumbnailFor(clone)
  await upsertProject(clone)
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

export function readProjectStorageStats(): Promise<ProjectStorageStats> {
  return requestJson<ProjectStorageStats>('/api/projects/storage')
}
