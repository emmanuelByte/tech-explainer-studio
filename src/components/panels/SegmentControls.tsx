import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Diamond, Minus, Pause, Plus, RotateCcw, Scissors, Trash2, Triangle } from 'lucide-react'
import { useStore } from '../../store'
import { Layer, SpeedEasing, VideoSegment } from '../../types'
import { Section, Row, NumField } from './_panelKit'

/* ──────────────────────────────────────────────────────────────
   Figma-style video segment editor:
     - Visual trim bar (full source duration) with two handles
     - In/Out NumFields (seconds)
     - Speed slider + chip presets (0.25× / 0.5× / 1× / 2× / 4× / Freeze)
     - Action buttons (Split, Delete, Reset cut, Duplicate, Insert)
   Edits the segment under the playhead. No separate selection state.
   ────────────────────────────────────────────────────────────── */

const SPEED_PRESETS = [0.25, 0.5, 1, 2, 4] as const

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v))
}

function formatSeconds(seconds: number, precision = 2): string {
  if (!Number.isFinite(seconds)) return '0'
  return seconds.toFixed(precision)
}

export function SegmentControls({ layer }: { layer: Layer }) {
  if (layer.type !== 'video') return null
  return <SegmentControlsInner layer={layer} />
}

function SegmentControlsInner({ layer }: { layer: Layer }) {
  const { t } = useTranslation()
  const {
    currentFrame, fps,
    selectActiveSegment, selectSegmentSpeed,
    splitVideoAt, removeVideoSegment, duplicateVideoSegment,
    setSegmentSourceRange, setSegmentSpeed, freezeSegment, resetVideoCut,
    setSegmentSpeedKeyframe, removeSegmentSpeedKeyframe, setSegmentSpeedKeyframeEasing,
    setCurrentFrame,
  } = useStore()

  const segments = layer.videoSegments ?? []
  const activeSegment = selectActiveSegment(layer.id, currentFrame)
  const activeIndex = activeSegment ? segments.findIndex((s) => s.id === activeSegment.id) : -1
  const sourceDurationFrames = layer.sourceDurationFrames ?? 0
  const sourceDurationSeconds = sourceDurationFrames / Math.max(1, fps)
  const hasMetadata = sourceDurationFrames > 0

  // Empty state — playhead is in a gap between segments (no active segment)
  if (!activeSegment) {
    return (
      <Section title={t('segment.title')}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '4px 0' }}>
          <div style={{ fontSize: 11, color: 'var(--text3)', textAlign: 'center' }}>
            {t('segment.noSegmentHere')}
          </div>
          <button
            type="button"
            onClick={() => splitVideoAt(layer.id, currentFrame)}
            style={{
              height: 26, fontSize: 11,
              background: 'var(--accent-bg)', color: 'var(--accent)',
              border: '1px solid var(--accent)', borderRadius: 3,
              transition: 'background 0.1s',
            }}
          >
            <Plus size={11} style={{ display: 'inline', verticalAlign: -2, marginRight: 4 }} />
            {t('segment.insertHere')}
          </button>
        </div>
      </Section>
    )
  }

  const speed = selectSegmentSpeed(activeSegment)
  const isFrozen = speed === 0

  const sourceInSec = activeSegment.sourceStartFrame / Math.max(1, fps)
  const sourceOutSec = activeSegment.sourceEndFrame / Math.max(1, fps)
  const shownSec = (activeSegment.timelineEndFrame - activeSegment.timelineStartFrame) / Math.max(1, fps)

  return (
    <Section title={t('segment.title')}>
      {/* Index header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        fontSize: 10, color: 'var(--text3)', marginBottom: 4,
        textTransform: 'uppercase', letterSpacing: '0.04em',
      }}>
        <span>{t('segment.indexOf', { n: activeIndex + 1, m: segments.length })}</span>
        {!hasMetadata && <span style={{ fontStyle: 'italic' }}>{t('segment.loadingMetadata')}</span>}
      </div>

      {/* Source row + visual trim bar */}
      {hasMetadata && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text3)' }}>
            <span style={{ textTransform: 'uppercase', letterSpacing: '0.04em' }}>{t('segment.source')}</span>
            <span style={{ fontVariantNumeric: 'tabular-nums' }}>
              {t('segment.sourceDuration', {
                seconds: formatSeconds(sourceDurationSeconds),
                frames: sourceDurationFrames,
              })}
            </span>
          </div>
          <TrimBar
            sourceDurationFrames={sourceDurationFrames}
            sourceStartFrame={activeSegment.sourceStartFrame}
            sourceEndFrame={activeSegment.sourceEndFrame}
            onChange={(nextStart, nextEnd) => setSegmentSourceRange(layer.id, activeSegment.id, nextStart, nextEnd)}
          />
          <div style={{ textAlign: 'right', fontSize: 9, color: 'var(--text3)' }}>
            {t('segment.shown', { seconds: formatSeconds(shownSec) })}
          </div>
        </>
      )}

      {/* In/Out fields */}
      <Row label={t('segment.in')}>
        <NumField
          leading="In"
          value={parseFloat(formatSeconds(sourceInSec, 2))}
          min={0}
          max={Math.max(0, sourceOutSec - 1 / Math.max(1, fps))}
          step={0.01}
          precision={2}
          sensitivity={0.01}
          unit="s"
          onChange={(v) => {
            const nextStart = Math.max(0, Math.round(v * fps))
            setSegmentSourceRange(layer.id, activeSegment.id, nextStart, activeSegment.sourceEndFrame)
          }}
        />
      </Row>
      <Row label={t('segment.out')}>
        <NumField
          leading="Out"
          value={parseFloat(formatSeconds(sourceOutSec, 2))}
          min={sourceInSec + 1 / Math.max(1, fps)}
          max={hasMetadata ? sourceDurationSeconds : Infinity}
          step={0.01}
          precision={2}
          sensitivity={0.01}
          unit="s"
          onChange={(v) => {
            const nextEnd = Math.max(activeSegment.sourceStartFrame + 1, Math.round(v * fps))
            setSegmentSourceRange(layer.id, activeSegment.id, activeSegment.sourceStartFrame, nextEnd)
          }}
        />
      </Row>

      {/* Speed at playhead — slider + chips upsert a keyframe at currentFrame */}
      <Row label={t('segment.speedAtPlayhead')}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
          <input
            type="range"
            min={0}
            max={4}
            step={0.05}
            value={clamp(speed, 0, 4)}
            onChange={(e) => setSegmentSpeed(layer.id, activeSegment.id, parseFloat(e.target.value))}
            className="figma-range"
            style={{ flex: 1 }}
          />
          <span style={{
            fontSize: 10, color: 'var(--text2)', minWidth: 38, textAlign: 'right',
            fontVariantNumeric: 'tabular-nums',
          }}>
            {isFrozen ? '0× ❄' : `${speed.toFixed(2)}×`}
          </span>
        </div>
      </Row>

      {/* Preset chips — insert a step keyframe at currentFrame */}
      <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
        {SPEED_PRESETS.map((p) => {
          const active = !isFrozen && Math.abs(speed - p) < 0.005
          return (
            <button
              key={p}
              type="button"
              onClick={() => setSegmentSpeed(layer.id, activeSegment.id, p)}
              style={{
                flex: 1,
                minWidth: 0,
                height: 22, padding: '0 4px', fontSize: 10,
                borderRadius: 3,
                background: active ? 'var(--accent-bg)' : 'var(--input)',
                color: active ? 'var(--accent)' : 'var(--text2)',
                border: `1px solid ${active ? 'var(--accent)' : 'var(--input-border)'}`,
                fontVariantNumeric: 'tabular-nums',
                transition: 'background 0.1s, color 0.1s',
              }}
            >
              {p === 1 ? '1×' : `${p}×`}
            </button>
          )
        })}
        <button
          type="button"
          onClick={() => freezeSegment(layer.id, activeSegment.id)}
          style={{
            flex: 1.2,
            minWidth: 0,
            height: 22, padding: '0 6px', fontSize: 10,
            borderRadius: 3,
            background: isFrozen ? 'rgba(59,130,246,0.15)' : 'var(--input)',
            color: isFrozen ? '#3b82f6' : 'var(--text2)',
            border: `1px solid ${isFrozen ? '#3b82f6' : 'var(--input-border)'}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3,
            transition: 'background 0.1s, color 0.1s',
          }}
        >
          <Pause size={9} fill="currentColor" stroke="none" />
          {t('segment.freeze')}
        </button>
      </div>

      {/* Speed keyframes list */}
      <div style={{ marginTop: 4 }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase',
          letterSpacing: '0.04em', marginBottom: 4,
        }}>
          <span>{t('segment.speedKeyframes')}</span>
          <button
            type="button"
            onClick={() => setSegmentSpeedKeyframe(layer.id, activeSegment.id, currentFrame, speed, 'linear')}
            title={t('segment.addRamp')}
            style={{
              display: 'flex', alignItems: 'center', gap: 3,
              fontSize: 9, padding: '2px 6px',
              background: 'transparent', color: 'var(--text2)',
              border: '1px solid var(--input-border)', borderRadius: 3,
              cursor: 'pointer', textTransform: 'none',
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--hover)' }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
          >
            <Triangle size={8} fill="currentColor" stroke="none" style={{ transform: 'rotate(90deg)' }} />
            {t('segment.addRamp')}
          </button>
        </div>
        {!activeSegment.speedKeyframes?.length ? (
          <div style={{
            fontSize: 10, color: 'var(--text3)',
            padding: '6px 8px', textAlign: 'center', fontStyle: 'italic',
            background: 'var(--input)', border: '1px solid var(--input-border)', borderRadius: 3,
          }}>
            {t('segment.noSpeedKeyframes')}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {[...activeSegment.speedKeyframes].sort((a, b) => a.frame - b.frame).map((kf) => {
              const atPlayhead = kf.frame === currentFrame
              return (
                <div
                  key={kf.frame}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '14px 1fr 1fr 22px 22px',
                    gap: 4,
                    alignItems: 'center',
                    padding: '3px 4px',
                    background: atPlayhead ? 'var(--accent-bg)' : 'transparent',
                    border: `1px solid ${atPlayhead ? 'var(--accent)' : 'transparent'}`,
                    borderRadius: 3,
                    fontSize: 10,
                  }}
                >
                  <Diamond
                    size={10}
                    fill={kf.value === 0 ? '#3b82f6' : '#f59e0b'}
                    stroke="none"
                    style={{ display: 'block' }}
                  />
                  <button
                    type="button"
                    onClick={() => setCurrentFrame(kf.frame)}
                    title={t('segment.jumpToKeyframe')}
                    style={{
                      fontSize: 10, color: 'var(--text2)',
                      background: 'transparent', border: 'none', cursor: 'pointer',
                      textAlign: 'left', padding: 0,
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {t('segment.frameShort', { frame: kf.frame })}
                  </button>
                  <span style={{
                    fontVariantNumeric: 'tabular-nums', color: 'var(--text)',
                    textAlign: 'right',
                  }}>
                    {kf.value === 0 ? '0× ❄' : `${kf.value.toFixed(2)}×`}
                  </span>
                  <button
                    type="button"
                    onClick={() => setSegmentSpeedKeyframeEasing(
                      layer.id,
                      activeSegment.id,
                      kf.frame,
                      kf.easing === 'step' ? 'linear' : 'step',
                    )}
                    title={kf.easing === 'step' ? t('segment.easingStep') : t('segment.easingLinear')}
                    style={{
                      width: 22, height: 18, padding: 0,
                      background: 'transparent', color: 'var(--text3)',
                      border: '1px solid var(--input-border)', borderRadius: 3,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      cursor: 'pointer', fontSize: 8,
                    }}
                  >
                    {kf.easing === 'step' ? '▮▮' : '╱'}
                  </button>
                  <button
                    type="button"
                    onClick={() => removeSegmentSpeedKeyframe(layer.id, activeSegment.id, kf.frame)}
                    title={t('segment.deleteKeyframe')}
                    style={{
                      width: 22, height: 18, padding: 0,
                      background: 'transparent', color: 'var(--text3)',
                      border: '1px solid var(--input-border)', borderRadius: 3,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      cursor: 'pointer',
                    }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = '#ef4444' }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--text3)' }}
                  >
                    <Minus size={10} />
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 3, marginTop: 4 }}>
        <ActionButton
          icon={<Scissors size={11} />}
          label={t('segment.splitAtPlayhead')}
          onClick={() => splitVideoAt(layer.id, currentFrame)}
        />
        <ActionButton
          icon={<Trash2 size={11} />}
          label={t('segment.delete')}
          danger
          disabled={segments.length <= 1}
          onClick={() => removeVideoSegment(layer.id, activeSegment.id)}
        />
      </div>
      <div style={{ display: 'flex', gap: 3 }}>
        <ActionButton
          icon={<Plus size={11} />}
          label={t('segment.duplicate')}
          onClick={() => duplicateVideoSegment(layer.id, activeSegment.id)}
        />
        <ActionButton
          icon={<RotateCcw size={11} />}
          label={t('segment.reset')}
          onClick={() => resetVideoCut(layer.id)}
        />
      </div>
    </Section>
  )
}

function ActionButton({ icon, label, onClick, danger, disabled }: {
  icon: React.ReactNode
  label: string
  onClick: () => void
  danger?: boolean
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        flex: 1, height: 22, padding: '0 6px', fontSize: 10,
        borderRadius: 3,
        background: 'transparent',
        color: disabled ? 'var(--text3)' : danger ? '#ef4444' : 'var(--text2)',
        border: '1px solid var(--input-border)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        transition: 'background 0.1s, color 0.1s',
        minWidth: 0,
      }}
      onMouseEnter={(e) => { if (!disabled) (e.currentTarget as HTMLButtonElement).style.background = 'var(--hover)' }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
    >
      {icon}
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
    </button>
  )
}

/* ──────────────────────────────────────────────────────────────
   TrimBar — horizontal bar showing full source duration; the
   active source range is highlighted, with two draggable handles
   marking sourceStart / sourceEnd. Outside the range is dimmed.
   ────────────────────────────────────────────────────────────── */
function TrimBar({
  sourceDurationFrames,
  sourceStartFrame,
  sourceEndFrame,
  onChange,
}: {
  sourceDurationFrames: number
  sourceStartFrame: number
  sourceEndFrame: number
  onChange: (nextStart: number, nextEnd: number) => void
}) {
  const trackRef = useRef<HTMLDivElement>(null)
  const beginInteraction = useStore((s) => s.beginInteraction)
  const endInteraction = useStore((s) => s.endInteraction)
  const [drag, setDrag] = useState<null | 'in' | 'out'>(null)

  const startPct = useMemo(() => (sourceStartFrame / Math.max(1, sourceDurationFrames)) * 100, [sourceStartFrame, sourceDurationFrames])
  const endPct = useMemo(() => (sourceEndFrame / Math.max(1, sourceDurationFrames)) * 100, [sourceEndFrame, sourceDurationFrames])

  function frameFromClientX(clientX: number): number {
    const track = trackRef.current
    if (!track) return 0
    const rect = track.getBoundingClientRect()
    const pct = clamp((clientX - rect.left) / rect.width, 0, 1)
    return Math.round(pct * sourceDurationFrames)
  }

  function startDrag(which: 'in' | 'out') {
    return (e: React.PointerEvent) => {
      e.preventDefault()
      e.stopPropagation()
      ;(e.target as Element).setPointerCapture?.(e.pointerId)
      setDrag(which)
      beginInteraction(true)
    }
  }

  useEffect(() => {
    if (!drag) return
    function onMove(e: PointerEvent) {
      const f = frameFromClientX(e.clientX)
      if (drag === 'in') {
        const nextStart = clamp(f, 0, sourceEndFrame - 1)
        onChange(nextStart, sourceEndFrame)
      } else {
        const nextEnd = clamp(f, sourceStartFrame + 1, sourceDurationFrames)
        onChange(sourceStartFrame, nextEnd)
      }
    }
    function onUp() {
      setDrag(null)
      endInteraction()
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag, sourceStartFrame, sourceEndFrame, sourceDurationFrames])

  return (
    <div
      ref={trackRef}
      style={{
        position: 'relative',
        height: 24,
        background: 'var(--input)',
        border: '1px solid var(--input-border)',
        borderRadius: 3,
        userSelect: 'none',
      }}
    >
      {/* Active range */}
      <div
        style={{
          position: 'absolute',
          left: `${startPct}%`,
          width: `${endPct - startPct}%`,
          top: 0, bottom: 0,
          background: 'rgba(13,153,255,0.18)',
          borderLeft: '1px solid var(--accent)',
          borderRight: '1px solid var(--accent)',
          pointerEvents: 'none',
        }}
      />
      {/* In handle */}
      <div
        onPointerDown={startDrag('in')}
        style={{
          position: 'absolute',
          left: `calc(${startPct}% - 4px)`,
          top: -2, bottom: -2,
          width: 8,
          cursor: 'ew-resize',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        <div
          style={{
            width: 3, height: 18,
            background: 'var(--accent)',
            borderRadius: 1,
            boxShadow: drag === 'in' ? '0 0 0 2px rgba(13,153,255,0.35)' : undefined,
          }}
        />
      </div>
      {/* Out handle */}
      <div
        onPointerDown={startDrag('out')}
        style={{
          position: 'absolute',
          left: `calc(${endPct}% - 4px)`,
          top: -2, bottom: -2,
          width: 8,
          cursor: 'ew-resize',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        <div
          style={{
            width: 3, height: 18,
            background: 'var(--accent)',
            borderRadius: 1,
            boxShadow: drag === 'out' ? '0 0 0 2px rgba(13,153,255,0.35)' : undefined,
          }}
        />
      </div>
    </div>
  )
}
