import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Pause } from 'lucide-react'
import { createPortal } from 'react-dom'
import { useStore } from '../store'
import { Layer, VideoSegment, LAYER_TYPE_COLOR } from '../types'

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
    beginInteraction, endInteraction,
  } = useStore()

  const segments = layer.videoSegments ?? []
  const baseColor = colorOverride ?? LAYER_TYPE_COLOR[layer.type] ?? '#0d99ff'
  const barH = Math.min(18, Math.max(12, Math.round(rowH * 0.42)))
  const dragRef = useRef<DragState | null>(null)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; segmentId: string } | null>(null)
  const [speedSubmenuOpen, setSpeedSubmenuOpen] = useState(false)

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

        return (
          <div
            key={seg.id}
            data-segment-id={seg.id}
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
              overflow: 'hidden',
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
          </div>
        )
      })}

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
