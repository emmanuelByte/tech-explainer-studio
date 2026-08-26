import { CANVAS_PRESETS, DEFAULT_COLOR_PALETTES, DEFAULT_TRANSFORM, Layer, MotionProject, ProjectHistorySnapshot, ProjectIndexItem, TransformProps, VideoSegment } from './types'
import { useStore } from './store'
import { interpolateProps } from './remotion/interpolateProps'
import { styledSvgDataUrl } from './svgImage'
import { CURRENT_PROJECT_SCHEMA_VERSION, migrateProject } from './domains/project/migrations'

export interface ProjectStorageStats {
  totalBytes: number
  projects: Array<{ id: string; name: string; bytes: number }>
}

const PROJECT_INDEX_KEY = 'projects:index'
const MAX_REASONABLE_TRANSFORM_VALUE = 1_000_000
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
    return sanitizeProject(migrateProject(await requestJson<unknown>(`/api/projects/${encodeURIComponent(id)}`)))
  } catch {
    return null
  }
}

function isReasonableNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= MAX_REASONABLE_TRANSFORM_VALUE
}

function nearestReasonableTransformValue(layer: Layer, frameIndex: number, key: keyof TransformProps) {
  for (let index = frameIndex - 1; index >= 0; index -= 1) {
    const value = layer.keyframes[index]?.props?.[key]
    if (isReasonableNumber(value)) return value
  }
  for (let index = frameIndex + 1; index < layer.keyframes.length; index += 1) {
    const value = layer.keyframes[index]?.props?.[key]
    if (isReasonableNumber(value)) return value
  }
  return DEFAULT_TRANSFORM[key]
}

function clampFrame(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min
  return Math.max(min, Math.min(max, Math.round(value)))
}

function sourceDurationFramesForLayer(layer: Layer, fps: number, fallbackFrames: number) {
  const fromMetadata = layer.sourceDurationFrames
  const fromSeconds = layer.videoDuration && Number.isFinite(layer.videoDuration)
    ? Math.max(0, Math.round(layer.videoDuration * fps))
    : undefined
  const fromSegments = layer.videoSegments?.length
    ? Math.max(...layer.videoSegments.map((segment) => Math.max(segment.sourceStartFrame, segment.sourceEndFrame)))
    : undefined
  return Math.max(0, Math.round(fromMetadata ?? fromSeconds ?? fromSegments ?? fallbackFrames))
}

function normalizeVideoSegments(segments: VideoSegment[], sourceDurationFrames: number, totalFrames: number) {
  const sourceMax = Math.max(0, sourceDurationFrames)
  let previousEnd = 0
  return [...segments]
    .sort((a, b) => a.timelineStartFrame - b.timelineStartFrame || a.timelineEndFrame - b.timelineEndFrame)
    .map((segment) => {
      const timelineStartFrame = clampFrame(segment.timelineStartFrame, previousEnd, Math.max(previousEnd, totalFrames - 1))
      const timelineEndFrame = clampFrame(segment.timelineEndFrame, timelineStartFrame + 1, Math.max(timelineStartFrame + 1, totalFrames))
      previousEnd = timelineEndFrame
      const sourceStartFrame = clampFrame(segment.sourceStartFrame, 0, sourceMax)
      const sourceEndFrame = clampFrame(segment.sourceEndFrame, sourceStartFrame, sourceMax)
      return {
        id: segment.id || uuid(),
        timelineStartFrame,
        timelineEndFrame,
        sourceStartFrame,
        sourceEndFrame,
      }
    })
    .filter((segment) => segment.timelineEndFrame > segment.timelineStartFrame)
}

function normalizeVideoLayer(layer: Layer, fps: number, totalFrames: number) {
  if (layer.type !== 'video') return layer
  const startFrame = clampFrame(layer.startFrame ?? 0, 0, Math.max(0, totalFrames - 1))
  const endFrame = clampFrame(layer.endFrame ?? startFrame + 1, startFrame + 1, Math.max(startFrame + 1, totalFrames))
  const fallbackDuration = Math.max(1, endFrame - startFrame)
  const sourceDurationFrames = sourceDurationFramesForLayer(layer, fps, fallbackDuration)
  if (Array.isArray(layer.videoSegments) && layer.videoSegments.length === 0) {
    return { ...layer, sourceDurationFrames, videoSegments: [] }
  }
  const rawSegments = layer.videoSegments?.length
    ? layer.videoSegments
    : [{
        id: uuid(),
        timelineStartFrame: startFrame,
        timelineEndFrame: endFrame,
        sourceStartFrame: 0,
        sourceEndFrame: Math.min(sourceDurationFrames || fallbackDuration, fallbackDuration),
      }]
  const videoSegments = normalizeVideoSegments(rawSegments, sourceDurationFrames, totalFrames)
  if (!videoSegments.length) return { ...layer, sourceDurationFrames, videoSegments: [] }
  return {
    ...layer,
    sourceDurationFrames,
    videoSegments,
    startFrame: Math.min(...videoSegments.map((segment) => segment.timelineStartFrame)),
    endFrame: Math.max(...videoSegments.map((segment) => segment.timelineEndFrame)),
  }
}

function normalizeHtmlTextMetrics(layer: Layer) {
  if (!layer.htmlText) return layer
  let next = layer.type === 'text' && layer.sizeMode !== 'fit-content'
    ? { ...layer, sizeMode: 'fit-content' as const }
    : layer
  if (!Number.isFinite(next.lineHeight) || next.lineHeight <= 4) return next
  const fontSize = Number.isFinite(layer.fontSize) && layer.fontSize > 0 ? layer.fontSize : 16
  return { ...next, lineHeight: Math.max(0.1, next.lineHeight / fontSize) }
}

function normalizeCssColor(value: string) {
  const trimmed = value?.trim()
  if (!trimmed) return value
  const short = trimmed.match(/^#([0-9a-f]{3})$/i)
  if (short) {
    const [, hex] = short
    return `#${hex[0]}${hex[0]}${hex[1]}${hex[1]}${hex[2]}${hex[2]}`.toLowerCase()
  }
  if (/^#[0-9a-f]{6}$/i.test(trimmed)) return trimmed.toLowerCase()
  const rgb = trimmed.match(/^rgba?\(\s*([\d.]+)(?:\s+|,\s*)([\d.]+)(?:\s+|,\s*)([\d.]+)(?:\s*[,/]\s*[\d.]+%?)?\s*\)$/i)
  if (!rgb) return value
  const toHex = (raw: string) => Math.max(0, Math.min(255, Math.round(Number(raw))))
    .toString(16)
    .padStart(2, '0')
  return `#${toHex(rgb[1])}${toHex(rgb[2])}${toHex(rgb[3])}`.toLowerCase()
}

function normalizeLayerColors(layer: Layer) {
  return {
    ...layer,
    fillColor: normalizeCssColor(layer.fillColor),
    textColor: normalizeCssColor(layer.textColor),
    strokeColor: normalizeCssColor(layer.strokeColor),
    gradientStops: layer.gradientStops.map((stop) => ({ ...stop, color: normalizeCssColor(stop.color) })),
  }
}

function isGroupLayer(layer: Layer) {
  return layer.type === 'group' || layer.isGroup
}

function withGroupTimeEnvelopes(layers: Layer[], totalFrames: number) {
  let next = layers
  for (let pass = 0; pass < layers.length; pass += 1) {
    const byParent = new Map<string, Layer[]>()
    next.forEach((layer) => {
      if (!layer.parentId) return
      byParent.set(layer.parentId, [...(byParent.get(layer.parentId) ?? []), layer])
    })

    let changed = false
    next = next.map((layer) => {
      if (!isGroupLayer(layer)) return layer
      const children = byParent.get(layer.id) ?? []
      if (!children.length) return layer
      const startFrame = Math.max(0, Math.min(...children.map((child) => child.startFrame ?? 0)))
      const endFrame = Math.max(startFrame + 1, Math.min(totalFrames, Math.max(...children.map((child) => child.endFrame ?? totalFrames))))
      if (layer.startFrame === startFrame && layer.endFrame === endFrame) return layer
      changed = true
      return { ...layer, startFrame, endFrame }
    })

    if (!changed) break
  }
  return next
}

function sanitizeLayer(layer: Layer, fps: number, totalFrames: number): Layer {
  const sanitized = normalizeLayerColors(normalizeHtmlTextMetrics({
    ...layer,
    keyframes: layer.keyframes.map((kf, frameIndex) => {
      const props = { ...DEFAULT_TRANSFORM, ...kf.props }
      ;(Object.keys(DEFAULT_TRANSFORM) as Array<keyof TransformProps>).forEach((key) => {
        if (!isReasonableNumber(props[key])) {
          props[key] = nearestReasonableTransformValue(layer, frameIndex, key) as never
        }
      })
      return { ...kf, props }
    }),
    propertyKeyframes: layer.propertyKeyframes
      ? Object.fromEntries(Object.entries(layer.propertyKeyframes).map(([key, frames]) => [
        key,
        (frames ?? []).map((kf) => ({
          ...kf,
          value: typeof kf.value === 'number' && !isReasonableNumber(kf.value)
            ? DEFAULT_TRANSFORM[key as keyof TransformProps] ?? 0
            : kf.value,
        })),
      ])) as Layer['propertyKeyframes']
      : layer.propertyKeyframes,
  }))
  return normalizeVideoLayer(sanitized, fps, totalFrames)
}

function sanitizeProject(project: MotionProject): MotionProject {
  const colorPalettes = project.colorPalettes?.length ? project.colorPalettes : DEFAULT_COLOR_PALETTES
  const fps = project.canvas.fps || 30
  const totalFrames = Math.max(1, project.canvas.durationFrames || 1)
  return {
    ...project,
    schemaVersion: CURRENT_PROJECT_SCHEMA_VERSION,
    colorPalettes,
    activeColorPaletteId: colorPalettes.some((palette) => palette.id === project.activeColorPaletteId)
      ? project.activeColorPaletteId
      : 'custom',
    layers: withGroupTimeEnvelopes(
      project.layers.map((layer) => sanitizeLayer(layer, fps, totalFrames)),
      totalFrames,
    ),
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

function thumbnailLayerSvg(
  layer: Layer,
  frame: number,
  parentWidth: number,
  parentHeight: number,
  childrenByParent: Map<string | null, Layer[]>,
): string {
  if (!layer.visible || frame < (layer.startFrame ?? 0) || frame > (layer.endFrame ?? Infinity)) return ''

  const p = interpolateProps(frame, layer.keyframes)
  const width = layer.sizeMode === 'fill-canvas' ? parentWidth : layer.width
  const height = layer.sizeMode === 'fill-canvas' ? parentHeight : layer.type === 'line' ? layer.strokeWidth || 2 : layer.height
  const x = parentWidth / 2 + p.x - width / 2
  const y = parentHeight / 2 + p.y - height / 2
  const common = [
    `opacity="${Math.max(0, Math.min(1, p.opacity))}"`,
    `transform="translate(${x} ${y}) rotate(${p.rotateZ} ${width / 2} ${height / 2}) skewX(${p.skewX}) skewY(${p.skewY}) scale(${p.scale * p.scaleX} ${p.scale * p.scaleY})"`,
  ].join(' ')
  const stroke = layer.strokeEnabled && layer.strokeWidth > 0
    ? ` stroke="${escapeXml(layer.strokeColor)}" stroke-width="${layer.strokeWidth}"`
    : ''
  const fill = escapeXml(fillForLayer(layer, '#6366f1'))

  if (layer.type === 'group') {
    const children = childrenByParent.get(layer.id) ?? []
    const surface = layer.fillType !== 'none' || layer.strokeEnabled
      ? `<rect width="${width}" height="${height}" rx="${layer.borderRadius}" fill="${fill}"${stroke}/>`
      : ''
    const content = [...children].reverse().map((child) => thumbnailLayerSvg(child, frame, width, height, childrenByParent)).join('')
    return `<g ${common}>${surface}${content}</g>`
  }
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
    const inset = layer.htmlText ? 0 : 8
    const tx = layer.textAlign === 'center' ? width / 2 : layer.textAlign === 'right' ? width - inset : inset
    const ty = height / 2 + size * 0.35
    return `<g ${common}><rect width="${width}" height="${height}" rx="${layer.borderRadius}" fill="${layer.fillType !== 'none' ? fill : 'transparent'}"/><text x="${tx}" y="${ty}" text-anchor="${anchor}" font-family="${escapeXml(layer.fontFamily || 'Inter')},Arial" font-size="${size}" font-weight="${escapeXml(layer.fontWeight || '400')}" fill="${escapeXml(layer.textColor)}">${escapeXml(layer.text || '')}</text></g>`
  }
  if (layer.type === 'image' && layer.src) {
    const fit = layer.imageFit === 'cover' ? 'xMidYMid slice' : layer.imageFit === 'fill' ? 'none' : 'xMidYMid meet'
    const imageSrc = layer.imageKind === 'svg' ? styledSvgDataUrl(layer.src, layer) : layer.src
    return `<image href="${escapeXml(imageSrc || layer.src)}" width="${width}" height="${height}" preserveAspectRatio="${fit}" ${common}/>`
  }
  if (layer.type === 'video' && layer.src) {
    return `<g ${common}><rect width="${width}" height="${height}" rx="${layer.borderRadius}" fill="#111827"/><path d="M ${width * 0.42} ${height * 0.32} L ${width * 0.42} ${height * 0.68} L ${width * 0.7} ${height * 0.5} Z" fill="#f8fafc" opacity="0.9"/><rect width="${width}" height="${height}" rx="${layer.borderRadius}" fill="none" stroke="#ef4444" stroke-width="${Math.max(2, Math.min(width, height) * 0.025)}" opacity="0.6"/></g>`
  }
  return `<rect width="${width}" height="${height}" rx="${layer.borderRadius}" fill="${fill}"${stroke} ${common}/>`
}

export function thumbnailFor(project: MotionProject) {
  const width = project.canvas.width
  const height = project.canvas.height
  const frame = Math.max(0, Math.min(project.canvas.durationFrames - 1, project.editor.playheadFrame ?? 0))
  const bg = escapeXml(project.canvas.backgroundColor || '#111827')
  const childrenByParent = new Map<string | null, Layer[]>()
  project.layers.forEach((layer) => {
    const parentId = layer.parentId ?? null
    childrenByParent.set(parentId, [...(childrenByParent.get(parentId) ?? []), layer])
  })
  const content = [...(childrenByParent.get(null) ?? [])].reverse().map((layer) => thumbnailLayerSvg(layer, frame, width, height, childrenByParent)).join('')
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
  project = sanitizeProject(migrateProject(project))
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
    const snapshots = await requestJson<ProjectHistorySnapshot[]>(`/api/projects/${encodeURIComponent(projectId)}/history`)
    return snapshots.map((snapshot) => ({
      ...snapshot,
      project: sanitizeProject(migrateProject(snapshot.project)),
    }))
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
    schemaVersion: CURRENT_PROJECT_SCHEMA_VERSION,
    id,
    name: nameOverride || s.projectName || 'Untitled Project',
    createdAt: s.projectCreatedAt || now,
    updatedAt: now,
    colorPalettes: s.colorPalettes,
    activeColorPaletteId: s.activeColorPaletteId,
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
      showOutsideCanvas: s.showOutsideCanvas,
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
  const s = useStore.getState()
  const colorPalettes = s.colorPalettes?.length ? s.colorPalettes : DEFAULT_COLOR_PALETTES
  const project: MotionProject = {
    schemaVersion: CURRENT_PROJECT_SCHEMA_VERSION,
    id: uuid(),
    name: options.name.trim() || 'Untitled Project',
    createdAt: now,
    updatedAt: now,
    colorPalettes,
    activeColorPaletteId: colorPalettes.some((palette) => palette.id === s.activeColorPaletteId)
      ? s.activeColorPaletteId
      : 'custom',
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
    editor: { zoom: 1, panX: 0, panY: 0, selectedLayerIds: [], playheadFrame: 0, showOutsideCanvas: false },
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
