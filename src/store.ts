import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  EditorState, Layer, Keyframe, TransformProps,
  CANVAS_PRESETS, DEFAULT_TRANSFORM, LayerType, Tool,
  TimelineMarker, MotionProject, AnimatableProperty, PairEasingType, KeyframeSelection,
  PropertyKeyframe, ImageKind,
} from './types'
import { getAnimatedPropertyValue, getStaticPropertyValue } from './animationProperties'
import { interpolateProps } from './remotion/interpolateProps'

function uid() { return Math.random().toString(36).slice(2, 9) }

function collectDescendants(layers: Layer[], parentId: string): Layer[] {
  const result: Layer[] = []
  const visit = (id: string) => {
    layers.filter((l) => l.parentId === id).forEach((child) => {
      result.push(child)
      visit(child.id)
    })
  }
  visit(parentId)
  return result
}

function isGroupLayer(layer: Layer) {
  return layer.type === 'group' || layer.isGroup
}

function shiftPropertyKeyframes(layer: Layer, delta: number): Layer['propertyKeyframes'] {
  if (!layer.propertyKeyframes) return layer.propertyKeyframes
  return Object.fromEntries(
    Object.entries(layer.propertyKeyframes).map(([key, keyframes]) => [
      key,
      (keyframes ?? []).map((kf) => ({ ...kf, frame: Math.max(0, kf.frame + delta) })).sort((a, b) => a.frame - b.frame),
    ]),
  ) as Layer['propertyKeyframes']
}

function retimeFrame(frame: number, oldStart: number, newStart: number, scale: number) {
  return Math.max(0, Math.round(newStart + (frame - oldStart) * scale))
}

function retimePropertyKeyframes(layer: Layer, oldStart: number, newStart: number, scale: number): Layer['propertyKeyframes'] {
  if (!layer.propertyKeyframes) return layer.propertyKeyframes
  return Object.fromEntries(
    Object.entries(layer.propertyKeyframes).map(([key, keyframes]) => [
      key,
      (keyframes ?? []).map((kf) => ({ ...kf, frame: retimeFrame(kf.frame, oldStart, newStart, scale) })).sort((a, b) => a.frame - b.frame),
    ]),
  ) as Layer['propertyKeyframes']
}

function getCanvasSize(state: EditorState) {
  const isCustom = state.canvasPreset.name === 'Custom'
  return {
    width: isCustom ? state.customWidth : state.canvasPreset.width,
    height: isCustom ? state.customHeight : state.canvasPreset.height,
  }
}

function getLayerFrameBox(layer: Layer, frame: number, canvasWidth: number, canvasHeight: number) {
  const transform = interpolateProps(frame, layer.keyframes)
  const rawWidth = layer.sizeMode === 'fill-canvas' ? canvasWidth : layer.width
  const rawHeight = layer.sizeMode === 'fill-canvas' ? canvasHeight : layer.type === 'line' ? layer.strokeWidth || 2 : layer.height
  const width = Math.max(1, Math.abs(rawWidth * transform.scale * transform.scaleX))
  const height = Math.max(1, Math.abs(rawHeight * transform.scale * transform.scaleY))
  const centerX = canvasWidth / 2 + transform.x
  const centerY = canvasHeight / 2 + transform.y
  return {
    left: centerX - width / 2,
    right: centerX + width / 2,
    top: centerY - height / 2,
    bottom: centerY + height / 2,
  }
}

function getLayersFrameBounds(layers: Layer[], frame: number, canvasWidth: number, canvasHeight: number, totalFrames: number) {
  if (!layers.length) return null
  const boxes = layers.map((layer) => getLayerFrameBox(layer, frame, canvasWidth, canvasHeight))
  const left = Math.min(...boxes.map((box) => box.left))
  const right = Math.max(...boxes.map((box) => box.right))
  const top = Math.min(...boxes.map((box) => box.top))
  const bottom = Math.max(...boxes.map((box) => box.bottom))
  const width = Math.max(1, Math.round(right - left))
  const height = Math.max(1, Math.round(bottom - top))
  return {
    width,
    height,
    x: left + width / 2 - canvasWidth / 2,
    y: top + height / 2 - canvasHeight / 2,
    startFrame: Math.min(...layers.map((layer) => layer.startFrame ?? 0)),
    endFrame: Math.max(...layers.map((layer) => layer.endFrame ?? totalFrames)),
  }
}

function fitAutoGroups(layers: Layer[], frame: number, canvasWidth: number, canvasHeight: number, totalFrames: number) {
  let next = layers
  for (let pass = 0; pass < 3; pass += 1) {
    let changed = false
    next = next.map((layer) => {
      if (!layer.autoFit || layer.type !== 'group') return layer
      const children = next.filter((child) => child.parentId === layer.id && child.visible)
      if (!children.length) return layer
      const boxes = children.map((child) => getLayerFrameBox(child, frame, canvasWidth, canvasHeight))
      const left = Math.min(...boxes.map((box) => box.left))
      const right = Math.max(...boxes.map((box) => box.right))
      const top = Math.min(...boxes.map((box) => box.top))
      const bottom = Math.max(...boxes.map((box) => box.bottom))
      const width = Math.max(1, Math.round(right - left))
      const height = Math.max(1, Math.round(bottom - top))
      const x = left + width / 2 - canvasWidth / 2
      const y = top + height / 2 - canvasHeight / 2
      const current = interpolateProps(frame, layer.keyframes)
      const existing = layer.keyframes.find((kf) => kf.frame === frame)
      const keyframe: Keyframe = {
        frame,
        easing: existing?.easing ?? layer.keyframes[0]?.easing ?? 'ease-out',
        bezier: existing?.bezier,
        props: { ...current, x, y },
      }
      const keyframes = existing
        ? layer.keyframes.map((kf) => kf.frame === frame ? keyframe : kf)
        : [...layer.keyframes, keyframe].sort((a, b) => a.frame - b.frame)
      if (layer.width !== width || layer.height !== height || current.x !== x || current.y !== y) changed = true
      return {
        ...layer,
        width,
        height,
        startFrame: Math.min(layer.startFrame ?? 0, ...children.map((child) => child.startFrame ?? 0)),
        endFrame: Math.max(layer.endFrame ?? totalFrames, ...children.map((child) => child.endFrame ?? totalFrames)),
        keyframes,
      }
    })
    if (!changed) break
  }
  return next
}

function withAutoFitGroups(state: EditorState, layers: Layer[]) {
  const { width, height } = getCanvasSize(state)
  return fitAutoGroups(layers, state.currentFrame, width, height, state.totalFrames)
}

function upsertTransformKeyframe(layer: Layer, frame: number, props: TransformProps): Layer {
  const current = interpolateProps(frame, layer.keyframes)
  const existing = layer.keyframes.find((kf) => kf.frame === frame)
  const keyframe: Keyframe = {
    frame,
    easing: existing?.easing ?? layer.keyframes[0]?.easing ?? 'ease-out',
    bezier: existing?.bezier,
    props: { ...current, ...props },
  }
  const keyframes = existing
    ? layer.keyframes.map((kf) => kf.frame === frame ? keyframe : kf)
    : [...layer.keyframes, keyframe].sort((a, b) => a.frame - b.frame)

  const propertyKeyframes = { ...(layer.propertyKeyframes ?? {}) }
  ;(['x', 'y'] as const).forEach((key) => {
    const frames = propertyKeyframes[key]
    if (!frames?.length) return
    const value = props[key]
    const frameKey = frames.find((kf) => kf.frame === frame)
    propertyKeyframes[key] = [
      ...frames.filter((kf) => kf.frame !== frame),
      {
        id: frameKey?.id ?? uid(),
        frame,
        value,
        easing: frameKey?.easing ?? 'ease-out',
        bezier: frameKey?.bezier,
      },
    ].sort((a, b) => a.frame - b.frame)
  })

  return { ...layer, keyframes, propertyKeyframes }
}

function upsertPropertyKeyframe(layer: Layer, key: AnimatableProperty, frame: number, value: number | string): Layer {
  const existing = layer.propertyKeyframes?.[key] ?? []
  const current = existing.find((kf) => kf.frame === frame)
  const nextFrame: PropertyKeyframe = {
    id: current?.id ?? uid(),
    frame,
    value,
    easing: current?.easing ?? 'ease-out',
    bezier: current?.bezier,
  }
  return {
    ...layer,
    propertyKeyframes: {
      ...(layer.propertyKeyframes ?? {}),
      [key]: [...existing.filter((kf) => kf.frame !== frame), nextFrame].sort((a, b) => a.frame - b.frame),
    },
  }
}

function setLayerValueAtFrame(layer: Layer, key: AnimatableProperty, value: number | string, frame: number): Layer {
  if (layer.propertyKeyframes?.[key]?.length) {
    return upsertPropertyKeyframe(layer, key, frame, value)
  }

  if (key in DEFAULT_TRANSFORM) {
    const targetFrame = layer.keyframes.length > 1 ? frame : layer.keyframes[0]?.frame ?? 0
    const base = interpolateProps(targetFrame, layer.keyframes)
    const existing = layer.keyframes.find((kf) => kf.frame === targetFrame)
    const keyframe: Keyframe = {
      frame: targetFrame,
      easing: existing?.easing ?? layer.keyframes[0]?.easing ?? 'linear',
      bezier: existing?.bezier,
      props: { ...base, [key]: value } as TransformProps,
    }
    const keyframes = existing
      ? layer.keyframes.map((item) => item.frame === targetFrame ? keyframe : item)
      : [...layer.keyframes, keyframe].sort((a, b) => a.frame - b.frame)
    return { ...layer, keyframes }
  }

  return { ...layer, [key]: value }
}

function getLayerLayoutSize(layer: Layer, frame: number, canvasWidth: number, canvasHeight: number) {
  const p = interpolateProps(frame, layer.keyframes)
  const rawWidth = layer.sizeMode === 'fill-canvas' ? canvasWidth : layer.width
  const rawHeight = layer.sizeMode === 'fill-canvas' ? canvasHeight : layer.type === 'line' ? layer.strokeWidth || 2 : layer.height
  return {
    width: Math.max(1, Math.abs(rawWidth * p.scale * p.scaleX)),
    height: Math.max(1, Math.abs(rawHeight * p.scale * p.scaleY)),
  }
}

function normalizeLayoutLayer(group: Layer, frame: number, canvasWidth: number, canvasHeight: number) {
  const p = interpolateProps(frame, group.keyframes)
  const width = group.sizeMode === 'fill-canvas' ? canvasWidth : group.width
  const height = group.sizeMode === 'fill-canvas' ? canvasHeight : group.type === 'line' ? group.strokeWidth || 2 : group.height
  return {
    p,
    left: canvasWidth / 2 + p.x - width / 2,
    top: canvasHeight / 2 + p.y - height / 2,
    width: Math.max(1, width),
    height: Math.max(1, height),
    padding: Math.max(0, group.layoutPadding ?? 0),
    gap: Math.max(0, group.layoutGap ?? 0),
  }
}

function justifyStart(justify: Layer['layoutJustify'], available: number, used: number) {
  if (justify === 'center') return Math.max(0, (available - used) / 2)
  if (justify === 'end') return Math.max(0, available - used)
  return 0
}

function justifyGap(justify: Layer['layoutJustify'], available: number, usedWithoutGap: number, gap: number, count: number) {
  if (justify === 'space-between' && count > 1) return Math.max(gap, (available - usedWithoutGap) / (count - 1))
  return gap
}

function alignOffset(align: Layer['layoutAlign'], available: number, childSize: number) {
  if (align === 'center') return Math.max(0, (available - childSize) / 2)
  if (align === 'end') return Math.max(0, available - childSize)
  return 0
}

function applyGroupLayout(layers: Layer[], groupId: string, state: EditorState) {
  const group = layers.find((layer) => layer.id === groupId)
  if (!group || (group.layoutMode ?? 'none') === 'none') return layers

  const children = layers.filter((layer) => layer.parentId === groupId)
  if (!children.length) return layers

  const { width: canvasWidth, height: canvasHeight } = getCanvasSize(state)
  const frame = state.currentFrame
  const groupBox = normalizeLayoutLayer(group, frame, canvasWidth, canvasHeight)
  const availableWidth = Math.max(1, groupBox.width - groupBox.padding * 2)
  const availableHeight = Math.max(1, groupBox.height - groupBox.padding * 2)
  const placements = new Map<string, { x: number; y: number; width?: number; height?: number }>()

  if (group.layoutMode === 'grid') {
    const columns = Math.max(1, Math.min(children.length, group.gridColumns ?? 2))
    const cellWidth = Math.max(1, (availableWidth - groupBox.gap * (columns - 1)) / columns)
    const sizes = children.map((child) => getLayerLayoutSize(child, frame, canvasWidth, canvasHeight))
    const rowHeights: number[] = []
    sizes.forEach((size, index) => {
      const row = Math.floor(index / columns)
      rowHeights[row] = Math.max(rowHeights[row] ?? 0, size.height)
    })
    children.forEach((child, index) => {
      const size = sizes[index]
      const row = Math.floor(index / columns)
      const col = index % columns
      const yBefore = rowHeights.slice(0, row).reduce((sum, h) => sum + h, 0) + groupBox.gap * row
      const childWidth = group.layoutAlign === 'stretch' ? cellWidth : size.width
      const x = groupBox.left + groupBox.padding + col * (cellWidth + groupBox.gap) + cellWidth / 2
      const y = groupBox.top + groupBox.padding + yBefore + rowHeights[row] / 2
      placements.set(child.id, {
        x: Math.round(x - canvasWidth / 2),
        y: Math.round(y - canvasHeight / 2),
        width: group.layoutAlign === 'stretch' ? Math.round(childWidth) : undefined,
      })
    })
  } else {
    const isRow = (group.layoutDirection ?? 'row') === 'row'
    const sizes = children.map((child) => getLayerLayoutSize(child, frame, canvasWidth, canvasHeight))
    const mainAvailable = isRow ? availableWidth : availableHeight
    const crossAvailable = isRow ? availableHeight : availableWidth
    const usedWithoutGap = sizes.reduce((sum, size) => sum + (isRow ? size.width : size.height), 0)
    const gap = justifyGap(group.layoutJustify, mainAvailable, usedWithoutGap, groupBox.gap, children.length)
    const used = usedWithoutGap + gap * Math.max(0, children.length - 1)
    let cursor = justifyStart(group.layoutJustify, mainAvailable, used)

    children.forEach((child, index) => {
      const size = sizes[index]
      const mainSize = isRow ? size.width : size.height
      const crossSize = group.layoutAlign === 'stretch' ? crossAvailable : (isRow ? size.height : size.width)
      const mainCenter = cursor + mainSize / 2
      const crossCenter = alignOffset(group.layoutAlign, crossAvailable, crossSize) + crossSize / 2
      const x = isRow
        ? groupBox.left + groupBox.padding + mainCenter
        : groupBox.left + groupBox.padding + crossCenter
      const y = isRow
        ? groupBox.top + groupBox.padding + crossCenter
        : groupBox.top + groupBox.padding + mainCenter
      placements.set(child.id, {
        x: Math.round(x - canvasWidth / 2),
        y: Math.round(y - canvasHeight / 2),
        width: !isRow && group.layoutAlign === 'stretch' ? Math.round(crossAvailable) : undefined,
        height: isRow && group.layoutAlign === 'stretch' ? Math.round(crossAvailable) : undefined,
      })
      cursor += mainSize + gap
    })
  }

  return layers.map((layer) => {
    const placement = placements.get(layer.id)
    if (!placement) return layer
    const current = interpolateProps(frame, layer.keyframes)
    const moved = upsertTransformKeyframe(layer, frame, { ...current, x: placement.x, y: placement.y })
    return {
      ...moved,
      width: placement.width && layer.type !== 'line' ? placement.width : moved.width,
      height: placement.height && layer.type !== 'line' ? placement.height : moved.height,
    }
  })
}

function normalizeLayoutGroups(state: EditorState, layers: Layer[], changedId?: string, includeAll = false) {
  const groups = new Set<string>()
  const changed = changedId ? layers.find((layer) => layer.id === changedId) : null
  if (changed?.parentId) groups.add(changed.parentId)
  if (changed && (changed.type === 'group' || changed.isGroup)) groups.add(changed.id)
  if (includeAll) {
    layers.forEach((layer) => {
      if ((layer.layoutMode ?? 'none') !== 'none') groups.add(layer.id)
    })
  }
  let next = layers
  groups.forEach((id) => {
    next = applyGroupLayout(next, id, state)
  })
  return next
}

function normalizeLayerTree(state: EditorState, layers: Layer[], changedId?: string, includeAllLayouts = false) {
  return withAutoFitGroups(state, normalizeLayoutGroups(state, layers, changedId, includeAllLayouts))
}

const LAYOUT_PROP_KEYS = new Set<keyof Layer>([
  'layoutMode',
  'layoutDirection',
  'layoutGap',
  'layoutPadding',
  'layoutAlign',
  'layoutJustify',
  'gridColumns',
])

const TYPE_NAMES: Record<LayerType, string> = {
  rectangle: 'Rectangle', ellipse: 'Ellipse', line: 'Line',
  triangle: 'Triangle', path: 'Path', text: 'Text', image: 'Image',
  group: 'Group',
}

function makeLayer(type: LayerType = 'rectangle', overrides: Partial<Layer> = {}): Layer {
  return {
    id: uid(),
    name: TYPE_NAMES[type],
    type,
    visible: true,
    locked: false,
    parentId: null,
    collapsed: false,
    isGroup: type === 'group',
    autoFit: false,
    width: type === 'text' ? 400 : type === 'line' ? 200 : 200,
    height: type === 'text' ? 80 : type === 'line' ? 4 : type === 'path' ? 200 : 140,
    sizeMode: 'fixed',
    layoutMode: 'none',
    layoutDirection: 'row',
    layoutGap: 12,
    layoutPadding: 16,
    layoutAlign: 'center',
    layoutJustify: 'start',
    gridColumns: 2,
    fillType: 'solid',
    fillColor: type === 'group' ? 'transparent' : `hsl(${Math.floor(Math.random() * 360)},65%,55%)`,
    gradientStops: [{ color: '#6366f1', position: 0 }, { color: '#a855f7', position: 100 }],
    gradientAngle: 135,
    strokeEnabled: type === 'line' || type === 'path',
    strokeColor: '#ffffff',
    strokeWidth: type === 'line' ? 2 : type === 'path' ? 4 : 0,
    borderRadius: 0,
    pathData: type === 'path' ? 'M 20 180 L 100 20 L 180 180' : undefined,
    pathClosed: false,
    shadowEnabled: false,
    shadowColor: 'rgba(0,0,0,0.5)',
    text: type === 'text' ? 'Edit text' : '',
    fontFamily: 'Inter',
    fontSize: 48,
    fontWeight: '600',
    textAlign: 'center',
    letterSpacing: 0,
    lineHeight: 1.2,
    textColor: '#ffffff',
    textSpans: [],
    textRevealMode: 'plain',
    imageFit: 'contain',
    svgStrokeColor: '#ffffff',
    svgFillColor: '#ffffff',
    svgFillEnabled: false,
    svgStrokeWidth: 2,
    startFrame: 0,
    endFrame: 150,
    keyframes: [{ frame: 0, easing: 'ease-out', props: { ...DEFAULT_TRANSFORM } }],
    ...overrides,
  }
}

interface Actions {
  loadProject: (project: MotionProject) => void
  renameProject: (name: string) => void
  createEmptyProjectState: (project: MotionProject) => void
  // Layers
  addLayer: (type: LayerType) => void
  addGeneratedLayer: (type: LayerType, overrides?: Partial<Layer>) => string
  addImage: (src: string, name: string, imageKind?: 'raster' | 'svg', naturalWidth?: number, naturalHeight?: number) => void
  replaceImageSource: (id: string, src: string, imageKind: ImageKind, naturalWidth?: number, naturalHeight?: number) => void
  deleteLayer: (id: string) => void
  duplicateLayer: (id: string) => void
  toggleVisibility: (id: string) => void
  toggleLock: (id: string) => void
  selectLayer: (id: string | null, multi?: boolean) => void
  selectLayers: (ids: string[]) => void
  selectKeyframe: (selection: KeyframeSelection, multi?: boolean) => void
  clearSelectedKeyframes: () => void
  deleteSelectedKeyframes: () => void
  renameLayer: (id: string, name: string) => void
  updateLayerProp: <K extends keyof Layer>(id: string, key: K, value: Layer[K]) => void
  setLayerAnimatedProperty: (id: string, key: AnimatableProperty, value: number | string) => void
  addPropertyKeyframe: (layerId: string, key: AnimatableProperty, frame?: number, value?: number | string) => void
  removePropertyKeyframe: (layerId: string, key: AnimatableProperty, frame: number) => void
  movePropertyKeyframe: (layerId: string, key: AnimatableProperty, fromFrame: number, toFrame: number) => void
  updatePropertyKeyframeEasing: (layerId: string, key: AnimatableProperty, frame: number, easing: PairEasingType, bezier?: [number, number, number, number]) => void
  reorderLayers: (from: number, to: number) => void
  // Keyframes
  addKeyframe: (layerId: string, frame: number, props: TransformProps, easing?: string) => void
  addKeyframes: (updates: Array<{ layerId: string; props: TransformProps }>, frame: number, easing?: string) => void
  resizeLayerBox: (layerId: string, frame: number, props: TransformProps, size: { width?: number; height?: number }) => void
  removeKeyframe: (layerId: string, frame: number) => void
  moveKeyframe: (layerId: string, fromFrame: number, toFrame: number) => void
  updateKeyframeEasing: (layerId: string, frame: number, easing: PairEasingType, bezier?: [number, number, number, number]) => void
  // Time range
  updateLayerTimeRange: (layerId: string, startFrame: number, endFrame: number) => void
  setLayerRange: (layerId: string, startFrame: number, endFrame: number, keyframeFrames?: number[]) => void
  // Reorder
  reorderLayersById: (orderedIds: string[]) => void
  moveLayerToParent: (layerIds: string[], parentId: string | null, insertAfterId?: string | null) => void
  toggleLayerCollapsed: (id: string) => void
  groupSelected: () => void
  ungroupLayer: (id: string) => void
  moveSelectedUpLevel: () => void
  moveSelectedIntoPreviousGroup: () => void
  moveSelectedWithinParent: (direction: -1 | 1) => void
  selectChildren: (id: string) => void
  selectSiblings: (id: string) => void
  collapseAllGroups: () => void
  expandAllGroups: () => void
  // Playback
  setCurrentFrame: (frame: number) => void
  setTotalFrames: (frames: number) => void
  setPlaying: (playing: boolean) => void
  // Canvas
  setCanvasPreset: (name: string) => void
  setCustomDimension: (key: 'customWidth' | 'customHeight', value: number) => void
  setCanvasBackgroundColor: (color: string) => void
  // UI
  setTheme: (theme: 'dark' | 'light') => void
  setTool: (tool: Tool) => void
  setTimelineZoom: (zoom: number) => void
  setTimelineScrollX: (scrollX: number) => void
  setTimelinePanelHeight: (height: number) => void
  setShowAllSubtracks: (show: boolean) => void
  setShowValueGraph: (show: boolean) => void
  setEditorViewport: (zoom: number, panX: number, panY: number) => void
  setEditingTextLayerId: (id: string | null) => void
  setTextSelection: (selection: { layerId: string; start: number; end: number } | null) => void
  updateTextSelectionStyle: (layerId: string, style: Partial<Pick<Layer, 'fontFamily' | 'fontSize' | 'fontWeight' | 'textColor' | 'letterSpacing'>>) => void
  beginInteraction: (snapshot?: boolean) => void
  endInteraction: () => void
  setAutoKeyframe: (v: boolean) => void
  // Markers
  addMarker: (frame: number) => void
  removeMarker: (id: string) => void
  // Loop
  setLoop: (inFrame: number, outFrame: number) => void
  clearLoop: () => void
  setLoopEnabled: (enabled: boolean) => void
  // History
  undo: () => void
  redo: () => void
  _snapshot: () => void
}

interface HistorySlice {
  _past: string[]   // JSON-serialized Layer[]
  _future: string[]
}

type Store = EditorState & HistorySlice & Actions

const initialLayers: Layer[] = [
  makeLayer('rectangle', { name: 'Rectangle 1', fillColor: '#6366f1', width: 320, height: 180, startFrame: 0, endFrame: 150 }),
]

export const useStore = create<Store>()(
  persist(
    (set, get) => ({
      // EditorState
      projectId: null,
      projectName: 'Untitled Project',
      projectCreatedAt: null,
      projectUpdatedAt: null,
      layers: initialLayers,
      guides: [],
      selectedLayerIds: [],
      selectedKeyframes: [],
      currentFrame: 0,
      totalFrames: 150,
      fps: 30,
      isPlaying: false,
      canvasPreset: CANVAS_PRESETS[0],
      customWidth: 1280,
      customHeight: 720,
      canvasBackgroundColor: '#1a1a2e',
      theme: 'dark',
      currentTool: 'select',
      timelineZoom: 1,
      timelineScrollX: 0,
      timelinePanelHeight: 200,
      showAllSubtracks: false,
      showValueGraph: false,
      editorZoom: 1,
      editorPanX: 0,
      editorPanY: 0,
      editingTextLayerId: null,
      textSelection: null,
      activeInteractionCount: 0,
      markers: [],
      loopIn: null,
      loopOut: null,
      loopEnabled: false,
      autoKeyframe: false,
      // History
      _past: [],
      _future: [],

      loadProject: (project) => {
        const preset = CANVAS_PRESETS.find((p) => p.name === project.canvas.presetName)
          ?? CANVAS_PRESETS.find((p) => p.width === project.canvas.width && p.height === project.canvas.height)
          ?? CANVAS_PRESETS[CANVAS_PRESETS.length - 1]
        set({
          projectId: project.id,
          projectName: project.name,
          projectCreatedAt: project.createdAt,
          projectUpdatedAt: project.updatedAt,
          layers: project.layers,
          guides: project.guides ?? [],
          totalFrames: project.canvas.durationFrames,
          fps: project.canvas.fps,
          canvasPreset: preset.name === 'Custom' ? CANVAS_PRESETS[CANVAS_PRESETS.length - 1] : preset,
          customWidth: project.canvas.width,
          customHeight: project.canvas.height,
          canvasBackgroundColor: project.canvas.backgroundColor ?? '#1a1a2e',
          selectedLayerIds: project.editor.selectedLayerIds ?? [],
          selectedKeyframes: [],
          currentFrame: project.editor.playheadFrame ?? 0,
          timelineZoom: project.timeline.zoom ?? 1,
          timelineScrollX: project.timeline.scrollX ?? 0,
          editorZoom: project.editor.zoom ?? 1,
          editorPanX: project.editor.panX ?? 0,
          editorPanY: project.editor.panY ?? 0,
          editingTextLayerId: null,
          textSelection: null,
          activeInteractionCount: 0,
          _past: [],
          _future: [],
        })
      },

      createEmptyProjectState: (project) => get().loadProject(project),

      renameProject: (name) => set({ projectName: name, projectUpdatedAt: new Date().toISOString() }),

      _snapshot: () => {
        const { layers, _past } = get()
        set({ _past: [..._past.slice(-49), JSON.stringify(layers)], _future: [] })
      },

      undo: () => {
        const { _past, layers, _future } = get()
        if (!_past.length) return
        const newPast = [..._past]
        const prev = JSON.parse(newPast.pop()!) as Layer[]
        set({
          layers: prev,
          _past: newPast,
          _future: [JSON.stringify(layers), ..._future.slice(0, 49)],
        })
      },

      redo: () => {
        const { _past, layers, _future } = get()
        if (!_future.length) return
        const newFuture = [..._future]
        const next = JSON.parse(newFuture.shift()!) as Layer[]
        set({
          layers: next,
          _past: [..._past, JSON.stringify(layers)],
          _future: newFuture,
        })
      },

      addLayer: (type) => {
        get()._snapshot()
        const { layers, totalFrames } = get()
        const layer = makeLayer(type, { name: `${TYPE_NAMES[type]} ${layers.filter(l => l.type === type).length + 1}`, endFrame: totalFrames })
        set({ layers: [...layers, layer], selectedLayerIds: [layer.id], selectedKeyframes: [] })
      },

      addGeneratedLayer: (type, overrides = {}) => {
        get()._snapshot()
        const { layers, totalFrames } = get()
        const layer = makeLayer(type, {
          name: `${TYPE_NAMES[type]} ${layers.filter(l => l.type === type).length + 1}`,
          endFrame: totalFrames,
          ...overrides,
        })
        set((s) => ({ layers: [...s.layers, layer], selectedLayerIds: [layer.id] }))
        return layer.id
      },

      addImage: (src, name, imageKind = 'raster', naturalWidth, naturalHeight) => {
        get()._snapshot()
        const { totalFrames } = get()
        const maxW = 360
        const maxH = 260
        const aspect = naturalWidth && naturalHeight ? naturalWidth / naturalHeight : 1.5
        const scale = naturalWidth && naturalHeight ? Math.min(1, maxW / naturalWidth, maxH / naturalHeight) : 1
        const width = naturalWidth && naturalHeight ? Math.max(1, Math.round(naturalWidth * scale)) : 300
        const height = naturalWidth && naturalHeight ? Math.max(1, Math.round(width / aspect)) : 200
        set((s) => ({
          layers: [
            ...s.layers,
            makeLayer('image', {
              name,
              src,
              imageKind,
              imageFit: 'contain',
              imageNaturalWidth: naturalWidth,
              imageNaturalHeight: naturalHeight,
              width,
              height,
              endFrame: totalFrames,
            }),
          ],
        }))
      },

      replaceImageSource: (id, src, imageKind, naturalWidth, naturalHeight) => {
        get()._snapshot()
        set((s) => ({
          layers: s.layers.map((layer) => layer.id === id && layer.type === 'image'
            ? {
                ...layer,
                src,
                imageKind,
                imageNaturalWidth: naturalWidth,
                imageNaturalHeight: naturalHeight,
              }
            : layer
          ),
        }))
      },

      deleteLayer: (id) => {
        get()._snapshot()
        const ids = new Set<string>([id])
        let changed = true
        while (changed) {
          changed = false
          get().layers.forEach((layer) => {
            if (layer.parentId && ids.has(layer.parentId) && !ids.has(layer.id)) {
              ids.add(layer.id)
              changed = true
            }
          })
        }
        set((s) => {
          const layers = s.layers.filter((l) => !ids.has(l.id))
          return {
            layers: normalizeLayerTree(s, layers, undefined, true),
            selectedLayerIds: s.selectedLayerIds.filter((sid) => !ids.has(sid)),
            selectedKeyframes: s.selectedKeyframes.filter((kf) => !ids.has(kf.layerId)),
          }
        })
      },

      duplicateLayer: (id) => {
        get()._snapshot()
        const { layers } = get()
        const src = layers.find((l) => l.id === id)
        if (!src) return
        const descendants = collectDescendants(layers, id)
        const idMap = new Map<string, string>([[id, uid()]])
        descendants.forEach((l) => idMap.set(l.id, uid()))
        const copies = [src, ...descendants].map((l, idx) => ({
          ...l,
          id: idMap.get(l.id)!,
          name: idx === 0 ? `${l.name} Copy` : l.name,
          parentId: l.id === id ? src.parentId ?? null : idMap.get(l.parentId ?? '') ?? l.parentId ?? null,
        }))
        const idx = layers.findIndex((l) => l.id === id)
        const next = [...layers]
        next.splice(idx + 1, 0, ...copies)
        set((s) => ({ layers: normalizeLayerTree(s, next, copies[0].parentId ?? undefined, true), selectedLayerIds: [copies[0].id] }))
      },

      toggleVisibility: (id) =>
        set((s) => ({ layers: s.layers.map((l) => l.id === id ? { ...l, visible: !l.visible } : l) })),

      toggleLock: (id) =>
        set((s) => ({ layers: s.layers.map((l) => l.id === id ? { ...l, locked: !l.locked } : l) })),

      selectLayer: (id, multi = false) => {
        if (!id) { set({ selectedLayerIds: [], selectedKeyframes: [] }); return }
        if (multi) {
          const { selectedLayerIds } = get()
          const next = selectedLayerIds.includes(id)
            ? selectedLayerIds.filter((x) => x !== id)
            : [...selectedLayerIds, id]
          set({ selectedLayerIds: next, selectedKeyframes: [] })
        } else {
          set({ selectedLayerIds: [id], selectedKeyframes: [] })
        }
      },

      selectLayers: (ids) => set({ selectedLayerIds: ids, selectedKeyframes: [] }),

      selectKeyframe: (selection, multi = false) => {
        set((s) => {
          const exists = s.selectedKeyframes.some((kf) =>
            kf.layerId === selection.layerId && kf.frame === selection.frame && kf.propKey === selection.propKey
          )
          const selectedKeyframes = multi
            ? exists
              ? s.selectedKeyframes.filter((kf) => !(kf.layerId === selection.layerId && kf.frame === selection.frame && kf.propKey === selection.propKey))
              : [...s.selectedKeyframes, selection]
            : [selection]
          return { selectedKeyframes, selectedLayerIds: [selection.layerId] }
        })
      },

      clearSelectedKeyframes: () => set({ selectedKeyframes: [] }),

      deleteSelectedKeyframes: () => {
        const selected = get().selectedKeyframes
        if (!selected.length) return
        get()._snapshot()
        set((s) => ({
          layers: s.layers.map((layer) => {
            const selections = selected.filter((kf) => kf.layerId === layer.id)
            if (!selections.length) return layer
            let nextLayer = { ...layer }
            const fullFrames = new Set(selections.filter((kf) => !kf.propKey).map((kf) => kf.frame))
            if (fullFrames.size) nextLayer.keyframes = nextLayer.keyframes.filter((kf) => !fullFrames.has(kf.frame))
            const byProp = new Map<AnimatableProperty, Set<number>>()
            selections.filter((kf) => kf.propKey).forEach((kf) => {
              const key = kf.propKey!
              byProp.set(key, new Set([...(byProp.get(key) ?? []), kf.frame]))
            })
            if (byProp.size) {
              nextLayer = { ...nextLayer, propertyKeyframes: { ...(nextLayer.propertyKeyframes ?? {}) } }
              byProp.forEach((frames, key) => {
                nextLayer.propertyKeyframes![key] = (nextLayer.propertyKeyframes?.[key] ?? []).filter((kf) => !frames.has(kf.frame))
              })
            }
            return nextLayer
          }),
          selectedKeyframes: [],
        }))
      },

      renameLayer: (id, name) =>
        set((s) => ({ layers: s.layers.map((l) => l.id === id ? { ...l, name } : l) })),

      updateLayerProp: (id, key, value) => {
        set((s) => {
          const layers = s.layers.map((l) => l.id === id ? { ...l, [key]: value } : l)
          return { layers: normalizeLayerTree(s, layers, id, LAYOUT_PROP_KEYS.has(key)) }
        })
      },

      setLayerAnimatedProperty: (id, key, value) => {
        const { autoKeyframe, currentFrame } = get()
        if (autoKeyframe) {
          get().addPropertyKeyframe(id, key, currentFrame, value)
          return
        }
        set((s) => {
          const layers = s.layers.map((l) => l.id === id ? setLayerValueAtFrame(l, key, value, currentFrame) : l)
          const shouldLayout = key !== 'x' && key !== 'y'
          return { layers: shouldLayout ? normalizeLayerTree(s, layers, id, false) : withAutoFitGroups(s, layers) }
        })
      },

      addPropertyKeyframe: (layerId, key, frame = get().currentFrame, value) => {
        if (get().activeInteractionCount === 0) get()._snapshot()
        set((s) => {
          const layers = s.layers.map((layer) => {
            if (layer.id !== layerId) return layer
            const transform = interpolateProps(frame, layer.keyframes)
            const resolvedValue = value ?? getAnimatedPropertyValue(layer, key, frame, transform) ?? getStaticPropertyValue(layer, transform, key)
            return upsertPropertyKeyframe(layer, key, frame, resolvedValue)
          })
          const shouldLayout = key !== 'x' && key !== 'y'
          return { layers: shouldLayout ? normalizeLayerTree(s, layers, layerId, false) : withAutoFitGroups(s, layers) }
        })
      },

      removePropertyKeyframe: (layerId, key, frame) => {
        get()._snapshot()
        set((s) => ({
          layers: s.layers.map((layer) => {
            if (layer.id !== layerId) return layer
            return {
              ...layer,
              propertyKeyframes: {
                ...(layer.propertyKeyframes ?? {}),
                [key]: (layer.propertyKeyframes?.[key] ?? []).filter((kf) => kf.frame !== frame),
              },
            }
          }),
        }))
      },

      movePropertyKeyframe: (layerId, key, fromFrame, toFrame) => {
        set((s) => ({
          layers: s.layers.map((layer) => {
            if (layer.id !== layerId) return layer
            return {
              ...layer,
              propertyKeyframes: {
                ...(layer.propertyKeyframes ?? {}),
                [key]: (layer.propertyKeyframes?.[key] ?? [])
                  .map((kf) => kf.frame === fromFrame ? { ...kf, frame: toFrame } : kf)
                  .sort((a, b) => a.frame - b.frame),
              },
            }
          }),
          selectedKeyframes: s.selectedKeyframes.map((kf) =>
            kf.layerId === layerId && kf.propKey === key && kf.frame === fromFrame ? { ...kf, frame: toFrame } : kf
          ),
        }))
      },

      updatePropertyKeyframeEasing: (layerId, key, frame, easing, bezier) => {
        set((s) => ({
          layers: s.layers.map((layer) => {
            if (layer.id !== layerId) return layer
            return {
              ...layer,
              propertyKeyframes: {
                ...(layer.propertyKeyframes ?? {}),
                [key]: (layer.propertyKeyframes?.[key] ?? []).map((kf) =>
                  kf.frame === frame ? { ...kf, easing, bezier: bezier ?? kf.bezier } : kf
                ),
              },
            }
          }),
        }))
      },

      reorderLayers: (from, to) => {
        get()._snapshot()
        set((s) => {
          const layers = [...s.layers]
          const [item] = layers.splice(from, 1)
          layers.splice(to, 0, item)
          return { layers: normalizeLayerTree(s, layers, item?.parentId ?? undefined, true) }
        })
      },

      addKeyframe: (layerId, frame, props, easing = 'ease-out') => {
        if (get().activeInteractionCount === 0) get()._snapshot()
        set((s) => {
          const layers = s.layers.map((l) => {
            if (l.id !== layerId) return l
            const existing = l.keyframes.find((k) => k.frame === frame)
            const kf: Keyframe = { frame, easing: (easing as Keyframe['easing']), props }
            const keyframes = existing
              ? l.keyframes.map((k) => k.frame === frame ? kf : k)
              : [...l.keyframes, kf].sort((a, b) => a.frame - b.frame)
            return { ...l, keyframes }
          })
          return { layers: normalizeLayerTree(s, layers, layerId, false) }
        })
      },

      addKeyframes: (updates, frame, easing = 'ease-out') => {
        if (!updates.length) return
        if (get().activeInteractionCount === 0) get()._snapshot()
        set((s) => {
          const byId = new Map(updates.map((update) => [update.layerId, update.props]))
          const layers = s.layers.map((layer) => {
            const props = byId.get(layer.id)
            if (!props) return layer
            const existing = layer.keyframes.find((keyframe) => keyframe.frame === frame)
            const kf: Keyframe = {
              frame,
              easing: (easing as Keyframe['easing']),
              bezier: existing?.bezier,
              props,
            }
            const keyframes = existing
              ? layer.keyframes.map((keyframe) => keyframe.frame === frame ? kf : keyframe)
              : [...layer.keyframes, kf].sort((a, b) => a.frame - b.frame)
            return { ...layer, keyframes }
          })
          return { layers: withAutoFitGroups(s, layers) }
        })
      },

      resizeLayerBox: (layerId, frame, props, size) => {
        if (get().activeInteractionCount === 0) get()._snapshot()
        set((s) => {
          const layers = s.layers.map((layer) => {
            if (layer.id !== layerId) return layer
            let next = upsertTransformKeyframe(layer, frame, props)
            if (typeof size.width === 'number' && Number.isFinite(size.width) && layer.type !== 'line') {
              next = setLayerValueAtFrame(next, 'width', Math.max(1, Math.round(size.width)), frame)
            }
            if (typeof size.height === 'number' && Number.isFinite(size.height)) {
              const height = Math.max(1, Math.round(size.height))
              next = layer.type === 'line'
                ? { ...next, strokeWidth: height }
                : setLayerValueAtFrame(next, 'height', height, frame)
            }
            return next
          })
          return { layers: normalizeLayerTree(s, layers, layerId, false) }
        })
      },

      updateLayerTimeRange: (layerId, startFrame, endFrame) => {
        if (get().activeInteractionCount === 0) get()._snapshot()
        set((s) => ({
          layers: s.layers.map((l) => l.id === layerId ? { ...l, startFrame, endFrame } : l),
        }))
      },

      setLayerRange: (layerId, startFrame, endFrame, keyframeFrames) => {
        if (get().activeInteractionCount === 0) get()._snapshot()
        set((s) => {
          const target = s.layers.find((l) => l.id === layerId)
          if (!target) return {}
          if (isGroupLayer(target)) {
            const targetIds = new Set([target.id, ...collectDescendants(s.layers, target.id).map((l) => l.id)])
            const timingLayers = s.layers.filter((l) => targetIds.has(l.id))
            const oldStart = Math.min(...timingLayers.map((l) => l.startFrame ?? 0))
            const oldEnd = Math.max(...timingLayers.map((l) => l.endFrame ?? s.totalFrames))
            const oldDuration = Math.max(1, oldEnd - oldStart)
            const nextDuration = Math.max(1, endFrame - startFrame)
            const scale = nextDuration / oldDuration
            return {
              layers: s.layers.map((l) => {
                if (!targetIds.has(l.id)) return l
                const nextStart = l.id === layerId ? startFrame : retimeFrame(l.startFrame ?? 0, oldStart, startFrame, scale)
                const nextEnd = l.id === layerId ? endFrame : retimeFrame(l.endFrame ?? s.totalFrames, oldStart, startFrame, scale)
                return {
                  ...l,
                  startFrame: Math.min(nextStart, nextEnd - 1),
                  endFrame: Math.max(nextStart + 1, nextEnd),
                  keyframes: l.keyframes
                    .map((kf) => ({ ...kf, frame: retimeFrame(kf.frame, oldStart, startFrame, scale) }))
                    .sort((a, b) => a.frame - b.frame),
                  propertyKeyframes: retimePropertyKeyframes(l, oldStart, startFrame, scale),
                }
              }),
              selectedKeyframes: s.selectedKeyframes.map((kf) =>
                targetIds.has(kf.layerId) ? { ...kf, frame: retimeFrame(kf.frame, oldStart, startFrame, scale) } : kf
              ),
            }
          }
          const delta = startFrame - (target.startFrame ?? 0)
          return {
            layers: s.layers.map((l) => {
              if (l.id !== layerId) return l
              const sorted = [...l.keyframes].sort((a, b) => a.frame - b.frame)
              const newKeyframes = sorted
                .map((kf, i) => ({ ...kf, frame: Math.max(0, keyframeFrames?.[i] ?? kf.frame + delta) }))
                .sort((a, b) => a.frame - b.frame)
              return {
                ...l,
                startFrame,
                endFrame,
                keyframes: newKeyframes,
                propertyKeyframes: shiftPropertyKeyframes(l, delta),
              }
            }),
            selectedKeyframes: s.selectedKeyframes.map((kf) =>
              kf.layerId === layerId ? { ...kf, frame: Math.max(0, kf.frame + delta) } : kf
            ),
          }
        })
      },

      reorderLayersById: (orderedIds) => {
        get()._snapshot()
        set((s) => {
          const map = new Map(s.layers.map((l) => [l.id, l]))
          const ordered = orderedIds.map((id) => map.get(id)).filter(Boolean) as typeof s.layers
          const missing = s.layers.filter((l) => !orderedIds.includes(l.id))
          const layers = [...ordered, ...missing]
          return { layers: normalizeLayerTree(s, layers, undefined, true) }
        })
      },

      moveLayerToParent: (layerIds, parentId, insertAfterId = null) => {
        const { layers } = get()
        const moving = layers.filter((l) => layerIds.includes(l.id))
        if (!moving.length) return
        if (parentId && moving.some((l) => l.id === parentId || collectDescendants(layers, l.id).some((d) => d.id === parentId))) return
        get()._snapshot()
        set((s) => {
          const target = parentId ? s.layers.find((l) => l.id === parentId) : null
          if (target && target.type !== 'group' && !target.isGroup) {
            const wrapIds = Array.from(new Set([...layerIds, target.id]))
            const wrapLayers = s.layers.filter((l) => wrapIds.includes(l.id))
            const { width: canvasWidth, height: canvasHeight } = getCanvasSize(s)
            const bounds = getLayersFrameBounds(wrapLayers, s.currentFrame, canvasWidth, canvasHeight, s.totalFrames)
            if (!bounds) return {}
            const group = makeLayer('group', {
              name: 'Group',
              parentId: target.parentId ?? null,
              width: bounds.width,
              height: bounds.height,
              sizeMode: 'fit-content',
              fillType: 'none',
              strokeEnabled: false,
              autoFit: true,
              startFrame: bounds.startFrame,
              endFrame: bounds.endFrame,
              keyframes: [{
                frame: s.currentFrame,
                easing: 'ease-out',
                props: {
                  ...DEFAULT_TRANSFORM,
                  x: bounds.x,
                  y: bounds.y,
                },
              }],
            })
            const firstIdx = Math.min(...wrapLayers.map((l) => s.layers.findIndex((item) => item.id === l.id)).filter((idx) => idx >= 0))
            const next = [...s.layers]
            next.splice(firstIdx, 0, group)
            return {
              layers: normalizeLayerTree(s, next.map((l) => wrapIds.includes(l.id) ? { ...l, parentId: group.id } : l), group.id, true),
              selectedLayerIds: [group.id],
            }
          }
          let next = s.layers.map((l) => {
            if (layerIds.includes(l.id)) return { ...l, parentId }
            return l
          })
          if (insertAfterId) {
            const movingSet = new Set(layerIds)
            const pulled = next.filter((l) => movingSet.has(l.id))
            next = next.filter((l) => !movingSet.has(l.id))
            const idx = next.findIndex((l) => l.id === insertAfterId)
            next.splice(idx + 1, 0, ...pulled)
          }
          return { layers: normalizeLayerTree(s, next, parentId ?? layerIds[0], true) }
        })
      },

      toggleLayerCollapsed: (id) =>
        set((s) => ({ layers: s.layers.map((l) => l.id === id ? { ...l, collapsed: !l.collapsed } : l) })),

      groupSelected: () => {
        const { selectedLayerIds } = get()
        if (selectedLayerIds.length === 0) return
        get()._snapshot()
        set((s) => {
          const selected = s.layers.filter((l) => selectedLayerIds.includes(l.id))
          if (!selected.length) return {}
          const sharedParent = selected.every((layer) => (layer.parentId ?? null) === (selected[0].parentId ?? null))
            ? selected[0].parentId ?? null
            : null
          const { width: canvasWidth, height: canvasHeight } = getCanvasSize(s)
          const bounds = getLayersFrameBounds(selected, s.currentFrame, canvasWidth, canvasHeight, s.totalFrames)
          if (!bounds) return {}
          const group = makeLayer('group', {
            name: 'Group',
            parentId: sharedParent,
            width: bounds.width,
            height: bounds.height,
            sizeMode: 'fit-content',
            fillType: 'none',
            strokeEnabled: false,
            autoFit: true,
            startFrame: bounds.startFrame,
            endFrame: bounds.endFrame,
            keyframes: [{
              frame: s.currentFrame,
              easing: 'ease-out',
              props: {
                ...DEFAULT_TRANSFORM,
                x: bounds.x,
                y: bounds.y,
              },
            }],
          })
          const firstIdx = Math.min(...selected.map((l) => s.layers.findIndex((x) => x.id === l.id)).filter((i) => i >= 0))
          const next = [...s.layers]
          next.splice(firstIdx, 0, group)
          const layers = next.map((l) => selectedLayerIds.includes(l.id) ? { ...l, parentId: group.id } : l)
          return {
            layers: normalizeLayerTree(s, layers, group.id, true),
            selectedLayerIds: [group.id],
          }
        })
      },

      ungroupLayer: (id) => {
        get()._snapshot()
        set((s) => {
          const group = s.layers.find((l) => l.id === id)
          if (!group) return {}
          return {
            layers: s.layers
              .filter((l) => l.id !== id)
              .map((l) => l.parentId === id ? { ...l, parentId: group.parentId ?? null } : l),
            selectedLayerIds: s.selectedLayerIds.filter((sid) => sid !== id),
          }
        })
      },

      moveSelectedUpLevel: () => {
        const { selectedLayerIds, layers } = get()
        selectedLayerIds.forEach((id) => {
          const layer = layers.find((l) => l.id === id)
          const parent = layers.find((l) => l.id === layer?.parentId)
          get().moveLayerToParent([id], parent?.parentId ?? null, parent?.id ?? null)
        })
      },

      moveSelectedIntoPreviousGroup: () => {
        const { selectedLayerIds, layers } = get()
        if (!selectedLayerIds.length) return
        const first = layers.find((l) => l.id === selectedLayerIds[0])
        if (!first) return
        const idx = layers.findIndex((l) => l.id === first.id)
        const group = [...layers.slice(0, idx)].reverse().find((l) => (l.isGroup || l.type === 'group') && l.parentId === (first.parentId ?? null))
        if (group) get().moveLayerToParent(selectedLayerIds, group.id)
      },

      moveSelectedWithinParent: (direction) => {
        const { selectedLayerIds, layers } = get()
        const id = selectedLayerIds[0]
        const layer = layers.find((l) => l.id === id)
        if (!layer) return
        const siblings = layers.filter((l) => (l.parentId ?? null) === (layer.parentId ?? null))
        const from = siblings.findIndex((l) => l.id === id)
        const to = from + direction
        if (to < 0 || to >= siblings.length) return
        const ordered = [...siblings]
        const [item] = ordered.splice(from, 1)
        ordered.splice(to, 0, item)
        const byParentOrder = new Map(ordered.map((l, i) => [l.id, i]))
        get()._snapshot()
        set((s) => {
          const next = [...layers].sort((a, b) => {
            const ap = a.parentId ?? null
            const bp = b.parentId ?? null
            if (ap === (layer.parentId ?? null) && bp === ap) return (byParentOrder.get(a.id) ?? 0) - (byParentOrder.get(b.id) ?? 0)
            return layers.indexOf(a) - layers.indexOf(b)
          })
          return { layers: normalizeLayerTree(s, next, layer.parentId ?? undefined, true) }
        })
      },

      selectChildren: (id) => set({ selectedLayerIds: collectDescendants(get().layers, id).map((l) => l.id) }),
      selectSiblings: (id) => {
        const layer = get().layers.find((l) => l.id === id)
        if (!layer) return
        set({ selectedLayerIds: get().layers.filter((l) => (l.parentId ?? null) === (layer.parentId ?? null)).map((l) => l.id) })
      },
      collapseAllGroups: () => set((s) => ({ layers: s.layers.map((l) => (l.isGroup || l.type === 'group') ? { ...l, collapsed: true } : l) })),
      expandAllGroups: () => set((s) => ({ layers: s.layers.map((l) => (l.isGroup || l.type === 'group') ? { ...l, collapsed: false } : l) })),

      removeKeyframe: (layerId, frame) => {
        get()._snapshot()
        set((s) => ({
          layers: s.layers.map((l) =>
            l.id === layerId ? { ...l, keyframes: l.keyframes.filter((k) => k.frame !== frame) } : l
          ),
        }))
      },

      moveKeyframe: (layerId, fromFrame, toFrame) => {
        set((s) => ({
          layers: s.layers.map((l) => {
            if (l.id !== layerId) return l
            const keyframes = l.keyframes
              .map((k) => k.frame === fromFrame ? { ...k, frame: toFrame } : k)
              .sort((a, b) => a.frame - b.frame)
            return { ...l, keyframes }
          }),
          selectedKeyframes: s.selectedKeyframes.map((kf) =>
            kf.layerId === layerId && !kf.propKey && kf.frame === fromFrame ? { ...kf, frame: toFrame } : kf
          ),
        }))
      },

      updateKeyframeEasing: (layerId, frame, easing, bezier) => {
        set((s) => ({
          layers: s.layers.map((l) => {
            if (l.id !== layerId) return l
            return {
              ...l,
              keyframes: l.keyframes.map((k) =>
                k.frame === frame ? { ...k, easing, bezier: easing === 'custom' ? (bezier ?? k.bezier ?? [0.25, 0.1, 0.25, 1]) : undefined } : k
              ),
            }
          }),
        }))
      },

      setCurrentFrame: (frame) => set({ currentFrame: frame }),
      setTotalFrames: (frames) => set({ totalFrames: frames }),
      setPlaying: (playing) => set({ isPlaying: playing }),

      setCanvasPreset: (name) => {
        const preset = CANVAS_PRESETS.find((p) => p.name === name)
        if (preset) set({ canvasPreset: preset })
      },

      setCustomDimension: (key, value) => set({ [key]: value }),
      setCanvasBackgroundColor: (color) => set({ canvasBackgroundColor: color }),
      setTheme: (theme) => set({ theme }),
      setTool: (tool) => set({ currentTool: tool }),
      setTimelineZoom: (zoom) => set({ timelineZoom: zoom }),
      setTimelineScrollX: (scrollX) => set({ timelineScrollX: scrollX }),
      setTimelinePanelHeight: (height) => set({ timelinePanelHeight: height }),
      setShowAllSubtracks: (show) => set({ showAllSubtracks: show }),
      setShowValueGraph: (show) => set({ showValueGraph: show }),
      setEditorViewport: (zoom, panX, panY) => set({ editorZoom: zoom, editorPanX: panX, editorPanY: panY }),
      setEditingTextLayerId: (id) => set({ editingTextLayerId: id }),
      setTextSelection: (selection) => set({ textSelection: selection }),
      updateTextSelectionStyle: (layerId, style) => {
        const selection = get().textSelection
        if (!selection || selection.layerId !== layerId || selection.start === selection.end) {
          set((s) => ({ layers: s.layers.map((l) => l.id === layerId ? { ...l, ...style } : l) }))
          return
        }
        const start = Math.min(selection.start, selection.end)
        const end = Math.max(selection.start, selection.end)
        set((s) => ({
          layers: s.layers.map((l) => {
            if (l.id !== layerId) return l
            const span = { id: uid(), start, end, ...style }
            return { ...l, textSpans: [...(l.textSpans ?? []).filter((item) => item.end <= start || item.start >= end), span] }
          }),
        }))
      },
      beginInteraction: (snapshot = true) => {
        if (snapshot && get().activeInteractionCount === 0) get()._snapshot()
        set((s) => ({ activeInteractionCount: s.activeInteractionCount + 1 }))
      },
      endInteraction: () => set((s) => ({ activeInteractionCount: Math.max(0, s.activeInteractionCount - 1) })),
      setAutoKeyframe: (v) => set({ autoKeyframe: v }),

      addMarker: (frame) => {
        const colors = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#a855f7']
        const marker: TimelineMarker = {
          id: uid(), frame,
          label: `Marker ${get().markers.length + 1}`,
          color: colors[get().markers.length % colors.length],
        }
        set((s) => ({ markers: [...s.markers, marker] }))
      },

      removeMarker: (id) => set((s) => ({ markers: s.markers.filter((m) => m.id !== id) })),

      setLoop: (inFrame, outFrame) => set({ loopIn: inFrame, loopOut: outFrame }),
      clearLoop: () => set({ loopIn: null, loopOut: null }),
      setLoopEnabled: (enabled) => set({ loopEnabled: enabled }),
    }),
    {
      name: 'motion-editor-v1',
      version: 2,
      migrate: (persisted) => {
        const s = persisted as Partial<Store>
        return {
          theme: s.theme,
          timelineZoom: s.timelineZoom,
          timelineScrollX: s.timelineScrollX,
          timelinePanelHeight: s.timelinePanelHeight,
          showAllSubtracks: s.showAllSubtracks,
          showValueGraph: s.showValueGraph,
          editorZoom: s.editorZoom,
          editorPanX: s.editorPanX,
          editorPanY: s.editorPanY,
        }
      },
      partialize: (s) => ({
        theme: s.theme,
        timelineZoom: s.timelineZoom,
        timelineScrollX: s.timelineScrollX,
        timelinePanelHeight: s.timelinePanelHeight,
        showAllSubtracks: s.showAllSubtracks,
        showValueGraph: s.showValueGraph,
        editorZoom: s.editorZoom,
        editorPanX: s.editorPanX,
        editorPanY: s.editorPanY,
      }),
    }
  )
)

// Derived selector helpers
export const selectedLayer = (s: Store) =>
  s.layers.find((l) => l.id === s.selectedLayerIds[0]) ?? null

export const selectedLayers = (s: Store) =>
  s.layers.filter((l) => s.selectedLayerIds.includes(l.id))
