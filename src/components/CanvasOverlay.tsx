import { useCallback, useEffect, useRef, useState } from 'react'
import { useStore } from '../store'
import { Layer, TransformProps } from '../types'
import { resolveLayerAnimation } from '../animationProperties'

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

const SNAP_DISTANCE = 6

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
  const selected = new Set(selectedIds)
  const xGuides = [0, canvasW / 2, canvasW]
  const yGuides = [0, canvasH / 2, canvasH]

  for (const item of layers) {
    if (selected.has(item.id) || !item.visible) continue
    const { layer, transform } = resolveLayerAnimation(item, frame)
    const h = layer.type === 'line' ? (layer.strokeWidth || 2) : layer.height
    const w = layer.width * transform.scale * transform.scaleX
    const boxH = h * transform.scale * transform.scaleY
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
  const h = animatedLayer.type === 'line' ? (animatedLayer.strokeWidth || 2) : animatedLayer.height
  const width = animatedLayer.width * transform.scale * transform.scaleX
  const height = h * transform.scale * transform.scaleY
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

export function CanvasOverlay({ containerRef, canvasW, canvasH }: Props) {
  const {
    layers, selectedLayerIds, currentFrame, addKeyframe, setLayerAnimatedProperty,
    editingTextLayerId, setEditingTextLayerId, updateLayerProp, beginInteraction, endInteraction, setTextSelection,
  } = useStore()

  const [displayScale, setDisplayScale] = useState(0)
  const dragRef = useRef<DragState | null>(null)
  const perspectiveHeld = useRef(false)

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
    const movingLayers = selectedLayerIds
      .map((id) => layers.find((l) => l.id === id))
      .filter((item): item is Layer => Boolean(item) && !item.locked)
    const layer = movingLayers[0]
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
  }, [endInteraction])

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
  if (!primaryBox || displayScale === 0) return null

  const isMultiSelection = selectedBoxes.length > 1
  const layer = primaryBox.layer
  const animatedLayer = primaryBox.animatedLayer
  const p = primaryBox.transform
  const layerH = animatedLayer.type === 'line' ? (animatedLayer.strokeWidth || 2) : animatedLayer.height
  const boxLeft = isMultiSelection ? Math.min(...selectedBoxes.map((box) => box.left)) : primaryBox.left
  const boxTop = isMultiSelection ? Math.min(...selectedBoxes.map((box) => box.top)) : primaryBox.top
  const boxRight = isMultiSelection ? Math.max(...selectedBoxes.map((box) => box.left + box.width)) : primaryBox.left + primaryBox.width
  const boxBottom = isMultiSelection ? Math.max(...selectedBoxes.map((box) => box.top + box.height)) : primaryBox.top + primaryBox.height
  const boxW = boxRight - boxLeft
  const boxH = boxBottom - boxTop
  const centerCx = boxLeft + boxW / 2
  const centerCy = boxTop + boxH / 2
  const selectionShape: React.CSSProperties = !isMultiSelection && animatedLayer.type === 'ellipse'
    ? { borderRadius: '50%' }
    : !isMultiSelection && animatedLayer.type === 'triangle'
      ? { clipPath: 'polygon(50% 0%, 0% 100%, 100% 100%)' }
      : !isMultiSelection && animatedLayer.type === 'line'
        ? { borderRadius: boxH }
        : {}

  function onHandleMouseDown(e: React.MouseEvent, type: HandleType) {
    if (layer!.locked) return
    e.preventDefault()
    e.stopPropagation()
    beginInteraction(true)
    const rect = containerRef.current?.getBoundingClientRect()
    const ds = rect ? rect.width / canvasW : displayScale
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
      startPropsById: Object.fromEntries(selectedBoxes.map((box) => [box.layer.id, { ...box.transform }])),
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

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'visible' }}>
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: canvasW,
          height: canvasH,
          transform: `scale(${displayScale})`,
          transformOrigin: 'top left',
          pointerEvents: 'none',
        }}
      >
        {/* Selection box */}
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
            <textarea
              autoFocus
              value={animatedLayer.text}
              onMouseDown={(e) => e.stopPropagation()}
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
                width: '100%',
                height: '100%',
                resize: 'none',
                border: 'none',
                outline: 'none',
                background: 'rgba(255,255,255,0.08)',
                color: animatedLayer.textColor,
                fontFamily: animatedLayer.fontFamily,
                fontSize: animatedLayer.fontSize,
                fontWeight: animatedLayer.fontWeight,
                textAlign: animatedLayer.textAlign,
                lineHeight: animatedLayer.lineHeight,
                letterSpacing: animatedLayer.letterSpacing,
                padding: '4px 8px',
                pointerEvents: 'all',
              }}
            />
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
      </div>
    </div>
  )
}
