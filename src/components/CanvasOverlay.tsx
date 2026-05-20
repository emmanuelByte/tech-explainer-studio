import { useCallback, useEffect, useRef, useState } from 'react'
import { useStore } from '../store'
import { DEFAULT_TRANSFORM, Layer, TransformProps } from '../types'
import { resolveLayerAnimation } from '../animationProperties'
import { descendantsOf } from '../layerTree'
import { buildTransform } from '../remotion/interpolateProps'

interface Props {
  containerRef: React.RefObject<HTMLDivElement | null>
  canvasW: number
  canvasH: number
}

type HandleType = 'move' | 'tl' | 'tr' | 'bl' | 'br' | 'ml' | 'mr' | 'mt' | 'mb' | 'rotate' | 'skewX' | 'skewY' | 'perspective'

interface DragState {
  type: HandleType
  startMx: number
  startMy: number
  startPropX: number
  startPropY: number
  startScale: number
  startW: number
  startH: number
  startBoxW: number
  startBoxH: number
  centerCx: number
  centerCy: number
  displayScale: number
  props: TransformProps
  startPropsById: Record<string, TransformProps>
  movingLayerIds: string[]
  shiftLock: null | 'x' | 'y'
  pendingMoveUpdates?: Array<{ layerId: string; props: TransformProps }>
}

interface LayerBox {
  layer: Layer
  animatedLayer: Layer
  transform: TransformProps
  left: number
  top: number
  width: number
  height: number
  centerCx: number
  centerCy: number
}

interface BoxRect {
  id: string
  left: number
  top: number
  right: number
  bottom: number
}

interface SpacingGuide {
  axis: 'x' | 'y'
  start: number
  end: number
  cross: number
  label: string
  matched: boolean
}

interface AlignmentGuide {
  axis: 'x' | 'y'
  position: number
  start: number
  end: number
  distance: number
}

interface MovePreview {
  dx: number
  dy: number
}

interface MarqueeState {
  startX: number
  startY: number
  currentX: number
  currentY: number
  additive: boolean
  started: boolean
  baseSelection: string[]
}

interface PenPoint {
  x: number
  y: number
}

interface EditablePathPoint {
  x: number
  y: number
  in?: PenPoint
  out?: PenPoint
}

interface PathDragState {
  type: 'anchor' | 'in' | 'out'
  pointIndex: number
  points: EditablePathPoint[]
  closed: boolean
}

const SNAP_DISTANCE = 6
const ALIGNMENT_GUIDE_DISTANCE = 12

function pathFromPoints(points: PenPoint[], closed: boolean) {
  if (!points.length) return ''
  const parts = [`M ${Math.round(points[0].x)} ${Math.round(points[0].y)}`]
  points.slice(1).forEach((point) => parts.push(`L ${Math.round(point.x)} ${Math.round(point.y)}`))
  if (closed) parts.push('Z')
  return parts.join(' ')
}

function distance(a: PenPoint, b: PenPoint) {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function fmtPathNumber(value: number) {
  return Number(value.toFixed(2))
}

function parseEditablePath(pathData = '') {
  const tokens = pathData.match(/[MLCQHVZ]|-?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? []
  const points: EditablePathPoint[] = []
  let closed = false
  let current: PenPoint = { x: 0, y: 0 }
  let i = 0

  const readNumber = (offset: number) => {
    const value = Number(tokens[i + offset])
    return Number.isFinite(value) ? value : null
  }

  while (i < tokens.length) {
    const token = tokens[i]
    if (/^M$/i.test(token) || /^L$/i.test(token)) {
      const x = readNumber(1)
      const y = readNumber(2)
      if (x !== null && y !== null) {
        current = { x, y }
        points.push({ ...current })
      }
      i += 3
      continue
    }
    if (/^H$/i.test(token)) {
      const x = readNumber(1)
      if (x !== null) {
        current = { x, y: current.y }
        points.push({ ...current })
      }
      i += 2
      continue
    }
    if (/^V$/i.test(token)) {
      const y = readNumber(1)
      if (y !== null) {
        current = { x: current.x, y }
        points.push({ ...current })
      }
      i += 2
      continue
    }
    if (/^C$/i.test(token)) {
      const c1x = readNumber(1)
      const c1y = readNumber(2)
      const c2x = readNumber(3)
      const c2y = readNumber(4)
      const x = readNumber(5)
      const y = readNumber(6)
      if ([c1x, c1y, c2x, c2y, x, y].every((value) => value !== null)) {
        if (points.length) points[points.length - 1].out = { x: c1x!, y: c1y! }
        current = { x: x!, y: y! }
        points.push({ ...current, in: { x: c2x!, y: c2y! } })
      }
      i += 7
      continue
    }
    if (/^Q$/i.test(token)) {
      const qx = readNumber(1)
      const qy = readNumber(2)
      const x = readNumber(3)
      const y = readNumber(4)
      if ([qx, qy, x, y].every((value) => value !== null)) {
        if (points.length) {
          points[points.length - 1].out = {
            x: current.x + (qx! - current.x) * 2 / 3,
            y: current.y + (qy! - current.y) * 2 / 3,
          }
        }
        current = { x: x!, y: y! }
        points.push({
          ...current,
          in: {
            x: current.x + (qx! - current.x) * 2 / 3,
            y: current.y + (qy! - current.y) * 2 / 3,
          },
        })
      }
      i += 5
      continue
    }
    if (/^Z$/i.test(token)) {
      closed = true
      i += 1
      continue
    }
    i += 1
  }

  return { points, closed }
}

function serializeEditablePath(points: EditablePathPoint[], closed: boolean) {
  if (!points.length) return ''
  const parts = [`M ${fmtPathNumber(points[0].x)} ${fmtPathNumber(points[0].y)}`]
  for (let index = 1; index < points.length; index += 1) {
    const prev = points[index - 1]
    const point = points[index]
    if (prev.out || point.in) {
      const c1 = prev.out ?? { x: prev.x, y: prev.y }
      const c2 = point.in ?? { x: point.x, y: point.y }
      parts.push(`C ${fmtPathNumber(c1.x)} ${fmtPathNumber(c1.y)} ${fmtPathNumber(c2.x)} ${fmtPathNumber(c2.y)} ${fmtPathNumber(point.x)} ${fmtPathNumber(point.y)}`)
    } else {
      parts.push(`L ${fmtPathNumber(point.x)} ${fmtPathNumber(point.y)}`)
    }
  }
  if (closed && points.length > 1) {
    const last = points[points.length - 1]
    const first = points[0]
    if (last.out || first.in) {
      const c1 = last.out ?? { x: last.x, y: last.y }
      const c2 = first.in ?? { x: first.x, y: first.y }
      parts.push(`C ${fmtPathNumber(c1.x)} ${fmtPathNumber(c1.y)} ${fmtPathNumber(c2.x)} ${fmtPathNumber(c2.y)} ${fmtPathNumber(first.x)} ${fmtPathNumber(first.y)}`)
    }
    parts.push('Z')
  }
  return parts.join(' ')
}

function segmentPath(points: EditablePathPoint[], index: number, closed: boolean) {
  const from = points[index]
  const to = points[index + 1] ?? (closed ? points[0] : null)
  if (!from || !to) return ''
  const start = `M ${fmtPathNumber(from.x)} ${fmtPathNumber(from.y)}`
  if (from.out || to.in) {
    const c1 = from.out ?? { x: from.x, y: from.y }
    const c2 = to.in ?? { x: to.x, y: to.y }
    return `${start} C ${fmtPathNumber(c1.x)} ${fmtPathNumber(c1.y)} ${fmtPathNumber(c2.x)} ${fmtPathNumber(c2.y)} ${fmtPathNumber(to.x)} ${fmtPathNumber(to.y)}`
  }
  return `${start} L ${fmtPathNumber(to.x)} ${fmtPathNumber(to.y)}`
}

function smoothPoint(points: EditablePathPoint[], index: number, closed: boolean) {
  const point = points[index]
  if (!point) return points
  const prev = points[index - 1] ?? (closed ? points[points.length - 1] : null)
  const next = points[index + 1] ?? (closed ? points[0] : null)
  if (!prev && !next) return points
  const nextPoints = points.map((item) => ({ ...item, in: item.in ? { ...item.in } : undefined, out: item.out ? { ...item.out } : undefined }))
  const target = nextPoints[index]

  if (target.in || target.out) {
    target.in = undefined
    target.out = undefined
    return nextPoints
  }

  if (prev && next) {
    const vx = next.x - prev.x
    const vy = next.y - prev.y
    const mag = Math.hypot(vx, vy) || 1
    const ux = vx / mag
    const uy = vy / mag
    const inLen = distance(point, prev) / 3
    const outLen = distance(point, next) / 3
    target.in = { x: point.x - ux * inLen, y: point.y - uy * inLen }
    target.out = { x: point.x + ux * outLen, y: point.y + uy * outLen }
  } else if (next) {
    target.out = { x: point.x + (next.x - point.x) / 3, y: point.y + (next.y - point.y) / 3 }
  } else if (prev) {
    target.in = { x: point.x + (prev.x - point.x) / 3, y: point.y + (prev.y - point.y) / 3 }
  }
  return nextPoints
}

function getMovementLayerIds(layers: Layer[], selectedIds: string[]) {
  return selectedIds.filter((id) => layers.some((layer) => layer.id === id))
}

function snapValue(value: number, guides: number[]) {
  let best = value
  let bestDistance = SNAP_DISTANCE + 1
  for (const guide of guides) {
    const distance = Math.abs(value - guide)
    if (distance < bestDistance) {
      bestDistance = distance
      best = guide
    }
  }
  return bestDistance <= SNAP_DISTANCE ? best : value
}

function buildSnapGuides(
  layers: Layer[],
  selectedIds: string[],
  frame: number,
  canvasW: number,
  canvasH: number,
) {
  const selected = new Set(getMovementLayerIds(layers, selectedIds))
  selectedIds.forEach((id) => {
    descendantsOf(layers, id).forEach((child) => selected.add(child.id))
  })
  const xGuides = [0, canvasW / 2, canvasW]
  const yGuides = [0, canvasH / 2, canvasH]

  for (const item of layers) {
    if (selected.has(item.id) || !item.visible) continue
    const box = getLayerBox(item, layers, frame, canvasW, canvasH)
    xGuides.push(box.left, box.centerCx, box.left + box.width)
    yGuides.push(box.top, box.centerCy, box.top + box.height)
  }

  return { xGuides, yGuides }
}

function canvasRect(canvasW: number, canvasH: number): BoxRect {
  return {
    id: 'canvas',
    left: 0,
    top: 0,
    right: canvasW,
    bottom: canvasH,
  }
}

function snapMovingBox(
  cx: number,
  cy: number,
  w: number,
  h: number,
  xGuides: number[],
  yGuides: number[],
) {
  const xCandidates = [cx - w / 2, cx, cx + w / 2]
  const yCandidates = [cy - h / 2, cy, cy + h / 2]
  let nextCx = cx
  let nextCy = cy
  let bestXDistance = SNAP_DISTANCE + 1
  let bestYDistance = SNAP_DISTANCE + 1

  for (const candidate of xCandidates) {
    for (const guide of xGuides) {
      const distance = Math.abs(candidate - guide)
      if (distance < bestXDistance) {
        bestXDistance = distance
        nextCx = cx + (guide - candidate)
      }
    }
  }

  for (const candidate of yCandidates) {
    for (const guide of yGuides) {
      const distance = Math.abs(candidate - guide)
      if (distance < bestYDistance) {
        bestYDistance = distance
        nextCy = cy + (guide - candidate)
      }
    }
  }

  return {
    cx: bestXDistance <= SNAP_DISTANCE ? nextCx : cx,
    cy: bestYDistance <= SNAP_DISTANCE ? nextCy : cy,
  }
}

function groupOrigin(layer: Layer) {
  const first = [...layer.keyframes].sort((a, b) => a.frame - b.frame)[0]
  return {
    x: layer.groupOriginX ?? first?.props.x ?? 0,
    y: layer.groupOriginY ?? first?.props.y ?? 0,
  }
}

function parentRenderOffset(layer: Layer, layers: Layer[], frame: number) {
  let x = 0
  let y = 0
  const seen = new Set<string>()
  let parentId = layer.parentId ?? null
  while (parentId && !seen.has(parentId)) {
    seen.add(parentId)
    const parent = layers.find((item) => item.id === parentId)
    if (!parent) break
    const p = resolveLayerAnimation(parent, frame).transform
    const origin = groupOrigin(parent)
    x += p.x - origin.x
    y += p.y - origin.y
    parentId = parent.parentId ?? null
  }
  return { x, y }
}

function getLayerBox(layer: Layer, layers: Layer[], frame: number, canvasW: number, canvasH: number): LayerBox {
  const { layer: animatedLayer, transform } = resolveLayerAnimation(layer, frame)
  const rawWidth = animatedLayer.sizeMode === 'fill-canvas' ? canvasW : animatedLayer.width
  const rawHeight = animatedLayer.sizeMode === 'fill-canvas' ? canvasH : animatedLayer.type === 'line' ? (animatedLayer.strokeWidth || 2) : animatedLayer.height
  const width = Math.abs(rawWidth * transform.scale * transform.scaleX)
  const height = Math.abs(rawHeight * transform.scale * transform.scaleY)
  const parentOffset = parentRenderOffset(layer, layers, frame)
  const centerCx = canvasW / 2 + transform.x + parentOffset.x
  const centerCy = canvasH / 2 + transform.y + parentOffset.y
  return {
    layer,
    animatedLayer,
    transform,
    left: centerCx - width / 2,
    top: centerCy - height / 2,
    width,
    height,
    centerCx,
    centerCy,
  }
}

function rectsIntersect(a: { left: number; top: number; right: number; bottom: number }, b: { left: number; top: number; right: number; bottom: number }) {
  return a.left <= b.right && a.right >= b.left && a.top <= b.bottom && a.bottom >= b.top
}

function pointInBox(x: number, y: number, box: LayerBox) {
  return x >= box.left && x <= box.left + box.width && y >= box.top && y <= box.top + box.height
}

function boxToRect(box: LayerBox): BoxRect {
  return {
    id: box.layer.id,
    left: box.left,
    top: box.top,
    right: box.left + box.width,
    bottom: box.top + box.height,
  }
}

function boxesToRect(boxes: LayerBox[], id: string): BoxRect | null {
  if (!boxes.length) return null
  const left = Math.min(...boxes.map((box) => box.left))
  const top = Math.min(...boxes.map((box) => box.top))
  const right = Math.max(...boxes.map((box) => box.left + box.width))
  const bottom = Math.max(...boxes.map((box) => box.top + box.height))
  return { id, left, top, right, bottom }
}

function isActiveLayer(layer: Layer, frame: number) {
  return layer.visible && frame >= (layer.startFrame ?? 0) && frame <= (layer.endFrame ?? Infinity)
}

function buildMeasurementBoxes(layers: Layer[], movingIds: string[], frame: number, canvasW: number, canvasH: number) {
  const excluded = new Set(movingIds)
  movingIds.forEach((id) => {
    descendantsOf(layers, id).forEach((child) => excluded.add(child.id))
  })
  const parentIds = new Set(
    movingIds
      .map((id) => layers.find((item) => item.id === id)?.parentId ?? null)
      .filter((id): id is string => Boolean(id)),
  )

  return layers
    .filter((item) => (
      !excluded.has(item.id)
      && isActiveLayer(item, frame)
      && (item.type !== 'group' && !item.isGroup || parentIds.has(item.id))
    ))
    .map((item) => boxToRect(getLayerBox(item, layers, frame, canvasW, canvasH)))
}

function overlapAmount(a1: number, a2: number, b1: number, b2: number) {
  return Math.min(a2, b2) - Math.max(a1, b1)
}

function overlapCenter(a1: number, a2: number, b1: number, b2: number) {
  return (Math.max(a1, b1) + Math.min(a2, b2)) / 2
}

function gapMatches(a: number, b: number) {
  return Math.abs(Math.round(a) - Math.round(b)) <= 1
}

function sameStringSet(a: string[], b: string[]) {
  if (a.length !== b.length) return false
  const values = new Set(a)
  return b.every((value) => values.has(value))
}

function sameGuide(a: SpacingGuide, b: SpacingGuide) {
  return a.axis === b.axis
    && Math.abs(a.start - b.start) < 0.5
    && Math.abs(a.end - b.end) < 0.5
    && Math.abs(a.cross - b.cross) < 0.5
}

function sameSpacingGuides(a: SpacingGuide[], b: SpacingGuide[]) {
  if (a.length !== b.length) return false
  return a.every((guide, index) => {
    const other = b[index]
    return Boolean(other)
      && guide.axis === other.axis
      && Math.abs(guide.start - other.start) < 0.5
      && Math.abs(guide.end - other.end) < 0.5
      && Math.abs(guide.cross - other.cross) < 0.5
      && guide.label === other.label
      && guide.matched === other.matched
  })
}

function sameAlignmentGuides(a: AlignmentGuide[], b: AlignmentGuide[]) {
  if (a.length !== b.length) return false
  return a.every((guide, index) => {
    const other = b[index]
    return Boolean(other)
      && guide.axis === other.axis
      && Math.abs(guide.position - other.position) < 0.5
      && Math.abs(guide.start - other.start) < 0.5
      && Math.abs(guide.end - other.end) < 0.5
  })
}

function repeatedSpacingGuides(boxes: BoxRect[], axis: 'x' | 'y', targetGap: number) {
  const sorted = [...boxes].sort((a, b) => axis === 'x' ? a.left - b.left : a.top - b.top)
  const guides: SpacingGuide[] = []
  for (let index = 0; index < sorted.length - 1; index += 1) {
    const a = sorted[index]
    const b = sorted[index + 1]
    const overlap = axis === 'x'
      ? overlapAmount(a.top, a.bottom, b.top, b.bottom)
      : overlapAmount(a.left, a.right, b.left, b.right)
    if (overlap <= 0) continue
    const gap = axis === 'x' ? b.left - a.right : b.top - a.bottom
    if (gap < 0 || !gapMatches(gap, targetGap)) continue
    guides.push({
      axis,
      start: axis === 'x' ? a.right : a.bottom,
      end: axis === 'x' ? b.left : b.top,
      cross: axis === 'x'
        ? overlapCenter(a.top, a.bottom, b.top, b.bottom)
        : overlapCenter(a.left, a.right, b.left, b.right),
      label: `${Math.round(gap)}px`,
      matched: true,
    })
  }
  return guides
}

function buildSpacingGuides(moving: BoxRect, otherBoxes: BoxRect[]) {
  const guides: SpacingGuide[] = []
  const primary: SpacingGuide[] = []

  const horizontalCandidates = otherBoxes.flatMap((box) => {
    if (overlapAmount(moving.top, moving.bottom, box.top, box.bottom) <= 0) return []
    const cross = overlapCenter(moving.top, moving.bottom, box.top, box.bottom)
    if (box.right <= moving.left) {
      const gap = moving.left - box.right
      return [{ axis: 'x' as const, start: box.right, end: moving.left, cross, gap }]
    }
    if (box.left >= moving.right) {
      const gap = box.left - moving.right
      return [{ axis: 'x' as const, start: moving.right, end: box.left, cross, gap }]
    }
    return []
  }).sort((a, b) => a.gap - b.gap)

  const verticalCandidates = otherBoxes.flatMap((box) => {
    if (overlapAmount(moving.left, moving.right, box.left, box.right) <= 0) return []
    const cross = overlapCenter(moving.left, moving.right, box.left, box.right)
    if (box.bottom <= moving.top) {
      const gap = moving.top - box.bottom
      return [{ axis: 'y' as const, start: box.bottom, end: moving.top, cross, gap }]
    }
    if (box.top >= moving.bottom) {
      const gap = box.top - moving.bottom
      return [{ axis: 'y' as const, start: moving.bottom, end: box.top, cross, gap }]
    }
    return []
  }).sort((a, b) => a.gap - b.gap)

  ;[horizontalCandidates[0], verticalCandidates[0]].forEach((candidate) => {
    if (!candidate) return
    primary.push({
      axis: candidate.axis,
      start: candidate.start,
      end: candidate.end,
      cross: candidate.cross,
      label: `${Math.round(candidate.gap)}px`,
      matched: false,
    })
  })

  primary.forEach((guide) => {
    const gap = Math.abs(guide.end - guide.start)
    const repeated = repeatedSpacingGuides([...otherBoxes, moving], guide.axis, gap)
      .filter((item) => !sameGuide(item, guide))
      .slice(0, 8)
    guides.push({ ...guide, matched: repeated.length > 0 }, ...repeated)
  })

  return guides
}

function rectAnchors(rect: BoxRect, axis: 'x' | 'y') {
  if (axis === 'x') {
    return [
      { key: 'left', value: rect.left },
      { key: 'center', value: (rect.left + rect.right) / 2 },
      { key: 'right', value: rect.right },
    ]
  }
  return [
    { key: 'top', value: rect.top },
    { key: 'center', value: (rect.top + rect.bottom) / 2 },
    { key: 'bottom', value: rect.bottom },
  ]
}

function sameAlignmentGuide(a: AlignmentGuide, b: AlignmentGuide) {
  return a.axis === b.axis && Math.abs(a.position - b.position) < 0.5
}

function buildAlignmentGuides(moving: BoxRect, otherBoxes: BoxRect[]) {
  const candidates: AlignmentGuide[] = []

  otherBoxes.forEach((box) => {
    rectAnchors(moving, 'x').forEach((movingAnchor) => {
      rectAnchors(box, 'x').forEach((boxAnchor) => {
        const distance = Math.abs(movingAnchor.value - boxAnchor.value)
        if (distance > ALIGNMENT_GUIDE_DISTANCE) return
        candidates.push({
          axis: 'x',
          position: boxAnchor.value,
          start: Math.min(moving.top, box.top) - 12,
          end: Math.max(moving.bottom, box.bottom) + 12,
          distance,
        })
      })
    })

    rectAnchors(moving, 'y').forEach((movingAnchor) => {
      rectAnchors(box, 'y').forEach((boxAnchor) => {
        const distance = Math.abs(movingAnchor.value - boxAnchor.value)
        if (distance > ALIGNMENT_GUIDE_DISTANCE) return
        candidates.push({
          axis: 'y',
          position: boxAnchor.value,
          start: Math.min(moving.left, box.left) - 12,
          end: Math.max(moving.right, box.right) + 12,
          distance,
        })
      })
    })
  })

  const selected: AlignmentGuide[] = []
  candidates
    .sort((a, b) => a.distance - b.distance || (b.end - b.start) - (a.end - a.start))
    .forEach((candidate) => {
      if (selected.some((guide) => sameAlignmentGuide(guide, candidate))) return
      const axisCount = selected.filter((guide) => guide.axis === candidate.axis).length
      if (axisCount >= 2) return
      selected.push(candidate)
    })

  return selected
}

function applyLayerTransformPreviews(container: HTMLElement | null, updates: Array<{ layerId: string; props: TransformProps }>) {
  if (!container) return
  const layerElements = Array.from(container.querySelectorAll<HTMLElement>('[data-layer-id]'))
  updates.forEach((update) => {
    const element = layerElements.find((item) => item.dataset.layerId === update.layerId)
    if (!element) return
    element.style.transform = buildTransform(update.props)
    element.dataset.dragPreview = 'true'
  })
}

function clearLayerTransformPreviews(container: HTMLElement | null, layers: Layer[], frame: number) {
  if (!container) return
  container.querySelectorAll<HTMLElement>('[data-drag-preview="true"]').forEach((element) => {
    const layer = layers.find((item) => item.id === element.dataset.layerId)
    if (layer) {
      element.style.transform = buildTransform(resolveLayerAnimation(layer, frame).transform)
    }
    delete element.dataset.dragPreview
  })
}

function textRuns(layer: Layer) {
  const spans = (layer.textSpans ?? [])
    .filter((span) => span.end > 0 && span.start < layer.text.length)
    .sort((a, b) => a.start - b.start)
  const runs: { text: string; style?: typeof spans[number] }[] = []
  let cursor = 0
  spans.forEach((span) => {
    const start = Math.max(0, Math.min(layer.text.length, span.start))
    const end = Math.max(start, Math.min(layer.text.length, span.end))
    if (start > cursor) runs.push({ text: layer.text.slice(cursor, start) })
    if (end > start) runs.push({ text: layer.text.slice(start, end), style: span })
    cursor = Math.max(cursor, end)
  })
  if (cursor < layer.text.length) runs.push({ text: layer.text.slice(cursor) })
  return runs.length ? runs : [{ text: layer.text }]
}

export function CanvasOverlay({ containerRef, canvasW, canvasH }: Props) {
  const {
    layers, selectedLayerIds, currentFrame, autoKeyframe, addKeyframe, addKeyframes, setLayerAnimatedProperty,
    editingTextLayerId, setEditingTextLayerId, updateLayerProp, beginInteraction, endInteraction, setTextSelection,
    selectLayer, selectLayers, clearSelectedKeyframes, currentTool, addGeneratedLayer, resizeLayerBox,
  } = useStore()

  const [displayScale, setDisplayScale] = useState(0)
  const [marquee, setMarquee] = useState<MarqueeState | null>(null)
  const [spacingGuides, setSpacingGuides] = useState<SpacingGuide[]>([])
  const [alignmentGuides, setAlignmentGuides] = useState<AlignmentGuide[]>([])
  const [movePreview, setMovePreview] = useState<MovePreview | null>(null)
  const [penPoints, setPenPoints] = useState<PenPoint[]>([])
  const [penPreviewPoint, setPenPreviewPoint] = useState<PenPoint | null>(null)
  const dragRef = useRef<DragState | null>(null)
  const pathDragRef = useRef<PathDragState | null>(null)
  const marqueeRef = useRef<MarqueeState | null>(null)
  const keyboardSpacingTimer = useRef<number | null>(null)
  const guideFrameRef = useRef<number | null>(null)
  const pendingGuideUpdateRef = useRef<{ spacing: SpacingGuide[]; alignment: AlignmentGuide[]; movePreview: MovePreview | null } | null>(null)
  const perspectiveHeld = useRef(false)
  const spaceHeld = useRef(false)

  const scheduleGuideUpdate = useCallback((spacing: SpacingGuide[], alignment: AlignmentGuide[], preview: MovePreview | null = null) => {
    pendingGuideUpdateRef.current = { spacing, alignment, movePreview: preview }
    if (guideFrameRef.current !== null) return
    guideFrameRef.current = window.requestAnimationFrame(() => {
      guideFrameRef.current = null
      const pending = pendingGuideUpdateRef.current
      pendingGuideUpdateRef.current = null
      if (!pending) return
      setSpacingGuides((current) => sameSpacingGuides(current, pending.spacing) ? current : pending.spacing)
      setAlignmentGuides((current) => sameAlignmentGuides(current, pending.alignment) ? current : pending.alignment)
      setMovePreview((current) => (
        current?.dx === pending.movePreview?.dx && current?.dy === pending.movePreview?.dy
          ? current
          : pending.movePreview
      ))
    })
  }, [])

  const clearGuideUpdate = useCallback(() => {
    pendingGuideUpdateRef.current = null
    if (guideFrameRef.current !== null) {
      window.cancelAnimationFrame(guideFrameRef.current)
      guideFrameRef.current = null
    }
    setSpacingGuides((current) => current.length ? [] : current)
    setAlignmentGuides((current) => current.length ? [] : current)
    setMovePreview((current) => current ? null : current)
  }, [])

  function finishPenPath(closed: boolean) {
    if (penPoints.length < 2) {
      setPenPoints([])
      setPenPreviewPoint(null)
      return
    }
    const xs = penPoints.map((point) => point.x)
    const ys = penPoints.map((point) => point.y)
    const pad = 12
    const minX = Math.max(0, Math.min(...xs) - pad)
    const minY = Math.max(0, Math.min(...ys) - pad)
    const maxX = Math.min(canvasW, Math.max(...xs) + pad)
    const maxY = Math.min(canvasH, Math.max(...ys) + pad)
    const width = Math.max(1, Math.round(maxX - minX))
    const height = Math.max(1, Math.round(maxY - minY))
    const localPoints = penPoints.map((point) => ({ x: point.x - minX, y: point.y - minY }))
    const id = addGeneratedLayer('path', {
      name: 'Path',
      width,
      height,
      fillType: closed ? 'solid' : 'none',
      fillColor: closed ? '#0d99ff' : 'transparent',
      strokeEnabled: true,
      strokeColor: '#ffffff',
      strokeWidth: 4,
      pathData: pathFromPoints(localPoints, closed),
      pathClosed: closed,
      endFrame: useStore.getState().totalFrames,
      keyframes: [{
        frame: 0,
        easing: 'ease-out',
        props: {
          ...DEFAULT_TRANSFORM,
          x: minX + width / 2 - canvasW / 2,
          y: minY + height / 2 - canvasH / 2,
        },
      }],
    })
    selectLayer(id)
    setPenPoints([])
    setPenPreviewPoint(null)
  }

  // ── All hooks before any early return ───────────────────
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const obs = new ResizeObserver(([entry]) => {
      setDisplayScale(entry.contentRect.width / canvasW)
    })
    obs.observe(el)
    return () => obs.disconnect()
  }, [containerRef, canvasW])

  useEffect(() => () => {
    pendingGuideUpdateRef.current = null
    if (guideFrameRef.current !== null) window.cancelAnimationFrame(guideFrameRef.current)
  }, [])

  const onMouseMove = useCallback((e: MouseEvent) => {
    const pathDrag = pathDragRef.current
    if (pathDrag) {
      const targetLayer = useStore.getState().layers.find((item) => item.id === selectedLayerIds[0])
      if (!targetLayer || targetLayer.type !== 'path') return
      const point = getCanvasPoint(e.clientX, e.clientY)
      const box = getLayerBox(targetLayer, layers, currentFrame, canvasW, canvasH)
      const local = {
        x: ((point.x - box.left) / Math.max(1, box.width)) * targetLayer.width,
        y: ((point.y - box.top) / Math.max(1, box.height)) * targetLayer.height,
      }
      const points = pathDrag.points.map((item) => ({ ...item, in: item.in ? { ...item.in } : undefined, out: item.out ? { ...item.out } : undefined }))
      const edited = points[pathDrag.pointIndex]
      if (!edited) return
      if (pathDrag.type === 'anchor') {
        const original = pathDrag.points[pathDrag.pointIndex]
        const dx = local.x - original.x
        const dy = local.y - original.y
        edited.x = local.x
        edited.y = local.y
        if (edited.in) edited.in = { x: edited.in.x + dx, y: edited.in.y + dy }
        if (edited.out) edited.out = { x: edited.out.x + dx, y: edited.out.y + dy }
      } else {
        edited[pathDrag.type] = local
        const opposite = pathDrag.type === 'in' ? 'out' : 'in'
        if (edited[opposite]) {
          const current = edited[pathDrag.type]!
          const oldOpposite = pathDrag.points[pathDrag.pointIndex][opposite]
          const oldCurrent = pathDrag.points[pathDrag.pointIndex][pathDrag.type]
          const ratio = oldOpposite && oldCurrent
            ? distance(edited, oldOpposite) / Math.max(1, distance(edited, oldCurrent))
            : 1
          edited[opposite] = {
            x: edited.x - (current.x - edited.x) * ratio,
            y: edited.y - (current.y - edited.y) * ratio,
          }
        }
      }
      updateLayerProp(targetLayer.id, 'pathData', serializeEditablePath(points, pathDrag.closed))
      return
    }

    const d = dragRef.current
    if (!d) return
    const directlySelectedLayers = selectedLayerIds
      .map((id) => layers.find((l) => l.id === id))
      .filter((item): item is Layer => Boolean(item) && !item.locked)
    const moveLayerIds = d.movingLayerIds.length ? d.movingLayerIds : getMovementLayerIds(layers, selectedLayerIds)
    const movingLayers = moveLayerIds
      .map((id) => layers.find((l) => l.id === id))
      .filter((item): item is Layer => Boolean(item))
    const layer = directlySelectedLayers[0]
    if (!layer) return

    const rawDx = (e.clientX - d.startMx) / d.displayScale
    const rawDy = (e.clientY - d.startMy) / d.displayScale

    if (d.type === 'move') {
      // Determine shift-lock axis on first significant movement
      if (e.shiftKey && d.shiftLock === null) {
        const adx = Math.abs(rawDx)
        const ady = Math.abs(rawDy)
        if (adx > 3 / d.displayScale || ady > 3 / d.displayScale) {
          d.shiftLock = adx > ady ? 'x' : 'y'
        }
      }
      if (!e.shiftKey) d.shiftLock = null

      const dx = d.shiftLock === 'y' ? 0 : rawDx
      const dy = d.shiftLock === 'x' ? 0 : rawDy
      const { xGuides, yGuides } = buildSnapGuides(layers, selectedLayerIds, currentFrame, canvasW, canvasH)
      const snapped = snapMovingBox(
        d.centerCx + dx,
        d.centerCy + dy,
        d.startBoxW,
        d.startBoxH,
        xGuides,
        yGuides,
      )
      const snappedDx = snapped.cx - d.centerCx
      const snappedDy = snapped.cy - d.centerCy
      const movingRect: BoxRect = {
        id: 'moving-selection',
        left: snapped.cx - d.startBoxW / 2,
        top: snapped.cy - d.startBoxH / 2,
        right: snapped.cx + d.startBoxW / 2,
        bottom: snapped.cy + d.startBoxH / 2,
      }
      const measurementBoxes = buildMeasurementBoxes(layers, moveLayerIds, currentFrame, canvasW, canvasH)
      scheduleGuideUpdate(
        buildSpacingGuides(movingRect, measurementBoxes),
        buildAlignmentGuides(movingRect, [...measurementBoxes, canvasRect(canvasW, canvasH)]),
        { dx: snappedDx, dy: snappedDy },
      )
      const moveUpdates = movingLayers.flatMap((movingLayer) => {
        const startProps = d.startPropsById[movingLayer.id]
        if (!startProps) return []
        return [{
          layerId: movingLayer.id,
          props: { ...startProps, x: startProps.x + snappedDx, y: startProps.y + snappedDy },
        }]
      })
      d.pendingMoveUpdates = moveUpdates
      applyLayerTransformPreviews(containerRef.current, moveUpdates)

    } else if (d.type === 'rotate') {
      const rect = containerRef.current?.getBoundingClientRect()
      if (!rect) return
      const mx = (e.clientX - rect.left) / d.displayScale - d.centerCx
      const my = (e.clientY - rect.top) / d.displayScale - d.centerCy
      const angle = Math.atan2(my, mx) * (180 / Math.PI) + 90
      const nextAngle = e.shiftKey ? Math.round(angle / 15) * 15 : Math.round(angle)
      if (autoKeyframe) addKeyframe(layer.id, currentFrame, { ...d.props, rotateZ: nextAngle })
      else setLayerAnimatedProperty(layer.id, 'rotateZ', nextAngle)

    } else if (d.type === 'skewX') {
      const skewX = d.props.skewX + rawDx * 0.5
      if (autoKeyframe) addKeyframe(layer.id, currentFrame, { ...d.props, skewX })
      else setLayerAnimatedProperty(layer.id, 'skewX', skewX)

    } else if (d.type === 'skewY') {
      const skewY = d.props.skewY + rawDy * 0.5
      if (autoKeyframe) addKeyframe(layer.id, currentFrame, { ...d.props, skewY })
      else setLayerAnimatedProperty(layer.id, 'skewY', skewY)

    } else if (d.type === 'perspective') {
      const perspective = Math.max(100, d.props.perspective - rawDy * 4)
      if (autoKeyframe) addKeyframe(layer.id, currentFrame, { ...d.props, perspective })
      else setLayerAnimatedProperty(layer.id, 'perspective', perspective)

    } else {
      const pullsLeft = d.type === 'tl' || d.type === 'ml' || d.type === 'bl'
      const pullsRight = d.type === 'tr' || d.type === 'mr' || d.type === 'br'
      const pullsTop = d.type === 'tl' || d.type === 'mt' || d.type === 'tr'
      const pullsBottom = d.type === 'bl' || d.type === 'mb' || d.type === 'br'
      let left = d.centerCx - d.startBoxW / 2
      let right = d.centerCx + d.startBoxW / 2
      let top = d.centerCy - d.startBoxH / 2
      let bottom = d.centerCy + d.startBoxH / 2

      if (pullsLeft) left += rawDx
      if (pullsRight) right += rawDx
      if (pullsTop) top += rawDy
      if (pullsBottom) bottom += rawDy

      const isCorner = (pullsLeft || pullsRight) && (pullsTop || pullsBottom)
      if (isCorner && e.shiftKey) {
        const sx = Math.max(0.02, Math.abs(right - left) / Math.max(1, d.startBoxW))
        const sy = Math.max(0.02, Math.abs(bottom - top) / Math.max(1, d.startBoxH))
        const s = Math.abs(sx - 1) > Math.abs(sy - 1) ? sx : sy
        const lockedW = d.startBoxW * s
        const lockedH = d.startBoxH * s
        if (pullsLeft) left = right - lockedW
        else right = left + lockedW
        if (pullsTop) top = bottom - lockedH
        else bottom = top + lockedH
      }

      const { xGuides, yGuides } = buildSnapGuides(layers, selectedLayerIds, currentFrame, canvasW, canvasH)
      if (pullsLeft) left = snapValue(left, xGuides)
      if (pullsRight) right = snapValue(right, xGuides)
      if (pullsTop) top = snapValue(top, yGuides)
      if (pullsBottom) bottom = snapValue(bottom, yGuides)

      const minBoxW = Math.max(4, 4 * Math.abs(d.props.scale * d.props.scaleX))
      const minBoxH = Math.max(4, 4 * Math.abs(d.props.scale * d.props.scaleY))
      if (right - left < minBoxW) {
        if (pullsLeft && !pullsRight) left = right - minBoxW
        else right = left + minBoxW
      }
      if (bottom - top < minBoxH) {
        if (pullsTop && !pullsBottom) top = bottom - minBoxH
        else bottom = top + minBoxH
      }

      const nextBoxW = right - left
      const nextBoxH = bottom - top
      const nextCx = left + nextBoxW / 2
      const nextCy = top + nextBoxH / 2
      const sx = Math.max(0.01, Math.abs(d.props.scale * d.props.scaleX))
      const sy = Math.max(0.01, Math.abs(d.props.scale * d.props.scaleY))

      const nextX = nextCx - canvasW / 2
      const nextY = nextCy - canvasH / 2
      const nextW = pullsLeft || pullsRight ? nextBoxW / sx : undefined
      const nextH = pullsTop || pullsBottom ? nextBoxH / sy : undefined
      if (autoKeyframe) {
        resizeLayerBox(
          layer.id,
          currentFrame,
          { ...d.props, x: nextX, y: nextY },
          { width: nextW, height: nextH },
        )
      } else {
        setLayerAnimatedProperty(layer.id, 'x', nextX)
        setLayerAnimatedProperty(layer.id, 'y', nextY)
        if (nextW !== undefined) setLayerAnimatedProperty(layer.id, 'width', nextW)
        if (nextH !== undefined) {
          if (layer.type === 'line') updateLayerProp(layer.id, 'strokeWidth', Math.max(1, Math.round(nextH)))
          else setLayerAnimatedProperty(layer.id, 'height', nextH)
        }
      }
    }
  }, [layers, selectedLayerIds, currentFrame, autoKeyframe, addKeyframe, addKeyframes, setLayerAnimatedProperty, updateLayerProp, resizeLayerBox, scheduleGuideUpdate, containerRef, canvasW, canvasH])

  const onMouseUp = useCallback(() => {
    pathDragRef.current = null
    const drag = dragRef.current
    if (drag?.type === 'move' && drag.pendingMoveUpdates?.length) {
      if (autoKeyframe) {
        addKeyframes(drag.pendingMoveUpdates, currentFrame)
      } else {
        drag.pendingMoveUpdates.forEach((update) => {
          setLayerAnimatedProperty(update.layerId, 'x', update.props.x)
          setLayerAnimatedProperty(update.layerId, 'y', update.props.y)
        })
      }
      window.requestAnimationFrame(() => {
        const state = useStore.getState()
        clearLayerTransformPreviews(containerRef.current, state.layers, state.currentFrame)
      })
    } else {
      const state = useStore.getState()
      clearLayerTransformPreviews(containerRef.current, state.layers, state.currentFrame)
    }
    if (drag) endInteraction()
    dragRef.current = null
    clearGuideUpdate()
    if (marqueeRef.current) {
      const state = marqueeRef.current
      const moved = Math.abs(state.currentX - state.startX) > 3 || Math.abs(state.currentY - state.startY) > 3
      if (!moved) {
        const boxes = layers
          .filter((item) => item.visible && currentFrame >= (item.startFrame ?? 0) && currentFrame <= (item.endFrame ?? Infinity))
          .map((item) => getLayerBox(item, layers, currentFrame, canvasW, canvasH))
        const hit = boxes.find((box) => pointInBox(state.currentX, state.currentY, box))
        selectLayer(hit?.layer.id ?? null, state.additive)
      }
      marqueeRef.current = null
      setMarquee(null)
    }
  }, [layers, currentFrame, canvasW, canvasH, autoKeyframe, selectLayer, addKeyframes, setLayerAnimatedProperty, endInteraction, clearGuideUpdate])

  useEffect(() => {
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [onMouseMove, onMouseUp])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'p') perspectiveHeld.current = e.type === 'keydown'
      if (e.code === 'Space') spaceHeld.current = e.type === 'keydown'
      if (currentTool !== 'pen' || e.type !== 'keydown' || !penPoints.length) return
      if (e.key === 'Escape') {
        e.preventDefault()
        setPenPoints([])
        setPenPreviewPoint(null)
      }
      if (e.key === 'Enter') {
        e.preventDefault()
        finishPenPath(false)
      }
      if (e.key.toLowerCase() === 'c') {
        e.preventDefault()
        finishPenPath(true)
      }
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('keyup', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('keyup', onKey)
    }
  }, [currentTool, penPoints])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return
      if (e.ctrlKey || e.metaKey || e.altKey) return
      const target = e.target as HTMLElement
      const tag = target.tagName.toLowerCase()
      if (tag === 'input' || tag === 'textarea' || target.isContentEditable) return

      if (keyboardSpacingTimer.current) window.clearTimeout(keyboardSpacingTimer.current)
      window.setTimeout(() => {
        const state = useStore.getState()
        const selectedIds = state.selectedLayerIds
        if (!selectedIds.length) {
          clearGuideUpdate()
          return
        }
        const movingIds = getMovementLayerIds(state.layers, selectedIds)
        const activeBoxes = movingIds
          .map((id) => state.layers.find((item) => item.id === id))
          .filter((item): item is Layer => Boolean(item))
          .map((item) => getLayerBox(item, state.layers, state.currentFrame, canvasW, canvasH))
        const movingRect = boxesToRect(activeBoxes, 'keyboard-selection')
        if (!movingRect) {
          clearGuideUpdate()
          return
        }
        const measurementBoxes = buildMeasurementBoxes(state.layers, movingIds, state.currentFrame, canvasW, canvasH)
        scheduleGuideUpdate(
          buildSpacingGuides(movingRect, measurementBoxes),
          buildAlignmentGuides(movingRect, [...measurementBoxes, canvasRect(canvasW, canvasH)]),
        )
        keyboardSpacingTimer.current = window.setTimeout(() => {
          clearGuideUpdate()
        }, 900)
      }, 0)
    }

    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      if (keyboardSpacingTimer.current) window.clearTimeout(keyboardSpacingTimer.current)
    }
  }, [canvasW, canvasH, scheduleGuideUpdate, clearGuideUpdate])

  useEffect(() => {
    if (currentTool !== 'pen') {
      setPenPoints([])
      setPenPreviewPoint(null)
    }
  }, [currentTool])

  // ── After all hooks — safe to bail out ──────────────────
  const selectedBoxes = selectedLayerIds
    .map((id) => layers.find((l) => l.id === id))
    .filter((item): item is Layer => Boolean(item))
    .map((selectedLayer) => getLayerBox(selectedLayer, layers, currentFrame, canvasW, canvasH))
  const primaryBox = selectedBoxes[0]
  if (displayScale === 0) return null

  const isMultiSelection = selectedBoxes.length > 1
  const layer = primaryBox?.layer
  const animatedLayer = primaryBox?.animatedLayer
  const p = primaryBox?.transform
  const layerH = animatedLayer ? animatedLayer.type === 'line' ? (animatedLayer.strokeWidth || 2) : animatedLayer.height : 0
  const boxLeft = selectedBoxes.length ? isMultiSelection ? Math.min(...selectedBoxes.map((box) => box.left)) : primaryBox!.left : 0
  const boxTop = selectedBoxes.length ? isMultiSelection ? Math.min(...selectedBoxes.map((box) => box.top)) : primaryBox!.top : 0
  const boxRight = selectedBoxes.length ? isMultiSelection ? Math.max(...selectedBoxes.map((box) => box.left + box.width)) : primaryBox!.left + primaryBox!.width : 0
  const boxBottom = selectedBoxes.length ? isMultiSelection ? Math.max(...selectedBoxes.map((box) => box.top + box.height)) : primaryBox!.top + primaryBox!.height : 0
  const boxW = boxRight - boxLeft
  const boxH = boxBottom - boxTop
  const centerCx = boxLeft + boxW / 2
  const centerCy = boxTop + boxH / 2
  const selectionShape: React.CSSProperties = !isMultiSelection && animatedLayer?.type === 'ellipse'
    ? { borderRadius: '50%' }
    : !isMultiSelection && animatedLayer?.type === 'triangle'
      ? { clipPath: 'polygon(50% 0%, 0% 100%, 100% 100%)' }
      : !isMultiSelection && animatedLayer?.type === 'line'
        ? { borderRadius: boxH }
        : {}

  function getCanvasPoint(clientX: number, clientY: number) {
    const rect = containerRef.current?.getBoundingClientRect()
    const scale = rect ? rect.width / canvasW : displayScale
    return {
      x: rect ? (clientX - rect.left) / scale : 0,
      y: rect ? (clientY - rect.top) / scale : 0,
    }
  }

  function updateMarqueeSelection(state: MarqueeState) {
    const left = Math.min(state.startX, state.currentX)
    const right = Math.max(state.startX, state.currentX)
    const top = Math.min(state.startY, state.currentY)
    const bottom = Math.max(state.startY, state.currentY)
    const selected = layers
      .filter((item) => item.visible && currentFrame >= (item.startFrame ?? 0) && currentFrame <= (item.endFrame ?? Infinity))
      .map((item) => getLayerBox(item, layers, currentFrame, canvasW, canvasH))
      .filter((box) => rectsIntersect({ left, top, right, bottom }, { left: box.left, top: box.top, right: box.left + box.width, bottom: box.top + box.height }))
      .map((box) => box.layer.id)
    const nextSelection = state.additive ? Array.from(new Set([...state.baseSelection, ...selected])) : selected
    if (!sameStringSet(useStore.getState().selectedLayerIds, nextSelection)) selectLayers(nextSelection)
  }

  function onBackgroundMouseDown(e: React.MouseEvent) {
    if (e.button !== 0 || currentTool === 'hand' || spaceHeld.current) return
    e.preventDefault()
    e.stopPropagation()
    const point = getCanvasPoint(e.clientX, e.clientY)
    if (currentTool === 'pen') {
      if (penPoints.length >= 3 && distance(point, penPoints[0]) <= 10 / displayScale) {
        finishPenPath(true)
        return
      }
      setPenPoints((points) => [...points, point])
      setPenPreviewPoint(point)
      return
    }
    const next: MarqueeState = {
      startX: point.x,
      startY: point.y,
      currentX: point.x,
      currentY: point.y,
      additive: e.shiftKey || e.metaKey || e.ctrlKey,
      started: false,
      baseSelection: selectedLayerIds,
    }
    marqueeRef.current = next
    setMarquee(next)
  }

  function onBackgroundMouseMove(e: React.MouseEvent) {
    if (currentTool === 'pen') {
      const point = getCanvasPoint(e.clientX, e.clientY)
      if (!penPreviewPoint || Math.abs(point.x - penPreviewPoint.x) > 0.1 || Math.abs(point.y - penPreviewPoint.y) > 0.1) {
        setPenPreviewPoint(point)
      }
      return
    }
    const state = marqueeRef.current
    if (!state) return
    const point = getCanvasPoint(e.clientX, e.clientY)
    if (Math.abs(point.x - state.currentX) <= 0.1 && Math.abs(point.y - state.currentY) <= 0.1) return
    const next = { ...state, currentX: point.x, currentY: point.y, started: state.started || Math.abs(point.x - state.startX) > 3 || Math.abs(point.y - state.startY) > 3 }
    marqueeRef.current = next
    setMarquee(next)
    if (next.started) updateMarqueeSelection(next)
  }

  function onBackgroundDoubleClick(e: React.MouseEvent) {
    if (currentTool === 'hand' || spaceHeld.current) return
    if (currentTool === 'pen') {
      e.preventDefault()
      e.stopPropagation()
      finishPenPath(false)
      return
    }
    const point = getCanvasPoint(e.clientX, e.clientY)
    const selectedGroup = selectedLayerIds.length === 1
      ? layers.find((item) => item.id === selectedLayerIds[0] && (item.type === 'group' || item.isGroup))
      : null
    if (selectedGroup) {
      const childIds = new Set(descendantsOf(layers, selectedGroup.id).map((child) => child.id))
      const childHit = [...layers].reverse()
        .filter((item) => childIds.has(item.id) && item.visible && item.type !== 'group' && currentFrame >= (item.startFrame ?? 0) && currentFrame <= (item.endFrame ?? Infinity))
        .map((item) => getLayerBox(item, layers, currentFrame, canvasW, canvasH))
        .find((box) => pointInBox(point.x, point.y, box))
      if (childHit) {
        e.preventDefault()
        e.stopPropagation()
        selectLayer(childHit.layer.id)
        if (childHit.layer.type === 'text') setEditingTextLayerId(childHit.layer.id)
        return
      }
    }

    const boxes = [...layers].reverse()
      .filter((item) => item.visible && currentFrame >= (item.startFrame ?? 0) && currentFrame <= (item.endFrame ?? Infinity))
      .map((item) => getLayerBox(item, layers, currentFrame, canvasW, canvasH))
    const hit = boxes.find((box) => pointInBox(point.x, point.y, box))
    if (hit?.layer.type === 'text') {
      e.preventDefault()
      e.stopPropagation()
      selectLayer(hit.layer.id)
      setEditingTextLayerId(hit.layer.id)
    }
  }

  function onHandleMouseDown(e: React.MouseEvent, type: HandleType) {
    if (currentTool === 'pen') return
    if (!layer || !animatedLayer || !p || layer.locked) return
    e.preventDefault()
    e.stopPropagation()
    clearGuideUpdate()
    clearSelectedKeyframes()
    if (type === 'move' && !isMultiSelection && (layer.type === 'group' || layer.isGroup)) {
      const point = getCanvasPoint(e.clientX, e.clientY)
      const childIds = new Set(descendantsOf(layers, layer.id).map((child) => child.id))
      const childHit = [...layers].reverse()
        .filter((item) => childIds.has(item.id) && item.visible && currentFrame >= (item.startFrame ?? 0) && currentFrame <= (item.endFrame ?? Infinity))
        .map((item) => getLayerBox(item, layers, currentFrame, canvasW, canvasH))
        .find((box) => pointInBox(point.x, point.y, box))
      if (childHit && !childHit.layer.locked) {
        selectLayer(childHit.layer.id)
        beginInteraction(true)
        const rect = containerRef.current?.getBoundingClientRect()
        const ds = rect ? rect.width / canvasW : displayScale
        const childMoveIds = getMovementLayerIds(layers, [childHit.layer.id])
        const childMoveBoxes = childMoveIds
          .map((id) => layers.find((item) => item.id === id))
          .filter((item): item is Layer => Boolean(item))
          .map((item) => getLayerBox(item, layers, currentFrame, canvasW, canvasH))
        dragRef.current = {
          type: 'move',
          startMx: e.clientX,
          startMy: e.clientY,
          startPropX: childHit.transform.x,
          startPropY: childHit.transform.y,
          startScale: childHit.transform.scale,
          startW: childHit.animatedLayer.width,
          startH: childHit.animatedLayer.type === 'line' ? childHit.animatedLayer.strokeWidth || 2 : childHit.animatedLayer.height,
          startBoxW: childHit.width,
          startBoxH: childHit.height,
          centerCx: childHit.centerCx,
          centerCy: childHit.centerCy,
          displayScale: ds,
          props: { ...childHit.transform },
          startPropsById: Object.fromEntries(childMoveBoxes.map((box) => [box.layer.id, { ...box.transform }])),
          movingLayerIds: childMoveIds,
          shiftLock: null,
        }
        return
      }
    }
    beginInteraction(true)
    const rect = containerRef.current?.getBoundingClientRect()
    const ds = rect ? rect.width / canvasW : displayScale
    const moveIds = type === 'move' ? getMovementLayerIds(layers, selectedLayerIds) : selectedLayerIds
    const moveStartBoxes = type === 'move'
      ? moveIds
        .map((id) => layers.find((item) => item.id === id))
        .filter((item): item is Layer => Boolean(item))
        .map((item) => getLayerBox(item, layers, currentFrame, canvasW, canvasH))
      : selectedBoxes
    dragRef.current = {
      type,
      startMx: e.clientX,
      startMy: e.clientY,
      startPropX: p.x,
      startPropY: p.y,
      startScale: p.scale,
      startW: animatedLayer.width,
      startH: layerH,
      startBoxW: boxW,
      startBoxH: boxH,
      centerCx,
      centerCy,
      displayScale: ds,
      props: { ...p },
      startPropsById: Object.fromEntries(moveStartBoxes.map((box) => [box.layer.id, { ...box.transform }])),
      movingLayerIds: moveIds,
      shiftLock: null,
    }
  }

  function Handle({ type, style }: { type: HandleType; style: React.CSSProperties }) {
    const isEdge = type === 'ml' || type === 'mr' || type === 'mt' || type === 'mb'
    const cursor = type === 'rotate' ? 'alias'
      : type === 'skewX' ? 'ew-resize'
      : type === 'skewY' ? 'ns-resize'
      : type === 'perspective' ? 'grab'
      : (type === 'ml' || type === 'mr') ? 'ew-resize'
      : (type === 'mt' || type === 'mb') ? 'ns-resize'
      : (type === 'tl' || type === 'br') ? 'nwse-resize'
      : 'nesw-resize'

    return (
      <div
        onMouseDown={(e) => onHandleMouseDown(e, type)}
        style={{
          position: 'absolute',
          width: isEdge ? 6 / displayScale : 8 / displayScale,
          height: isEdge ? 6 / displayScale : 8 / displayScale,
          background: '#fff',
          border: `${1.5 / displayScale}px solid #0d99ff`,
          borderRadius: type === 'rotate' ? '50%' : 2,
          cursor,
          zIndex: 10,
          ...style,
        }}
      />
    )
  }

  const hw = 4 / displayScale
  const ehw = 3 / displayScale  // edge handle half-width
  const editingTextLines = animatedLayer?.type === 'text' ? Math.max(1, animatedLayer.text.split('\n').length) : 1
  const editingTextBlockH = animatedLayer?.type === 'text' ? editingTextLines * animatedLayer.fontSize * animatedLayer.lineHeight : 0
  const editingPadY = animatedLayer?.type === 'text' ? Math.max(4, (boxH - editingTextBlockH) / 2) : 4
  const editablePath = !isMultiSelection && animatedLayer?.type === 'path'
    ? parseEditablePath(animatedLayer.pathData)
    : null
  const editablePathClosed = Boolean(animatedLayer?.pathClosed ?? editablePath?.closed)
  const pathScaleX = animatedLayer?.type === 'path' ? boxW / Math.max(1, animatedLayer.width) : 1
  const pathScaleY = animatedLayer?.type === 'path' ? boxH / Math.max(1, animatedLayer.height) : 1

  function pathPointStyle(point: PenPoint): React.CSSProperties {
    return {
      position: 'absolute',
      left: point.x * pathScaleX,
      top: point.y * pathScaleY,
      transform: 'translate(-50%, -50%)',
    }
  }

  function updatePath(points: EditablePathPoint[], closed = editablePathClosed) {
    if (!animatedLayer || animatedLayer.type !== 'path') return
    updateLayerProp(animatedLayer.id, 'pathClosed', closed)
    updateLayerProp(animatedLayer.id, 'pathData', serializeEditablePath(points, closed))
  }

  function startPathDrag(e: React.MouseEvent, type: PathDragState['type'], pointIndex: number) {
    if (!editablePath) return
    e.preventDefault()
    e.stopPropagation()
    pathDragRef.current = {
      type,
      pointIndex,
      points: editablePath.points.map((item) => ({ ...item, in: item.in ? { ...item.in } : undefined, out: item.out ? { ...item.out } : undefined })),
      closed: editablePathClosed,
    }
  }

  function toggleSmoothPoint(e: React.MouseEvent, pointIndex: number) {
    if (!editablePath) return
    e.preventDefault()
    e.stopPropagation()
    updatePath(smoothPoint(editablePath.points, pointIndex, editablePathClosed))
  }

  function insertPathPoint(e: React.MouseEvent, afterIndex: number) {
    if (!editablePath || !animatedLayer || animatedLayer.type !== 'path') return
    e.preventDefault()
    e.stopPropagation()
    const point = getCanvasPoint(e.clientX, e.clientY)
    const local = {
      x: ((point.x - boxLeft) / Math.max(1, boxW)) * animatedLayer.width,
      y: ((point.y - boxTop) / Math.max(1, boxH)) * animatedLayer.height,
    }
    const points = editablePath.points.map((item) => ({ ...item, in: item.in ? { ...item.in } : undefined, out: item.out ? { ...item.out } : undefined }))
    const insertAt = afterIndex + 1
    points.splice(insertAt, 0, local)
    updatePath(points)
  }

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'all', overflow: 'visible' }}>
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: canvasW,
          height: canvasH,
          transform: `scale(${displayScale})`,
          transformOrigin: 'top left',
          pointerEvents: 'all',
        }}
        onMouseDown={onBackgroundMouseDown}
        onMouseMove={onBackgroundMouseMove}
        onDoubleClick={onBackgroundDoubleClick}
      >
        {marquee?.started && (
          <div
            style={{
              position: 'absolute',
              left: Math.min(marquee.startX, marquee.currentX),
              top: Math.min(marquee.startY, marquee.currentY),
              width: Math.abs(marquee.currentX - marquee.startX),
              height: Math.abs(marquee.currentY - marquee.startY),
              background: 'rgba(13,153,255,0.12)',
              border: `${1 / displayScale}px solid #0d99ff`,
              boxSizing: 'border-box',
              pointerEvents: 'none',
              zIndex: 20,
            }}
          />
        )}
        {currentTool === 'pen' && (penPoints.length > 0 || penPreviewPoint) && (
          <svg
            width={canvasW}
            height={canvasH}
            viewBox={`0 0 ${canvasW} ${canvasH}`}
            style={{ position: 'absolute', inset: 0, overflow: 'visible', pointerEvents: 'none', zIndex: 25 }}
          >
            {penPoints.length > 0 && (
              <path
                d={pathFromPoints(
                  penPreviewPoint && penPoints.length ? [...penPoints, penPreviewPoint] : penPoints,
                  false,
                )}
                fill="none"
                stroke="#0d99ff"
                strokeWidth={2 / displayScale}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray={`${6 / displayScale} ${4 / displayScale}`}
              />
            )}
            {penPoints.map((point, index) => (
              <circle
                key={`${index}-${point.x}-${point.y}`}
                cx={point.x}
                cy={point.y}
                r={index === 0 ? 5 / displayScale : 4 / displayScale}
                fill={index === 0 && penPoints.length >= 3 ? '#f59e0b' : '#fff'}
                stroke="#0d99ff"
                strokeWidth={1.5 / displayScale}
              />
            ))}
          </svg>
        )}
        {alignmentGuides.length > 0 && (
          <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 27 }}>
            {alignmentGuides.map((guide, index) => {
              const color = '#f59e0b'
              return (
                <div
                  key={`${guide.axis}-${guide.position}-${guide.start}-${guide.end}-${index}`}
                  style={{
                    position: 'absolute',
                    left: guide.axis === 'x' ? guide.position : guide.start,
                    top: guide.axis === 'x' ? guide.start : guide.position,
                    width: guide.axis === 'x' ? 0 : Math.max(1, guide.end - guide.start),
                    height: guide.axis === 'x' ? Math.max(1, guide.end - guide.start) : 0,
                    borderLeft: guide.axis === 'x' ? `${1.2 / displayScale}px dashed ${color}` : undefined,
                    borderTop: guide.axis === 'y' ? `${1.2 / displayScale}px dashed ${color}` : undefined,
                    boxShadow: guide.axis === 'x'
                      ? `${0.5 / displayScale}px 0 0 rgba(6,17,31,0.45)`
                      : `0 ${0.5 / displayScale}px 0 rgba(6,17,31,0.45)`,
                  }}
                />
              )
            })}
          </div>
        )}
        {spacingGuides.length > 0 && (
          <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 28 }}>
            {spacingGuides.map((guide, index) => {
              const color = guide.matched ? '#22c55e' : '#0d99ff'
              const labelStyle: React.CSSProperties = {
                position: 'absolute',
                left: guide.axis === 'x' ? (guide.start + guide.end) / 2 : guide.cross,
                top: guide.axis === 'x' ? guide.cross : (guide.start + guide.end) / 2,
                transform: 'translate(-50%, -50%)',
                padding: `${1 / displayScale}px ${4 / displayScale}px`,
                borderRadius: 999,
                background: color,
                color: '#06111f',
                fontSize: 10 / displayScale,
                fontWeight: 700,
                lineHeight: 1.35,
                whiteSpace: 'nowrap',
                boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
              }
              return (
                <div key={`${guide.axis}-${guide.start}-${guide.end}-${guide.cross}-${index}`}>
                  <div
                    style={{
                      position: 'absolute',
                      left: guide.axis === 'x' ? guide.start : guide.cross,
                      top: guide.axis === 'x' ? guide.cross : guide.start,
                      width: guide.axis === 'x' ? Math.max(1, guide.end - guide.start) : 0,
                      height: guide.axis === 'y' ? Math.max(1, guide.end - guide.start) : 0,
                      borderTop: guide.axis === 'x' ? `${1.4 / displayScale}px solid ${color}` : undefined,
                      borderLeft: guide.axis === 'y' ? `${1.4 / displayScale}px solid ${color}` : undefined,
                    }}
                  />
                  {guide.axis === 'x' ? (
                    <>
                      <div style={{ position: 'absolute', left: guide.start, top: guide.cross - 4 / displayScale, width: 0, height: 8 / displayScale, borderLeft: `${1.4 / displayScale}px solid ${color}` }} />
                      <div style={{ position: 'absolute', left: guide.end, top: guide.cross - 4 / displayScale, width: 0, height: 8 / displayScale, borderLeft: `${1.4 / displayScale}px solid ${color}` }} />
                    </>
                  ) : (
                    <>
                      <div style={{ position: 'absolute', left: guide.cross - 4 / displayScale, top: guide.start, width: 8 / displayScale, height: 0, borderTop: `${1.4 / displayScale}px solid ${color}` }} />
                      <div style={{ position: 'absolute', left: guide.cross - 4 / displayScale, top: guide.end, width: 8 / displayScale, height: 0, borderTop: `${1.4 / displayScale}px solid ${color}` }} />
                    </>
                  )}
                  <div style={labelStyle}>{guide.label}</div>
                </div>
              )
            })}
          </div>
        )}
        {/* Selection box */}
        {primaryBox && layer && animatedLayer && p && (
        <div
          style={{
            position: 'absolute',
            left: boxLeft + (movePreview?.dx ?? 0),
            top: boxTop + (movePreview?.dy ?? 0),
            width: boxW,
            height: boxH,
            transform: isMultiSelection ? undefined : `rotate(${p.rotateZ}deg)`,
            transformOrigin: 'center',
            border: `${1.5 / displayScale}px solid #0d99ff`,
            ...selectionShape,
            pointerEvents: currentTool === 'pen' ? 'none' : 'all',
            cursor: layer.locked ? 'not-allowed' : perspectiveHeld.current ? 'grab' : 'move',
            boxSizing: 'border-box',
          }}
          onMouseDown={(e) => onHandleMouseDown(e, !isMultiSelection && perspectiveHeld.current ? 'perspective' : 'move')}
          onDoubleClick={(e) => {
            if (isMultiSelection || animatedLayer.type !== 'text') return
            e.stopPropagation()
            setEditingTextLayerId(animatedLayer.id)
          }}
        >
          {editablePath && animatedLayer.type === 'path' && (
            <svg
              width="100%"
              height="100%"
              viewBox={`0 0 ${animatedLayer.width} ${animatedLayer.height}`}
              preserveAspectRatio="none"
              style={{ position: 'absolute', inset: 0, overflow: 'visible', pointerEvents: 'none', zIndex: 8 }}
            >
              {editablePath.points.map((_, index) => {
                if (!editablePathClosed && index >= editablePath.points.length - 1) return null
                const d = segmentPath(editablePath.points, index, editablePathClosed)
                if (!d) return null
                return (
                  <path
                    key={`segment-hit-${index}`}
                    d={d}
                    fill="none"
                    stroke="transparent"
                    strokeWidth={14 / displayScale}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ pointerEvents: 'stroke', cursor: 'copy' }}
                    onMouseDown={(e) => insertPathPoint(e, index)}
                  />
                )
              })}
              {editablePath.points.map((point, index) => (
                <g key={`handles-${index}`}>
                  {point.in && (
                    <>
                      <line
                        x1={point.x}
                        y1={point.y}
                        x2={point.in.x}
                        y2={point.in.y}
                        stroke="#0d99ff"
                        strokeWidth={1.4 / displayScale}
                        strokeDasharray={`${4 / displayScale} ${3 / displayScale}`}
                      />
                      <circle
                        cx={point.in.x}
                        cy={point.in.y}
                        r={4.5 / displayScale}
                        fill="#fff"
                        stroke="#0d99ff"
                        strokeWidth={1.5 / displayScale}
                        style={{ pointerEvents: 'all', cursor: 'grab' }}
                        onMouseDown={(e) => startPathDrag(e, 'in', index)}
                      />
                    </>
                  )}
                  {point.out && (
                    <>
                      <line
                        x1={point.x}
                        y1={point.y}
                        x2={point.out.x}
                        y2={point.out.y}
                        stroke="#0d99ff"
                        strokeWidth={1.4 / displayScale}
                        strokeDasharray={`${4 / displayScale} ${3 / displayScale}`}
                      />
                      <circle
                        cx={point.out.x}
                        cy={point.out.y}
                        r={4.5 / displayScale}
                        fill="#fff"
                        stroke="#0d99ff"
                        strokeWidth={1.5 / displayScale}
                        style={{ pointerEvents: 'all', cursor: 'grab' }}
                        onMouseDown={(e) => startPathDrag(e, 'out', index)}
                      />
                    </>
                  )}
                  <circle
                    cx={point.x}
                    cy={point.y}
                    r={5 / displayScale}
                    fill="#fff"
                    stroke={point.in || point.out ? '#f59e0b' : '#0d99ff'}
                    strokeWidth={1.8 / displayScale}
                    style={{ pointerEvents: 'all', cursor: 'move' }}
                    onMouseDown={(e) => startPathDrag(e, 'anchor', index)}
                    onDoubleClick={(e) => toggleSmoothPoint(e, index)}
                  />
                </g>
              ))}
            </svg>
          )}

          {editingTextLayerId === animatedLayer.id && animatedLayer.type === 'text' ? (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
                borderRadius: animatedLayer.borderRadius,
                background: 'rgba(255,255,255,0.08)',
                overflow: 'hidden',
                cursor: 'text',
              }}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <div
                aria-hidden
                style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: animatedLayer.textAlign === 'center' ? 'center' : animatedLayer.textAlign === 'right' ? 'flex-end' : 'flex-start',
                  padding: '4px 8px',
                  boxSizing: 'border-box',
                  pointerEvents: 'none',
                  fontFamily: animatedLayer.fontFamily,
                  fontSize: animatedLayer.fontSize,
                  fontWeight: animatedLayer.fontWeight,
                  color: animatedLayer.textColor,
                  textAlign: animatedLayer.textAlign,
                  lineHeight: animatedLayer.lineHeight,
                  letterSpacing: animatedLayer.letterSpacing,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}
              >
                <div style={{ width: '100%' }}>
                  {textRuns(animatedLayer).map((run, idx) => (
                    <span
                      key={idx}
                      style={{
                        fontFamily: run.style?.fontFamily,
                        fontSize: run.style?.fontSize,
                        fontWeight: run.style?.fontWeight,
                        color: run.style?.textColor,
                        letterSpacing: run.style?.letterSpacing,
                      }}
                    >
                      {run.text}
                    </span>
                  ))}
                </div>
              </div>
              <textarea
                autoFocus
                value={animatedLayer.text}
                onChange={(e) => updateLayerProp(animatedLayer.id, 'text', e.target.value)}
                onSelect={(e) => {
                  const el = e.currentTarget
                  setTextSelection({ layerId: animatedLayer.id, start: el.selectionStart, end: el.selectionEnd })
                }}
                onBlur={() => setEditingTextLayerId(null)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    e.preventDefault()
                    setEditingTextLayerId(null)
                  }
                }}
                style={{
                  position: 'absolute',
                  inset: 0,
                  width: '100%',
                  height: '100%',
                  resize: 'none',
                  border: 'none',
                  outline: 'none',
                  background: 'transparent',
                  color: 'transparent',
                  caretColor: animatedLayer.textColor,
                  fontFamily: animatedLayer.fontFamily,
                  fontSize: animatedLayer.fontSize,
                  fontWeight: animatedLayer.fontWeight,
                  textAlign: animatedLayer.textAlign,
                  lineHeight: animatedLayer.lineHeight,
                  letterSpacing: animatedLayer.letterSpacing,
                  padding: `${editingPadY}px 8px`,
                  boxSizing: 'border-box',
                  whiteSpace: 'pre-wrap',
                  overflow: 'hidden',
                  pointerEvents: 'all',
                }}
              />
            </div>
          ) : null}

          {!isMultiSelection && (
            <>
              {/* Corner handles */}
              <Handle type="tl" style={{ left: -hw, top: -hw }} />
              <Handle type="tr" style={{ right: -hw, top: -hw }} />
              <Handle type="bl" style={{ left: -hw, bottom: -hw }} />
              <Handle type="br" style={{ right: -hw, bottom: -hw }} />

              {/* Edge midpoint handles */}
              <Handle type="ml" style={{ left: -ehw, top: '50%', transform: 'translateY(-50%)' }} />
              <Handle type="mr" style={{ right: -ehw, top: '50%', transform: 'translateY(-50%)' }} />
              <Handle type="mt" style={{ top: -ehw, left: '50%', transform: 'translateX(-50%)' }} />
              <Handle type="mb" style={{ bottom: -ehw, left: '50%', transform: 'translateX(-50%)' }} />

              {/* Skew handles */}
              <Handle type="skewX" style={{ top: -ehw, left: '62%', transform: 'translateX(-50%)', background: '#a7f3d0' }} />
              <Handle type="skewY" style={{ left: -ehw, top: '62%', transform: 'translateY(-50%)', background: '#a7f3d0' }} />

              {/* Rotation arm */}
              <div style={{
                position: 'absolute',
                left: '50%',
                top: -24 / displayScale,
                transform: 'translateX(-50%)',
                pointerEvents: 'all',
              }}>
                <div style={{ width: 1 / displayScale, height: 14 / displayScale, background: '#0d99ff', margin: '0 auto' }} />
                <div onMouseDown={(e) => onHandleMouseDown(e, 'rotate')}
                  style={{
                    width: 8 / displayScale, height: 8 / displayScale,
                    background: '#fff',
                    border: `${1.5 / displayScale}px solid #0d99ff`,
                    borderRadius: '50%',
                    cursor: 'alias',
                    position: 'relative',
                    left: -4 / displayScale,
                    marginTop: 2 / displayScale,
                  }}
                />
              </div>
            </>
          )}
        </div>
        )}
      </div>
    </div>
  )
}
