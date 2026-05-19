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

export function CanvasOverlay({ containerRef, canvasW, canvasH }: Props) {
  const { layers, selectedLayerIds, currentFrame, addKeyframe } = useStore()
  const [containerSize, setContainerSize] = useState({ w: 1, h: 1 })
  const dragRef = useRef<{
    type: HandleType
    startMx: number; startMy: number
    startX: number; startY: number
    startW: number
    centerX: number; centerY: number
    props: TransformProps
  } | null>(null)

  // Always observe the container — no early return before this
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const obs = new ResizeObserver(([entry]) => {
      setContainerSize({ w: entry.contentRect.width, h: entry.contentRect.height })
    })
    obs.observe(el)
    return () => obs.disconnect()
  }, [containerRef])

  const selectedId = selectedLayerIds[0]
  const layer: Layer | undefined = layers.find((l) => l.id === selectedId)
  const scale = containerSize.w / canvasW

  // Pre-compute even when no layer (hooks can't be conditional)
  const p = layer ? interpolateProps(currentFrame, layer.keyframes) : null

  const onMouseMove = useCallback((e: MouseEvent) => {
    const d = dragRef.current
    if (!d || !layer || !p) return

    const dx = (e.clientX - d.startMx) / scale
    const dy = (e.clientY - d.startMy) / scale

    if (d.type === 'move') {
      addKeyframe(layer.id, currentFrame, { ...d.props, x: d.startX + dx, y: d.startY + dy })
    } else if (d.type === 'rotate') {
      const rect = containerRef.current?.getBoundingClientRect()
      if (!rect) return
      const mx = e.clientX - rect.left - d.centerX
      const my = e.clientY - rect.top - d.centerY
      const angle = Math.atan2(my, mx) * (180 / Math.PI) + 90
      addKeyframe(layer.id, currentFrame, { ...d.props, rotateZ: Math.round(angle) })
    } else {
      // Corner resize → scale
      const scaleDelta = (d.type === 'br' || d.type === 'tr')
        ? (d.startW + dx * 2) / d.startW
        : (d.startW - dx * 2) / d.startW
      addKeyframe(layer.id, currentFrame, { ...d.props, scale: Math.max(0.01, d.props.scale * scaleDelta) })
    }
  }, [layer, currentFrame, p, scale, addKeyframe, containerRef])

  const onMouseUp = useCallback(() => { dragRef.current = null }, [])

  useEffect(() => {
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [onMouseMove, onMouseUp])

  // After all hooks — safe to return null
  if (!layer || !p) return null

  const layerH = layer.type === 'line' ? (layer.strokeWidth || 2) : layer.height
  const cx = (canvasW / 2 + p.x) * scale
  const cy = (canvasH / 2 + p.y) * scale
  const sw = layer.width * p.scale * scale
  const sh = layerH * p.scale * scale
  const left = cx - sw / 2
  const top = cy - sh / 2

  function onHandleMouseDown(e: React.MouseEvent, type: HandleType) {
    if (layer!.locked) return
    e.preventDefault()
    e.stopPropagation()
    dragRef.current = {
      type,
      startMx: e.clientX, startMy: e.clientY,
      startX: p!.x, startY: p!.y,
      startW: layer!.width,
      centerX: cx, centerY: cy,
      props: { ...p! },
    }
  }

  function Handle({ type, style }: { type: HandleType; style: React.CSSProperties }) {
    return (
      <div
        onMouseDown={(e) => onHandleMouseDown(e, type)}
        style={{
          position: 'absolute',
          width: 8, height: 8,
          background: '#fff',
          border: '1.5px solid #6366f1',
          borderRadius: type === 'rotate' ? '50%' : 2,
          cursor: type === 'rotate' ? 'alias' : 'nwse-resize',
          zIndex: 10,
          ...style,
        }}
      />
    )
  }

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
      <div
        style={{
          position: 'absolute',
          left, top,
          width: sw, height: sh,
          transform: `rotate(${p.rotateZ}deg)`,
          transformOrigin: 'center',
          border: '1.5px solid #6366f1',
          pointerEvents: 'all',
          cursor: layer.locked ? 'not-allowed' : 'move',
          boxSizing: 'border-box',
        }}
        onMouseDown={(e) => onHandleMouseDown(e, 'move')}
      >
        <Handle type="tl" style={{ left: -5, top: -5 }} />
        <Handle type="tr" style={{ right: -5, top: -5 }} />
        <Handle type="bl" style={{ left: -5, bottom: -5 }} />
        <Handle type="br" style={{ right: -5, bottom: -5 }} />
        {/* Rotation handle */}
        <div style={{ position: 'absolute', left: '50%', top: -24, transform: 'translateX(-50%)', pointerEvents: 'all' }}>
          <div style={{ width: 1, height: 14, background: '#6366f1', margin: '0 auto' }} />
          <Handle type="rotate" style={{ position: 'relative', left: -4, top: 0, cursor: 'alias' }} />
        </div>
      </div>
    </div>
  )
}
