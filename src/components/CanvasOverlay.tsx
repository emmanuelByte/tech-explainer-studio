import { useCallback, useEffect, useRef, useState } from 'react'
import { useStore } from '../store'
import { interpolateProps } from '../remotion/interpolateProps'
import { Layer, TransformProps } from '../types'

interface Props {
  containerRef: React.RefObject<HTMLDivElement | null>
  canvasW: number
  canvasH: number
}

type HandleType = 'move' | 'tl' | 'tr' | 'bl' | 'br' | 'ml' | 'mr' | 'mt' | 'mb' | 'rotate'

interface DragState {
  type: HandleType
  startMx: number
  startMy: number
  startPropX: number
  startPropY: number
  startScale: number
  startW: number
  startH: number
  centerCx: number
  centerCy: number
  displayScale: number
  props: TransformProps
  shiftLock: null | 'x' | 'y'
}

export function CanvasOverlay({ containerRef, canvasW, canvasH }: Props) {
  const { layers, selectedLayerIds, currentFrame, addKeyframe, updateLayerProp } = useStore()

  const [displayScale, setDisplayScale] = useState(0)
  const dragRef = useRef<DragState | null>(null)

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
    const layer = layers.find((l) => l.id === selectedLayerIds[0])
    if (!layer || layer.locked) return

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
      addKeyframe(layer.id, currentFrame, { ...d.props, x: d.startPropX + dx, y: d.startPropY + dy })

    } else if (d.type === 'rotate') {
      const rect = containerRef.current?.getBoundingClientRect()
      if (!rect) return
      const mx = (e.clientX - rect.left) / d.displayScale - d.centerCx
      const my = (e.clientY - rect.top) / d.displayScale - d.centerCy
      const angle = Math.atan2(my, mx) * (180 / Math.PI) + 90
      addKeyframe(layer.id, currentFrame, { ...d.props, rotateZ: Math.round(angle) })

    } else if (d.type === 'ml' || d.type === 'mr') {
      // Resize width only (from center)
      const sign = d.type === 'mr' ? 1 : -1
      const newW = Math.max(4, d.startW + sign * rawDx * 2)
      updateLayerProp(layer.id, 'width', Math.round(newW))

    } else if (d.type === 'mt' || d.type === 'mb') {
      // Resize height only (from center)
      const sign = d.type === 'mb' ? 1 : -1
      const newH = Math.max(4, d.startH + sign * rawDy * 2)
      updateLayerProp(layer.id, 'height', Math.round(newH))

    } else {
      // Corner resize → scale
      const sign = (d.type === 'br' || d.type === 'tr') ? 1 : -1
      const scaleDelta = (d.startW + sign * rawDx * 2) / d.startW
      addKeyframe(layer.id, currentFrame, {
        ...d.props,
        scale: Math.max(0.01, d.startScale * scaleDelta),
      })
    }
  }, [layers, selectedLayerIds, currentFrame, addKeyframe, updateLayerProp, containerRef])

  const onMouseUp = useCallback(() => { dragRef.current = null }, [])

  useEffect(() => {
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [onMouseMove, onMouseUp])

  // ── After all hooks — safe to bail out ──────────────────
  const layer: Layer | undefined = layers.find((l) => l.id === selectedLayerIds[0])
  if (!layer || displayScale === 0) return null

  const p = interpolateProps(currentFrame, layer.keyframes)
  const layerH = layer.type === 'line' ? (layer.strokeWidth || 2) : layer.height

  const centerCx = canvasW / 2 + p.x
  const centerCy = canvasH / 2 + p.y
  const boxW = layer.width * p.scale
  const boxH = layerH * p.scale
  const boxLeft = centerCx - boxW / 2
  const boxTop = centerCy - boxH / 2

  function onHandleMouseDown(e: React.MouseEvent, type: HandleType) {
    if (layer!.locked) return
    e.preventDefault()
    e.stopPropagation()
    const rect = containerRef.current?.getBoundingClientRect()
    const ds = rect ? rect.width / canvasW : displayScale
    dragRef.current = {
      type,
      startMx: e.clientX,
      startMy: e.clientY,
      startPropX: p.x,
      startPropY: p.y,
      startScale: p.scale,
      startW: layer!.width,
      startH: layerH,
      centerCx,
      centerCy,
      displayScale: ds,
      props: { ...p },
      shiftLock: null,
    }
  }

  function Handle({ type, style }: { type: HandleType; style: React.CSSProperties }) {
    const isEdge = type === 'ml' || type === 'mr' || type === 'mt' || type === 'mb'
    const cursor = type === 'rotate' ? 'alias'
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
            transform: `rotate(${p.rotateZ}deg)`,
            transformOrigin: 'center',
            border: `${1.5 / displayScale}px solid #6366f1`,
            pointerEvents: 'all',
            cursor: layer.locked ? 'not-allowed' : 'move',
            boxSizing: 'border-box',
          }}
          onMouseDown={(e) => onHandleMouseDown(e, 'move')}
        >
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
        </div>
      </div>
    </div>
  )
}
