import { useRef, useState, useCallback, useEffect } from 'react'
import { useStore } from '../store'
import { Layer, TimelineMarker } from '../types'

const BASE_FPX = 4        // base px per frame at zoom=1
const ROW_H = 28
const RULER_H = 24
const LABEL_W = 130

function PlayIcon() {
  return <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21" /></svg>
}
function PauseIcon() {
  return <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></svg>
}
function ZoomInIcon() {
  return <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="7" /><line x1="11" y1="8" x2="11" y2="14" /><line x1="8" y1="11" x2="14" y2="11" /><line x1="16" y1="16" x2="21" y2="21" /></svg>
}
function ZoomOutIcon() {
  return <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="7" /><line x1="8" y1="11" x2="14" y2="11" /><line x1="16" y1="16" x2="21" y2="21" /></svg>
}

interface ContextMenu {
  x: number; y: number
  layerId: string; frame: number
}

export function Timeline() {
  const {
    layers, currentFrame, totalFrames, fps, isPlaying,
    selectedLayerIds, timelineZoom, markers,
    setCurrentFrame, setPlaying, setTotalFrames,
    selectLayer, removeKeyframe, moveKeyframe, addMarker, removeMarker,
    setTimelineZoom, loopEnabled, loopIn, loopOut, setLoop, clearLoop, setLoopEnabled,
  } = useStore()

  const scrollRef = useRef<HTMLDivElement>(null)
  const isDragging = useRef(false)
  const kfDrag = useRef<{ layerId: string; fromFrame: number; startX: number } | null>(null)
  const loopDrag = useRef<{ type: 'in' | 'out'; startX: number; startFrame: number } | null>(null)
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null)
  const [copiedKf, setCopiedKf] = useState<{ props: unknown; easing: string } | null>(null)

  const fpx = BASE_FPX * timelineZoom
  const totalWidth = totalFrames * fpx

  const frameFromX = useCallback((clientX: number) => {
    const el = scrollRef.current
    if (!el) return 0
    const rect = el.getBoundingClientRect()
    const x = clientX - rect.left + el.scrollLeft
    return Math.max(0, Math.min(totalFrames - 1, Math.round(x / fpx)))
  }, [totalFrames, fpx])

  // Ruler click for scrubbing
  function onRulerDown(e: React.MouseEvent) {
    isDragging.current = true
    setCurrentFrame(frameFromX(e.clientX))
  }
  function onRulerMove(e: React.MouseEvent) {
    if (!isDragging.current) return
    setCurrentFrame(frameFromX(e.clientX))
  }
  function onRulerUp() { isDragging.current = false }

  // Right-click ruler to add marker
  function onRulerContextMenu(e: React.MouseEvent) {
    e.preventDefault()
    addMarker(frameFromX(e.clientX))
  }

  // Keyframe drag
  function onKfMouseDown(e: React.MouseEvent, layerId: string, frame: number) {
    e.stopPropagation()
    kfDrag.current = { layerId, fromFrame: frame, startX: e.clientX }
  }

  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      if (!kfDrag.current) return
      const el = scrollRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const x = e.clientX - rect.left + el.scrollLeft
      const newFrame = Math.max(0, Math.min(totalFrames - 1, Math.round(x / fpx)))
      if (newFrame !== kfDrag.current.fromFrame) {
        moveKeyframe(kfDrag.current.layerId, kfDrag.current.fromFrame, newFrame)
        kfDrag.current = { ...kfDrag.current, fromFrame: newFrame }
      }
    }
    function onMouseUp() { kfDrag.current = null }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => { window.removeEventListener('mousemove', onMouseMove); window.removeEventListener('mouseup', onMouseUp) }
  }, [totalFrames, fpx, moveKeyframe])

  // Context menu handlers
  function onKfContextMenu(e: React.MouseEvent, layerId: string, frame: number) {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ x: e.clientX, y: e.clientY, layerId, frame })
  }

  useEffect(() => {
    if (!contextMenu) return
    function close() { setContextMenu(null) }
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [contextMenu])

  // Scroll timeline to keep playhead visible
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const px = currentFrame * fpx
    if (px < el.scrollLeft || px > el.scrollLeft + el.clientWidth - 40) {
      el.scrollLeft = Math.max(0, px - el.clientWidth / 2)
    }
  }, [currentFrame, fpx])

  const durationSec = totalFrames / fps

  // Ruler marks
  const rulerMarks: React.ReactNode[] = []
  const minPxPerLabel = 40
  let labelEvery = fps
  while (labelEvery * fpx < minPxPerLabel) labelEvery += fps
  const tickEvery = Math.max(1, Math.round(fps / 4))

  for (let f = 0; f <= totalFrames; f += tickEvery) {
    const isMajor = f % labelEvery === 0
    rulerMarks.push(
      <div key={f} style={{ position: 'absolute', left: f * fpx, top: 0, height: RULER_H, pointerEvents: 'none' }}>
        <div style={{ width: 1, height: isMajor ? 10 : 5, background: 'var(--text3)', marginTop: isMajor ? 6 : 10 }} />
        {isMajor && (
          <div style={{ fontSize: 9, color: 'var(--text3)', paddingLeft: 2, whiteSpace: 'nowrap', userSelect: 'none' }}>
            {f === 0 ? '0' : `${(f / fps).toFixed(1)}s`}
          </div>
        )}
      </div>
    )
  }

  return (
    <div
      style={{
        background: 'var(--timeline)',
        borderTop: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        maxHeight: 240,
        minHeight: 120,
      }}
    >
      {/* Control bar */}
      <div className="flex items-center gap-2 px-3 py-1.5 flex-shrink-0"
        style={{ borderBottom: '1px solid var(--border)', background: 'var(--panel)' }}
      >
        <button
          onClick={() => setPlaying(!isPlaying)}
          className="w-7 h-7 flex items-center justify-center rounded transition-colors"
          style={{ background: '#6366f1', color: '#fff' }}
        >
          {isPlaying ? <PauseIcon /> : <PlayIcon />}
        </button>

        <span className="font-mono text-xs" style={{ color: 'var(--text3)', minWidth: 80 }}>
          {currentFrame} / {totalFrames - 1}
        </span>

        {/* Loop toggle */}
        <button
          onClick={() => setLoopEnabled(!loopEnabled)}
          className="text-xs rounded px-2 py-1 transition-colors"
          style={{
            background: loopEnabled ? 'rgba(99,102,241,0.15)' : 'var(--input)',
            color: loopEnabled ? '#6366f1' : 'var(--text2)',
            border: `1px solid ${loopEnabled ? '#6366f1' : 'var(--border)'}`,
          }}
          title="Toggle loop playback"
        >
          ↺ Loop
        </button>
        {loopEnabled && (loopIn !== null || loopOut !== null) && (
          <button onClick={clearLoop} className="text-xs" style={{ color: 'var(--text3)' }}>✕</button>
        )}

        <div className="flex-1" />

        {/* Timeline zoom */}
        <button onClick={() => setTimelineZoom(Math.max(0.25, timelineZoom / 1.5))} className="p-1 rounded" style={{ color: 'var(--text2)' }}><ZoomOutIcon /></button>
        <span className="text-xs" style={{ color: 'var(--text3)' }}>{Math.round(timelineZoom * 100)}%</span>
        <button onClick={() => setTimelineZoom(Math.min(8, timelineZoom * 1.5))} className="p-1 rounded" style={{ color: 'var(--text2)' }}><ZoomInIcon /></button>

        <div className="flex items-center gap-1.5 ml-2">
          <span className="text-xs" style={{ color: 'var(--text3)' }}>Dur</span>
          <input
            type="number" min={1} max={300} value={Math.round(durationSec)}
            onChange={(e) => setTotalFrames(Math.max(1, Number(e.target.value)) * fps)}
            className="input-base w-12 text-right"
          />
          <span className="text-xs" style={{ color: 'var(--text3)' }}>s</span>
        </div>
      </div>

      {/* Tracks */}
      <div className="flex flex-1 overflow-hidden">
        {/* Layer labels */}
        <div className="flex flex-col flex-shrink-0" style={{ width: LABEL_W, borderRight: '1px solid var(--border)' }}>
          <div style={{ height: RULER_H, borderBottom: '1px solid var(--border2)' }} />
          {layers.map((layer) => (
            <LayerLabel key={layer.id} layer={layer} selected={selectedLayerIds.includes(layer.id)} onSelect={() => selectLayer(layer.id)} />
          ))}
        </div>

        {/* Scrollable ruler + tracks */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-x-auto overflow-y-hidden"
          style={{ position: 'relative', cursor: 'default' }}
        >
          <div style={{ width: Math.max(totalWidth, 400), position: 'relative' }}>
            {/* Ruler */}
            <div
              style={{ height: RULER_H, position: 'relative', borderBottom: '1px solid var(--border2)', cursor: 'col-resize', userSelect: 'none' }}
              onMouseDown={onRulerDown}
              onMouseMove={onRulerMove}
              onMouseUp={onRulerUp}
              onMouseLeave={onRulerUp}
              onContextMenu={onRulerContextMenu}
            >
              {rulerMarks}

              {/* Loop region */}
              {loopEnabled && loopIn !== null && loopOut !== null && (
                <div style={{
                  position: 'absolute',
                  left: loopIn * fpx,
                  width: (loopOut - loopIn) * fpx,
                  top: 0, bottom: 0,
                  background: 'rgba(99,102,241,0.15)',
                  borderLeft: '2px solid #6366f1',
                  borderRight: '2px solid #6366f1',
                  pointerEvents: 'none',
                }} />
              )}

              {/* Markers */}
              {markers.map((m) => (
                <div key={m.id} style={{ position: 'absolute', left: m.frame * fpx, top: 0, zIndex: 5 }}>
                  <div
                    title={`${m.label} (frame ${m.frame})`}
                    style={{
                      width: 0, height: 0,
                      borderLeft: '5px solid transparent',
                      borderRight: '5px solid transparent',
                      borderTop: `8px solid ${m.color}`,
                      cursor: 'pointer',
                    }}
                    onClick={(e) => { e.stopPropagation(); setCurrentFrame(m.frame) }}
                    onContextMenu={(e) => { e.preventDefault(); removeMarker(m.id) }}
                  />
                </div>
              ))}
            </div>

            {/* Layer tracks */}
            {layers.map((layer) => (
              <TrackRow
                key={layer.id}
                layer={layer}
                fpx={fpx}
                totalWidth={totalWidth}
                selected={selectedLayerIds.includes(layer.id)}
                currentFrame={currentFrame}
                onKfMouseDown={onKfMouseDown}
                onKfContextMenu={onKfContextMenu}
                onClick={() => { selectLayer(layer.id); setCurrentFrame(currentFrame) }}
              />
            ))}

            {/* Playhead */}
            <div style={{
              position: 'absolute', top: 0, left: currentFrame * fpx,
              width: 1, bottom: 0, background: '#ef4444', pointerEvents: 'none', zIndex: 10,
            }}>
              <div style={{
                position: 'absolute', top: 0, left: -4,
                width: 8, height: 10, background: '#ef4444',
                clipPath: 'polygon(50% 100%, 0 0, 100% 0)',
              }} />
            </div>
          </div>
        </div>
      </div>

      {/* Context menu */}
      {contextMenu && (
        <div
          style={{
            position: 'fixed', left: contextMenu.x, top: contextMenu.y,
            background: 'var(--panel)', border: '1px solid var(--border)',
            borderRadius: 6, zIndex: 1000, minWidth: 160,
            boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {[
            {
              label: 'Delete keyframe', action: () => {
                removeKeyframe(contextMenu.layerId, contextMenu.frame)
                setContextMenu(null)
              },
            },
            {
              label: 'Copy keyframe', action: () => {
                const layer = layers.find((l) => l.id === contextMenu.layerId)
                const kf = layer?.keyframes.find((k) => k.frame === contextMenu.frame)
                if (kf) setCopiedKf({ props: kf.props, easing: kf.easing })
                setContextMenu(null)
              },
            },
            ...(copiedKf ? [{
              label: 'Paste keyframe', action: () => {
                const { addKeyframe } = useStore.getState()
                addKeyframe(contextMenu.layerId, contextMenu.frame, copiedKf.props as never, copiedKf.easing)
                setContextMenu(null)
              },
            }] : []),
          ].map(({ label, action }) => (
            <button
              key={label}
              onClick={action}
              className="w-full text-left px-3 py-2 text-xs hover:opacity-80 transition-opacity"
              style={{ color: label.includes('Delete') ? '#ef4444' : 'var(--text)', background: 'transparent', display: 'block' }}
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function LayerLabel({ layer, selected, onSelect }: { layer: Layer; selected: boolean; onSelect: () => void }) {
  const { toggleVisibility, toggleLock } = useStore()
  const typeColors: Record<string, string> = {
    rectangle: '#6366f1', ellipse: '#22c55e', line: '#06b6d4',
    triangle: '#f97316', text: '#f59e0b', image: '#a855f7',
  }
  return (
    <div
      onClick={onSelect}
      style={{
        height: ROW_H, display: 'flex', alignItems: 'center', gap: 6, padding: '0 8px',
        cursor: 'pointer', borderBottom: '1px solid var(--border2)',
        background: selected ? 'rgba(99,102,241,0.1)' : 'transparent',
        borderLeft: selected ? '2px solid #6366f1' : '2px solid transparent',
      }}
    >
      <div style={{ width: 6, height: 6, borderRadius: '50%', background: typeColors[layer.type] ?? '#888', flexShrink: 0 }} />
      <span className="flex-1 truncate" style={{ fontSize: 10, color: 'var(--text)' }}>{layer.name}</span>
      <button
        onClick={(e) => { e.stopPropagation(); toggleVisibility(layer.id) }}
        style={{ color: layer.visible ? 'var(--text2)' : 'var(--text3)', fontSize: 11, lineHeight: 1, flexShrink: 0 }}
        title="Toggle visibility"
      >
        {layer.visible ? '👁' : '🙈'}
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); toggleLock(layer.id) }}
        style={{ color: layer.locked ? '#f59e0b' : 'var(--text3)', fontSize: 11, lineHeight: 1, flexShrink: 0 }}
        title="Toggle lock"
      >
        {layer.locked ? '🔒' : '🔓'}
      </button>
    </div>
  )
}

function TrackRow({ layer, fpx, totalWidth, selected, currentFrame, onKfMouseDown, onKfContextMenu, onClick }: {
  layer: Layer; fpx: number; totalWidth: number; selected: boolean; currentFrame: number
  onKfMouseDown: (e: React.MouseEvent, layerId: string, frame: number) => void
  onKfContextMenu: (e: React.MouseEvent, layerId: string, frame: number) => void
  onClick: () => void
}) {
  return (
    <div
      onClick={onClick}
      style={{
        height: ROW_H, position: 'relative', width: totalWidth,
        borderBottom: '1px solid var(--border2)',
        background: selected ? 'rgba(99,102,241,0.05)' : 'transparent',
        cursor: 'pointer',
      }}
    >
      {/* Keyframe bar (between first and last kf) */}
      {layer.keyframes.length >= 2 && (() => {
        const sorted = [...layer.keyframes].sort((a, b) => a.frame - b.frame)
        const x1 = sorted[0].frame * fpx
        const x2 = sorted[sorted.length - 1].frame * fpx
        return (
          <div style={{
            position: 'absolute', left: x1, width: x2 - x1, top: ROW_H / 2 - 2, height: 4,
            background: 'rgba(99,102,241,0.3)', borderRadius: 2, pointerEvents: 'none',
          }} />
        )
      })()}

      {/* Keyframes */}
      {layer.keyframes.map((kf) => (
        <div
          key={kf.frame}
          className={`kf-diamond ${kf.frame === currentFrame ? 'active' : ''}`}
          style={{ left: kf.frame * fpx }}
          onMouseDown={(e) => { e.stopPropagation(); onKfMouseDown(e, layer.id, kf.frame) }}
          onContextMenu={(e) => onKfContextMenu(e, layer.id, kf.frame)}
          onClick={(e) => e.stopPropagation()}
          title={`Frame ${kf.frame} (${kf.easing})`}
        />
      ))}
    </div>
  )
}
