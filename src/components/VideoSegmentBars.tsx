import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Pause, Scissors } from 'lucide-react'
import { createPortal } from 'react-dom'
import { useStore } from '../store'
import { Layer, SpeedEasing, VideoSegment, LAYER_TYPE_COLOR } from '../types'

/* ──────────────────────────────────────────────────────────────
   Per-segment bars for a video layer's row in the Timeline.
     - Each segment renders as a separate bar within the layer row
     - Left/right edge handles → trim (changes speed)
     - Alt + edge handle → slip (preserves speed, moves source window)
     - Body drag → move whole segment along comp timeline
     - Speed badge in corner (❄ for freeze, "2×" / "0.5×" etc.)
     - Click → jumps playhead to segment start, selects layer
     - Right-click → context menu (Split / Freeze / Speed / Duplicate / Delete / Reset)
   ────────────────────────────────────────────────────────────── */

const SPEED_PRESETS = [0.25, 0.5, 1, 2, 4]
const SEG_GAP_PX = 2 // visual gap between adjacent segments (purely cosmetic, real gaps still expressed in frames)

interface DragState {
  kind: 'left' | 'right' | 'move'
  segmentId: string
  startX: number
  origTimelineStart: number
  origTimelineEnd: number
  origSourceStart: number
  origSourceEnd: number
  altKey: boolean
  didMove: boolean
}

export function VideoSegmentBars({
  layer, fpx, timelineOffset, rowH, currentFrame, color: colorOverride, onClickLayer,
}: {
  layer: Layer
  fpx: number
  timelineOffset: number
  rowH: number
  currentFrame: number
  color?: string
  onClickLayer: () => void
}) {
  const { t } = useTranslation()
  const {
    selectSegmentSpeed,
    setSegmentTimelineRange, setSegmentSourceRange, moveVideoSegment,
    setSegmentSpeed, splitVideoAt, freezeSegment, duplicateVideoSegment,
    removeVideoSegment, resetVideoCut, setCurrentFrame,
    moveSegmentSpeedKeyframe, removeSegmentSpeedKeyframe, setSegmentSpeedKeyframeEasing,
    beginInteraction, endInteraction,
  } = useStore()

  const segments = layer.videoSegments ?? []
  const baseColor = colorOverride ?? LAYER_TYPE_COLOR[layer.type] ?? '#0d99ff'
  const barH = Math.min(18, Math.max(12, Math.round(rowH * 0.42)))
  const dragRef = useRef<DragState | null>(null)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; segmentId: string } | null>(null)
  const [speedSubmenuOpen, setSpeedSubmenuOpen] = useState(false)
  const [kfMenu, setKfMenu] = useState<{ x: number; y: number; segmentId: string; frame: number; easing: SpeedEasing } | null>(null)
  // CapCut-style hover-split: which segment is currently hovered. If it also
  // contains the playhead, we render a scissors affordance above the playhead.
  const [hoveredSegmentId, setHoveredSegmentId] = useState<string | null>(null)

  const frameX = (f: number) => timelineOffset + f * fpx

  function startDrag(e: React.MouseEvent, segment: VideoSegment, kind: 'left' | 'right' | 'move') {
    e.preventDefault()
    e.stopPropagation()
    dragRef.current = {
      kind,
      segmentId: segment.id,
      startX: e.clientX,
      origTimelineStart: segment.timelineStartFrame,
      origTimelineEnd: segment.timelineEndFrame,
      origSourceStart: segment.sourceStartFrame,
      origSourceEnd: segment.sourceEndFrame,
      altKey: e.altKey,
      didMove: false,
    }
    beginInteraction(true)
  }

  useEffect(() => {
    function onMove(e: MouseEvent) {
      const d = dragRef.current
      if (!d) return
      const dx = e.clientX - d.startX
      const deltaFrames = Math.round(dx / Math.max(0.001, fpx))
      if (Math.abs(deltaFrames) >= 1) d.didMove = true
      const slip = e.altKey || d.altKey

      if (d.kind === 'move') {
        // Body drag = move whole segment, sources unchanged
        moveVideoSegment(layer.id, d.segmentId, deltaFrames - (d.origTimelineStart - d.origTimelineStart))
        // Simpler: compute new start, send absolute via setSegmentTimelineRange with preserveSpeed=true
        // but moveVideoSegment already handles delta semantics.
        return
      }

      if (d.kind === 'left') {
        if (slip) {
          // Slip: timeline range fixed, source moves by deltaFrames (in source space).
          const nextSrcStart = Math.max(0, d.origSourceStart + deltaFrames)
          const nextSrcEnd = nextSrcStart + (d.origSourceEnd - d.origSourceStart)
          setSegmentSourceRange(layer.id, d.segmentId, nextSrcStart, nextSrcEnd)
        } else {
          // Trim left edge: keeps speed, sourceStart moves with timelineStart so visible content stays in place
          const newStart = d.origTimelineStart + deltaFrames
          setSegmentTimelineRange(layer.id, d.segmentId, newStart, d.origTimelineEnd, { preserveSpeed: true })
        }
        return
      }

      if (d.kind === 'right') {
        if (slip) {
          const nextSrcStart = Math.max(0, d.origSourceStart + deltaFrames)
          const nextSrcEnd = nextSrcStart + (d.origSourceEnd - d.origSourceStart)
          setSegmentSourceRange(layer.id, d.segmentId, nextSrcStart, nextSrcEnd)
        } else {
          // Trim right edge: keeps speed, sourceEnd scales with timelineEnd
          const newEnd = d.origTimelineEnd + deltaFrames
          setSegmentTimelineRange(layer.id, d.segmentId, d.origTimelineStart, newEnd, { preserveSpeed: true })
        }
      }
    }
    function onUp() {
      if (dragRef.current) {
        endInteraction()
        dragRef.current = null
      }
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fpx, layer.id])

  function speedBadge(speed: number) {
    if (speed === 0) return <Pause size={8} fill="currentColor" stroke="none" />
    if (Math.abs(speed - 1) < 0.005) return null
    return <span style={{ fontSize: 8, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{speed.toFixed(speed < 1 ? 2 : 1).replace(/\.?0+$/, '')}×</span>
  }

  return (
    <>
      {segments.map((seg) => {
        const speed = selectSegmentSpeed(seg)
        const isFrozen = speed === 0
        const left = frameX(seg.timelineStartFrame) + SEG_GAP_PX / 2
        const width = Math.max(8, (seg.timelineEndFrame - seg.timelineStartFrame) * fpx - SEG_GAP_PX)
        const containsPlayhead = currentFrame >= seg.timelineStartFrame && currentFrame < seg.timelineEndFrame
        const segColor = isFrozen ? '#3b82f6' : baseColor

        const showSplitAffordance = hoveredSegmentId === seg.id && containsPlayhead
          && currentFrame > seg.timelineStartFrame
          && currentFrame < seg.timelineEndFrame - 1
        // Position of scissors button INSIDE the bar (bar-local coordinates).
        // The bar starts at `left = frameX(timelineStart) + GAP/2`, so the
        // playhead at frame F sits at local x = (F - timelineStart) * fpx - GAP/2.
        const playheadLocalX = (currentFrame - seg.timelineStartFrame) * fpx - SEG_GAP_PX / 2

        return (
          <div
            key={seg.id}
            data-segment-id={seg.id}
            onMouseEnter={() => setHoveredSegmentId(seg.id)}
            onMouseLeave={() => setHoveredSegmentId((id) => id === seg.id ? null : id)}
            onContextMenu={(e) => {
              e.preventDefault()
              e.stopPropagation()
              setContextMenu({ x: e.clientX, y: e.clientY, segmentId: seg.id })
              setSpeedSubmenuOpen(false)
            }}
            onClick={(e) => {
              if (dragRef.current?.didMove) return
              e.stopPropagation()
              onClickLayer()
              setCurrentFrame(seg.timelineStartFrame)
            }}
            style={{
              position: 'absolute',
              left, width,
              top: rowH / 2 - barH / 2,
              height: barH,
              background: segColor + (containsPlayhead ? '55' : '33'),
              border: `1px solid ${segColor}${containsPlayhead ? 'cc' : '88'}`,
              borderRadius: 3,
              cursor: 'pointer',
              userSelect: 'none',
              overflow: 'visible', // allow scissors affordance to peek above the bar
            }}
            title={t('segment.slipHint')}
          >
            {/* Left edge handle */}
            <div
              onMouseDown={(e) => startDrag(e, seg, 'left')}
              style={{
                position: 'absolute', left: -1, top: -1, bottom: -1, width: 6,
                cursor: 'ew-resize', background: segColor, borderRadius: '3px 0 0 3px',
                zIndex: 3,
              }}
            />
            {/* Body drag */}
            <div
              onMouseDown={(e) => startDrag(e, seg, 'move')}
              style={{ position: 'absolute', left: 6, right: 6, top: 0, bottom: 0, cursor: 'grab' }}
            />
            {/* Right edge handle */}
            <div
              onMouseDown={(e) => startDrag(e, seg, 'right')}
              style={{
                position: 'absolute', right: -1, top: -1, bottom: -1, width: 6,
                cursor: 'ew-resize', background: segColor, borderRadius: '0 3px 3px 0',
                zIndex: 3,
              }}
            />
            {/* Speed badge */}
            {(isFrozen || Math.abs(speed - 1) > 0.005) && width > 28 && (
              <div
                style={{
                  position: 'absolute', top: 1, right: 8,
                  height: 12, padding: '0 3px',
                  background: 'rgba(0,0,0,0.55)', color: '#fff',
                  borderRadius: 2,
                  display: 'flex', alignItems: 'center', gap: 2,
                  pointerEvents: 'none',
                  zIndex: 2,
                }}
              >
                {speedBadge(speed)}
              </div>
            )}

            {/* CapCut-style hover-split affordance: visible only when this
                segment is hovered AND the playhead is currently over it.
                A scissors button hovers above the playhead column. Click
                splits the segment at the playhead. */}
            {showSplitAffordance && (
              <button
                type="button"
                onMouseDown={(e) => { e.stopPropagation() }}
                onClick={(e) => {
                  e.stopPropagation()
                  splitVideoAt(layer.id, currentFrame)
                }}
                title={t('segment.splitAtPlayhead')}
                style={{
                  position: 'absolute',
                  left: playheadLocalX - 9, // 18px wide → center on playhead
                  top: -22,
                  width: 18, height: 18,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: 'var(--panel)',
                  color: 'var(--accent)',
                  border: '1px solid var(--accent)',
                  borderRadius: '50%',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.35)',
                  cursor: 'pointer',
                  zIndex: 6,
                  padding: 0,
                  transition: 'transform 0.08s ease',
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.1)' }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)' }}
              >
                <Scissors size={10} />
              </button>
            )}
          </div>
        )
      })}

      {/* Speed keyframe diamonds — rendered as siblings of segment bars so
          they sit above the bars and can carry their own drag interactions.
          Diamonds are color-coded: orange for normal speed change, blue for
          freeze (value = 0). */}
      {segments.flatMap((seg) => (seg.speedKeyframes ?? []).map((kf) => {
        const x = frameX(kf.frame)
        const isFreezeKf = kf.value === 0
        const color = isFreezeKf ? '#3b82f6' : '#f59e0b'
        return (
          <SpeedKfDiamond
            key={`${seg.id}-${kf.frame}`}
            x={x}
            top={rowH / 2 - barH / 2 - 10}
            color={color}
            value={kf.value}
            easing={kf.easing}
            isLinear={kf.easing === 'linear'}
            onClick={(e) => {
              e.stopPropagation()
              setCurrentFrame(kf.frame)
            }}
            onContextMenu={(e) => {
              e.preventDefault()
              e.stopPropagation()
              setKfMenu({ x: e.clientX, y: e.clientY, segmentId: seg.id, frame: kf.frame, easing: kf.easing })
            }}
            onDragMove={(deltaFrames) => {
              const next = kf.frame + Math.round(deltaFrames)
              if (next !== kf.frame) moveSegmentSpeedKeyframe(layer.id, seg.id, kf.frame, next)
            }}
            fpx={fpx}
          />
        )
      }))}

      {/* Speed keyframe context menu */}
      {kfMenu && createPortal(
        <>
          <div
            onClick={() => setKfMenu(null)}
            onContextMenu={(e) => { e.preventDefault(); setKfMenu(null) }}
            style={{ position: 'fixed', inset: 0, zIndex: 4000 }}
          />
          <FlippablePopover
            anchorX={kfMenu.x}
            anchorY={kfMenu.y}
            minWidth={180}
            onClick={(e) => e.stopPropagation()}
          >
            <MenuItem
              onClick={() => {
                setSegmentSpeedKeyframeEasing(layer.id, kfMenu.segmentId, kfMenu.frame, kfMenu.easing === 'step' ? 'linear' : 'step')
                setKfMenu(null)
              }}
            >
              {kfMenu.easing === 'step' ? t('segment.easingLinear') : t('segment.easingStep')}
            </MenuItem>
            <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
            <MenuItem
              onClick={() => { removeSegmentSpeedKeyframe(layer.id, kfMenu.segmentId, kfMenu.frame); setKfMenu(null) }}
              danger
            >
              {t('segment.deleteKeyframe')}
            </MenuItem>
          </FlippablePopover>
        </>,
        document.body,
      )}

      {/* Context menu */}
      {contextMenu && createPortal(
        <>
          <div
            onClick={() => { setContextMenu(null); setSpeedSubmenuOpen(false) }}
            onContextMenu={(e) => { e.preventDefault(); setContextMenu(null); setSpeedSubmenuOpen(false) }}
            style={{ position: 'fixed', inset: 0, zIndex: 4000 }}
          />
          <FlippablePopover
            anchorX={contextMenu.x}
            anchorY={contextMenu.y}
            minWidth={200}
            onClick={(e) => e.stopPropagation()}
          >
            <MenuItem onClick={() => { splitVideoAt(layer.id, currentFrame); setContextMenu(null) }}>
              {t('segment.splitAtPlayhead')}
            </MenuItem>
            <MenuItem onClick={() => { freezeSegment(layer.id, contextMenu.segmentId); setContextMenu(null) }}>
              {t('segment.freeze')}
            </MenuItem>
            <SubmenuRow
              label={t('segment.speedMenu')}
              open={speedSubmenuOpen}
              onToggle={() => setSpeedSubmenuOpen((o) => !o)}
            >
              {SPEED_PRESETS.map((p) => (
                <MenuItem
                  key={p}
                  onClick={() => { setSegmentSpeed(layer.id, contextMenu.segmentId, p); setContextMenu(null) }}
                >
                  {p === 1 ? t('segment.normal') : `${p}×`}
                </MenuItem>
              ))}
            </SubmenuRow>
            <MenuItem onClick={() => { duplicateVideoSegment(layer.id, contextMenu.segmentId); setContextMenu(null) }}>
              {t('segment.duplicate')}
            </MenuItem>
            <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
            <MenuItem
              onClick={() => { removeVideoSegment(layer.id, contextMenu.segmentId); setContextMenu(null) }}
              danger
              disabled={segments.length <= 1}
            >
              {t('segment.delete')}
            </MenuItem>
            <MenuItem onClick={() => { resetVideoCut(layer.id); setContextMenu(null) }}>
              {t('segment.reset')}
            </MenuItem>
          </FlippablePopover>
        </>,
        document.body,
      )}
    </>
  )
}

/* ──────────────────────────────────────────────────────────────
   FlippablePopover — fixed-position menu that measures itself
   after mount and clamps/flips to stay inside the viewport.
   Anchors at (anchorX, anchorY); prefers below+right of anchor,
   flips up if below the bottom edge, flips left if past the right.
   ────────────────────────────────────────────────────────────── */
function FlippablePopover({
  anchorX, anchorY, minWidth = 180, children, onClick,
}: {
  anchorX: number
  anchorY: number
  minWidth?: number
  children: React.ReactNode
  onClick?: (e: React.MouseEvent) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const margin = 6
    const vw = window.innerWidth
    const vh = window.innerHeight

    let left = anchorX
    let top = anchorY

    // Flip horizontally if would overflow right edge
    if (left + rect.width > vw - margin) {
      left = Math.max(margin, anchorX - rect.width)
    }
    // Flip vertically if would overflow bottom edge
    if (top + rect.height > vh - margin) {
      top = Math.max(margin, anchorY - rect.height)
    }
    // Final clamp
    left = Math.max(margin, Math.min(left, vw - rect.width - margin))
    top = Math.max(margin, Math.min(top, vh - rect.height - margin))

    setPos({ left, top })
  }, [anchorX, anchorY])

  return (
    <div
      ref={ref}
      onClick={onClick}
      style={{
        position: 'fixed',
        left: pos?.left ?? anchorX,
        top: pos?.top ?? anchorY,
        minWidth,
        background: 'var(--panel)',
        border: '1px solid var(--border)',
        borderRadius: 4,
        boxShadow: '0 12px 36px rgba(0,0,0,0.4)',
        padding: 4,
        zIndex: 4001,
        // Hide until measured to avoid the brief flash at the off-screen anchor.
        visibility: pos ? 'visible' : 'hidden',
      }}
    >
      {children}
    </div>
  )
}

/* Submenu row — opens to the right by default; flips left if there's
   not enough room. Vertically tries to align with the row, flips up
   if it would overflow the bottom. */
function SubmenuRow({
  label, open, onToggle, children,
}: {
  label: string
  open: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  const rowRef = useRef<HTMLDivElement>(null)
  const subRef = useRef<HTMLDivElement>(null)
  const [side, setSide] = useState<'right' | 'left'>('right')
  const [verticalShift, setVerticalShift] = useState(0)

  useLayoutEffect(() => {
    if (!open) return
    const row = rowRef.current
    const sub = subRef.current
    if (!row || !sub) return
    const rowRect = row.getBoundingClientRect()
    const subRect = sub.getBoundingClientRect()
    const margin = 6
    const vw = window.innerWidth
    const vh = window.innerHeight

    // Horizontal: prefer right of row, flip to left if no room
    const fitsRight = rowRect.right + subRect.width + margin <= vw
    setSide(fitsRight ? 'right' : 'left')

    // Vertical: align with row top, then shift up if would overflow bottom
    const desiredTop = rowRect.top
    const overflow = desiredTop + subRect.height - (vh - margin)
    setVerticalShift(overflow > 0 ? -overflow : 0)
  }, [open])

  return (
    <div ref={rowRef} style={{ position: 'relative' }}>
      <MenuItem
        onClick={onToggle}
        trailing={<span style={{ color: 'var(--text3)', fontSize: 9 }}>▸</span>}
      >
        {label}
      </MenuItem>
      {open && (
        <div
          ref={subRef}
          style={{
            position: 'absolute',
            top: verticalShift,
            ...(side === 'right' ? { left: '100%', marginLeft: 2 } : { right: '100%', marginRight: 2 }),
            minWidth: 100,
            background: 'var(--panel)',
            border: '1px solid var(--border)',
            borderRadius: 4,
            boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
            padding: 4,
          }}
        >
          {children}
        </div>
      )}
    </div>
  )
}

function MenuItem({
  children, onClick, trailing, danger, disabled,
}: {
  children: React.ReactNode
  onClick: () => void
  trailing?: React.ReactNode
  danger?: boolean
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        width: '100%', padding: '6px 10px',
        background: 'transparent',
        color: disabled ? 'var(--text3)' : danger ? '#ef4444' : 'var(--text)',
        fontSize: 11, borderRadius: 3,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        border: 'none',
        textAlign: 'left',
        transition: 'background 0.1s',
      }}
      onMouseEnter={(e) => { if (!disabled) (e.currentTarget as HTMLButtonElement).style.background = 'var(--hover)' }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
    >
      <span>{children}</span>
      {trailing}
    </button>
  )
}

/* ──────────────────────────────────────────────────────────────
   Speed keyframe diamond on the timeline.
     - Click → jump playhead to the keyframe
     - Drag → move the keyframe along its parent segment
     - Right-click → context menu (toggle easing, delete)
   Linear-easing keyframes render with a hollow center to distinguish
   them from step-easing diamonds.
   ────────────────────────────────────────────────────────────── */
function SpeedKfDiamond({
  x, top, color, value, easing, isLinear, onClick, onContextMenu, onDragMove, fpx,
}: {
  x: number
  top: number
  color: string
  value: number
  easing: SpeedEasing
  isLinear: boolean
  onClick: (e: React.MouseEvent) => void
  onContextMenu: (e: React.MouseEvent) => void
  onDragMove: (deltaFrames: number) => void
  fpx: number
}) {
  const dragRef = useRef<{ startX: number; didMove: boolean } | null>(null)

  function onMouseDown(e: React.MouseEvent) {
    if (e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    dragRef.current = { startX: e.clientX, didMove: false }
    function onMove(ev: MouseEvent) {
      const d = dragRef.current
      if (!d) return
      const dx = ev.clientX - d.startX
      const deltaFrames = Math.round(dx / Math.max(0.001, fpx))
      if (Math.abs(deltaFrames) >= 1) {
        d.didMove = true
        onDragMove(deltaFrames)
        d.startX = ev.clientX
      }
    }
    function onUp(ev: MouseEvent) {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      const didMove = dragRef.current?.didMove
      dragRef.current = null
      if (!didMove) onClick(ev as unknown as React.MouseEvent)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  return (
    <div
      onMouseDown={onMouseDown}
      onContextMenu={onContextMenu}
      title={`${value === 0 ? '❄ Freeze' : `${value.toFixed(2)}×`} · ${easing}`}
      style={{
        position: 'absolute',
        left: x - 5,
        top,
        width: 10, height: 10,
        background: isLinear ? 'transparent' : color,
        border: `1.5px solid ${color}`,
        transform: 'rotate(45deg)',
        borderRadius: 1,
        cursor: 'grab',
        zIndex: 5,
        transition: 'background 0.1s',
      }}
    />
  )
}
