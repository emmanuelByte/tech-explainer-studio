import { useCallback, useEffect, useRef, useState } from 'react'
import { useStore } from '../store'
import { Layer, TransformProps } from '../types'
import { resolveLayerAnimation } from '../animationProperties'
import { descendantsOf } from '../layerTree'

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

interface MarqueeState {
  startX: number
  startY: number
  currentX: number
  currentY: number
  additive: boolean
  started: boolean
  baseSelection: string[]
}

const SNAP_DISTANCE = 6

function getMovementLayerIds(layers: Layer[], selectedIds: string[]) {
  const ids = new Set(selectedIds)
  selectedIds.forEach((id) => {
    descendantsOf(layers, id).forEach((child) => ids.add(child.id))
  })
  return [...ids]
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
  const xGuides = [0, canvasW / 2, canvasW]
  const yGuides = [0, canvasH / 2, canvasH]

  for (const item of layers) {
    if (selected.has(item.id) || !item.visible) continue
    const { layer, transform } = resolveLayerAnimation(item, frame)
    const rawW = layer.sizeMode === 'fill-canvas' ? canvasW : layer.width
    const rawH = layer.sizeMode === 'fill-canvas' ? canvasH : layer.type === 'line' ? (layer.strokeWidth || 2) : layer.height
    const w = rawW * transform.scale * transform.scaleX
    const boxH = rawH * transform.scale * transform.scaleY
    const cx = canvasW / 2 + transform.x
    const cy = canvasH / 2 + transform.y
    xGuides.push(cx - w / 2, cx, cx + w / 2)
    yGuides.push(cy - boxH / 2, cy, cy + boxH / 2)
  }

  return { xGuides, yGuides }
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

function getLayerBox(layer: Layer, frame: number, canvasW: number, canvasH: number): LayerBox {
  const { layer: animatedLayer, transform } = resolveLayerAnimation(layer, frame)
  const rawWidth = animatedLayer.sizeMode === 'fill-canvas' ? canvasW : animatedLayer.width
  const rawHeight = animatedLayer.sizeMode === 'fill-canvas' ? canvasH : animatedLayer.type === 'line' ? (animatedLayer.strokeWidth || 2) : animatedLayer.height
  const width = rawWidth * transform.scale * transform.scaleX
  const height = rawHeight * transform.scale * transform.scaleY
  const centerCx = canvasW / 2 + transform.x
  const centerCy = canvasH / 2 + transform.y
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
    layers, selectedLayerIds, currentFrame, addKeyframe, setLayerAnimatedProperty,
    editingTextLayerId, setEditingTextLayerId, updateLayerProp, beginInteraction, endInteraction, setTextSelection,
    selectLayer, selectLayers, currentTool,
  } = useStore()

  const [displayScale, setDisplayScale] = useState(0)
  const [marquee, setMarquee] = useState<MarqueeState | null>(null)
  const dragRef = useRef<DragState | null>(null)
  const marqueeRef = useRef<MarqueeState | null>(null)
  const perspectiveHeld = useRef(false)
  const spaceHeld = useRef(false)

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

  const onMouseMove = useCallback((e: MouseEvent) => {
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
      movingLayers.forEach((movingLayer) => {
        const startProps = d.startPropsById[movingLayer.id]
        if (!startProps) return
        addKeyframe(movingLayer.id, currentFrame, { ...startProps, x: startProps.x + snappedDx, y: startProps.y + snappedDy })
      })

    } else if (d.type === 'rotate') {
      const rect = containerRef.current?.getBoundingClientRect()
      if (!rect) return
      const mx = (e.clientX - rect.left) / d.displayScale - d.centerCx
      const my = (e.clientY - rect.top) / d.displayScale - d.centerCy
      const angle = Math.atan2(my, mx) * (180 / Math.PI) + 90
      const nextAngle = e.shiftKey ? Math.round(angle / 15) * 15 : Math.round(angle)
      addKeyframe(layer.id, currentFrame, { ...d.props, rotateZ: nextAngle })

    } else if (d.type === 'skewX') {
      addKeyframe(layer.id, currentFrame, { ...d.props, skewX: d.props.skewX + rawDx * 0.5 })

    } else if (d.type === 'skewY') {
      addKeyframe(layer.id, currentFrame, { ...d.props, skewY: d.props.skewY + rawDy * 0.5 })

    } else if (d.type === 'perspective') {
      addKeyframe(layer.id, currentFrame, { ...d.props, perspective: Math.max(100, d.props.perspective - rawDy * 4) })

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

      if (pullsLeft || pullsRight) setLayerAnimatedProperty(layer.id, 'width', Math.round(nextBoxW / sx))
      if (pullsTop || pullsBottom) setLayerAnimatedProperty(layer.id, 'height', Math.round(nextBoxH / sy))
      addKeyframe(layer.id, currentFrame, {
        ...d.props,
        x: nextCx - canvasW / 2,
        y: nextCy - canvasH / 2,
      })
    }
  }, [layers, selectedLayerIds, currentFrame, addKeyframe, setLayerAnimatedProperty, containerRef, canvasW, canvasH])

  const onMouseUp = useCallback(() => {
    if (dragRef.current) endInteraction()
    dragRef.current = null
    if (marqueeRef.current) {
      const state = marqueeRef.current
      const moved = Math.abs(state.currentX - state.startX) > 3 || Math.abs(state.currentY - state.startY) > 3
      if (!moved) {
        const boxes = layers
          .filter((item) => item.visible && currentFrame >= (item.startFrame ?? 0) && currentFrame <= (item.endFrame ?? Infinity))
          .map((item) => getLayerBox(item, currentFrame, canvasW, canvasH))
        const hit = boxes.find((box) => pointInBox(state.currentX, state.currentY, box))
        selectLayer(hit?.layer.id ?? null, state.additive)
      }
      marqueeRef.current = null
      setMarquee(null)
    }
  }, [layers, currentFrame, canvasW, canvasH, selectLayer, endInteraction])

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
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('keyup', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('keyup', onKey)
    }
  }, [])

  // ── After all hooks — safe to bail out ──────────────────
  const selectedBoxes = selectedLayerIds
    .map((id) => layers.find((l) => l.id === id))
    .filter((item): item is Layer => Boolean(item))
    .map((selectedLayer) => getLayerBox(selectedLayer, currentFrame, canvasW, canvasH))
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
      .map((item) => getLayerBox(item, currentFrame, canvasW, canvasH))
      .filter((box) => rectsIntersect({ left, top, right, bottom }, { left: box.left, top: box.top, right: box.left + box.width, bottom: box.top + box.height }))
      .map((box) => box.layer.id)
    selectLayers(state.additive ? Array.from(new Set([...state.baseSelection, ...selected])) : selected)
  }

  function onBackgroundMouseDown(e: React.MouseEvent) {
    if (e.button !== 0 || currentTool === 'hand' || spaceHeld.current) return
    e.preventDefault()
    e.stopPropagation()
    const point = getCanvasPoint(e.clientX, e.clientY)
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
    const state = marqueeRef.current
    if (!state) return
    const point = getCanvasPoint(e.clientX, e.clientY)
    const next = { ...state, currentX: point.x, currentY: point.y, started: state.started || Math.abs(point.x - state.startX) > 3 || Math.abs(point.y - state.startY) > 3 }
    marqueeRef.current = next
    setMarquee(next)
    if (next.started) updateMarqueeSelection(next)
  }

  function onBackgroundDoubleClick(e: React.MouseEvent) {
    if (currentTool === 'hand' || spaceHeld.current) return
    const point = getCanvasPoint(e.clientX, e.clientY)
    const selectedGroup = selectedLayerIds.length === 1
      ? layers.find((item) => item.id === selectedLayerIds[0] && (item.type === 'group' || item.isGroup))
      : null
    if (selectedGroup) {
      const childIds = new Set(descendantsOf(layers, selectedGroup.id).map((child) => child.id))
      const childHit = [...layers].reverse()
        .filter((item) => childIds.has(item.id) && item.visible && item.type !== 'group' && currentFrame >= (item.startFrame ?? 0) && currentFrame <= (item.endFrame ?? Infinity))
        .map((item) => getLayerBox(item, currentFrame, canvasW, canvasH))
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
      .map((item) => getLayerBox(item, currentFrame, canvasW, canvasH))
    const hit = boxes.find((box) => pointInBox(point.x, point.y, box))
    if (hit?.layer.type === 'text') {
      e.preventDefault()
      e.stopPropagation()
      selectLayer(hit.layer.id)
      setEditingTextLayerId(hit.layer.id)
    }
  }

  function onHandleMouseDown(e: React.MouseEvent, type: HandleType) {
    if (!layer || !animatedLayer || !p || layer.locked) return
    e.preventDefault()
    e.stopPropagation()
    if (type === 'move' && !isMultiSelection && (layer.type === 'group' || layer.isGroup)) {
      const point = getCanvasPoint(e.clientX, e.clientY)
      const childIds = new Set(descendantsOf(layers, layer.id).map((child) => child.id))
      const childHit = [...layers].reverse()
        .filter((item) => childIds.has(item.id) && item.visible && currentFrame >= (item.startFrame ?? 0) && currentFrame <= (item.endFrame ?? Infinity))
        .map((item) => getLayerBox(item, currentFrame, canvasW, canvasH))
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
          .map((item) => getLayerBox(item, currentFrame, canvasW, canvasH))
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
        .map((item) => getLayerBox(item, currentFrame, canvasW, canvasH))
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
          border: `${1.5 / displayScale}px solid #6366f1`,
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
              background: 'rgba(32,213,248,0.12)',
              border: `${1 / displayScale}px solid #20d5f8`,
              boxSizing: 'border-box',
              pointerEvents: 'none',
              zIndex: 20,
            }}
          />
        )}
        {/* Selection box */}
        {primaryBox && layer && animatedLayer && p && (
        <div
          style={{
            position: 'absolute',
            left: boxLeft,
            top: boxTop,
            width: boxW,
            height: boxH,
            transform: isMultiSelection ? undefined : `rotate(${p.rotateZ}deg)`,
            transformOrigin: 'center',
            border: `${1.5 / displayScale}px solid #6366f1`,
            ...selectionShape,
            pointerEvents: 'all',
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
                <div style={{ width: 1 / displayScale, height: 14 / displayScale, background: '#6366f1', margin: '0 auto' }} />
                <div onMouseDown={(e) => onHandleMouseDown(e, 'rotate')}
                  style={{
                    width: 8 / displayScale, height: 8 / displayScale,
                    background: '#fff',
                    border: `${1.5 / displayScale}px solid #6366f1`,
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
