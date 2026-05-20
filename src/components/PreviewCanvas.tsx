import { useCallback, useEffect, useRef, useState } from 'react'
import { Player, PlayerRef } from '@remotion/player'
import { Clapperboard, Maximize2, Minus, Plus, Scan } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useStore } from '../store'
import { EditorComposition } from '../remotion/Composition'
import { Layer, CANVAS_PRESETS } from '../types'
import { CanvasOverlay } from './CanvasOverlay'

function ZoomButton({ children, onClick, title }: { children: React.ReactNode; onClick: () => void; title: string }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="icon-btn"
    >
      {children}
    </button>
  )
}

export function PreviewCanvas() {
  const { t } = useTranslation()
  const {
    layers, currentFrame, totalFrames, fps,
    canvasPreset, customWidth, customHeight, canvasBackgroundColor,
    setCanvasPreset, setCustomDimension, currentTool,
    editorZoom, editorPanX, editorPanY, setEditorViewport,
  } = useStore()

  const playerRef = useRef<PlayerRef>(null)
  const outerRef = useRef<HTMLDivElement>(null)
  const transformRef = useRef<HTMLDivElement>(null)
  const playerWrapperRef = useRef<HTMLDivElement>(null)

  const zoom = editorZoom
  const pan = { x: editorPanX, y: editorPanY }
  const isPanning = useRef(false)
  const panStart = useRef({ mx: 0, my: 0, px: 0, py: 0, zoom: 1 })
  const panPreview = useRef<{ zoom: number; x: number; y: number } | null>(null)
  const panFrame = useRef<number | null>(null)
  const wheelPanCommit = useRef<number | null>(null)
  const spaceHeld = useRef(false)
  const [isPanningUi, setIsPanningUi] = useState(false)

  const isCustom = canvasPreset.name === 'Custom'
  const canvasW = isCustom ? customWidth : canvasPreset.width
  const canvasH = isCustom ? customHeight : canvasPreset.height

  // Sync player to store frame
  useEffect(() => {
    const player = playerRef.current
    if (!player) return
    if (player.getCurrentFrame() !== currentFrame) player.seekTo(currentFrame)
  }, [currentFrame])

  function setZoomPan(nextZoom: number, nextPan = pan) {
    setEditorViewport(Math.max(0.1, Math.min(5, nextZoom)), nextPan.x, nextPan.y)
  }

  function setPanTransition(enabled: boolean) {
    if (!transformRef.current) return
    transformRef.current.style.transition = enabled ? 'transform 0.08s ease' : 'none'
  }

  function applyPanTransform(nextZoom: number, nextX: number, nextY: number) {
    if (!transformRef.current) return
    transformRef.current.style.transform = `translate(${nextX}px,${nextY}px) scale(${nextZoom})`
  }

  function schedulePanPreview(nextZoom: number, nextX: number, nextY: number) {
    panPreview.current = { zoom: nextZoom, x: nextX, y: nextY }
    if (panFrame.current !== null) return
    panFrame.current = requestAnimationFrame(() => {
      panFrame.current = null
      const preview = panPreview.current
      if (!preview) return
      applyPanTransform(preview.zoom, preview.x, preview.y)
    })
  }

  function cancelPanPreviewFrame() {
    if (panFrame.current === null) return
    cancelAnimationFrame(panFrame.current)
    panFrame.current = null
  }

  function clearWheelPanCommit() {
    if (wheelPanCommit.current === null) return
    window.clearTimeout(wheelPanCommit.current)
    wheelPanCommit.current = null
  }

  function deltaToPixels(e: WheelEvent, value: number) {
    if (e.deltaMode === WheelEvent.DOM_DELTA_LINE) return value * 16
    if (e.deltaMode === WheelEvent.DOM_DELTA_PAGE) return value * 80
    return value
  }

  function zoomAtPoint(nextZoom: number, clientX: number, clientY: number) {
    const stage = playerWrapperRef.current
    if (!stage) {
      setZoomPan(nextZoom)
      return
    }
    const rect = stage.getBoundingClientRect()
    const currentCenter = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
    const baseCenter = { x: currentCenter.x - pan.x, y: currentCenter.y - pan.y }
    const localOffset = {
      x: (clientX - currentCenter.x) / zoom,
      y: (clientY - currentCenter.y) / zoom,
    }
    const desiredCenter = {
      x: clientX - localOffset.x * nextZoom,
      y: clientY - localOffset.y * nextZoom,
    }
    setZoomPan(nextZoom, { x: desiredCenter.x - baseCenter.x, y: desiredCenter.y - baseCenter.y })
  }

  function zoomAtCanvasCenter(nextZoom: number) {
    const outer = outerRef.current
    if (!outer) {
      setZoomPan(nextZoom)
      return
    }
    const rect = outer.getBoundingClientRect()
    zoomAtPoint(nextZoom, rect.left + rect.width / 2, rect.top + rect.height / 2)
  }

  // Touchpad/mouse wheel: two-finger scroll pans, Shift/Ctrl/trackpad pinch zooms to cursor.
  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault()
    const isZoomGesture = e.ctrlKey || e.metaKey || e.shiftKey
    if (!isZoomGesture) {
      const state = useStore.getState()
      const currentPreview = panPreview.current
      const baseX = currentPreview?.x ?? state.editorPanX
      const baseY = currentPreview?.y ?? state.editorPanY
      const baseZoom = currentPreview?.zoom ?? state.editorZoom
      const nextX = baseX - deltaToPixels(e, e.deltaX)
      const nextY = baseY - deltaToPixels(e, e.deltaY)
      setPanTransition(false)
      schedulePanPreview(baseZoom, nextX, nextY)
      clearWheelPanCommit()
      wheelPanCommit.current = window.setTimeout(() => {
        wheelPanCommit.current = null
        cancelPanPreviewFrame()
        applyPanTransform(baseZoom, nextX, nextY)
        panPreview.current = null
        setEditorViewport(baseZoom, nextX, nextY)
        requestAnimationFrame(() => setPanTransition(true))
      }, 70)
      return
    }

    clearWheelPanCommit()
    panPreview.current = null
    const z = useStore.getState().editorZoom
    const currentPan = { x: useStore.getState().editorPanX, y: useStore.getState().editorPanY }
    const dominantDelta = Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX
    const fallbackDelta = 'wheelDelta' in e ? -(e as WheelEvent & { wheelDelta: number }).wheelDelta : 0
    const wheelDelta = dominantDelta || fallbackDelta
    const direction = wheelDelta < 0 ? 1 : -1
    const factor = direction > 0 ? 1.1 : 0.9
    const newZ = Math.max(0.1, Math.min(5, z * factor))
    const stage = playerWrapperRef.current
    if (!stage) {
      setEditorViewport(newZ, currentPan.x, currentPan.y)
      return
    }
    const rect = stage.getBoundingClientRect()
    const currentCenter = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
    const baseCenter = { x: currentCenter.x - currentPan.x, y: currentCenter.y - currentPan.y }
    const localOffset = {
      x: (e.clientX - currentCenter.x) / z,
      y: (e.clientY - currentCenter.y) / z,
    }
    const desiredCenter = {
      x: e.clientX - localOffset.x * newZ,
      y: e.clientY - localOffset.y * newZ,
    }
    setEditorViewport(newZ, desiredCenter.x - baseCenter.x, desiredCenter.y - baseCenter.y)
  }, [setEditorViewport])

  useEffect(() => {
    const el = outerRef.current
    if (!el) return
    el.addEventListener('wheel', handleWheel, { passive: false })
    return () => {
      el.removeEventListener('wheel', handleWheel)
      clearWheelPanCommit()
      cancelPanPreviewFrame()
    }
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
      const state = useStore.getState()
      isPanning.current = true
      setIsPanningUi(true)
      setPanTransition(false)
      panPreview.current = {
        zoom: state.editorZoom,
        x: state.editorPanX,
        y: state.editorPanY,
      }
      panStart.current = {
        mx: e.clientX,
        my: e.clientY,
        px: state.editorPanX,
        py: state.editorPanY,
        zoom: state.editorZoom,
      }
    }
  }

  function onMouseMove(e: React.MouseEvent) {
    if (!isPanning.current) return
    schedulePanPreview(
      panStart.current.zoom,
      panStart.current.px + (e.clientX - panStart.current.mx),
      panStart.current.py + (e.clientY - panStart.current.my),
    )
  }

  function onMouseUp() {
    if (!isPanning.current) return
    const preview = panPreview.current ?? {
      zoom: panStart.current.zoom,
      x: panStart.current.px,
      y: panStart.current.py,
    }
    cancelPanPreviewFrame()
    applyPanTransform(preview.zoom, preview.x, preview.y)
    isPanning.current = false
    setIsPanningUi(false)
    panPreview.current = null
    setEditorViewport(preview.zoom, preview.x, preview.y)
    requestAnimationFrame(() => {
      if (!isPanning.current) setPanTransition(true)
    })
  }

  function fitToScreen() {
    const outer = outerRef.current
    if (!outer) return
    const { width, height } = outer.getBoundingClientRect()
    const fz = Math.min((width - 48) / canvasW, (height - 48) / canvasH)
    setZoomPan(fz, { x: 0, y: 0 })
  }

  function resetZoom() { setZoomPan(1, { x: 0, y: 0 }) }

  // Ctrl+0 = fit, Ctrl+1 = 100%, Ctrl+2 = 200%
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!e.ctrlKey && !e.metaKey) return
      if (e.key === '0') { e.preventDefault(); fitToScreen() }
      if (e.key === '1') { e.preventDefault(); resetZoom() }
      if (e.key === '2') { e.preventDefault(); zoomAtCanvasCenter(2) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  // fitToScreen and resetZoom are stable (no deps change)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const cursorStyle =
    currentTool === 'hand' || spaceHeld.current ? (isPanningUi ? 'cursor-grabbing' : 'cursor-grab') : ''

  return (
    <div className="flex flex-col flex-1 min-w-0" style={{ background: 'var(--bg)', overflow: 'hidden' }}>
      {/* Toolbar strip — Figma-style: minimal, flat */}
      <div
        className="flex items-center flex-shrink-0"
        style={{ height: 40, padding: '0 10px', gap: 4, background: 'var(--panel)', borderBottom: '1px solid var(--border)' }}
      >
        {/* Preset selector */}
        <select
          value={canvasPreset.name}
          onChange={(e) => setCanvasPreset(e.target.value)}
          className="input-base"
          style={{ minWidth: 110, height: 26 }}
        >
          {CANVAS_PRESETS.map((p) => (
            <option key={p.name} value={p.name}>{p.name}</option>
          ))}
        </select>

        {isCustom ? (
          <div className="flex items-center gap-1">
            <input type="number" value={customWidth}
              onChange={(e) => setCustomDimension('customWidth', Number(e.target.value))}
              className="input-base"
              style={{ width: 56, height: 26 }}
            />
            <span style={{ color: 'var(--text3)', fontSize: 10 }}>×</span>
            <input type="number" value={customHeight}
              onChange={(e) => setCustomDimension('customHeight', Number(e.target.value))}
              className="input-base"
              style={{ width: 56, height: 26 }}
            />
          </div>
        ) : (
          <span style={{ color: 'var(--text3)', fontSize: 11 }}>{canvasW} × {canvasH}</span>
        )}

        <div className="flex-1" />

        {/* Zoom controls — Figma-style */}
        <ZoomButton title={t('preview.zoomOut')} onClick={() => zoomAtCanvasCenter(Math.max(0.1, zoom / 1.25))}><Minus size={13} /></ZoomButton>
        <button
          onClick={resetZoom}
          title={t('preview.resetZoom')}
          style={{
            height: 26, minWidth: 52, padding: '0 6px',
            fontSize: 11, color: 'var(--text2)',
            background: 'transparent', borderRadius: 3,
            border: '1px solid var(--input-border)',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {Math.round(zoom * 100)}%
        </button>
        <ZoomButton title={t('preview.zoomIn')} onClick={() => zoomAtCanvasCenter(Math.min(5, zoom * 1.25))}><Plus size={13} /></ZoomButton>
        <button onClick={fitToScreen} className="icon-btn" title={t('preview.fitToScreen')} style={{ width: 26, height: 26, minWidth: 26 }}>
          <Maximize2 size={13} />
        </button>
        <button onClick={resetZoom} className="icon-btn" title={t('preview.actualSize')} style={{ width: 26, height: 26, minWidth: 26 }}>
          <Scan size={13} />
        </button>
      </div>

      {/* Canvas area */}
      <div
        ref={outerRef}
        className={`flex-1 flex items-center justify-center overflow-hidden select-none ${cursorStyle}`}
        style={{ background: 'var(--canvas-bg)' }}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
      >
        {/* Zoom/pan transform wrapper */}
        <div
          ref={transformRef}
          style={{
            transform: `translate(${pan.x}px,${pan.y}px) scale(${zoom})`,
            transformOrigin: 'center center',
            transition: 'transform 0.08s ease',
          }}
        >
          <div
            ref={playerWrapperRef}
            style={{
              position: 'relative',
              width: canvasW,
              height: canvasH,
              boxShadow: 'var(--preview-shadow)',
              borderRadius: 2,
              overflow: 'hidden',
              flexShrink: 0,
              pointerEvents: 'all',
            }}
          >
            <Player
              ref={playerRef}
              component={EditorComposition}
              inputProps={{ layers, canvasWidth: canvasW, canvasHeight: canvasH, backgroundColor: canvasBackgroundColor }}
              durationInFrames={Math.max(totalFrames, 1)}
              fps={fps}
              compositionWidth={canvasW}
              compositionHeight={canvasH}
              style={{ width: '100%', height: '100%' }}
              controls={false}
              loop={false}
              acknowledgeRemotionLicense
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
          border: '1px solid #0d99ff',
          pointerEvents: 'none',
        }}
      />
    </div>
  )
}
