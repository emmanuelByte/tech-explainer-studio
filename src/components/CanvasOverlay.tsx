import { useCallback, useEffect, useRef, useState } from 'react'
import { useStore } from '../store'
import { interpolateProps } from '../remotion/interpolateProps'
import { Layer, TransformProps } from '../types'

interface Props {
  containerRef: React.RefObject<HTMLDivElement | null>
  canvasW: number
  canvasH: number
}

type HandleType = 'move' | 'tl' | 'tr' | 'bl' | 'br' | 'rotate'

interface DragState {
  type: HandleType
  startMx: number
  startMy: number
  startPropX: number
  startPropY: number
  startScale: number
  startW: number
  centerCx: number  // center in canvas coords
  centerCy: number
  displayScale: number
  props: TransformProps
}

export function CanvasOverlay({ containerRef, canvasW, canvasH }: Props) {
  const { layers, selectedLayerIds, currentFrame, addKeyframe } = useStore()

  // The CSS display scale: how many screen px per canvas px
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

    // Delta in canvas coordinates
    const dx = (e.clientX - d.startMx) / d.displayScale
    const dy = (e.clientY - d.startMy) / d.displayScale

    if (d.type === 'move') {
      addKeyframe(layer.id, currentFrame, { ...d.props, x: d.startPropX + dx, y: d.startPropY + dy })
    } else if (d.type === 'rotate') {
      const rect = containerRef.current?.getBoundingClientRect()
      if (!rect) return
      const mx = (e.clientX - rect.left) / d.displayScale - d.centerCx
      const my = (e.clientY - rect.top) / d.displayScale - d.centerCy
      const angle = Math.atan2(my, mx) * (180 / Math.PI) + 90
      addKeyframe(layer.id, currentFrame, { ...d.props, rotateZ: Math.round(angle) })
    } else {
      // Corner resize → scale
      const sign = (d.type === 'br' || d.type === 'tr') ? 1 : -1
      const scaleDelta = (d.startW + sign * dx * 2) / d.startW
      addKeyframe(layer.id, currentFrame, {
        ...d.props,
        scale: Math.max(0.01, d.startScale * scaleDelta),
      })
    }
  }, [layers, selectedLayerIds, currentFrame, addKeyframe, containerRef])

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

  // All positions in CANVAS pixels — the CSS scale maps them to screen
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
    // Capture displayScale at drag-start for accurate coordinate conversion
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
      centerCx,
      centerCy,
      displayScale: ds,
      props: { ...p },
    }
  }

  function Handle({ type, style }: { type: HandleType; style: React.CSSProperties }) {
    return (
      <div
        onMouseDown={(e) => onHandleMouseDown(e, type)}
        style={{
          position: 'absolute',
          width: 8 / displayScale,   // keep handle visually 8px regardless of zoom
          height: 8 / displayScale,
          background: '#fff',
          border: `${1.5 / displayScale}px solid #6366f1`,
          borderRadius: type === 'rotate' ? '50%' : 2,
          cursor: type === 'rotate' ? 'alias' : 'nwse-resize',
          zIndex: 10,
          ...style,
        }}
      />
    )
  }

  const hw = 4 / displayScale  // half-handle offset

  return (
    // Outer wrapper: fills the playerWrapper in container pixels
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'visible' }}>
      {/*
        Inner div: rendered at CANVAS SIZE then CSS-scaled to match the Remotion Player.
        This puts us in the same coordinate space as the composition.
      */}
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
        {/* Selection box, in canvas coordinates */}
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
          <Handle type="tl" style={{ left: -hw, top: -hw }} />
          <Handle type="tr" style={{ right: -hw, top: -hw }} />
          <Handle type="bl" style={{ left: -hw, bottom: -hw }} />
          <Handle type="br" style={{ right: -hw, bottom: -hw }} />

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
