import {
  AlignCenterHorizontal, AlignCenterVertical, AlignEndHorizontal, AlignEndVertical,
  AlignStartHorizontal, AlignStartVertical, ChevronRight, Link2, Unlink2,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useStore } from '../../store'
import { Layer, LayoutAlign, LayoutDirection, LayoutJustify, LayoutMode, TransformProps, PairEasingType, SizeMode } from '../../types'
import { resolveLayerAnimation } from '../../animationProperties'

const EASINGS: PairEasingType[] = ['linear', 'ease', 'ease-in', 'ease-out', 'ease-in-out', 'spring', 'bounce', 'custom']
const LAYOUT_MODES: { value: LayoutMode; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'flex', label: 'Flex' },
  { value: 'grid', label: 'Grid' },
]
const LAYOUT_DIRECTIONS: { value: LayoutDirection; label: string }[] = [
  { value: 'row', label: 'Row' },
  { value: 'column', label: 'Column' },
]
const LAYOUT_ALIGNS: { value: LayoutAlign; label: string }[] = [
  { value: 'start', label: 'Start' },
  { value: 'center', label: 'Center' },
  { value: 'end', label: 'End' },
  { value: 'stretch', label: 'Stretch' },
]
const LAYOUT_JUSTIFIES: { value: LayoutJustify; label: string }[] = [
  { value: 'start', label: 'Start' },
  { value: 'center', label: 'Center' },
  { value: 'end', label: 'End' },
  { value: 'space-between', label: 'Space between' },
]

function formatNumber(value: number, precision: number) {
  return Number.isInteger(value) ? String(value) : String(parseFloat(value.toFixed(precision)))
}

/* ──────────────────────────────────────────────────────────────
   NumField — Figma-style numeric input with optional unit suffix
   and optional drag-scrub on a leading icon/label.
   ────────────────────────────────────────────────────────────── */
function NumField({
  leading, value, onChange, unit, step = 1, min, precision = 2,
  sensitivity = 1, ariaLabel,
}: {
  leading: React.ReactNode
  value: number
  onChange: (value: number) => void
  unit?: string
  step?: number
  min?: number
  precision?: number
  sensitivity?: number
  ariaLabel?: string
}) {
  const { t } = useTranslation()
  const beginInteraction = useStore((s) => s.beginInteraction)
  const endInteraction = useStore((s) => s.endInteraction)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(formatNumber(value, precision))
  const [scrubbing, setScrubbing] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const editingRef = useRef(false)
  const onChangeRef = useRef(onChange)
  const sensitivityRef = useRef(sensitivity)
  const scrubStart = useRef({ x: 0, v: 0 })
  onChangeRef.current = onChange
  sensitivityRef.current = sensitivity

  useEffect(() => {
    if (!editingRef.current) setDraft(formatNumber(value, precision))
  }, [value, precision])

  function clamp(v: number) {
    return min !== undefined ? Math.max(min, v) : v
  }

  function applyValue(raw: string) {
    const next = Number(raw)
    if (!Number.isFinite(next)) return
    onChangeRef.current(clamp(parseFloat(next.toFixed(precision))))
  }

  function startEditing() {
    if (editingRef.current) return
    editingRef.current = true
    setEditing(true)
    setDraft(formatNumber(value, precision))
    beginInteraction(true)
    requestAnimationFrame(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    })
  }

  function stopEditing(commit: boolean) {
    if (!editingRef.current) return
    if (commit) applyValue(draft)
    else setDraft(formatNumber(value, precision))
    editingRef.current = false
    setEditing(false)
    endInteraction()
  }

  function onLeadingMouseDown(e: React.MouseEvent) {
    if (editing) return
    e.preventDefault()
    scrubStart.current = { x: e.clientX, v: value }
    setScrubbing(true)
    beginInteraction(true)
  }

  useEffect(() => {
    if (!scrubbing) return
    function onMove(e: MouseEvent) {
      const dx = e.clientX - scrubStart.current.x
      const mult = e.shiftKey ? 10 : e.altKey ? 0.1 : 1
      const raw = scrubStart.current.v + dx * sensitivityRef.current * mult
      onChangeRef.current(clamp(parseFloat(raw.toFixed(precision))))
    }
    function onUp() { setScrubbing(false); endInteraction() }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrubbing, precision])

  // unit suffix width offset so the value never collides with the unit
  const unitWidth = unit ? Math.max(14, unit.length * 6 + 6) : 0

  return (
    <div
      aria-label={ariaLabel}
      style={{
        display: 'flex',
        alignItems: 'center',
        height: 26,
        background: scrubbing ? 'var(--accent-bg)' : 'var(--input)',
        border: `1px solid ${scrubbing ? 'var(--accent)' : editing ? 'var(--accent)' : 'var(--input-border)'}`,
        borderRadius: 3,
        overflow: 'hidden',
        transition: 'border-color 0.1s, background 0.1s',
        cursor: editing ? 'text' : undefined,
        minWidth: 0,
      }}
    >
      <span
        onMouseDown={onLeadingMouseDown}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minWidth: 20,
          paddingLeft: 4,
          paddingRight: 4,
          height: '100%',
          color: 'var(--text3)',
          fontSize: 10,
          cursor: 'ew-resize',
          userSelect: 'none',
          flexShrink: 0,
        }}
        title={t('transform.scrubHelp')}
      >
        {leading}
      </span>
      <input
        ref={inputRef}
        type="number"
        value={editing ? draft : formatNumber(value, precision)}
        min={min}
        step={step}
        onFocus={startEditing}
        onChange={(e) => { setDraft(e.target.value); applyValue(e.target.value) }}
        onBlur={() => stopEditing(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
          if (e.key === 'Escape') { e.preventDefault(); stopEditing(false); e.currentTarget.blur() }
        }}
        style={{
          flex: 1,
          minWidth: 0,
          height: '100%',
          background: 'transparent',
          border: 'none',
          outline: 'none',
          color: 'var(--text)',
          fontSize: 11,
          fontFamily: 'inherit',
          fontVariantNumeric: 'tabular-nums',
          textAlign: 'right',
          padding: `0 ${unitWidth + 4}px 0 2px`,
        }}
      />
      {unit && (
        <span
          style={{
            position: 'relative',
            marginLeft: -unitWidth,
            width: unitWidth,
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            paddingRight: 6,
            fontSize: 9,
            color: 'var(--text3)',
            pointerEvents: 'none',
            userSelect: 'none',
            flexShrink: 0,
          }}
        >
          {unit}
        </span>
      )}
    </div>
  )
}

function IconBtn({ title, children, onClick, active }: {
  title: string
  children: React.ReactNode
  onClick: () => void
  active?: boolean
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: 26, borderRadius: 3,
        background: active ? 'var(--accent-bg)' : 'transparent',
        color: active ? 'var(--accent)' : 'var(--text2)',
        transition: 'background 0.1s, color 0.1s',
      }}
      onMouseEnter={(e) => { if (!active) (e.currentTarget as HTMLButtonElement).style.background = 'var(--hover)' }}
      onMouseLeave={(e) => { if (!active) (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
    >
      {children}
    </button>
  )
}

/* ──────────────────────────────────────────────────────────────
   Accordion section (Figma-style collapsible group)
   ────────────────────────────────────────────────────────────── */
function Section({
  title, defaultOpen = true, headerExtra, children,
}: {
  title: string
  defaultOpen?: boolean
  headerExtra?: React.ReactNode
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div style={{ borderBottom: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', paddingRight: 10 }}>
        <button
          onClick={() => setOpen(!open)}
          className={`accordion-header ${open ? 'open' : ''}`}
          style={{ flex: 1 }}
        >
          <ChevronRight size={11} className="chev" />
          <span style={{ textTransform: 'uppercase', letterSpacing: '0.06em', fontSize: 10 }}>{title}</span>
        </button>
        {headerExtra && <div style={{ display: 'flex', alignItems: 'center' }}>{headerExtra}</div>}
      </div>
      {open && (
        <div style={{ padding: '4px 10px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {children}
        </div>
      )}
    </div>
  )
}

/* ──────────────────────────────────────────────────────────────
   Inline label row — "Width [input]"
   ────────────────────────────────────────────────────────────── */
function Row({ label, children }: { label?: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, minHeight: 26 }}>
      {label && (
        <span style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.04em', width: 56, flexShrink: 0 }}>
          {label}
        </span>
      )}
      <div style={{ flex: 1, display: 'flex', gap: 4, minWidth: 0 }}>{children}</div>
    </div>
  )
}

/* ──────────────────────────────────────────────────────────────
   Rotation3D — Figma/After Effects style 3D rotation control with
   visual axis indicators, live cube preview, and clear per-axis
   tooltips. Each axis input has its own colored leading icon
   matching the convention X=red, Y=green, Z=blue (After Effects).
   ────────────────────────────────────────────────────────────── */
function Rotation3D({
  rotateX, rotateY, rotateZ, onChange,
}: {
  rotateX: number
  rotateY: number
  rotateZ: number
  onChange: (axis: 'rotateX' | 'rotateY' | 'rotateZ', v: number) => void
}) {
  const { t } = useTranslation()
  const AXIS_COLORS = { x: '#ef4444', y: '#22c55e', z: '#3b82f6' } as const

  function AxisDot({ color }: { color: string }) {
    return <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0 }} />
  }

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
      {/* Mini 3D cube preview */}
      <div
        title={t('transform.rotation3d')}
        style={{
          width: 44, height: 44, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'var(--input)',
          border: '1px solid var(--input-border)',
          borderRadius: 3,
          perspective: 120,
          marginTop: 2,
        }}
      >
        <div
          style={{
            width: 22, height: 22,
            transformStyle: 'preserve-3d',
            transform: `rotateX(${rotateX}deg) rotateY(${rotateY}deg) rotateZ(${rotateZ}deg)`,
            transition: 'transform 0.06s linear',
            position: 'relative',
          }}
        >
          {/* Front face */}
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(13,153,255,0.55)', border: '1px solid var(--accent)', transform: 'translateZ(11px)' }} />
          {/* Back face */}
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(13,153,255,0.2)', border: '1px solid rgba(13,153,255,0.35)', transform: 'translateZ(-11px)' }} />
          {/* Right face */}
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(239,68,68,0.45)', border: '1px solid rgba(239,68,68,0.65)', transform: 'rotateY(90deg) translateZ(11px)' }} />
          {/* Left face */}
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(239,68,68,0.2)', border: '1px solid rgba(239,68,68,0.35)', transform: 'rotateY(-90deg) translateZ(11px)' }} />
          {/* Top face */}
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(34,197,94,0.45)', border: '1px solid rgba(34,197,94,0.65)', transform: 'rotateX(90deg) translateZ(11px)' }} />
          {/* Bottom face */}
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(34,197,94,0.2)', border: '1px solid rgba(34,197,94,0.35)', transform: 'rotateX(-90deg) translateZ(11px)' }} />
        </div>
      </div>

      {/* Per-axis inputs */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
        <span style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          {t('transform.rotation3d')}
        </span>
        <div title={t('transform.rotateXTitle')}>
          <NumField
            leading={<span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><AxisDot color={AXIS_COLORS.x} />X</span>}
            value={rotateX} unit="°" step={1} precision={1}
            onChange={(v) => onChange('rotateX', v)}
            ariaLabel={t('transform.rotateXTitle')}
          />
        </div>
        <div title={t('transform.rotateYTitle')}>
          <NumField
            leading={<span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><AxisDot color={AXIS_COLORS.y} />Y</span>}
            value={rotateY} unit="°" step={1} precision={1}
            onChange={(v) => onChange('rotateY', v)}
            ariaLabel={t('transform.rotateYTitle')}
          />
        </div>
        <div title={t('transform.rotateZTitle')}>
          <NumField
            leading={<span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><AxisDot color={AXIS_COLORS.z} />Z</span>}
            value={rotateZ} unit="°" step={1} precision={1}
            onChange={(v) => onChange('rotateZ', v)}
            ariaLabel={t('transform.rotateZTitle')}
          />
        </div>
      </div>
    </div>
  )
}

function estimateTextSize(text: string, fontSize: number, lineHeight: number, letterSpacing: number) {
  const lines = (text || 'Text').split('\n')
  const longest = Math.max(...lines.map((line) => line.length), 1)
  return {
    width: Math.ceil(longest * (fontSize * 0.58 + letterSpacing) + 24),
    height: Math.ceil(lines.length * fontSize * lineHeight + 16),
  }
}

function visibleImageSize(layer: ReturnType<typeof resolveLayerAnimation>['layer'], width: number, height: number) {
  if (layer.type !== 'image' && layer.type !== 'video') return { width, height }
  const fit = layer.imageFit ?? 'contain'
  if (fit === 'fill' || fit === 'cover') return { width, height }
  const naturalW = layer.type === 'video' ? layer.videoNaturalWidth : layer.imageNaturalWidth
  const naturalH = layer.type === 'video' ? layer.videoNaturalHeight : layer.imageNaturalHeight
  if (!naturalW || !naturalH) return { width, height }

  const containScale = Math.min(width / naturalW, height / naturalH)
  const scale = fit === 'scale-down' ? Math.min(1, containScale) : containScale
  return {
    width: naturalW * scale,
    height: naturalH * scale,
  }
}

function parentRenderOffset(layer: Layer, layers: Layer[], frame: number) {
  let x = 0
  let y = 0
  const seen = new Set<string>()
  let parentId = layer.parentId ?? null
  while (parentId && !seen.has(parentId)) {
    seen.add(parentId)
    const parent = layers.find((item) => item.id === parentId)
    if (!parent) break
    const p = resolveLayerAnimation(parent, frame).transform
    x += p.x
    y += p.y
    parentId = parent.parentId ?? null
  }
  return { x, y }
}

function layerFrameBox(layer: Layer, layers: Layer[], frame: number, canvasW: number, canvasH: number) {
  const { layer: animatedLayer, transform } = resolveLayerAnimation(layer, frame)
  const rawWidth = animatedLayer.sizeMode === 'fill-canvas' ? canvasW : animatedLayer.width
  const rawHeight = animatedLayer.sizeMode === 'fill-canvas' ? canvasH : animatedLayer.type === 'line' ? animatedLayer.strokeWidth || 2 : animatedLayer.height
  const width = Math.abs(rawWidth * transform.scale * transform.scaleX)
  const height = Math.abs(rawHeight * transform.scale * transform.scaleY)
  const parentOffset = parentRenderOffset(layer, layers, frame)
  const centerX = canvasW / 2 + transform.x + parentOffset.x
  const centerY = canvasH / 2 + transform.y + parentOffset.y
  return {
    left: centerX - width / 2,
    right: centerX + width / 2,
    top: centerY - height / 2,
    bottom: centerY + height / 2,
    centerX,
    centerY,
    width,
    height,
  }
}

export function TransformPanel() {
  const { t } = useTranslation()
  const {
    layers, selectedLayerIds, currentFrame,
    canvasPreset, customWidth, customHeight,
    addKeyframe, setLayerAnimatedProperty, updateLayerProp,
    updateKeyframeEasing,
  } = useStore()
  const selectedLayer = layers.find((l) => l.id === selectedLayerIds[0])
  const [aspectLocked, setAspectLocked] = useState(false)

  useEffect(() => {
    setAspectLocked(false)
  }, [selectedLayer?.id])

  if (!selectedLayer) return null
  const layer = selectedLayer

  const p = resolveLayerAnimation(layer, currentFrame).transform
  const sorted = [...layer.keyframes].sort((a, b) => a.frame - b.frame)
  const activeKf = sorted.reduce<typeof sorted[0] | null>((found, kf) => kf.frame <= currentFrame ? kf : found, null)

  function handleTransformChange(key: keyof TransformProps, value: number) {
    setLayerAnimatedProperty(layer.id, key as never, value)
  }

  function handleAddKeyframe() {
    addKeyframe(layer.id, currentFrame, { ...p })
  }

  const canvasW = canvasPreset.name === 'Custom' ? customWidth : canvasPreset.width
  const canvasH = canvasPreset.name === 'Custom' ? customHeight : canvasPreset.height
  const sizeMode = layer.sizeMode ?? 'fixed'
  const canUseLayout = layer.type === 'group' || layer.isGroup
  const canMaskLayer = layer.type === 'group' || layer.type === 'rectangle' || layer.type === 'ellipse' || layer.type === 'triangle' || layer.type === 'path' || layer.isGroup
  const layoutMode = layer.layoutMode ?? 'none'
  const parentLayer = layer.parentId ? layers.find((item) => item.id === layer.parentId) : null
  const relativeX = p.x
  const relativeY = p.y
  const relativeZ = p.z
  const animatedLayer = resolveLayerAnimation(layer, currentFrame).layer
  const effectiveW = sizeMode === 'fill-canvas' ? canvasW : animatedLayer.width
  const effectiveH = sizeMode === 'fill-canvas' ? canvasH : animatedLayer.type === 'line' ? animatedLayer.strokeWidth || 2 : animatedLayer.height
  const canFit = layer.type === 'text' || layer.autoFit || layer.type === 'group'
  const canLockAspect = layer.type !== 'line'
  const aspectRatio = effectiveH > 0 ? effectiveW / effectiveH : 1

  function materializeAutoFrame() {
    if (!layer.autoFit) return
    updateLayerProp(layer.id, 'autoFit', false)
    updateLayerProp(layer.id, 'type', 'rectangle')
    updateLayerProp(layer.id, 'isGroup', true)
    updateLayerProp(layer.id, 'fillType', 'none')
    updateLayerProp(layer.id, 'strokeEnabled', false)
  }

  function setSizeMode(mode: SizeMode) {
    if (mode === 'fit-content' && !canFit) return
    if (mode === 'fit-content' && layer.type !== 'text') {
      updateLayerProp(layer.id, 'autoFit', true)
      updateLayerProp(layer.id, 'type', 'group')
      updateLayerProp(layer.id, 'isGroup', true)
      updateLayerProp(layer.id, 'fillType', 'none')
      updateLayerProp(layer.id, 'strokeEnabled', false)
      updateLayerProp(layer.id, 'sizeMode', 'fit-content')
      return
    }
    if (mode !== 'fit-content') materializeAutoFrame()
    updateLayerProp(layer.id, 'sizeMode', mode)
    if (mode === 'fit-content' && layer.type === 'text') {
      const next = estimateTextSize(layer.text, layer.fontSize, layer.lineHeight, layer.letterSpacing)
      setLayerAnimatedProperty(layer.id, 'width' as never, next.width)
      setLayerAnimatedProperty(layer.id, 'height' as never, next.height)
    }
    if (mode === 'fill-canvas') {
      setLayerAnimatedProperty(layer.id, 'width' as never, canvasW)
      setLayerAnimatedProperty(layer.id, 'height' as never, canvasH)
    }
  }

  function setClipChildren(enabled: boolean) {
    if (enabled && !layer.isGroup) updateLayerProp(layer.id, 'isGroup', true)
    updateLayerProp(layer.id, 'clipChildren', enabled)
  }

  const moveLayerTree = (key: 'x' | 'y', nextValue: number) => {
    const rounded = Math.round(nextValue)
    setLayerAnimatedProperty(layer.id, key as never, rounded)
  }
  const setRelativeX = (value: number) => moveLayerTree('x', value)
  const setRelativeY = (value: number) => moveLayerTree('y', value)
  const setWidth = (value: number) => {
    materializeAutoFrame()
    if (sizeMode !== 'fixed') updateLayerProp(layer.id, 'sizeMode', 'fixed')
    const nextWidth = Math.max(1, Math.round(value))
    setLayerAnimatedProperty(layer.id, 'width' as never, nextWidth)
    if (aspectLocked && canLockAspect) {
      setLayerAnimatedProperty(layer.id, 'height' as never, Math.max(1, Math.round(nextWidth / aspectRatio)))
    }
  }
  const setHeight = (value: number) => {
    materializeAutoFrame()
    if (sizeMode !== 'fixed') updateLayerProp(layer.id, 'sizeMode', 'fixed')
    if (layer.type === 'line') updateLayerProp(layer.id, 'strokeWidth', Math.max(1, Math.round(value)))
    else {
      const nextHeight = Math.max(1, Math.round(value))
      setLayerAnimatedProperty(layer.id, 'height' as never, nextHeight)
      if (aspectLocked && canLockAspect) {
        setLayerAnimatedProperty(layer.id, 'width' as never, Math.max(1, Math.round(nextHeight * aspectRatio)))
      }
    }
  }
  const boxVisualW = Math.abs(effectiveW * p.scale * p.scaleX)
  const boxVisualH = Math.abs(effectiveH * p.scale * p.scaleY)
  const mediaVisual = visibleImageSize(animatedLayer, boxVisualW, boxVisualH)
  const visualW = mediaVisual.width
  const visualH = mediaVisual.height
  const frameBox = layerFrameBox(layer, layers, currentFrame, canvasW, canvasH)
  const visualBox = {
    left: frameBox.centerX - visualW / 2,
    right: frameBox.centerX + visualW / 2,
    top: frameBox.centerY - visualH / 2,
    bottom: frameBox.centerY + visualH / 2,
    centerX: frameBox.centerX,
    centerY: frameBox.centerY,
  }
  const targetBox = parentLayer
    ? layerFrameBox(parentLayer, layers, currentFrame, canvasW, canvasH)
    : { left: 0, right: canvasW, top: 0, bottom: canvasH, centerX: canvasW / 2, centerY: canvasH / 2 }
  const alignX = (mode: 'left' | 'center' | 'right') => {
    const delta = mode === 'left'
      ? targetBox.left - visualBox.left
      : mode === 'right'
        ? targetBox.right - visualBox.right
        : targetBox.centerX - visualBox.centerX
    moveLayerTree('x', p.x + delta)
  }
  const alignY = (mode: 'top' | 'middle' | 'bottom') => {
    const delta = mode === 'top'
      ? targetBox.top - visualBox.top
      : mode === 'bottom'
        ? targetBox.bottom - visualBox.bottom
        : targetBox.centerY - visualBox.centerY
    moveLayerTree('y', p.y + delta)
  }

  return (
    <div>
      {/* ── FRAME ────────────────────────────────────────────── */}
      <Section title={t('transform.frame')}>
        <Row label={t('transform.position')}>
          <NumField leading="X" value={relativeX} step={1} precision={1} onChange={setRelativeX} ariaLabel={t('transform.xPositionAria')} />
          <NumField leading="Y" value={relativeY} step={1} precision={1} onChange={setRelativeY} ariaLabel={t('transform.yPositionAria')} />
          <NumField leading="Z" value={relativeZ} step={10} precision={1} sensitivity={10} onChange={(v) => handleTransformChange('z', v)} ariaLabel={t('transform.zPositionAria')} />
        </Row>
        <Row label={t('transform.size')}>
          <NumField leading="W" value={effectiveW} min={1} step={1} precision={0} onChange={setWidth} ariaLabel={t('transform.widthAria')} />
          <button
            type="button"
            disabled={!canLockAspect}
            onClick={() => setAspectLocked((v) => !v)}
            title={aspectLocked ? t('transform.unlockAspect') : t('transform.lockAspect')}
            style={{
              width: 22, height: 22, flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              borderRadius: 3,
              color: aspectLocked ? 'var(--accent)' : 'var(--text3)',
              background: aspectLocked ? 'var(--accent-bg)' : 'transparent',
              opacity: canLockAspect ? 1 : 0.35,
              transition: 'background 0.1s',
            }}
          >
            {aspectLocked ? <Link2 size={12} /> : <Unlink2 size={12} />}
          </button>
          <NumField leading="H" value={effectiveH} min={1} step={1} precision={0} onChange={setHeight} ariaLabel={t('transform.heightAria')} />
        </Row>
        <Row label={t('transform.align')}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 2, flex: 1 }}>
            <IconBtn title={t('transform.alignLeft')} onClick={() => alignX('left')}><AlignStartVertical size={13} /></IconBtn>
            <IconBtn title={t('transform.alignCenter')} onClick={() => alignX('center')}><AlignCenterVertical size={13} /></IconBtn>
            <IconBtn title={t('transform.alignRight')} onClick={() => alignX('right')}><AlignEndVertical size={13} /></IconBtn>
            <IconBtn title={t('transform.alignTop')} onClick={() => alignY('top')}><AlignStartHorizontal size={13} /></IconBtn>
            <IconBtn title={t('transform.alignMiddle')} onClick={() => alignY('middle')}><AlignCenterHorizontal size={13} /></IconBtn>
            <IconBtn title={t('transform.alignBottom')} onClick={() => alignY('bottom')}><AlignEndHorizontal size={13} /></IconBtn>
          </div>
        </Row>
        <Row label={t('transform.sizing')}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 2, flex: 1 }}>
            {([
              ['fixed', t('transform.fixed')],
              ['fit-content', t('transform.fit')],
              ['fill-canvas', t('transform.fill')],
            ] as const).map(([mode, label]) => (
              <button
                key={mode}
                onClick={() => setSizeMode(mode)}
                disabled={mode === 'fit-content' && !canFit}
                style={{
                  height: 24, fontSize: 10, borderRadius: 3,
                  background: sizeMode === mode ? 'var(--accent-bg)' : 'transparent',
                  color: sizeMode === mode ? 'var(--accent)' : 'var(--text2)',
                  opacity: mode === 'fit-content' && !canFit ? 0.4 : 1,
                  transition: 'background 0.1s, color 0.1s',
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </Row>
        {canMaskLayer && (
          <Row label={t('transform.mask')}>
            <label
              className="w-full"
              style={{
                height: 24,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontSize: 11,
                color: 'var(--text2)',
                cursor: 'pointer',
                userSelect: 'none',
              }}
            >
              <input
                type="checkbox"
                checked={!!layer.clipChildren}
                onChange={(e) => setClipChildren(e.target.checked)}
              />
              {t('transform.clipChildren')}
            </label>
          </Row>
        )}
      </Section>

      {/* ── LAYOUT (groups only) ────────────────────────────── */}
      {canUseLayout && (
        <Section title={t('transform.layout')} defaultOpen={false}>
          <Row label={t('transform.mode')}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 2, flex: 1 }}>
              {LAYOUT_MODES.map((mode) => (
                <button
                  key={mode.value}
                  onClick={() => updateLayerProp(layer.id, 'layoutMode', mode.value)}
                  style={{
                    height: 24, fontSize: 10, borderRadius: 3,
                    background: layoutMode === mode.value ? 'var(--accent-bg)' : 'transparent',
                    color: layoutMode === mode.value ? 'var(--accent)' : 'var(--text2)',
                  }}
                >
                  {t(`transform.${mode.value}`, { defaultValue: mode.label })}
                </button>
              ))}
            </div>
          </Row>
          {layoutMode !== 'none' && (
            <>
              {layoutMode === 'flex' && (
                <Row label={t('transform.direction')}>
                  <select
                    value={layer.layoutDirection ?? 'row'}
                    onChange={(e) => updateLayerProp(layer.id, 'layoutDirection', e.target.value as LayoutDirection)}
                    className="input-base"
                    style={{ flex: 1, height: 26 }}
                  >
                    {LAYOUT_DIRECTIONS.map((dir) => <option key={dir.value} value={dir.value}>{t(`transform.${dir.value}`, { defaultValue: dir.label })}</option>)}
                  </select>
                </Row>
              )}
              <Row label={t('transform.align')}>
                <select
                  value={layer.layoutAlign ?? 'center'}
                  onChange={(e) => updateLayerProp(layer.id, 'layoutAlign', e.target.value as LayoutAlign)}
                  className="input-base"
                  style={{ flex: 1, height: 26 }}
                >
                  {LAYOUT_ALIGNS.map((a) => <option key={a.value} value={a.value}>{t(`transform.${a.value}`, { defaultValue: a.label })}</option>)}
                </select>
              </Row>
              <Row label={t('transform.justify')}>
                <select
                  value={layer.layoutJustify ?? 'start'}
                  onChange={(e) => updateLayerProp(layer.id, 'layoutJustify', e.target.value as LayoutJustify)}
                  className="input-base"
                  style={{ flex: 1, height: 26 }}
                >
                  {LAYOUT_JUSTIFIES.map((j) => <option key={j.value} value={j.value}>{t(`transform.${j.value === 'space-between' ? 'spaceBetween' : j.value}`, { defaultValue: j.label })}</option>)}
                </select>
              </Row>
              <Row label={t('transform.padding')}>
                <NumField leading="P" value={layer.layoutPadding ?? 16} min={0} step={1} precision={0} unit="px" onChange={(v) => updateLayerProp(layer.id, 'layoutPadding', Math.max(0, Math.round(v)))} />
              </Row>
              <Row label={t('transform.gap')}>
                <NumField leading="G" value={layer.layoutGap ?? 12} min={0} step={1} precision={0} unit="px" onChange={(v) => updateLayerProp(layer.id, 'layoutGap', Math.max(0, Math.round(v)))} />
              </Row>
              {layoutMode === 'grid' && (
                <Row label={t('transform.columns')}>
                  <NumField leading="#" value={layer.gridColumns ?? 2} min={1} step={1} precision={0} onChange={(v) => updateLayerProp(layer.id, 'gridColumns', Math.max(1, Math.round(v)))} />
                </Row>
              )}
            </>
          )}
        </Section>
      )}

      {/* ── TRANSFORM ──────────────────────────────────────── */}
      <Section title={t('transform.transform')}>
        <Row label={t('transform.scale')}>
          <NumField leading="S" value={p.scale} step={0.01} precision={3} sensitivity={0.01} onChange={(v) => handleTransformChange('scale', v)} />
        </Row>
        <Row label={t('transform.scaleXY')}>
          <NumField leading="X" value={p.scaleX} step={0.01} precision={3} sensitivity={0.01} onChange={(v) => handleTransformChange('scaleX', v)} />
          <NumField leading="Y" value={p.scaleY} step={0.01} precision={3} sensitivity={0.01} onChange={(v) => handleTransformChange('scaleY', v)} />
        </Row>

        {/* 3D Rotation — improved with axis indicators, visual preview, tooltips */}
        <Rotation3D
          rotateX={p.rotateX}
          rotateY={p.rotateY}
          rotateZ={p.rotateZ}
          onChange={(axis, v) => handleTransformChange(axis, v)}
        />

        <Row label={t('transform.skew')}>
          <NumField leading="X" value={p.skewX} unit="°" step={0.5} precision={1} onChange={(v) => handleTransformChange('skewX', v)} />
          <NumField leading="Y" value={p.skewY} unit="°" step={0.5} precision={1} onChange={(v) => handleTransformChange('skewY', v)} />
        </Row>
        <Row label={t('transform.origin')}>
          <NumField leading="X" value={p.originX} unit="%" step={1} precision={1} onChange={(v) => handleTransformChange('originX', v)} />
          <NumField leading="Y" value={p.originY} unit="%" step={1} precision={1} onChange={(v) => handleTransformChange('originY', v)} />
        </Row>
        <Row label={t('transform.opacity')}>
          <NumField
            leading="O"
            value={Math.round(p.opacity * 100)}
            step={1}
            min={0}
            precision={0}
            sensitivity={1}
            unit="%"
            onChange={(v) => handleTransformChange('opacity', Math.max(0, Math.min(100, v)) / 100)}
          />
        </Row>
        <Row label={t('transform.perspective')}>
          <NumField leading="P" value={p.perspective} step={10} sensitivity={10} precision={0} onChange={(v) => handleTransformChange('perspective', v)} />
        </Row>
      </Section>

      {/* ── KEYFRAME ──────────────────────────────────────── */}
      <Section title={t('transform.keyframe')} defaultOpen={false}>
        <Row label={t('transform.easing')}>
          <select
            value={activeKf?.easing ?? 'ease-out'}
            onChange={(e) => activeKf && updateKeyframeEasing(layer.id, activeKf.frame, e.target.value as PairEasingType, activeKf.bezier)}
            className="input-base"
            style={{ flex: 1, height: 26 }}
          >
            {EASINGS.map((e) => <option key={e} value={e}>{e}</option>)}
          </select>
        </Row>
        {activeKf?.easing === 'custom' && (
          <Row label={t('transform.bezier')}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 2, flex: 1 }}>
              {(activeKf.bezier ?? [0.25, 0.1, 0.25, 1]).map((v, i) => (
                <NumField
                  key={i}
                  leading={['x1', 'y1', 'x2', 'y2'][i]}
                  value={v}
                  min={0}
                  step={0.01}
                  precision={2}
                  sensitivity={0.01}
                  onChange={(next) => {
                    if (!activeKf) return
                    const arr = [...(activeKf.bezier ?? [0.25, 0.1, 0.25, 1])] as [number, number, number, number]
                    arr[i] = Math.max(0, Math.min(1, next))
                    updateKeyframeEasing(layer.id, activeKf.frame, 'custom', arr)
                  }}
                />
              ))}
            </div>
          </Row>
        )}
        <button
          onClick={handleAddKeyframe}
          style={{
            width: '100%', height: 28, fontSize: 11, fontWeight: 500,
            background: '#f59e0b', color: '#000', borderRadius: 3,
            transition: 'opacity 0.1s',
          }}
        >
          ◆ {t('transform.addKeyframeAt', { frame: currentFrame })}
        </button>
        <div style={{ fontSize: 10, color: 'var(--text3)', textAlign: 'center' }}>
          {t('transform.keyframesCount', { count: layer.keyframes.length })}
        </div>
      </Section>
    </div>
  )
}

export function SectionHeader({ label }: { label: string }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '8px 12px',
        borderTop: '1px solid var(--border)',
        fontSize: 10,
        fontWeight: 500,
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        color: 'var(--text2)',
        userSelect: 'none',
      }}
    >
      {label}
    </div>
  )
}
