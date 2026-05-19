import { useCallback, useEffect, useRef, useState } from 'react'
import { Player, PlayerRef } from '@remotion/player'
import { useStore } from '../store'
import { EditorComposition } from '../remotion/Composition'
import { Layer, CANVAS_PRESETS } from '../types'
import { CanvasOverlay } from './CanvasOverlay'

function ZoomButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-6 h-6 flex items-center justify-center rounded text-xs transition-colors"
      style={{ background: 'var(--input)', color: 'var(--text)', border: '1px solid var(--border)' }}
    >
      {label}
    </button>
  )
}

export function PreviewCanvas() {
  const {
    layers, currentFrame, totalFrames, fps,
    canvasPreset, customWidth, customHeight,
    setCanvasPreset, setCustomDimension, currentTool, addLayer,
  } = useStore()

  const playerRef = useRef<PlayerRef>(null)
  const outerRef = useRef<HTMLDivElement>(null)
  const playerWrapperRef = useRef<HTMLDivElement>(null)

  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const isPanning = useRef(false)
  const panStart = useRef({ mx: 0, my: 0, px: 0, py: 0 })
  const spaceHeld = useRef(false)

  const isCustom = canvasPreset.name === 'Custom'
  const canvasW = isCustom ? customWidth : canvasPreset.width
  const canvasH = isCustom ? customHeight : canvasPreset.height

  // Sync player to store frame
  useEffect(() => {
    const player = playerRef.current
    if (!player) return
    if (player.getCurrentFrame() !== currentFrame) player.seekTo(currentFrame)
  }, [currentFrame])

  // Zoom to cursor on Ctrl+Wheel or Shift+Wheel
  const handleWheel = useCallback((e: WheelEvent) => {
    if (!e.ctrlKey && !e.shiftKey) return
    e.preventDefault()
    const step = e.shiftKey ? 0.1 : (e.deltaY > 0 ? -0.1 : 0.1)
    setZoom((z) => {
      const newZ = Math.max(0.1, Math.min(5, e.shiftKey ? (e.deltaY > 0 ? z - step : z + step) : z * (e.deltaY > 0 ? 0.9 : 1.1)))
      const rect = outerRef.current!.getBoundingClientRect()
      const cx = e.clientX - rect.left
      const cy = e.clientY - rect.top
      setPan((p) => ({
        x: cx - (cx - p.x) * (newZ / z),
        y: cy - (cy - p.y) * (newZ / z),
      }))
      return newZ
    })
  }, [])

  useEffect(() => {
    const el = outerRef.current
    if (!el) return
    el.addEventListener('wheel', handleWheel, { passive: false })
    return () => el.removeEventListener('wheel', handleWheel)
  }, [handleWheel])

  // Space/middle mouse pan
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !e.repeat) { spaceHeld.current = e.type === 'keydown' }
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('keyup', onKey)
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('keyup', onKey) }
  }, [])

  function onMouseDown(e: React.MouseEvent) {
    if (e.button === 1 || (e.button === 0 && spaceHeld.current) || currentTool === 'hand') {
      e.preventDefault()
      isPanning.current = true
      panStart.current = { mx: e.clientX, my: e.clientY, px: pan.x, py: pan.y }
    }
  }

  function onMouseMove(e: React.MouseEvent) {
    if (!isPanning.current) return
    setPan({
      x: panStart.current.px + (e.clientX - panStart.current.mx),
      y: panStart.current.py + (e.clientY - panStart.current.my),
    })
  }

  function onMouseUp() { isPanning.current = false }

  function fitToScreen() {
    const outer = outerRef.current
    if (!outer) return
    const { width, height } = outer.getBoundingClientRect()
    const wrapper = playerWrapperRef.current
    if (!wrapper) return
    const { width: pw, height: ph } = wrapper.getBoundingClientRect()
    const fz = Math.min((width - 48) / pw, (height - 48) / ph)
    setZoom(fz)
    setPan({ x: 0, y: 0 })
  }

  function resetZoom() { setZoom(1); setPan({ x: 0, y: 0 }) }

  // Ctrl+0 = fit, Ctrl+1 = 100%, Ctrl+2 = 200%
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!e.ctrlKey && !e.metaKey) return
      if (e.key === '0') { e.preventDefault(); fitToScreen() }
      if (e.key === '1') { e.preventDefault(); resetZoom() }
      if (e.key === '2') { e.preventDefault(); setZoom(2); setPan({ x: 0, y: 0 }) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  // fitToScreen and resetZoom are stable (no deps change)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const cursorStyle =
    currentTool === 'hand' || spaceHeld.current ? (isPanning.current ? 'cursor-grabbing' : 'cursor-grab') : ''

  return (
    <div className="flex flex-col flex-1 min-w-0" style={{ background: 'var(--bg)', overflow: 'hidden' }}>
      {/* Toolbar strip */}
      <div
        className="flex items-center gap-2 px-3 py-1.5 flex-wrap flex-shrink-0"
        style={{ background: 'var(--panel)', borderBottom: '1px solid var(--border)' }}
      >
        {/* Preset selector */}
        <select
          value={canvasPreset.name}
          onChange={(e) => setCanvasPreset(e.target.value)}
          className="input-base"
          style={{ minWidth: 120 }}
        >
          {CANVAS_PRESETS.map((p) => (
            <option key={p.name} value={p.name}>{p.name}</option>
          ))}
        </select>

        {isCustom ? (
          <div className="flex items-center gap-1">
            <input type="number" value={customWidth}
              onChange={(e) => setCustomDimension('customWidth', Number(e.target.value))}
              className="input-base w-16"
            />
            <span style={{ color: 'var(--text3)', fontSize: 11 }}>×</span>
            <input type="number" value={customHeight}
              onChange={(e) => setCustomDimension('customHeight', Number(e.target.value))}
              className="input-base w-16"
            />
          </div>
        ) : (
          <span style={{ color: 'var(--text3)', fontSize: 11 }}>{canvasW} × {canvasH}</span>
        )}

        <div className="flex-1" />

        {/* Zoom controls */}
        <ZoomButton label="−" onClick={() => setZoom((z) => Math.max(0.1, z / 1.25))} />
        <button
          onClick={resetZoom}
          className="text-xs px-2 py-0.5 rounded transition-colors"
          style={{ background: 'var(--input)', color: 'var(--text)', border: '1px solid var(--border)', minWidth: 48 }}
          title="Click to reset to 100%"
        >
          {Math.round(zoom * 100)}%
        </button>
        <ZoomButton label="+" onClick={() => setZoom((z) => Math.min(8, z * 1.25))} />
        <button
          onClick={fitToScreen}
          className="text-xs px-2 py-0.5 rounded transition-colors"
          style={{ background: 'var(--input)', color: 'var(--text2)', border: '1px solid var(--border)' }}
          title="Fit to screen"
        >
          Fit
        </button>
        <button
          onClick={resetZoom}
          className="text-xs px-2 py-0.5 rounded transition-colors"
          style={{ background: 'var(--input)', color: 'var(--text2)', border: '1px solid var(--border)' }}
          title="Actual pixel size"
        >
          1:1
        </button>
      </div>

      {/* Canvas area */}
      <div
        ref={outerRef}
        className={`flex-1 flex items-center justify-center overflow-hidden select-none ${cursorStyle}`}
        style={{ background: 'var(--bg2)' }}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
      >
        {/* Zoom/pan transform wrapper */}
        <div
          style={{
            transform: `translate(${pan.x}px,${pan.y}px) scale(${zoom})`,
            transformOrigin: '0 0',
            transition: 'transform 0.08s ease',
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: zoom !== 1 || pan.x !== 0 || pan.y !== 0 ? 'none' : undefined,
          }}
        >
          <div
            ref={playerWrapperRef}
            style={{
              position: 'relative',
              aspectRatio: `${canvasW} / ${canvasH}`,
              maxWidth: '100%',
              maxHeight: '100%',
              width: canvasW > canvasH ? '100%' : 'auto',
              height: canvasW <= canvasH ? '100%' : 'auto',
              boxShadow: '0 0 0 1px #2a2a2a, 0 8px 40px rgba(0,0,0,0.5)',
              borderRadius: 4,
              overflow: 'hidden',
              flexShrink: 0,
              pointerEvents: 'all',
            }}
          >
            <Player
              ref={playerRef}
              component={EditorComposition}
              inputProps={{ layers, canvasWidth: canvasW, canvasHeight: canvasH }}
              durationInFrames={Math.max(totalFrames, 1)}
              fps={fps}
              compositionWidth={canvasW}
              compositionHeight={canvasH}
              style={{ width: '100%', height: '100%' }}
              controls={false}
              loop={false}
            />
            <CanvasOverlay
              containerRef={playerWrapperRef}
              canvasW={canvasW}
              canvasH={canvasH}
            />
          </div>
        </div>

        {/* Minimap */}
        {zoom > 1.5 && (
          <Minimap
            layers={layers}
            canvasW={canvasW}
            canvasH={canvasH}
            pan={pan}
            zoom={zoom}
            outerRef={outerRef}
          />
        )}
      </div>
    </div>
  )
}

function Minimap({ layers, canvasW, canvasH, pan, zoom, outerRef }: {
  layers: Layer[]
  canvasW: number
  canvasH: number
  pan: { x: number; y: number }
  zoom: number
  outerRef: React.RefObject<HTMLDivElement | null>
}) {
  const MM_W = 140
  const MM_H = Math.round(MM_W * canvasH / canvasW)
  const scale = MM_W / canvasW

  const outer = outerRef.current
  const vw = outer?.clientWidth ?? MM_W
  const vh = outer?.clientHeight ?? MM_H
  // Viewport rect in canvas coordinates
  const vpX = -pan.x / zoom
  const vpY = -pan.y / zoom
  const vpW = vw / zoom
  const vpH = vh / zoom

  return (
    <div
      style={{
        position: 'absolute', bottom: 12, right: 12,
        width: MM_W, height: MM_H,
        background: 'rgba(0,0,0,0.7)',
        border: '1px solid #333',
        borderRadius: 4,
        overflow: 'hidden',
        pointerEvents: 'none',
        zIndex: 20,
      }}
    >
      {/* Layer rectangles */}
      {layers.filter((l) => l.visible).map((l) => (
        <div
          key={l.id}
          style={{
            position: 'absolute',
            left: (canvasW / 2 - l.width / 2) * scale,
            top: (canvasH / 2 - l.height / 2) * scale,
            width: l.width * scale,
            height: l.height * scale,
            background: l.fillColor,
            opacity: 0.6,
          }}
        />
      ))}
      {/* Viewport rect */}
      <div
        style={{
          position: 'absolute',
          left: vpX * scale,
          top: vpY * scale,
          width: vpW * scale,
          height: vpH * scale,
          border: '1px solid #6366f1',
          pointerEvents: 'none',
        }}
      />
    </div>
  )
}
