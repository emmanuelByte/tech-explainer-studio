import { useRef, useState, useCallback, useEffect } from 'react'
import { useStore } from '../store'
import { Layer, TimelineMarker, LAYER_TYPE_COLOR, TransformProps, DEFAULT_TRANSFORM } from '../types'
import { interpolateProps } from '../remotion/interpolateProps'
import {
  DndContext, closestCenter, DragEndEvent,
  PointerSensor, useSensor, useSensors,
} from '@dnd-kit/core'
import {
  SortableContext, verticalListSortingStrategy,
  useSortable, arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

const BASE_FPX = 4
const RULER_H = 24
const LABEL_W = 150
const ROW_H = 28
const SUBTRACK_H = 22
const MIN_TL_H = 120
const MAX_TL_H_RATIO = 0.6
const BAR_HANDLE_W = 6
const SNAP_FRAMES = 5

// ── Property metadata ──────────────────────────────────────────────────────
const PROP_GROUPS: { label: string; color: string; keys: (keyof TransformProps)[] }[] = [
  {
    label: 'Transform',
    color: '#6366f1',
    keys: ['x', 'y', 'scale', 'opacity', 'rotateX', 'rotateY', 'rotateZ', 'skewX', 'skewY', 'perspective', 'originX', 'originY'],
  },
  {
    label: 'Effects',
    color: '#06b6d4',
    keys: ['blur', 'backdropBlur', 'brightness', 'contrast', 'grayscale', 'shadowX', 'shadowY', 'shadowBlur', 'shadowSpread'],
  },
]

const PROP_LABELS: Partial<Record<keyof TransformProps, string>> = {
  x: 'X', y: 'Y', scale: 'Scale', opacity: 'Opacity',
  rotateX: 'Rot X', rotateY: 'Rot Y', rotateZ: 'Rot Z',
  skewX: 'Skew X', skewY: 'Skew Y', perspective: 'Persp.',
  originX: 'Origin X', originY: 'Origin Y',
  blur: 'Blur', backdropBlur: 'Backdrop', brightness: 'Brightness',
  contrast: 'Contrast', grayscale: 'Grayscale',
  shadowX: 'Shadow X', shadowY: 'Shadow Y', shadowBlur: 'Shad Blur',
  shadowSpread: 'Shad Spd', charProgress: 'Char',
}

function getChangingProps(layer: Layer): (keyof TransformProps)[] {
  if (layer.keyframes.length < 2) return []
  const keys = Object.keys(DEFAULT_TRANSFORM) as (keyof TransformProps)[]
  return keys.filter((k) => {
    const vals = layer.keyframes.map((kf) => kf.props[k])
    return vals.some((v) => v !== vals[0])
  })
}

function savedTimelineH() {
  const v = localStorage.getItem('tl-h')
  return v ? Math.max(MIN_TL_H, parseInt(v)) : 200
}

// ── Icons ──────────────────────────────────────────────────────────────────
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

// ── Context menus ──────────────────────────────────────────────────────────
interface KfContextMenu {
  x: number; y: number; layerId: string; frame: number
  showEasing?: boolean
}
interface BarContextMenu { x: number; y: number; layerId: string }

// ── Bar drag ──────────────────────────────────────────────────────────────
interface BarDragState {
  type: 'left' | 'right' | 'move'
  layerId: string
  startClientX: number
  origStart: number
  origEnd: number
  origKfFrames: number[]
}

// ── Easing picker popup ───────────────────────────────────────────────────
const EASINGS = ['linear', 'ease', 'ease-in', 'ease-out', 'ease-in-out', 'spring', 'bounce'] as const

function EasingPicker({ x, y, layerId, frame, onClose }: {
  x: number; y: number; layerId: string; frame: number; onClose: () => void
}) {
  const { updateKeyframeEasing } = useStore()
  return (
    <div
      style={{
        position: 'fixed', left: x, top: y,
        background: 'var(--panel)', border: '1px solid var(--border)',
        borderRadius: 6, zIndex: 1100, minWidth: 140,
        boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
        padding: '4px 0',
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="px-3 py-1" style={{ color: 'var(--text3)', fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
        Easing
      </div>
      {EASINGS.map((e) => (
        <button key={e} onClick={() => { updateKeyframeEasing(layerId, frame, e); onClose() }}
          className="w-full text-left px-3 py-1.5 text-xs hover:opacity-80"
          style={{ color: 'var(--text)', background: 'transparent', display: 'block' }}>
          {e}
        </button>
      ))}
    </div>
  )
}

// ── Sortable label (with sub-tracks) ──────────────────────────────────────
function SortableLabel({
  layer, selected, currentFrame, onSelect, rowH,
  expanded, onToggleExpand, changingProps,
  onAddSubKf,
}: {
  layer: Layer; selected: boolean; currentFrame: number; onSelect: () => void; rowH: number
  expanded: boolean; onToggleExpand: () => void; changingProps: (keyof TransformProps)[]
  onAddSubKf: (layerId: string) => void
}) {
  const { toggleVisibility, toggleLock } = useStore()
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: layer.id })

  const outOfRange = currentFrame < (layer.startFrame ?? 0) || currentFrame > (layer.endFrame ?? Infinity)
  const hasMultipleKf = layer.keyframes.length >= 2

  return (
    <div
      ref={setNodeRef}
      style={{
        display: 'flex', flexDirection: 'column',
        borderBottom: '1px solid var(--border2)',
        transform: CSS.Transform.toString(transform),
        transition: transition ?? undefined,
        opacity: isDragging ? 0.5 : 1,
        zIndex: isDragging ? 50 : undefined,
      }}
    >
      {/* Main row */}
      <div
        onClick={onSelect}
        style={{
          height: rowH, display: 'flex', alignItems: 'center', gap: 3,
          cursor: 'pointer', paddingLeft: 2, paddingRight: 6,
          background: isDragging
            ? 'rgba(99,102,241,0.18)'
            : selected ? 'rgba(99,102,241,0.1)' : 'transparent',
          borderLeft: selected ? '2px solid #6366f1' : '2px solid transparent',
          overflow: 'hidden',
        }}
      >
        {/* Expand toggle */}
        <button
          onClick={(e) => { e.stopPropagation(); onToggleExpand() }}
          style={{
            width: 14, height: 14, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: hasMultipleKf ? 'var(--text2)' : 'var(--text3)',
            fontSize: 8, background: 'transparent', cursor: hasMultipleKf ? 'pointer' : 'default',
            transform: expanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s',
          }}
          title={hasMultipleKf ? 'Expand sub-tracks' : 'No animated properties'}
        >
          ▶
        </button>

        {/* Drag handle */}
        <span
          {...attributes} {...listeners}
          onClick={(e) => e.stopPropagation()}
          style={{ cursor: 'grab', color: 'var(--text3)', fontSize: 12, flexShrink: 0, touchAction: 'none' }}
        >⠿</span>

        {/* Color dot */}
        <div style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0, background: LAYER_TYPE_COLOR[layer.type] ?? '#888' }} />

        {/* Name */}
        <span className="flex-1 truncate" style={{ fontSize: 10, color: 'var(--text)', opacity: outOfRange ? 0.45 : 1 }}>
          {layer.name}
        </span>

        {/* Actions */}
        <button onClick={(e) => { e.stopPropagation(); toggleVisibility(layer.id) }}
          style={{ color: layer.visible ? 'var(--text2)' : 'var(--text3)', fontSize: 10, lineHeight: 1, flexShrink: 0 }}>
          {layer.visible ? '👁' : '○'}
        </button>
        <button onClick={(e) => { e.stopPropagation(); toggleLock(layer.id) }}
          style={{ color: layer.locked ? '#f59e0b' : 'var(--text3)', fontSize: 10, lineHeight: 1, flexShrink: 0 }}>
          {layer.locked ? '🔒' : '🔓'}
        </button>
      </div>

      {/* Sub-track labels */}
      {expanded && hasMultipleKf && (
        <div>
          {PROP_GROUPS.map((group) => {
            const groupProps = group.keys.filter((k) => changingProps.includes(k))
            if (groupProps.length === 0) return null
            return (
              <div key={group.label}>
                {/* Group header */}
                <div style={{
                  height: 16, display: 'flex', alignItems: 'center', paddingLeft: 28,
                  background: 'rgba(0,0,0,0.15)',
                }}>
                  <span style={{ fontSize: 8, color: group.color, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    {group.label}
                  </span>
                </div>
                {groupProps.map((propKey) => (
                  <div key={propKey} style={{
                    height: SUBTRACK_H, display: 'flex', alignItems: 'center', gap: 4,
                    paddingLeft: 28, paddingRight: 6,
                    borderLeft: `2px solid ${group.color}40`,
                    background: 'rgba(0,0,0,0.08)',
                  }}>
                    <div style={{ width: 3, height: 3, borderRadius: '50%', background: group.color, flexShrink: 0 }} />
                    <span className="flex-1 truncate" style={{ fontSize: 9, color: 'var(--text2)' }}>
                      {PROP_LABELS[propKey] ?? propKey}
                    </span>
                    <button
                      onClick={(e) => { e.stopPropagation(); onAddSubKf(layer.id) }}
                      style={{ fontSize: 10, color: group.color, flexShrink: 0, lineHeight: 1 }}
                      title="Add keyframe at playhead"
                    >+</button>
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Track row (with sub-tracks) ───────────────────────────────────────────
function TrackRow({
  layer, fpx, totalWidth, selected, currentFrame, rowH,
  expanded, changingProps,
  onKfMouseDown, onKfContextMenu, onClick,
  onBarMouseDown, onBarContextMenu,
}: {
  layer: Layer; fpx: number; totalWidth: number; selected: boolean; currentFrame: number; rowH: number
  expanded: boolean; changingProps: (keyof TransformProps)[]
  onKfMouseDown: (e: React.MouseEvent, layerId: string, frame: number) => void
  onKfContextMenu: (e: React.MouseEvent, layerId: string, frame: number, showEasing?: boolean) => void
  onClick: () => void
  onBarMouseDown: (e: React.MouseEvent, layerId: string, type: 'left' | 'right' | 'move') => void
  onBarContextMenu: (e: React.MouseEvent, layerId: string) => void
}) {
  const startF = layer.startFrame ?? 0
  const endF = layer.endFrame ?? (totalWidth / fpx)
  const barLeft = startF * fpx
  const barW = Math.max(4, (endF - startF) * fpx)
  const color = LAYER_TYPE_COLOR[layer.type] ?? '#6366f1'
  const hasMultipleKf = layer.keyframes.length >= 2

  return (
    <div onClick={onClick} style={{ display: 'flex', flexDirection: 'column', width: totalWidth, borderBottom: '1px solid var(--border2)', background: selected ? 'rgba(99,102,241,0.04)' : 'transparent', cursor: 'pointer' }}>
      {/* Main bar row */}
      <div style={{ height: rowH, position: 'relative' }}>
        {/* Layer time bar */}
        <div
          style={{
            position: 'absolute', left: barLeft, width: barW,
            top: rowH / 2 - 6, height: 12,
            background: color + '33', borderRadius: 3, border: `1px solid ${color}66`, userSelect: 'none',
          }}
          onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); onBarContextMenu(e, layer.id) }}
        >
          <div onMouseDown={(e) => { e.stopPropagation(); onBarMouseDown(e, layer.id, 'left') }}
            style={{ position: 'absolute', left: 0, top: 0, width: BAR_HANDLE_W, height: '100%', cursor: 'ew-resize', background: color, borderRadius: '3px 0 0 3px' }} />
          <div onMouseDown={(e) => { e.stopPropagation(); onBarMouseDown(e, layer.id, 'move') }}
            style={{ position: 'absolute', left: BAR_HANDLE_W, right: BAR_HANDLE_W, top: 0, height: '100%', cursor: 'grab' }} />
          <div onMouseDown={(e) => { e.stopPropagation(); onBarMouseDown(e, layer.id, 'right') }}
            style={{ position: 'absolute', right: 0, top: 0, width: BAR_HANDLE_W, height: '100%', cursor: 'ew-resize', background: color, borderRadius: '0 3px 3px 0' }} />
        </div>

        {/* Keyframe connector */}
        {hasMultipleKf && (() => {
          const sorted = [...layer.keyframes].sort((a, b) => a.frame - b.frame)
          const x1 = sorted[0].frame * fpx
          const x2 = sorted[sorted.length - 1].frame * fpx
          return (
            <div style={{ position: 'absolute', left: x1, width: x2 - x1, top: rowH / 2 - 1, height: 2, background: color + '60', borderRadius: 1, pointerEvents: 'none' }} />
          )
        })()}

        {/* Keyframes */}
        {layer.keyframes.map((kf) => (
          <div key={kf.frame}
            className={`kf-diamond ${kf.frame === currentFrame ? 'active' : ''}`}
            style={{ left: kf.frame * fpx, top: rowH / 2 - 5 }}
            onMouseDown={(e) => { e.stopPropagation(); onKfMouseDown(e, layer.id, kf.frame) }}
            onContextMenu={(e) => onKfContextMenu(e, layer.id, kf.frame)}
            onClick={(e) => e.stopPropagation()}
            title={`Frame ${kf.frame} (${kf.easing})`}
          />
        ))}
      </div>

      {/* Sub-track rows */}
      {expanded && hasMultipleKf && (
        <div>
          {PROP_GROUPS.map((group) => {
            const groupProps = group.keys.filter((k) => changingProps.includes(k))
            if (groupProps.length === 0) return null
            return (
              <div key={group.label}>
                {/* Group header track */}
                <div style={{ height: 16, position: 'relative', background: 'rgba(0,0,0,0.15)' }} />
                {groupProps.map((propKey) => {
                  const p0 = layer.keyframes[0]?.props[propKey] as number
                  const pRange = layer.keyframes.map((kf) => kf.props[propKey] as number)
                  const pMin = Math.min(...pRange)
                  const pMax = Math.max(...pRange)

                  return (
                    <div key={propKey} style={{ height: SUBTRACK_H, position: 'relative', background: 'rgba(0,0,0,0.08)', borderLeft: `2px solid ${group.color}30` }}>
                      {/* Mini value line between consecutive keyframes */}
                      {layer.keyframes.length >= 2 && (() => {
                        const sorted = [...layer.keyframes].sort((a, b) => a.frame - b.frame)
                        return sorted.slice(0, -1).map((kf, i) => {
                          const next = sorted[i + 1]
                          const x1 = kf.frame * fpx
                          const x2 = next.frame * fpx
                          const v1 = kf.props[propKey] as number
                          const v2 = next.props[propKey] as number
                          const range = pMax - pMin || 1
                          const y1 = SUBTRACK_H / 2 - ((v1 - pMin) / range - 0.5) * (SUBTRACK_H - 6)
                          const y2 = SUBTRACK_H / 2 - ((v2 - pMin) / range - 0.5) * (SUBTRACK_H - 6)
                          const w = x2 - x1
                          if (w < 2) return null
                          return (
                            <svg key={kf.frame} style={{ position: 'absolute', left: x1, top: 0, width: w, height: SUBTRACK_H, pointerEvents: 'none', overflow: 'visible' }}>
                              <line x1={0} y1={y1} x2={w} y2={y2} stroke={group.color} strokeWidth={1} strokeOpacity={0.6} />
                            </svg>
                          )
                        })
                      })()}

                      {/* Keyframe diamonds on sub-track */}
                      {layer.keyframes.map((kf) => (
                        <div key={kf.frame}
                          className={`kf-diamond ${kf.frame === currentFrame ? 'active' : ''}`}
                          style={{ left: kf.frame * fpx, top: SUBTRACK_H / 2 - 5, width: 8, height: 8 }}
                          onMouseDown={(e) => { e.stopPropagation(); onKfMouseDown(e, layer.id, kf.frame) }}
                          onContextMenu={(e) => onKfContextMenu(e, layer.id, kf.frame, true)}
                          onClick={(e) => e.stopPropagation()}
                          title={`${PROP_LABELS[propKey] ?? propKey}: ${(kf.props[propKey] as number).toFixed(2)}`}
                        />
                      ))}
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Main Timeline ─────────────────────────────────────────────────────────
export function Timeline() {
  const {
    layers, currentFrame, totalFrames, fps, isPlaying,
    selectedLayerIds, timelineZoom, markers,
    setCurrentFrame, setPlaying, setTotalFrames,
    selectLayer, removeKeyframe, moveKeyframe, addKeyframe,
    addMarker, removeMarker,
    setTimelineZoom, loopEnabled, loopIn, loopOut, setLoop, clearLoop, setLoopEnabled,
    updateLayerTimeRange, setLayerRange, duplicateLayer, deleteLayer, reorderLayersById,
  } = useStore()

  const [timelineH, setTimelineH] = useState(savedTimelineH)
  const [kfContextMenu, setKfContextMenu] = useState<KfContextMenu | null>(null)
  const [barContextMenu, setBarContextMenu] = useState<BarContextMenu | null>(null)
  const [copiedKf, setCopiedKf] = useState<{ props: unknown; easing: string } | null>(null)
  const [expandedLayers, setExpandedLayers] = useState<Set<string>>(new Set())

  const scrollRef = useRef<HTMLDivElement>(null)
  const isDragging = useRef(false)
  const kfDrag = useRef<{ layerId: string; fromFrame: number } | null>(null)
  const barDrag = useRef<BarDragState | null>(null)
  const resizeDragging = useRef(false)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

  const fpx = BASE_FPX * timelineZoom
  const totalWidth = totalFrames * fpx
  const reversed = [...layers].reverse()

  function toggleExpand(layerId: string) {
    setExpandedLayers((prev) => {
      const next = new Set(prev)
      if (next.has(layerId)) next.delete(layerId)
      else next.add(layerId)
      return next
    })
  }

  function onAddSubKf(layerId: string) {
    const layer = layers.find((l) => l.id === layerId)
    if (!layer) return
    const p = interpolateProps(currentFrame, layer.keyframes)
    addKeyframe(layerId, currentFrame, { ...p })
  }

  // ── Timeline resize ────────────────────────────────────────────────────
  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      if (!resizeDragging.current) return
      const newH = window.innerHeight - e.clientY
      const clamped = Math.max(MIN_TL_H, Math.min(window.innerHeight * MAX_TL_H_RATIO, newH))
      setTimelineH(clamped)
      localStorage.setItem('tl-h', String(Math.round(clamped)))
    }
    function onMouseUp() { resizeDragging.current = false }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => { window.removeEventListener('mousemove', onMouseMove); window.removeEventListener('mouseup', onMouseUp) }
  }, [])

  // ── Scrub ──────────────────────────────────────────────────────────────
  const frameFromX = useCallback((clientX: number) => {
    const el = scrollRef.current
    if (!el) return 0
    const rect = el.getBoundingClientRect()
    const x = clientX - rect.left + el.scrollLeft
    return Math.max(0, Math.min(totalFrames - 1, Math.round(x / fpx)))
  }, [totalFrames, fpx])

  function onRulerDown(e: React.MouseEvent) { isDragging.current = true; setCurrentFrame(frameFromX(e.clientX)) }
  function onRulerMove(e: React.MouseEvent) { if (isDragging.current) setCurrentFrame(frameFromX(e.clientX)) }
  function onRulerUp() { isDragging.current = false }
  function onRulerContextMenu(e: React.MouseEvent) { e.preventDefault(); addMarker(frameFromX(e.clientX)) }

  // ── Keyframe drag ──────────────────────────────────────────────────────
  function onKfMouseDown(e: React.MouseEvent, layerId: string, frame: number) {
    e.stopPropagation()
    kfDrag.current = { layerId, fromFrame: frame }
  }

  // ── Bar drag ───────────────────────────────────────────────────────────
  function onBarMouseDown(e: React.MouseEvent, layerId: string, type: 'left' | 'right' | 'move') {
    e.stopPropagation()
    const layer = layers.find((l) => l.id === layerId)
    if (!layer) return
    useStore.getState()._snapshot()
    barDrag.current = {
      type, layerId, startClientX: e.clientX,
      origStart: layer.startFrame ?? 0,
      origEnd: layer.endFrame ?? totalFrames,
      origKfFrames: [...layer.keyframes].sort((a, b) => a.frame - b.frame).map((k) => k.frame),
    }
  }

  function snapFrame(f: number): number {
    return Math.abs(f - currentFrame) <= SNAP_FRAMES ? currentFrame : f
  }

  // ── Global mouse events ────────────────────────────────────────────────
  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      if (kfDrag.current) {
        const el = scrollRef.current
        if (!el) return
        const rect = el.getBoundingClientRect()
        const x = e.clientX - rect.left + el.scrollLeft
        const newFrame = Math.max(0, Math.min(totalFrames - 1, Math.round(x / fpx)))
        if (newFrame !== kfDrag.current.fromFrame) {
          moveKeyframe(kfDrag.current.layerId, kfDrag.current.fromFrame, newFrame)
          kfDrag.current = { ...kfDrag.current, fromFrame: newFrame }
        }
        return
      }
      if (barDrag.current) {
        const { type, layerId, startClientX, origStart, origEnd, origKfFrames } = barDrag.current
        const dx = e.clientX - startClientX
        const deltaF = Math.round(dx / fpx)
        if (type === 'left') {
          updateLayerTimeRange(layerId, snapFrame(Math.max(0, Math.min(origEnd - 1, origStart + deltaF))), origEnd)
        } else if (type === 'right') {
          updateLayerTimeRange(layerId, origStart, snapFrame(Math.max(origStart + 1, Math.min(totalFrames, origEnd + deltaF))))
        } else {
          const dur = origEnd - origStart
          const newStart = Math.max(0, origStart + deltaF)
          const newEnd = Math.min(totalFrames, newStart + dur)
          setLayerRange(layerId, newStart, newEnd, origKfFrames.map((f) => Math.max(0, f + (newStart - origStart))))
        }
      }
    }
    function onMouseUp() { kfDrag.current = null; barDrag.current = null }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => { window.removeEventListener('mousemove', onMouseMove); window.removeEventListener('mouseup', onMouseUp) }
  }, [totalFrames, fpx, moveKeyframe, updateLayerTimeRange, setLayerRange, currentFrame])

  // ── Context menu auto-close ────────────────────────────────────────────
  useEffect(() => {
    if (!kfContextMenu && !barContextMenu) return
    function close() { setKfContextMenu(null); setBarContextMenu(null) }
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [kfContextMenu, barContextMenu])

  // ── Auto-scroll playhead ───────────────────────────────────────────────
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const px = currentFrame * fpx
    if (px < el.scrollLeft || px > el.scrollLeft + el.clientWidth - 40) {
      el.scrollLeft = Math.max(0, px - el.clientWidth / 2)
    }
  }, [currentFrame, fpx])

  // ── DnD reorder ───────────────────────────────────────────────────────
  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIdx = reversed.findIndex((l) => l.id === active.id)
    const newIdx = reversed.findIndex((l) => l.id === over.id)
    reorderLayersById([...arrayMove(reversed, oldIdx, newIdx)].reverse().map((l) => l.id))
  }

  // ── Ruler marks ───────────────────────────────────────────────────────
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

  const durationSec = totalFrames / fps

  return (
    <div style={{
      background: 'var(--timeline)', borderTop: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column', flexShrink: 0,
      height: timelineH, minHeight: MIN_TL_H, position: 'relative',
    }}>
      {/* Resize handle */}
      <div
        onMouseDown={() => { resizeDragging.current = true }}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4, cursor: 'row-resize', zIndex: 20, background: 'transparent' }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'rgba(99,102,241,0.35)' }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'transparent' }}
      />

      {/* Control bar */}
      <div className="flex items-center gap-2 px-3 py-1.5 flex-shrink-0"
        style={{ borderBottom: '1px solid var(--border)', background: 'var(--panel)', marginTop: 4 }}>
        <button onClick={() => setPlaying(!isPlaying)}
          className="w-7 h-7 flex items-center justify-center rounded transition-colors"
          style={{ background: '#6366f1', color: '#fff' }}>
          {isPlaying ? <PauseIcon /> : <PlayIcon />}
        </button>
        <span className="font-mono text-xs" style={{ color: 'var(--text3)', minWidth: 80 }}>
          {currentFrame} / {totalFrames - 1}
        </span>

        <button onClick={() => setLoopEnabled(!loopEnabled)}
          className="text-xs rounded px-2 py-1 transition-colors"
          style={{
            background: loopEnabled ? 'rgba(99,102,241,0.15)' : 'var(--input)',
            color: loopEnabled ? '#6366f1' : 'var(--text2)',
            border: `1px solid ${loopEnabled ? '#6366f1' : 'var(--border)'}`,
          }}>↺ Loop</button>
        {loopEnabled && (loopIn !== null || loopOut !== null) && (
          <button onClick={clearLoop} className="text-xs" style={{ color: 'var(--text3)' }}>✕</button>
        )}

        <div className="flex-1" />

        <button onClick={() => setTimelineZoom(Math.max(0.25, timelineZoom / 1.5))} className="p-1 rounded" style={{ color: 'var(--text2)' }}><ZoomOutIcon /></button>
        <span className="text-xs" style={{ color: 'var(--text3)' }}>{Math.round(timelineZoom * 100)}%</span>
        <button onClick={() => setTimelineZoom(Math.min(8, timelineZoom * 1.5))} className="p-1 rounded" style={{ color: 'var(--text2)' }}><ZoomInIcon /></button>

        <div className="flex items-center gap-1.5 ml-2">
          <span className="text-xs" style={{ color: 'var(--text3)' }}>Dur</span>
          <input type="number" min={1} max={300} value={Math.round(durationSec)}
            onChange={(e) => setTotalFrames(Math.max(1, Number(e.target.value)) * fps)}
            className="input-base w-12 text-right" />
          <span className="text-xs" style={{ color: 'var(--text3)' }}>s</span>
        </div>
      </div>

      {/* Tracks area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Label column */}
        <div className="flex flex-col flex-shrink-0" style={{ width: LABEL_W, borderRight: '1px solid var(--border)', overflow: 'hidden' }}>
          <div style={{ height: RULER_H, flexShrink: 0, borderBottom: '1px solid var(--border2)' }} />
          <div className="flex-1 overflow-y-auto overflow-x-hidden" style={{ overflowY: 'auto' }}>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={reversed.map((l) => l.id)} strategy={verticalListSortingStrategy}>
                {reversed.map((layer) => (
                  <SortableLabel
                    key={layer.id}
                    layer={layer}
                    selected={selectedLayerIds.includes(layer.id)}
                    currentFrame={currentFrame}
                    onSelect={() => selectLayer(layer.id)}
                    rowH={ROW_H}
                    expanded={expandedLayers.has(layer.id)}
                    onToggleExpand={() => toggleExpand(layer.id)}
                    changingProps={getChangingProps(layer)}
                    onAddSubKf={onAddSubKf}
                  />
                ))}
              </SortableContext>
            </DndContext>
          </div>
        </div>

        {/* Scrollable tracks */}
        <div ref={scrollRef} className="flex-1 overflow-x-auto overflow-y-auto" style={{ position: 'relative', cursor: 'default' }}>
          <div style={{ width: Math.max(totalWidth, 400), position: 'relative' }}>
            {/* Ruler */}
            <div
              style={{ height: RULER_H, position: 'relative', borderBottom: '1px solid var(--border2)', cursor: 'col-resize', userSelect: 'none', flexShrink: 0 }}
              onMouseDown={onRulerDown} onMouseMove={onRulerMove} onMouseUp={onRulerUp}
              onMouseLeave={onRulerUp} onContextMenu={onRulerContextMenu}
            >
              {rulerMarks}
              {loopEnabled && loopIn !== null && loopOut !== null && (
                <div style={{ position: 'absolute', left: loopIn * fpx, width: (loopOut - loopIn) * fpx, top: 0, bottom: 0, background: 'rgba(99,102,241,0.15)', borderLeft: '2px solid #6366f1', borderRight: '2px solid #6366f1', pointerEvents: 'none' }} />
              )}
              {markers.map((m: TimelineMarker) => (
                <div key={m.id} style={{ position: 'absolute', left: m.frame * fpx, top: 0, zIndex: 5 }}>
                  <div title={`${m.label} (frame ${m.frame})`}
                    style={{ width: 0, height: 0, borderLeft: '5px solid transparent', borderRight: '5px solid transparent', borderTop: `8px solid ${m.color}`, cursor: 'pointer' }}
                    onClick={(e) => { e.stopPropagation(); setCurrentFrame(m.frame) }}
                    onContextMenu={(e) => { e.preventDefault(); removeMarker(m.id) }}
                  />
                </div>
              ))}
            </div>

            {/* Track rows — same order as label column */}
            {reversed.map((layer) => (
              <TrackRow
                key={layer.id}
                layer={layer} fpx={fpx} totalWidth={totalWidth}
                selected={selectedLayerIds.includes(layer.id)}
                currentFrame={currentFrame} rowH={ROW_H}
                expanded={expandedLayers.has(layer.id)}
                changingProps={getChangingProps(layer)}
                onKfMouseDown={onKfMouseDown}
                onKfContextMenu={(e: React.MouseEvent, layerId: string, frame: number, showEasing?: boolean) => {
                  e.preventDefault(); e.stopPropagation()
                  setKfContextMenu({ x: e.clientX, y: e.clientY, layerId, frame, showEasing })
                }}
                onClick={() => selectLayer(layer.id)}
                onBarMouseDown={onBarMouseDown}
                onBarContextMenu={(e, layerId) => setBarContextMenu({ x: e.clientX, y: e.clientY, layerId })}
              />
            ))}

            {/* Playhead */}
            <div style={{ position: 'absolute', top: 0, left: currentFrame * fpx, width: 1, bottom: 0, background: '#ef4444', pointerEvents: 'none', zIndex: 10 }}>
              <div style={{ position: 'absolute', top: 0, left: -4, width: 8, height: 10, background: '#ef4444', clipPath: 'polygon(50% 100%, 0 0, 100% 0)' }} />
            </div>
          </div>
        </div>
      </div>

      {/* Keyframe context menu */}
      {kfContextMenu && !kfContextMenu.showEasing && (
        <div style={{ position: 'fixed', left: kfContextMenu.x, top: kfContextMenu.y, background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 6, zIndex: 1000, minWidth: 160, boxShadow: '0 4px 20px rgba(0,0,0,0.3)' }}
          onClick={(e) => e.stopPropagation()}>
          {[
            { label: 'Delete keyframe', danger: true, action: () => { removeKeyframe(kfContextMenu.layerId, kfContextMenu.frame); setKfContextMenu(null) } },
            { label: 'Copy keyframe', danger: false, action: () => { const l = layers.find((x) => x.id === kfContextMenu.layerId); const kf = l?.keyframes.find((k) => k.frame === kfContextMenu.frame); if (kf) setCopiedKf({ props: kf.props, easing: kf.easing }); setKfContextMenu(null) } },
            ...(copiedKf ? [{ label: 'Paste keyframe', danger: false, action: () => { useStore.getState().addKeyframe(kfContextMenu.layerId, kfContextMenu.frame, copiedKf.props as never, copiedKf.easing); setKfContextMenu(null) } }] : []),
            { label: 'Set easing…', danger: false, action: () => setKfContextMenu((m) => m ? { ...m, showEasing: true } : m) },
          ].map(({ label, action, danger }) => (
            <button key={label} onClick={action} className="w-full text-left px-3 py-2 text-xs hover:opacity-80"
              style={{ color: danger ? '#ef4444' : 'var(--text)', background: 'transparent', display: 'block' }}>{label}</button>
          ))}
        </div>
      )}

      {/* Easing picker */}
      {kfContextMenu?.showEasing && (
        <EasingPicker
          x={kfContextMenu.x} y={kfContextMenu.y}
          layerId={kfContextMenu.layerId} frame={kfContextMenu.frame}
          onClose={() => setKfContextMenu(null)}
        />
      )}

      {/* Bar context menu */}
      {barContextMenu && (
        <div style={{ position: 'fixed', left: barContextMenu.x, top: barContextMenu.y, background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 6, zIndex: 1000, minWidth: 180, boxShadow: '0 4px 20px rgba(0,0,0,0.3)' }}
          onClick={(e) => e.stopPropagation()}>
          {[
            { label: 'Set in point to playhead', danger: false, action: () => { const l = layers.find((x) => x.id === barContextMenu.layerId); if (l) updateLayerTimeRange(l.id, currentFrame, l.endFrame ?? totalFrames); setBarContextMenu(null) } },
            { label: 'Set out point to playhead', danger: false, action: () => { const l = layers.find((x) => x.id === barContextMenu.layerId); if (l) updateLayerTimeRange(l.id, l.startFrame ?? 0, currentFrame); setBarContextMenu(null) } },
            { label: 'Duplicate layer', danger: false, action: () => { duplicateLayer(barContextMenu.layerId); setBarContextMenu(null) } },
            { label: 'Delete layer', danger: true, action: () => { deleteLayer(barContextMenu.layerId); setBarContextMenu(null) } },
          ].map(({ label, action, danger }) => (
            <button key={label} onClick={action} className="w-full text-left px-3 py-2 text-xs hover:opacity-80"
              style={{ color: danger ? '#ef4444' : 'var(--text)', background: 'transparent', display: 'block' }}>{label}</button>
          ))}
        </div>
      )}
    </div>
  )
}
