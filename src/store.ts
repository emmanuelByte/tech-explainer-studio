import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  EditorState, Layer, Keyframe, TransformProps,
  CANVAS_PRESETS, DEFAULT_TRANSFORM, LayerType, Tool,
  TimelineMarker, MotionProject, AnimatableProperty, PairEasingType, KeyframeSelection,
  PropertyKeyframe, ImageKind, DEFAULT_COLOR_PALETTES, VideoSegment,
} from './types'
import { getAnimatedPropertyValue, getStaticPropertyValue } from './animationProperties'
import { interpolateProps } from './remotion/interpolateProps'

function uid() { return Math.random().toString(36).slice(2, 9) }

function normalizeHexColor(value: string) {
  const trimmed = value.trim().toLowerCase()
  const short = trimmed.match(/^#([0-9a-f]{3})$/i)
  if (short) {
    const [, hex] = short
    return `#${hex[0]}${hex[0]}${hex[1]}${hex[1]}${hex[2]}${hex[2]}`.toLowerCase()
  }
  if (/^#[0-9a-f]{6}$/i.test(trimmed)) return trimmed
  return null
}

function clampInt(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min
  return Math.max(min, Math.min(max, Math.round(value)))
}

function sourceDurationFramesForLayer(layer: Layer, fps: number, fallbackFrames?: number) {
  const fromMetadata = layer.sourceDurationFrames
  const fromSeconds = layer.videoDuration && Number.isFinite(layer.videoDuration)
    ? Math.max(0, Math.round(layer.videoDuration * fps))
    : undefined
  const fromSegments = layer.videoSegments?.length
    ? Math.max(...layer.videoSegments.map((segment) => Math.max(segment.sourceStartFrame, segment.sourceEndFrame)))
    : undefined
  return Math.max(0, Math.round(fromMetadata ?? fromSeconds ?? fromSegments ?? fallbackFrames ?? 0))
}

function videoLayerEnvelope(layer: Layer) {
  const segments = layer.videoSegments ?? []
  if (!segments.length) return { startFrame: layer.startFrame, endFrame: layer.endFrame }
  return {
    startFrame: Math.min(...segments.map((segment) => segment.timelineStartFrame)),
    endFrame: Math.max(...segments.map((segment) => segment.timelineEndFrame)),
  }
}

function normalizeVideoSegments(segments: VideoSegment[], sourceDurationFrames: number, totalFrames: number) {
  const sourceMax = Math.max(0, sourceDurationFrames)
  let previousEnd = 0
  return [...segments]
    .sort((a, b) => a.timelineStartFrame - b.timelineStartFrame || a.timelineEndFrame - b.timelineEndFrame)
    .map((segment) => {
      const timelineStartFrame = clampInt(segment.timelineStartFrame, previousEnd, Math.max(previousEnd, totalFrames - 1))
      const timelineEndFrame = clampInt(segment.timelineEndFrame, timelineStartFrame + 1, Math.max(timelineStartFrame + 1, totalFrames))
      previousEnd = timelineEndFrame
      const sourceStartFrame = clampInt(segment.sourceStartFrame, 0, sourceMax)
      const sourceEndFrame = clampInt(segment.sourceEndFrame, sourceStartFrame, sourceMax)
      return {
        id: segment.id || uid(),
        timelineStartFrame,
        timelineEndFrame,
        sourceStartFrame,
        sourceEndFrame,
      }
    })
    .filter((segment) => segment.timelineEndFrame > segment.timelineStartFrame)
}

function makeDefaultVideoSegment(layer: Layer, fps: number, totalFrames: number): VideoSegment {
  const timelineStartFrame = clampInt(layer.startFrame ?? 0, 0, Math.max(0, totalFrames - 1))
  const timelineEndFrame = clampInt(layer.endFrame ?? timelineStartFrame + 1, timelineStartFrame + 1, Math.max(timelineStartFrame + 1, totalFrames))
  const timelineDuration = Math.max(1, timelineEndFrame - timelineStartFrame)
  const sourceDurationFrames = sourceDurationFramesForLayer(layer, fps, timelineDuration)
  return {
    id: uid(),
    timelineStartFrame,
    timelineEndFrame,
    sourceStartFrame: 0,
    sourceEndFrame: Math.min(sourceDurationFrames || timelineDuration, timelineDuration),
  }
}

function normalizeVideoLayer(layer: Layer, fps: number, totalFrames: number): Layer {
  if (layer.type !== 'video') return layer
  const sourceDurationFrames = sourceDurationFramesForLayer(layer, fps, Math.max(1, (layer.endFrame ?? 1) - (layer.startFrame ?? 0)))
  if (Array.isArray(layer.videoSegments) && layer.videoSegments.length === 0) {
    return { ...layer, sourceDurationFrames, videoSegments: [] }
  }
  const rawSegments = layer.videoSegments?.length ? layer.videoSegments : [makeDefaultVideoSegment(layer, fps, totalFrames)]
  const videoSegments = normalizeVideoSegments(rawSegments, sourceDurationFrames, totalFrames)
  const envelope = videoLayerEnvelope({ ...layer, videoSegments })
  return {
    ...layer,
    sourceDurationFrames,
    videoSegments,
    ...envelope,
  }
}

function retimeVideoSegments(layer: Layer, oldStart: number, newStart: number, scale: number): Layer['videoSegments'] {
  if (!layer.videoSegments?.length) return layer.videoSegments
  return layer.videoSegments.map((segment) => ({
    ...segment,
    timelineStartFrame: retimeFrame(segment.timelineStartFrame, oldStart, newStart, scale),
    timelineEndFrame: retimeFrame(segment.timelineEndFrame, oldStart, newStart, scale),
  }))
}

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

function collectAncestorIds(layers: Layer[], layerId: string) {
  const result: string[] = []
  const seen = new Set<string>()
  let current = layers.find((layer) => layer.id === layerId)
  while (current?.parentId && !seen.has(current.parentId)) {
    seen.add(current.parentId)
    result.push(current.parentId)
    current = layers.find((layer) => layer.id === current!.parentId)
  }
  return result
}

function isGroupLayer(layer: Layer) {
  return layer.type === 'group' || layer.isGroup
}

function baseGroupOffset(layer: Layer) {
  const first = [...layer.keyframes].sort((a, b) => a.frame - b.frame)[0]
  return {
    x: first?.props.x ?? 0,
    y: first?.props.y ?? 0,
  }
}

function ensureGroupOrigin(layer: Layer) {
  return layer
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

function layerWorldPosition(layers: Layer[], layer: Layer, frame: number) {
  const seen = new Set<string>()
  let x = 0
  let y = 0
  let current: Layer | undefined = layer
  while (current && !seen.has(current.id)) {
    seen.add(current.id)
    const transform = interpolateProps(frame, current.keyframes)
    x += transform.x
    y += transform.y
    current = current.parentId ? layers.find((item) => item.id === current!.parentId) : undefined
  }
  return { x, y }
}

function reparentLayerAtFrame(layer: Layer, layers: Layer[], frame: number, parentId: string | null) {
  const world = layerWorldPosition(layers, layer, frame)
  const parent = parentId ? layers.find((item) => item.id === parentId) : null
  const parentWorld = parent ? layerWorldPosition(layers, parent, frame) : { x: 0, y: 0 }
  return setLayerBaseTransformValues({ ...layer, parentId }, frame, {
    x: Math.round(world.x - parentWorld.x),
    y: Math.round(world.y - parentWorld.y),
  })
}

function getLayerFrameBox(layer: Layer, frame: number, canvasWidth: number, canvasHeight: number, layers: Layer[] = [layer]) {
  const transform = interpolateProps(frame, layer.keyframes)
  const rawWidth = layer.sizeMode === 'fill-canvas' ? canvasWidth : layer.width
  const rawHeight = layer.sizeMode === 'fill-canvas' ? canvasHeight : layer.type === 'line' ? layer.strokeWidth || 2 : layer.height
  const width = Math.max(1, Math.abs(rawWidth * transform.scale * transform.scaleX))
  const height = Math.max(1, Math.abs(rawHeight * transform.scale * transform.scaleY))
  const world = layerWorldPosition(layers, layer, frame)
  const centerX = canvasWidth / 2 + world.x
  const centerY = canvasHeight / 2 + world.y
  return {
    left: centerX - width / 2,
    right: centerX + width / 2,
    top: centerY - height / 2,
    bottom: centerY + height / 2,
  }
}

function getLayersFrameBounds(layers: Layer[], frame: number, canvasWidth: number, canvasHeight: number, totalFrames: number, allLayers: Layer[] = layers) {
  if (!layers.length) return null
  const boxes = layers.map((layer) => getLayerFrameBox(layer, frame, canvasWidth, canvasHeight, allLayers))
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

function fitAutoGroups(layers: Layer[], frame: number, canvasWidth: number, canvasHeight: number, totalFrames: number, skipIds = new Set<string>()) {
  let next = layers
  for (let pass = 0; pass < 3; pass += 1) {
    let changed = false
    const groups = next.filter((layer) => layer.autoFit && layer.type === 'group' && !skipIds.has(layer.id))
    groups.forEach((layer) => {
      const currentLayer = next.find((item) => item.id === layer.id)
      if (!currentLayer) return
      if (skipIds.has(layer.id)) return layer
      const children = next.filter((child) => child.parentId === currentLayer.id && child.visible)
      if (!children.length) return
      const boxes = children.map((child) => getLayerFrameBox(child, frame, canvasWidth, canvasHeight, next))
      const left = Math.min(...boxes.map((box) => box.left))
      const right = Math.max(...boxes.map((box) => box.right))
      const top = Math.min(...boxes.map((box) => box.top))
      const bottom = Math.max(...boxes.map((box) => box.bottom))
      const width = Math.max(1, Math.round(right - left))
      const height = Math.max(1, Math.round(bottom - top))
      const worldX = Math.round(left + width / 2 - canvasWidth / 2)
      const worldY = Math.round(top + height / 2 - canvasHeight / 2)
      const parent = currentLayer.parentId ? next.find((item) => item.id === currentLayer.parentId) : null
      const parentWorld = parent ? layerWorldPosition(next, parent, frame) : { x: 0, y: 0 }
      const current = interpolateProps(frame, currentLayer.keyframes)
      const currentWorld = { x: parentWorld.x + current.x, y: parentWorld.y + current.y }
      const x = worldX - parentWorld.x
      const y = worldY - parentWorld.y
      const deltaX = parentWorld.x + x - currentWorld.x
      const deltaY = parentWorld.y + y - currentWorld.y
      if (currentLayer.width !== width || currentLayer.height !== height || current.x !== x || current.y !== y) changed = true
      const fittedGroup = {
        ...setLayerBaseTransformValues(currentLayer, frame, { x, y }),
        width,
        height,
        startFrame: Math.min(currentLayer.startFrame ?? 0, ...children.map((child) => child.startFrame ?? 0)),
        endFrame: Math.max(currentLayer.endFrame ?? totalFrames, ...children.map((child) => child.endFrame ?? totalFrames)),
      }
      next = next.map((item) => {
        if (item.id === currentLayer.id) return fittedGroup
        if (item.parentId !== currentLayer.id || (!deltaX && !deltaY)) return item
        const childCurrent = interpolateProps(frame, item.keyframes)
        changed = true
        return setLayerBaseTransformValues(item, frame, {
          x: Math.round(childCurrent.x - deltaX),
          y: Math.round(childCurrent.y - deltaY),
        })
      })
    })
    if (!changed) break
  }
  return next
}

function withAutoFitGroups(state: EditorState, layers: Layer[], skipIds = new Set<string>()) {
  const { width, height } = getCanvasSize(state)
  return fitAutoGroups(layers, state.currentFrame, width, height, state.totalFrames, skipIds)
}

function autoFitSkipIdsForMove(layers: Layer[], ids: string[]) {
  const skipIds = new Set<string>()
  ids.forEach((id) => {
    const layer = layers.find((item) => item.id === id)
    if (layer && isGroupLayer(layer)) skipIds.add(id)
    collectAncestorIds(layers, id).forEach((ancestorId) => {
      const ancestor = layers.find((item) => item.id === ancestorId)
      if (ancestor?.autoFit) skipIds.add(ancestorId)
    })
  })
  return skipIds
}

function upsertTransformKeyframe(layer: Layer, frame: number, props: TransformProps, easing?: PairEasingType): Layer {
  const current = interpolateProps(frame, layer.keyframes)
  const existing = layer.keyframes.find((kf) => kf.frame === frame)
  const keyframe: Keyframe = {
    frame,
    easing: easing ?? existing?.easing ?? layer.keyframes[0]?.easing ?? 'ease-out',
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

function setLayerBaseValue(layer: Layer, key: AnimatableProperty, value: number | string, frame: number): Layer {
  if (key in DEFAULT_TRANSFORM && typeof value === 'number') {
    const current = interpolateProps(frame, layer.keyframes)
    const delta = value - (current[key as keyof TransformProps] as number)
    const keyframes = layer.keyframes.length
      ? layer.keyframes.map((kf) => ({
        ...kf,
        props: {
          ...kf.props,
          [key]: ((kf.props[key as keyof TransformProps] ?? DEFAULT_TRANSFORM[key as keyof TransformProps]) as number) + delta,
        } as TransformProps,
      }))
      : [{ frame: 0, easing: 'ease-out' as PairEasingType, props: { ...DEFAULT_TRANSFORM, [key]: value } as TransformProps }]
    return {
      ...layer,
      keyframes,
      propertyKeyframes: layer.propertyKeyframes?.[key]?.length
        ? {
          ...(layer.propertyKeyframes ?? {}),
          [key]: (layer.propertyKeyframes[key] ?? []).map((kf) => ({
            ...kf,
            value: typeof kf.value === 'number' ? kf.value + delta : value,
          })),
        }
        : layer.propertyKeyframes,
    }
  }

  if (layer.propertyKeyframes?.[key]?.length) {
    return {
      ...layer,
      [key]: value,
      propertyKeyframes: {
        ...(layer.propertyKeyframes ?? {}),
        [key]: (layer.propertyKeyframes[key] ?? []).map((kf) => ({ ...kf, value })),
      },
    }
  }

  return { ...layer, [key]: value }
}

function setLayerBaseTransformValues(layer: Layer, frame: number, values: Partial<TransformProps>): Layer {
  return (Object.entries(values) as Array<[keyof TransformProps, number | undefined]>).reduce((next, [key, value]) => {
    if (typeof value !== 'number' || !Number.isFinite(value)) return next
    return setLayerBaseValue(next, key as AnimatableProperty, value, frame)
  }, layer)
}

function removeTransformPropertyChange(layer: Layer, key: AnimatableProperty, frame: number): Layer {
  if (!(key in DEFAULT_TRANSFORM)) return layer
  const target = layer.keyframes.find((kf) => kf.frame === frame)
  if (!target || layer.keyframes.length <= 1) return layer
  const withoutTarget = layer.keyframes.filter((kf) => kf.frame !== frame)
  const fallback = interpolateProps(frame, withoutTarget)
  return {
    ...layer,
    keyframes: layer.keyframes.map((kf) =>
      kf.frame === frame
        ? { ...kf, props: { ...kf.props, [key]: fallback[key as keyof TransformProps] } as TransformProps }
        : kf
    ),
  }
}

function transformPropertyFrames(layer: Layer, key: AnimatableProperty): PropertyKeyframe[] {
  if (!(key in DEFAULT_TRANSFORM)) return []
  const prop = key as keyof TransformProps
  const sorted = [...layer.keyframes].sort((a, b) => a.frame - b.frame)
  return sorted
    .filter((kf) => {
      if (sorted.length < 2) return false
      const without = sorted.filter((item) => item.frame !== kf.frame)
      if (!without.length) return false
      const fallback = interpolateProps(kf.frame, without)
      return kf.props[prop] !== fallback[prop]
    })
    .map((kf) => ({
      id: uid(),
      frame: kf.frame,
      value: kf.props[prop],
      easing: kf.easing,
      bezier: kf.bezier ? [...kf.bezier] as [number, number, number, number] : undefined,
    }))
}

function materializeTransformPropertyTrack(layer: Layer, key: AnimatableProperty, deletedFrames = new Set<number>()): Layer {
  if (!(key in DEFAULT_TRANSFORM)) return layer
  const frames = transformPropertyFrames(layer, key).filter((kf) => !deletedFrames.has(kf.frame))
  return {
    ...layer,
    propertyKeyframes: {
      ...(layer.propertyKeyframes ?? {}),
      [key]: frames,
    },
  }
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
      const x = -groupBox.width / 2 + groupBox.padding + col * (cellWidth + groupBox.gap) + cellWidth / 2
      const y = -groupBox.height / 2 + groupBox.padding + yBefore + rowHeights[row] / 2
      placements.set(child.id, {
        x: Math.round(x),
        y: Math.round(y),
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
        ? -groupBox.width / 2 + groupBox.padding + mainCenter
        : -groupBox.width / 2 + groupBox.padding + crossCenter
      const y = isRow
        ? -groupBox.height / 2 + groupBox.padding + crossCenter
        : -groupBox.height / 2 + groupBox.padding + mainCenter
      placements.set(child.id, {
        x: Math.round(x),
        y: Math.round(y),
        width: !isRow && group.layoutAlign === 'stretch' ? Math.round(crossAvailable) : undefined,
        height: isRow && group.layoutAlign === 'stretch' ? Math.round(crossAvailable) : undefined,
      })
      cursor += mainSize + gap
    })
  }

  return layers.map((layer) => {
    const placement = placements.get(layer.id)
    if (!placement) return layer
    const moved = setLayerBaseTransformValues(layer, frame, { x: placement.x, y: placement.y })
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

function normalizeLayerTree(state: EditorState, layers: Layer[], changedId?: string, includeAllLayouts = false, skipAutoFitIds = new Set<string>()) {
  return withAutoFitGroups(state, normalizeLayoutGroups(state, layers, changedId, includeAllLayouts), skipAutoFitIds)
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
  video: 'Video',
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
    clipChildren: false,
    width: type === 'text' ? 400 : type === 'line' ? 200 : type === 'video' ? 320 : 200,
    height: type === 'text' ? 80 : type === 'line' ? 4 : type === 'path' ? 200 : type === 'video' ? 180 : 140,
    sizeMode: 'fixed',
    layoutMode: 'none',
    layoutDirection: 'row',
    layoutGap: 12,
    layoutPadding: 16,
    layoutAlign: 'center',
    layoutJustify: 'start',
    gridColumns: 2,
    fillType: type === 'text' || type === 'group' ? 'none' : 'solid',
    fillColor: type === 'text' || type === 'group' ? 'transparent' : `hsl(${Math.floor(Math.random() * 360)},65%,55%)`,
    gradientStops: [{ color: '#6366f1', position: 0 }, { color: '#a855f7', position: 100 }],
    gradientAngle: 135,
    strokeEnabled: type === 'line' || type === 'path',
    strokeColor: '#ffffff',
    strokeWidth: type === 'line' ? 2 : type === 'path' ? 4 : 0,
    borderRadius: 0,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    borderBottomRightRadius: 0,
    borderBottomLeftRadius: 0,
    borderRadiusLinked: true,
    pathData: type === 'path' ? 'M 20 180 L 100 20 L 180 180' : undefined,
    pathClosed: false,
    shadowEnabled: false,
    shadowColor: 'rgba(0,0,0,0.5)',
    shadowFollowsPerspective: false,
    text: type === 'text' ? 'Edit text' : '',
    fontFamily: 'Inter',
    fontSize: 48,
    fontWeight: '600',
    textAlign: 'center',
    letterSpacing: 0,
    lineHeight: 1.2,
    textColor: type === 'text' ? '#000000' : '#ffffff',
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
  insertLibraryLayers: (layers: Layer[], options?: { frameOffset?: number; fitToTimeline?: boolean; rootLayerIds?: string[] }) => string[]
  addImage: (src: string, name: string, imageKind?: 'raster' | 'svg', naturalWidth?: number, naturalHeight?: number) => void
  replaceImageSource: (id: string, src: string, imageKind: ImageKind, naturalWidth?: number, naturalHeight?: number) => void
  addVideo: (src: string, name: string, naturalWidth?: number, naturalHeight?: number, duration?: number) => void
  replaceVideoSource: (id: string, src: string, naturalWidth?: number, naturalHeight?: number, duration?: number) => void
  deleteLayer: (id: string) => void
  duplicateLayer: (id: string) => void
  toggleVisibility: (id: string) => void
  toggleLock: (id: string) => void
  selectLayer: (id: string | null, multi?: boolean) => void
  selectLayers: (ids: string[]) => void
  selectKeyframe: (selection: KeyframeSelection, multi?: boolean) => void
  clearSelectedKeyframes: () => void
  deleteSelectedKeyframes: () => void
  moveSelectedKeyframes: (delta: number) => void
  renameLayer: (id: string, name: string) => void
  updateLayerProp: <K extends keyof Layer>(id: string, key: K, value: Layer[K]) => void
  setLayerAnimatedProperty: (id: string, key: AnimatableProperty, value: number | string) => void
  addPropertyKeyframe: (layerId: string, key: AnimatableProperty, frame?: number, value?: number | string) => void
  removePropertyKeyframe: (layerId: string, key: AnimatableProperty, frame: number) => void
  movePropertyKeyframe: (layerId: string, key: AnimatableProperty, fromFrame: number, toFrame: number) => void
  updatePropertyKeyframeEasing: (layerId: string, key: AnimatableProperty, frame: number, easing: PairEasingType, bezier?: [number, number, number, number]) => void
  duplicateKeyframe: (layerId: string, frame: number, propKey?: AnimatableProperty, targetFrame?: number) => void
  reorderLayers: (from: number, to: number) => void
  // Keyframes
  addKeyframe: (layerId: string, frame: number, props: TransformProps, easing?: string) => void
  addKeyframes: (updates: Array<{ layerId: string; props: TransformProps }>, frame: number, easing?: string) => void
  addKeyframeSequence: (layerId: string, keyframes: Keyframe[]) => void
  resizeLayerBox: (layerId: string, frame: number, props: TransformProps, size: { width?: number; height?: number }) => void
  removeKeyframe: (layerId: string, frame: number) => void
  clearLayerKeyframes: (layerId: string) => void
  moveKeyframe: (layerId: string, fromFrame: number, toFrame: number) => void
  updateKeyframeEasing: (layerId: string, frame: number, easing: PairEasingType, bezier?: [number, number, number, number]) => void
  // Time range
  updateLayerTimeRange: (layerId: string, startFrame: number, endFrame: number) => void
  setLayerRange: (layerId: string, startFrame: number, endFrame: number, keyframeFrames?: number[]) => void
  // Video segments
  selectActiveSegment: (layerId: string, frame: number) => VideoSegment | null
  selectSegmentSpeed: (segment: VideoSegment) => number
  setLayerSourceDuration: (layerId: string, durationFrames: number) => void
  splitVideoAt: (layerId: string, frame: number) => void
  removeVideoSegment: (layerId: string, segmentId: string) => void
  duplicateVideoSegment: (layerId: string, segmentId: string) => void
  setSegmentTimelineRange: (layerId: string, segmentId: string, startFrame: number, endFrame: number, opts?: { preserveSpeed?: boolean }) => void
  setSegmentSourceRange: (layerId: string, segmentId: string, sourceStartFrame: number, sourceEndFrame: number) => void
  moveVideoSegment: (layerId: string, segmentId: string, deltaFrames: number) => void
  setSegmentSpeed: (layerId: string, segmentId: string, speed: number) => void
  freezeSegment: (layerId: string, segmentId: string) => void
  resetVideoCut: (layerId: string) => void
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
  setCurrentFrame: (frame: number, options?: { preserveKeyframeSelection?: boolean }) => void
  setTotalFrames: (frames: number) => void
  setPlaying: (playing: boolean) => void
  setPlaybackRate: (rate: number) => void
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
  setShowOutsideCanvas: (show: boolean) => void
  setActiveColorPalette: (id: string) => void
  createColorPalette: (name: string) => string
  deleteColorPalette: (id: string) => void
  addColorToPalette: (color: string, paletteId?: string) => void
  removeColorFromPalette: (color: string, paletteId?: string) => void
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
      playbackRate: 1,
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
      showOutsideCanvas: false,
      colorPalettes: DEFAULT_COLOR_PALETTES,
      activeColorPaletteId: 'custom',
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
          playbackRate: 1,
          timelineZoom: project.timeline.zoom ?? 1,
          timelineScrollX: project.timeline.scrollX ?? 0,
          editorZoom: project.editor.zoom ?? 1,
          editorPanX: project.editor.panX ?? 0,
          editorPanY: project.editor.panY ?? 0,
          showOutsideCanvas: project.editor.showOutsideCanvas ?? false,
          colorPalettes: project.colorPalettes?.length ? project.colorPalettes : DEFAULT_COLOR_PALETTES,
          activeColorPaletteId: project.colorPalettes?.some((palette) => palette.id === project.activeColorPaletteId)
            ? project.activeColorPaletteId!
            : 'custom',
          editingTextLayerId: null,
          textSelection: null,
          activeInteractionCount: 0,
          _past: [],
          _future: [],
        })
        set((s) => ({
          layers: s.layers.map((layer) => normalizeVideoLayer(layer, s.fps, s.totalFrames)),
        }))
      },

      createEmptyProjectState: (project) => get().loadProject(project),

      renameProject: (name) => set({ projectName: name, projectUpdatedAt: new Date().toISOString() }),

      _snapshot: () => {
        const { layers, _past } = get()
        const snapshot = JSON.stringify(layers)
        if (_past[_past.length - 1] === snapshot) return
        set({ _past: [..._past.slice(-49), snapshot], _future: [] })
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

      insertLibraryLayers: (sourceLayers, options = {}) => {
        if (!sourceLayers.length) return []
        get()._snapshot()
        const { totalFrames } = get()
        const frameOffset = options.frameOffset ?? 0
        const idMap = new Map(sourceLayers.map((layer) => [layer.id, uid()]))
        const sourceIdSet = new Set(sourceLayers.map((layer) => layer.id))
        const shiftFrame = (frame: number) => Math.max(0, frame + frameOffset)

        const copies = sourceLayers.map((layer) => {
          const keyframes = (layer.keyframes ?? []).map((kf) => ({
            ...kf,
            frame: shiftFrame(kf.frame),
            props: { ...kf.props },
          })).sort((a, b) => a.frame - b.frame)
          const propertyKeyframes = layer.propertyKeyframes
            ? Object.fromEntries(
              Object.entries(layer.propertyKeyframes).map(([key, frames]) => [
                key,
                (frames ?? []).map((kf) => ({ ...kf, id: uid(), frame: shiftFrame(kf.frame) })).sort((a, b) => a.frame - b.frame),
              ]),
            ) as Layer['propertyKeyframes']
            : undefined
          const parentId = layer.parentId && idMap.has(layer.parentId) ? idMap.get(layer.parentId)! : null
          return {
            ...layer,
            id: idMap.get(layer.id)!,
            name: layer.name,
            parentId,
            keyframes,
            propertyKeyframes,
            startFrame: options.fitToTimeline ? 0 : shiftFrame(layer.startFrame ?? 0),
            endFrame: options.fitToTimeline ? totalFrames : Math.max(1, shiftFrame(layer.endFrame ?? totalFrames)),
          }
        })

        const roots = (options.rootLayerIds?.length ? options.rootLayerIds : sourceLayers
          .filter((layer) => !layer.parentId || !sourceIdSet.has(layer.parentId))
          .map((layer) => layer.id))
          .map((id) => idMap.get(id))
          .filter((id): id is string => Boolean(id))

        set((s) => ({
          layers: [...s.layers, ...copies],
          selectedLayerIds: roots,
          selectedKeyframes: [],
        }))
        return roots
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

      addVideo: (src, name, naturalWidth, naturalHeight, duration) => {
        get()._snapshot()
        const { totalFrames, fps } = get()
        const maxW = 420
        const maxH = 280
        const aspect = naturalWidth && naturalHeight ? naturalWidth / naturalHeight : 16 / 9
        const scale = naturalWidth && naturalHeight ? Math.min(1, maxW / naturalWidth, maxH / naturalHeight) : 1
        const width = naturalWidth && naturalHeight ? Math.max(1, Math.round(naturalWidth * scale)) : 320
        const height = naturalWidth && naturalHeight ? Math.max(1, Math.round(width / aspect)) : 180
        const videoFrames = duration && Number.isFinite(duration) ? Math.max(1, Math.round(duration * fps)) : totalFrames
        const endFrame = Math.min(totalFrames, videoFrames)
        set((s) => ({
          layers: [
            ...s.layers,
            normalizeVideoLayer(makeLayer('video', {
              name,
              src,
              imageFit: 'contain',
              videoNaturalWidth: naturalWidth,
              videoNaturalHeight: naturalHeight,
              videoDuration: duration,
              sourceDurationFrames: videoFrames,
              videoSegments: [{
                id: uid(),
                timelineStartFrame: 0,
                timelineEndFrame: endFrame,
                sourceStartFrame: 0,
                sourceEndFrame: Math.min(videoFrames, endFrame),
              }],
              width,
              height,
              endFrame,
            }), fps, totalFrames),
          ],
        }))
      },

      replaceVideoSource: (id, src, naturalWidth, naturalHeight, duration) => {
        get()._snapshot()
        set((s) => {
          const videoFrames = duration && Number.isFinite(duration) ? Math.max(1, Math.round(duration * s.fps)) : undefined
          return {
            layers: s.layers.map((layer) => {
              if (layer.id !== id || layer.type !== 'video') return layer
              const startFrame = layer.startFrame ?? 0
              const endFrame = Math.min(s.totalFrames, startFrame + (videoFrames ?? Math.max(1, (layer.endFrame ?? s.totalFrames) - startFrame)))
              return normalizeVideoLayer({
                ...layer,
                src,
                videoNaturalWidth: naturalWidth,
                videoNaturalHeight: naturalHeight,
                videoDuration: duration,
                sourceDurationFrames: videoFrames,
                videoSegments: [{
                  id: uid(),
                  timelineStartFrame: startFrame,
                  timelineEndFrame: endFrame,
                  sourceStartFrame: 0,
                  sourceEndFrame: Math.min(videoFrames ?? Math.max(1, endFrame - startFrame), Math.max(1, endFrame - startFrame)),
                }],
                startFrame,
                endFrame,
              }, s.fps, s.totalFrames)
            }),
          }
        })
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
        if (!id) { set({ selectedLayerIds: [], selectedKeyframes: [], editingTextLayerId: null, textSelection: null }); return }
        if (multi) {
          const { selectedLayerIds } = get()
          const next = selectedLayerIds.includes(id)
            ? selectedLayerIds.filter((x) => x !== id)
            : [...selectedLayerIds, id]
          set({
            selectedLayerIds: next,
            selectedKeyframes: [],
            editingTextLayerId: null,
            textSelection: null,
          })
        } else {
          set({
            selectedLayerIds: [id],
            selectedKeyframes: [],
            editingTextLayerId: null,
            textSelection: null,
          })
        }
      },

      selectLayers: (ids) => set({
        selectedLayerIds: ids,
        selectedKeyframes: [],
        editingTextLayerId: null,
        textSelection: null,
      }),

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
          return { selectedKeyframes, selectedLayerIds: [selection.layerId], currentFrame: selection.frame }
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
                const propertyFrames = nextLayer.propertyKeyframes?.[key] ?? []
                const removedFromProperty = new Set(propertyFrames.filter((kf) => frames.has(kf.frame)).map((kf) => kf.frame))
                nextLayer.propertyKeyframes![key] = propertyFrames.filter((kf) => !frames.has(kf.frame))
                const transformBackedFrames = new Set([...frames].filter((frame) => !removedFromProperty.has(frame)))
                if (transformBackedFrames.size) nextLayer = materializeTransformPropertyTrack(nextLayer, key, transformBackedFrames)
              })
            }
            return nextLayer
          }),
          selectedKeyframes: [],
        }))
      },

      moveSelectedKeyframes: (delta) => {
        const selected = get().selectedKeyframes
        if (!selected.length || delta === 0) return
        const minFrame = Math.min(...selected.map((kf) => kf.frame))
        const maxFrame = Math.max(...selected.map((kf) => kf.frame))
        const appliedDelta = Math.max(-minFrame, Math.min(delta, get().totalFrames - maxFrame))
        if (appliedDelta === 0) return
        get()._snapshot()
        set((s) => ({
          layers: s.layers.map((layer) => {
            const layerSelections = selected.filter((kf) => kf.layerId === layer.id)
            if (!layerSelections.length) return layer

            const fullFrames = new Set(layerSelections.filter((kf) => !kf.propKey).map((kf) => kf.frame))
            const movedFullFrames = new Set([...fullFrames].map((frame) => frame + appliedDelta))
            let nextLayer = { ...layer }
            if (fullFrames.size) {
              const moved = layer.keyframes
                .filter((kf) => fullFrames.has(kf.frame))
                .map((kf) => ({ ...kf, frame: kf.frame + appliedDelta }))
              nextLayer.keyframes = [
                ...layer.keyframes.filter((kf) => !fullFrames.has(kf.frame) && !movedFullFrames.has(kf.frame)),
                ...moved,
              ].sort((a, b) => a.frame - b.frame)
            }

            const byProp = new Map<AnimatableProperty, Set<number>>()
            layerSelections.filter((kf) => kf.propKey).forEach((kf) => {
              const key = kf.propKey!
              byProp.set(key, new Set([...(byProp.get(key) ?? []), kf.frame]))
            })
            if (byProp.size) {
              nextLayer.propertyKeyframes = { ...(nextLayer.propertyKeyframes ?? {}) }
              byProp.forEach((frames, key) => {
                const propertyFrames = layer.propertyKeyframes?.[key] ?? []
                const selectedPropertyFrames = new Set(propertyFrames.filter((kf) => frames.has(kf.frame)).map((kf) => kf.frame))
                const movedFrames = new Set([...selectedPropertyFrames].map((frame) => frame + appliedDelta))
                const moved = propertyFrames
                  .filter((kf) => frames.has(kf.frame))
                  .map((kf) => ({ ...kf, frame: kf.frame + appliedDelta }))
                nextLayer.propertyKeyframes![key] = [
                  ...propertyFrames.filter((kf) => !frames.has(kf.frame) && !movedFrames.has(kf.frame)),
                  ...moved,
                ].sort((a, b) => a.frame - b.frame)
                frames.forEach((frame) => {
                  if (selectedPropertyFrames.has(frame) || !(key in DEFAULT_TRANSFORM)) return
                  const source = nextLayer.keyframes.find((kf) => kf.frame === frame)
                  if (!source) return
                  const destination = frame + appliedDelta
                  const value = source.props[key as keyof TransformProps]
                  const easing = source.easing
                  nextLayer = removeTransformPropertyChange(nextLayer, key, frame)
                  const current = interpolateProps(destination, nextLayer.keyframes)
                  nextLayer = upsertTransformKeyframe(nextLayer, destination, {
                    ...current,
                    [key]: value,
                  } as TransformProps, easing)
                })
              })
            }

            return nextLayer
          }),
          selectedKeyframes: s.selectedKeyframes.map((kf) => ({ ...kf, frame: kf.frame + appliedDelta })),
          currentFrame: Math.max(0, Math.min(s.totalFrames - 1, s.currentFrame + appliedDelta)),
        }))
      },

      renameLayer: (id, name) => {
        if (get().layers.find((l) => l.id === id)?.name === name) return
        if (get().activeInteractionCount === 0) get()._snapshot()
        set((s) => ({ layers: s.layers.map((l) => l.id === id ? { ...l, name } : l) }))
      },

      updateLayerProp: (id, key, value) => {
        if (Object.is(get().layers.find((l) => l.id === id)?.[key], value)) return
        if (get().activeInteractionCount === 0) get()._snapshot()
        set((s) => {
          const layers = s.layers.map((l) => l.id === id ? { ...l, [key]: value } : l)
          return { layers: normalizeLayerTree(s, layers, id, LAYOUT_PROP_KEYS.has(key)) }
        })
      },

      setLayerAnimatedProperty: (id, key, value) => {
        const { autoKeyframe, currentFrame, selectedKeyframes } = get()
        const selectedKeyframe = selectedKeyframes.length === 1 && selectedKeyframes[0].layerId === id
          ? selectedKeyframes[0]
          : null

        if (selectedKeyframe && !selectedKeyframe.propKey && key in DEFAULT_TRANSFORM && typeof value === 'number') {
          if (get().activeInteractionCount === 0) get()._snapshot()
          set((s) => {
            const targetLayer = s.layers.find((layer) => layer.id === id)
            const layers = s.layers.map((layer) => {
              if (layer.id !== id) return layer
              const target = key === 'x' || key === 'y' ? ensureGroupOrigin(layer) : layer
              const existing = target.keyframes.find((kf) => kf.frame === selectedKeyframe.frame)
              if (!existing) return target
              return {
                ...target,
                keyframes: target.keyframes.map((kf) =>
                  kf.frame === selectedKeyframe.frame
                    ? { ...kf, props: { ...DEFAULT_TRANSFORM, ...kf.props, [key]: value } as TransformProps }
                    : kf
                ),
              }
            })
            const skipAutoFitIds = (key === 'x' || key === 'y')
              ? autoFitSkipIdsForMove(s.layers, [id])
              : new Set<string>()
            return { layers: normalizeLayerTree(s, layers, id, false, skipAutoFitIds) }
          })
          return
        }

        if (selectedKeyframe?.propKey === key) {
          if (get().activeInteractionCount === 0) get()._snapshot()
          set((s) => ({
            layers: normalizeLayerTree(
              s,
              s.layers.map((layer) => {
                if (layer.id !== id) return layer
                const frames = layer.propertyKeyframes?.[key]
                if (!frames?.some((kf) => kf.frame === selectedKeyframe.frame)) {
                  if (key in DEFAULT_TRANSFORM && typeof value === 'number') {
                    return upsertTransformKeyframe(layer, selectedKeyframe.frame, {
                      ...interpolateProps(selectedKeyframe.frame, layer.keyframes),
                      [key]: value,
                    } as TransformProps)
                  }
                  return layer
                }
                return {
                  ...layer,
                  propertyKeyframes: {
                    ...(layer.propertyKeyframes ?? {}),
                    [key]: frames.map((kf) =>
                      kf.frame === selectedKeyframe.frame ? { ...kf, value } : kf
                    ),
                  },
                }
              }),
              id
            ),
          }))
          return
        }

        if (autoKeyframe) {
          if (key in DEFAULT_TRANSFORM && typeof value === 'number') {
            if (get().activeInteractionCount === 0) get()._snapshot()
            set((s) => {
              const targetLayer = s.layers.find((layer) => layer.id === id)
              const layers = s.layers.map((layer) => {
                if (layer.id !== id) return layer
                const target = key === 'x' || key === 'y' ? ensureGroupOrigin(layer) : layer
                const current = interpolateProps(currentFrame, target.keyframes)
                return upsertTransformKeyframe(target, currentFrame, { ...current, [key]: value } as TransformProps)
              })
              const skipAutoFitIds = (key === 'x' || key === 'y')
                ? autoFitSkipIdsForMove(s.layers, [id])
                : new Set<string>()
              return { layers: normalizeLayerTree(s, layers, id, false, skipAutoFitIds) }
            })
            return
          }
          get().addPropertyKeyframe(id, key, currentFrame, value)
          return
        }
        if (get().activeInteractionCount === 0) get()._snapshot()
        set((s) => {
          const targetLayer = s.layers.find((layer) => layer.id === id)
          const layers = s.layers.map((l) => {
            if (l.id !== id) return l
            const target = key === 'x' || key === 'y' ? ensureGroupOrigin(l) : l
            return setLayerBaseValue(target, key, value, currentFrame)
          })
          const shouldLayout = key !== 'x' && key !== 'y'
          const skipAutoFitIds = !shouldLayout ? autoFitSkipIdsForMove(s.layers, [id]) : new Set<string>()
          return { layers: shouldLayout ? normalizeLayerTree(s, layers, id, false, skipAutoFitIds) : withAutoFitGroups(s, layers, skipAutoFitIds) }
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
            const existing = layer.propertyKeyframes?.[key] ?? []
            if (!existing.some((kf) => kf.frame === frame)) {
              return materializeTransformPropertyTrack(layer, key, new Set([frame]))
            }
            return {
              ...layer,
              propertyKeyframes: {
                ...(layer.propertyKeyframes ?? {}),
                [key]: existing.filter((kf) => kf.frame !== frame),
              },
            }
          }),
          selectedKeyframes: s.selectedKeyframes.filter((kf) =>
            !(kf.layerId === layerId && kf.frame === frame && kf.propKey === key)
          ),
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
        if (get().activeInteractionCount === 0) get()._snapshot()
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

      duplicateKeyframe: (layerId, frame, propKey, targetFrame = get().currentFrame) => {
        const { layers, totalFrames } = get()
        const layer = layers.find((item) => item.id === layerId)
        if (!layer) return
        const propFrames = propKey ? layer.propertyKeyframes?.[propKey] ?? [] : []
        const hasPropertyFrames = propFrames.length > 0
        const usedFrames = new Set(
          propKey
            ? hasPropertyFrames
              ? propFrames.map((kf) => kf.frame)
              : propKey in DEFAULT_TRANSFORM
                ? layer.keyframes.map((kf) => kf.frame)
                : []
            : layer.keyframes.map((kf) => kf.frame)
        )
        if (!usedFrames.has(frame)) return

        let destination = Math.max(0, Math.min(totalFrames - 1, Math.round(targetFrame)))
        if (destination === frame || usedFrames.has(destination)) {
          destination = frame + 1
          while (destination < totalFrames && usedFrames.has(destination)) destination += 1
          if (destination >= totalFrames) {
            destination = frame - 1
            while (destination >= 0 && usedFrames.has(destination)) destination -= 1
          }
        }
        if (destination < 0 || destination >= totalFrames || destination === frame) return

        get()._snapshot()
        set((s) => ({
          layers: s.layers.map((item) => {
            if (item.id !== layerId) return item
            if (propKey) {
              const source = item.propertyKeyframes?.[propKey]?.find((kf) => kf.frame === frame)
              if (!source) {
                if (!(propKey in DEFAULT_TRANSFORM)) return item
                const transformSource = item.keyframes.find((kf) => kf.frame === frame)
                if (!transformSource) return item
                const current = interpolateProps(destination, item.keyframes)
                return upsertTransformKeyframe(item, destination, {
                  ...current,
                  [propKey]: transformSource.props[propKey as keyof TransformProps],
                } as TransformProps, transformSource.easing)
              }
              return {
                ...item,
                propertyKeyframes: {
                  ...(item.propertyKeyframes ?? {}),
                  [propKey]: [
                    ...(item.propertyKeyframes?.[propKey] ?? []).filter((kf) => kf.frame !== destination),
                    { ...source, id: uid(), frame: destination, bezier: source.bezier ? [...source.bezier] as [number, number, number, number] : undefined },
                  ].sort((a, b) => a.frame - b.frame),
                },
              }
            }
            const source = item.keyframes.find((kf) => kf.frame === frame)
            if (!source) return item
            return {
              ...item,
              keyframes: [
                ...item.keyframes.filter((kf) => kf.frame !== destination),
                { ...source, frame: destination, props: { ...source.props }, bezier: source.bezier ? [...source.bezier] as [number, number, number, number] : undefined },
              ].sort((a, b) => a.frame - b.frame),
            }
          }),
          selectedKeyframes: [{ layerId, frame: destination, propKey }],
          selectedLayerIds: [layerId],
          currentFrame: destination,
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
            const kf: Keyframe = { frame, easing: (easing as Keyframe['easing']), props: { ...props } as TransformProps }
            const keyframes = existing
              ? l.keyframes.map((k) => k.frame === frame ? kf : k)
              : [...l.keyframes, kf].sort((a, b) => a.frame - b.frame)
            return { ...l, keyframes }
          })
          const target = s.layers.find((layer) => layer.id === layerId)
          const skipAutoFitIds = target && isGroupLayer(target) ? new Set([layerId]) : new Set<string>()
          return { layers: normalizeLayerTree(s, layers, layerId, false, skipAutoFitIds) }
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
            const target = ('x' in props || 'y' in props) ? ensureGroupOrigin(layer) : layer
            return upsertTransformKeyframe(target, frame, props, easing as PairEasingType)
          })
          const skipAutoFitIds = autoFitSkipIdsForMove(s.layers, [...byId.keys()])
          return { layers: withAutoFitGroups(s, layers, skipAutoFitIds) }
        })
      },

      addKeyframeSequence: (layerId, keyframes) => {
        if (!keyframes.length) return
        if (get().activeInteractionCount === 0) get()._snapshot()
        set((s) => {
          const targetLayer = s.layers.find((layer) => layer.id === layerId)
          const layers = s.layers.map((layer) => {
            if (layer.id !== layerId) return layer
            return keyframes.reduce((nextLayer, keyframe) => {
              const target = ('x' in keyframe.props || 'y' in keyframe.props) ? ensureGroupOrigin(nextLayer) : nextLayer
              return upsertTransformKeyframe(target, keyframe.frame, keyframe.props, keyframe.easing)
            }, layer)
          })
          const skipAutoFitIds = targetLayer && isGroupLayer(targetLayer) ? new Set([layerId]) : autoFitSkipIdsForMove(s.layers, [layerId])
          return { layers: withAutoFitGroups(s, layers, skipAutoFitIds) }
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
          const target = s.layers.find((layer) => layer.id === layerId)
          const skipAutoFitIds = target && isGroupLayer(target) ? new Set([layerId]) : new Set<string>()
          return { layers: normalizeLayerTree(s, layers, layerId, false, skipAutoFitIds) }
        })
      },

      updateLayerTimeRange: (layerId, startFrame, endFrame) => {
        if (get().activeInteractionCount === 0) get()._snapshot()
        set((s) => ({
          layers: s.layers.map((l) => {
            if (l.id !== layerId) return l
            if (l.type !== 'video' || !l.videoSegments?.length) return { ...l, startFrame, endFrame }
            const oldStart = l.startFrame ?? 0
            const oldEnd = l.endFrame ?? s.totalFrames
            const scale = Math.max(1, endFrame - startFrame) / Math.max(1, oldEnd - oldStart)
            return normalizeVideoLayer({
              ...l,
              videoSegments: retimeVideoSegments(l, oldStart, startFrame, scale),
            }, s.fps, s.totalFrames)
          }),
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
                  videoSegments: retimeVideoSegments(l, oldStart, startFrame, scale),
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
              const nextLayer = {
                ...l,
                startFrame,
                endFrame,
                keyframes: newKeyframes,
                propertyKeyframes: shiftPropertyKeyframes(l, delta),
                videoSegments: retimeVideoSegments(l, l.startFrame ?? 0, startFrame, Math.max(1, endFrame - startFrame) / Math.max(1, (l.endFrame ?? s.totalFrames) - (l.startFrame ?? 0))),
              }
              return l.type === 'video' ? normalizeVideoLayer(nextLayer, s.fps, s.totalFrames) : nextLayer
            }),
            selectedKeyframes: s.selectedKeyframes.map((kf) =>
              kf.layerId === layerId ? { ...kf, frame: Math.max(0, kf.frame + delta) } : kf
            ),
          }
        })
      },

      selectActiveSegment: (layerId, frame) => {
        const layer = get().layers.find((item) => item.id === layerId)
        if (!layer?.videoSegments?.length) return null
        return layer.videoSegments.find((segment) =>
          frame >= segment.timelineStartFrame && frame < segment.timelineEndFrame
        ) ?? null
      },

      selectSegmentSpeed: (segment) => {
        const timelineDuration = segment.timelineEndFrame - segment.timelineStartFrame
        if (timelineDuration <= 0) return 0
        return (segment.sourceEndFrame - segment.sourceStartFrame) / timelineDuration
      },

      setLayerSourceDuration: (layerId, durationFrames) => {
        const sourceDurationFrames = Math.max(0, Math.round(durationFrames))
        set((s) => {
          let changed = false
          const layers = s.layers.map((layer) => {
            if (layer.id !== layerId || layer.type !== 'video') return layer
            if (layer.sourceDurationFrames === sourceDurationFrames) return layer
            changed = true
            return normalizeVideoLayer({ ...layer, sourceDurationFrames }, s.fps, s.totalFrames)
          })
          return changed ? { layers } : {}
        })
      },

      splitVideoAt: (layerId, frame) => {
        if (get().activeInteractionCount === 0) get()._snapshot()
        set((s) => ({
          layers: s.layers.map((layer) => {
            if (layer.id !== layerId || layer.type !== 'video') return layer
            const normalized = normalizeVideoLayer(layer, s.fps, s.totalFrames)
            const segments = normalized.videoSegments ?? []
            const index = segments.findIndex((segment) => frame > segment.timelineStartFrame && frame < segment.timelineEndFrame)
            if (index < 0) return normalized
            const segment = segments[index]
            const speed = get().selectSegmentSpeed(segment)
            const sourceCut = clampInt(segment.sourceStartFrame + speed * (frame - segment.timelineStartFrame), 0, sourceDurationFramesForLayer(normalized, s.fps))
            const nextSegments = [
              ...segments.slice(0, index),
              { ...segment, id: uid(), timelineEndFrame: frame, sourceEndFrame: sourceCut },
              { ...segment, id: uid(), timelineStartFrame: frame, sourceStartFrame: sourceCut },
              ...segments.slice(index + 1),
            ]
            return normalizeVideoLayer({ ...normalized, videoSegments: nextSegments }, s.fps, s.totalFrames)
          }),
        }))
      },

      removeVideoSegment: (layerId, segmentId) => {
        if (get().activeInteractionCount === 0) get()._snapshot()
        set((s) => ({
          layers: s.layers.map((layer) => {
            if (layer.id !== layerId || layer.type !== 'video') return layer
            const nextSegments = (layer.videoSegments ?? []).filter((segment) => segment.id !== segmentId)
            return nextSegments.length
              ? normalizeVideoLayer({ ...layer, videoSegments: nextSegments }, s.fps, s.totalFrames)
              : { ...layer, videoSegments: [] }
          }),
        }))
      },

      duplicateVideoSegment: (layerId, segmentId) => {
        if (get().activeInteractionCount === 0) get()._snapshot()
        set((s) => ({
          layers: s.layers.map((layer) => {
            if (layer.id !== layerId || layer.type !== 'video') return layer
            const normalized = normalizeVideoLayer(layer, s.fps, s.totalFrames)
            const segments = normalized.videoSegments ?? []
            const index = segments.findIndex((segment) => segment.id === segmentId)
            if (index < 0) return normalized
            const segment = segments[index]
            const duration = Math.max(1, segment.timelineEndFrame - segment.timelineStartFrame)
            const timelineStartFrame = segment.timelineEndFrame
            const timelineEndFrame = Math.min(s.totalFrames, timelineStartFrame + duration)
            if (timelineEndFrame <= timelineStartFrame) return normalized
            const copy = { ...segment, id: uid(), timelineStartFrame, timelineEndFrame }
            const shifted = segments.slice(index + 1).map((item) => ({
              ...item,
              timelineStartFrame: item.timelineStartFrame + (timelineEndFrame - timelineStartFrame),
              timelineEndFrame: item.timelineEndFrame + (timelineEndFrame - timelineStartFrame),
            }))
            return normalizeVideoLayer({ ...normalized, videoSegments: [...segments.slice(0, index + 1), copy, ...shifted] }, s.fps, s.totalFrames)
          }),
        }))
      },

      setSegmentTimelineRange: (layerId, segmentId, startFrame, endFrame, opts) => {
        if (get().activeInteractionCount === 0) get()._snapshot()
        set((s) => ({
          layers: s.layers.map((layer) => {
            if (layer.id !== layerId || layer.type !== 'video') return layer
            const normalized = normalizeVideoLayer(layer, s.fps, s.totalFrames)
            const segments = normalized.videoSegments ?? []
            const index = segments.findIndex((segment) => segment.id === segmentId)
            if (index < 0) return normalized
            const previousEnd = index > 0 ? segments[index - 1].timelineEndFrame : 0
            const nextStart = index < segments.length - 1 ? segments[index + 1].timelineStartFrame : s.totalFrames
            const start = clampInt(startFrame, previousEnd, Math.max(previousEnd, nextStart - 1))
            const end = clampInt(endFrame, start + 1, nextStart)
            const sourceDuration = sourceDurationFramesForLayer(normalized, s.fps)
            const current = segments[index]
            const oldSpeed = get().selectSegmentSpeed(current)
            const nextSourceEnd = opts?.preserveSpeed
              ? clampInt(current.sourceStartFrame + (end - start) * oldSpeed, current.sourceStartFrame, sourceDuration)
              : current.sourceEndFrame
            return normalizeVideoLayer({
              ...normalized,
              videoSegments: segments.map((segment) => segment.id === segmentId
                ? { ...segment, timelineStartFrame: start, timelineEndFrame: end, sourceEndFrame: nextSourceEnd }
                : segment),
            }, s.fps, s.totalFrames)
          }),
        }))
      },

      setSegmentSourceRange: (layerId, segmentId, sourceStartFrame, sourceEndFrame) => {
        if (get().activeInteractionCount === 0) get()._snapshot()
        set((s) => ({
          layers: s.layers.map((layer) => {
            if (layer.id !== layerId || layer.type !== 'video') return layer
            const normalized = normalizeVideoLayer(layer, s.fps, s.totalFrames)
            const sourceDuration = sourceDurationFramesForLayer(normalized, s.fps)
            const start = clampInt(sourceStartFrame, 0, sourceDuration)
            const end = clampInt(sourceEndFrame, start, sourceDuration)
            return normalizeVideoLayer({
              ...normalized,
              videoSegments: (normalized.videoSegments ?? []).map((segment) => segment.id === segmentId
                ? { ...segment, sourceStartFrame: start, sourceEndFrame: end }
                : segment),
            }, s.fps, s.totalFrames)
          }),
        }))
      },

      moveVideoSegment: (layerId, segmentId, deltaFrames) => {
        if (get().activeInteractionCount === 0) get()._snapshot()
        set((s) => ({
          layers: s.layers.map((layer) => {
            if (layer.id !== layerId || layer.type !== 'video') return layer
            const normalized = normalizeVideoLayer(layer, s.fps, s.totalFrames)
            const segments = normalized.videoSegments ?? []
            const index = segments.findIndex((segment) => segment.id === segmentId)
            if (index < 0) return normalized
            const segment = segments[index]
            const previousEnd = index > 0 ? segments[index - 1].timelineEndFrame : 0
            const nextStart = index < segments.length - 1 ? segments[index + 1].timelineStartFrame : s.totalFrames
            const duration = segment.timelineEndFrame - segment.timelineStartFrame
            const start = clampInt(segment.timelineStartFrame + deltaFrames, previousEnd, Math.max(previousEnd, nextStart - duration))
            return normalizeVideoLayer({
              ...normalized,
              videoSegments: segments.map((item) => item.id === segmentId
                ? { ...item, timelineStartFrame: start, timelineEndFrame: start + duration }
                : item),
            }, s.fps, s.totalFrames)
          }),
        }))
      },

      setSegmentSpeed: (layerId, segmentId, speed) => {
        if (get().activeInteractionCount === 0) get()._snapshot()
        set((s) => ({
          layers: s.layers.map((layer) => {
            if (layer.id !== layerId || layer.type !== 'video') return layer
            const normalized = normalizeVideoLayer(layer, s.fps, s.totalFrames)
            const sourceDuration = sourceDurationFramesForLayer(normalized, s.fps)
            const clampedSpeed = Math.max(0.25, Math.min(4, speed))
            return normalizeVideoLayer({
              ...normalized,
              videoSegments: (normalized.videoSegments ?? []).map((segment) => {
                if (segment.id !== segmentId) return segment
                const timelineDuration = Math.max(1, segment.timelineEndFrame - segment.timelineStartFrame)
                return {
                  ...segment,
                  sourceEndFrame: clampInt(segment.sourceStartFrame + timelineDuration * clampedSpeed, segment.sourceStartFrame, sourceDuration),
                }
              }),
            }, s.fps, s.totalFrames)
          }),
        }))
      },

      freezeSegment: (layerId, segmentId) => {
        if (get().activeInteractionCount === 0) get()._snapshot()
        set((s) => ({
          layers: s.layers.map((layer) => layer.id === layerId && layer.type === 'video'
            ? normalizeVideoLayer({
                ...layer,
                videoSegments: (layer.videoSegments ?? []).map((segment) => segment.id === segmentId
                  ? { ...segment, sourceEndFrame: segment.sourceStartFrame }
                  : segment),
              }, s.fps, s.totalFrames)
            : layer),
        }))
      },

      resetVideoCut: (layerId) => {
        if (get().activeInteractionCount === 0) get()._snapshot()
        set((s) => ({
          layers: s.layers.map((layer) => {
            if (layer.id !== layerId || layer.type !== 'video') return layer
            const startFrame = clampInt(layer.startFrame ?? 0, 0, Math.max(0, s.totalFrames - 1))
            const sourceDuration = sourceDurationFramesForLayer(layer, s.fps, Math.max(1, (layer.endFrame ?? s.totalFrames) - startFrame))
            const timelineDuration = Math.max(1, Math.min(sourceDuration || s.totalFrames - startFrame, s.totalFrames - startFrame))
            return normalizeVideoLayer({
              ...layer,
              videoSegments: [{
                id: uid(),
                timelineStartFrame: startFrame,
                timelineEndFrame: startFrame + timelineDuration,
                sourceStartFrame: 0,
                sourceEndFrame: Math.min(sourceDuration || timelineDuration, timelineDuration),
              }],
            }, s.fps, s.totalFrames)
          }),
        }))
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
            const bounds = getLayersFrameBounds(wrapLayers, s.currentFrame, canvasWidth, canvasHeight, s.totalFrames, s.layers)
            if (!bounds) return {}
            const groupParent = target.parentId ? s.layers.find((l) => l.id === target.parentId) : null
            const groupParentWorld = groupParent ? layerWorldPosition(s.layers, groupParent, s.currentFrame) : { x: 0, y: 0 }
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
                frame: 0,
                easing: 'ease-out',
                props: {
                  ...DEFAULT_TRANSFORM,
                  x: Math.round(bounds.x - groupParentWorld.x),
                  y: Math.round(bounds.y - groupParentWorld.y),
                },
              }],
            })
            const firstIdx = Math.min(...wrapLayers.map((l) => s.layers.findIndex((item) => item.id === l.id)).filter((idx) => idx >= 0))
            const next = [...s.layers]
            next.splice(firstIdx, 0, group)
            return {
              layers: normalizeLayerTree(
                s,
                next.map((l) => wrapIds.includes(l.id) ? reparentLayerAtFrame(l, next, s.currentFrame, group.id) : l),
                group.id,
                true,
              ),
              selectedLayerIds: [group.id],
            }
          }
          let next = s.layers.map((l) => {
            if (layerIds.includes(l.id)) return reparentLayerAtFrame(l, s.layers, s.currentFrame, parentId)
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
          const bounds = getLayersFrameBounds(selected, s.currentFrame, canvasWidth, canvasHeight, s.totalFrames, s.layers)
          if (!bounds) return {}
          const parent = sharedParent ? s.layers.find((l) => l.id === sharedParent) : null
          const parentWorld = parent ? layerWorldPosition(s.layers, parent, s.currentFrame) : { x: 0, y: 0 }
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
              frame: 0,
              easing: 'ease-out',
              props: {
                ...DEFAULT_TRANSFORM,
                x: Math.round(bounds.x - parentWorld.x),
                y: Math.round(bounds.y - parentWorld.y),
              },
            }],
          })
          const firstIdx = Math.min(...selected.map((l) => s.layers.findIndex((x) => x.id === l.id)).filter((i) => i >= 0))
          const next = [...s.layers]
          next.splice(firstIdx, 0, group)
          const layers = next.map((l) => selectedLayerIds.includes(l.id) ? reparentLayerAtFrame(l, next, s.currentFrame, group.id) : l)
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
          const withoutGroup = s.layers.filter((l) => l.id !== id)
          return {
            layers: withoutGroup.map((l) => l.parentId === id
              ? reparentLayerAtFrame(l, s.layers, s.currentFrame, group.parentId ?? null)
              : l),
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
        if (group) {
          const selected = new Set(selectedLayerIds)
          const topChild = [...layers].reverse().find((layer) => layer.parentId === group.id && !selected.has(layer.id))
          get().moveLayerToParent(selectedLayerIds, group.id, topChild?.id ?? null)
        }
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

      clearLayerKeyframes: (layerId) => {
        const target = get().layers.find((layer) => layer.id === layerId)
        if (!target || (!target.keyframes.length && !Object.values(target.propertyKeyframes ?? {}).some((frames) => frames?.length))) return
        get()._snapshot()
        set((s) => ({
          layers: s.layers.map((layer) =>
            layer.id === layerId
              ? { ...layer, keyframes: [], propertyKeyframes: {} }
              : layer
          ),
          selectedKeyframes: s.selectedKeyframes.filter((kf) => kf.layerId !== layerId),
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
        if (get().activeInteractionCount === 0) get()._snapshot()
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

      setCurrentFrame: (frame, options) => set((s) => ({
        currentFrame: frame,
        selectedKeyframes: options?.preserveKeyframeSelection ? s.selectedKeyframes : [],
      })),
      setTotalFrames: (frames) => set({ totalFrames: frames }),
      setPlaying: (playing) => set({ isPlaying: playing }),
      setPlaybackRate: (rate) => set({ playbackRate: Math.max(0.1, Math.min(4, rate)) }),

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
      setShowOutsideCanvas: (show) => set({ showOutsideCanvas: show }),
      setActiveColorPalette: (id) => set((s) => ({
        activeColorPaletteId: s.colorPalettes.some((palette) => palette.id === id) ? id : s.activeColorPaletteId,
      })),
      createColorPalette: (name) => {
        const id = uid()
        const safeName = name.trim() || 'Palette'
        set((s) => ({
          colorPalettes: [...s.colorPalettes, { id, name: safeName, colors: [] }],
          activeColorPaletteId: id,
        }))
        return id
      },
      deleteColorPalette: (id) => set((s) => {
        if (s.colorPalettes.length <= 1) return {}
        const next = s.colorPalettes.filter((palette) => palette.id !== id)
        if (next.length === s.colorPalettes.length) return {}
        return {
          colorPalettes: next,
          activeColorPaletteId: s.activeColorPaletteId === id ? next[0].id : s.activeColorPaletteId,
        }
      }),
      addColorToPalette: (color, paletteId) => {
        const normalized = normalizeHexColor(color)
        if (!normalized) return
        const targetId = paletteId ?? get().activeColorPaletteId
        set((s) => ({
          colorPalettes: s.colorPalettes.map((palette) => {
            if (palette.id !== targetId) return palette
            const existing = palette.colors.map((item) => item.toLowerCase())
            if (existing.includes(normalized)) return palette
            return { ...palette, colors: [normalized, ...palette.colors].slice(0, 64) }
          }),
        }))
      },
      removeColorFromPalette: (color, paletteId) => {
        const normalized = normalizeHexColor(color)
        if (!normalized) return
        const targetId = paletteId ?? get().activeColorPaletteId
        set((s) => ({
          colorPalettes: s.colorPalettes.map((palette) => palette.id === targetId
            ? { ...palette, colors: palette.colors.filter((item) => item.toLowerCase() !== normalized) }
            : palette),
        }))
      },
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
      version: 3,
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
          showOutsideCanvas: s.showOutsideCanvas,
          colorPalettes: s.colorPalettes?.length ? s.colorPalettes : DEFAULT_COLOR_PALETTES,
          activeColorPaletteId: s.activeColorPaletteId ?? 'custom',
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
        showOutsideCanvas: s.showOutsideCanvas,
        colorPalettes: s.colorPalettes,
        activeColorPaletteId: s.activeColorPaletteId,
      }),
    }
  )
)

// Derived selector helpers
export const selectedLayer = (s: Store) =>
  s.layers.find((l) => l.id === s.selectedLayerIds[0]) ?? null

export const selectedLayers = (s: Store) =>
  s.layers.filter((l) => s.selectedLayerIds.includes(l.id))
