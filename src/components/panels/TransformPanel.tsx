import {
  AlignCenterHorizontal, AlignCenterVertical, AlignEndHorizontal, AlignEndVertical,
  AlignStartHorizontal, AlignStartVertical, Box, Clock3, Link2, Maximize2, MoveHorizontal,
  MoveVertical, Rotate3D, RotateCw, Scaling, StretchHorizontal, StretchVertical,
  Unlink2,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useStore } from '../../store'
import { Layer, LayoutAlign, LayoutDirection, LayoutJustify, LayoutMode, TransformProps, PairEasingType, SizeMode } from '../../types'
import { ScrubField } from './ScrubField'
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

function IconNumberField({ label, icon: Icon, value, onChange, unit, step = 1, min, precision = 2 }: {
  label: string
  icon: typeof MoveHorizontal
  value: number
  onChange: (value: number) => void
  unit?: string
  step?: number
  min?: number
  precision?: number
}) {
  const beginInteraction = useStore((s) => s.beginInteraction)
  const endInteraction = useStore((s) => s.endInteraction)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(formatNumber(value, precision))
  const timerRef = useRef<number | null>(null)
  const editingRef = useRef(false)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  useEffect(() => {
    if (!editingRef.current) setDraft(formatNumber(value, precision))
  }, [value, precision])

  useEffect(() => () => {
    if (timerRef.current) window.clearTimeout(timerRef.current)
  }, [])

  function clamp(v: number) {
    return min !== undefined ? Math.max(min, v) : v
  }

  function applyValue(raw: string) {
    const next = Number(raw)
    if (!Number.isFinite(next)) return false
    onChangeRef.current(clamp(parseFloat(next.toFixed(precision))))
    return true
  }

  function scheduleValue(raw: string) {
    if (timerRef.current) window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null
      applyValue(raw)
    }, 180)
  }

  function startEditing() {
    if (editingRef.current) return
    editingRef.current = true
    setEditing(true)
    setDraft(formatNumber(value, precision))
    beginInteraction(true)
  }

  function stopEditing(commit: boolean) {
    if (!editingRef.current) return
    if (timerRef.current) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
    if (commit) applyValue(draft)
    else setDraft(formatNumber(value, precision))
    editingRef.current = false
    setEditing(false)
    endInteraction()
  }

  return (
    <label className="min-w-0">
      <div className="flex items-center gap-1 mb-1" style={{ color: 'var(--text3)' }}>
        <Icon size={13} />
        <span className="text-[10px] uppercase">{label}</span>
      </div>
      <div className="relative">
        <input
          type="number"
          value={editing ? draft : formatNumber(value, precision)}
          min={min}
          step={step}
          onFocus={startEditing}
          onChange={(e) => {
            setDraft(e.target.value)
            scheduleValue(e.target.value)
          }}
          onBlur={() => stopEditing(true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.currentTarget.blur()
            }
            if (e.key === 'Escape') {
              e.preventDefault()
              stopEditing(false)
              e.currentTarget.blur()
            }
          }}
          className="input-base w-full text-right pr-5"
        />
        {unit && (
          <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[9px]" style={{ color: 'var(--text3)' }}>
            {unit}
          </span>
        )}
      </div>
    </label>
  )
}

function IconAction({ title, icon: Icon, onClick }: {
  title: string
  icon: typeof AlignStartHorizontal
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="icon-btn"
      style={{ width: '100%', height: 28, minWidth: 0, borderRadius: 6 }}
    >
      <Icon size={15} strokeWidth={2.1} />
    </button>
  )
}

function PanelGroup({ title, icon: Icon, children }: { title: string; icon: typeof Box; children: React.ReactNode }) {
  return (
    <section>
      <div className="flex items-center gap-1.5 px-3 py-1.5" style={{ borderBottom: '1px solid var(--border)', borderTop: '1px solid var(--border)', color: 'var(--text3)' }}>
        <Icon size={11} />
        <span style={{ fontSize: 10, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{title}</span>
      </div>
      <div className="px-3 py-2 flex flex-col gap-2">
        {children}
      </div>
    </section>
  )
}

function SubLabel({ children }: { children: React.ReactNode }) {
  return <div className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--text3)' }}>{children}</div>
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
  if (layer.type !== 'image') return { width, height }
  const fit = layer.imageFit ?? 'contain'
  if (fit === 'fill' || fit === 'cover') return { width, height }
  const naturalW = layer.imageNaturalWidth
  const naturalH = layer.imageNaturalHeight
  if (!naturalW || !naturalH) return { width, height }

  const containScale = Math.min(width / naturalW, height / naturalH)
  const scale = fit === 'scale-down' ? Math.min(1, containScale) : containScale
  return {
    width: naturalW * scale,
    height: naturalH * scale,
  }
}

function groupOrigin(layer: Layer | null) {
  if (!layer) return { x: 0, y: 0 }
  const first = [...layer.keyframes].sort((a, b) => a.frame - b.frame)[0]
  return {
    x: layer.groupOriginX ?? first?.props.x ?? 0,
    y: layer.groupOriginY ?? first?.props.y ?? 0,
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
    const origin = groupOrigin(parent)
    x += p.x - origin.x
    y += p.y - origin.y
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
  const layer = layers.find((l) => l.id === selectedLayerIds[0])
  const [aspectLocked, setAspectLocked] = useState(false)

  useEffect(() => {
    setAspectLocked(false)
  }, [layer?.id])

  if (!layer) return null

  const p = resolveLayerAnimation(layer, currentFrame).transform
  const sorted = [...layer.keyframes].sort((a, b) => a.frame - b.frame)
  const activeKf = sorted.reduce<typeof sorted[0] | null>((found, kf) => kf.frame <= currentFrame ? kf : found, null)

  function handleTransformChange(key: keyof TransformProps, value: number) {
    setLayerAnimatedProperty(layer!.id, key, value)
  }

  function handleAddKeyframe() {
    addKeyframe(layer!.id, currentFrame, { ...p })
  }

  const canvasW = canvasPreset.name === 'Custom' ? customWidth : canvasPreset.width
  const canvasH = canvasPreset.name === 'Custom' ? customHeight : canvasPreset.height
  const sizeMode = layer.sizeMode ?? 'fixed'
  const canUseLayout = layer.type === 'group' || layer.isGroup
  const layoutMode = layer.layoutMode ?? 'none'
  const parentLayer = layer.parentId ? layers.find((item) => item.id === layer.parentId) : null
  const parentOrigin = groupOrigin(parentLayer)
  const relativeX = p.x - parentOrigin.x
  const relativeY = p.y - parentOrigin.y
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
      setLayerAnimatedProperty(layer.id, 'width', next.width)
      setLayerAnimatedProperty(layer.id, 'height', next.height)
    }
    if (mode === 'fill-canvas') {
      setLayerAnimatedProperty(layer.id, 'width', canvasW)
      setLayerAnimatedProperty(layer.id, 'height', canvasH)
    }
  }

  const moveLayerTree = (key: 'x' | 'y', nextValue: number) => {
    const rounded = Math.round(nextValue)
    setLayerAnimatedProperty(layer.id, key, rounded)
  }
  const setRelativeX = (value: number) => moveLayerTree('x', parentOrigin.x + value)
  const setRelativeY = (value: number) => moveLayerTree('y', parentOrigin.y + value)
  const setWidth = (value: number) => {
    materializeAutoFrame()
    if (sizeMode !== 'fixed') updateLayerProp(layer.id, 'sizeMode', 'fixed')
    const nextWidth = Math.max(1, Math.round(value))
    setLayerAnimatedProperty(layer.id, 'width', nextWidth)
    if (aspectLocked && canLockAspect) {
      setLayerAnimatedProperty(layer.id, 'height', Math.max(1, Math.round(nextWidth / aspectRatio)))
    }
  }
  const setHeight = (value: number) => {
    materializeAutoFrame()
    if (sizeMode !== 'fixed') updateLayerProp(layer.id, 'sizeMode', 'fixed')
    if (layer.type === 'line') updateLayerProp(layer.id, 'strokeWidth', Math.max(1, Math.round(value)))
    else {
      const nextHeight = Math.max(1, Math.round(value))
      setLayerAnimatedProperty(layer.id, 'height', nextHeight)
      if (aspectLocked && canLockAspect) {
        setLayerAnimatedProperty(layer.id, 'width', Math.max(1, Math.round(nextHeight * aspectRatio)))
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
    <div className="flex flex-col gap-0 pb-2">
      <PanelGroup title={t('transform.frame')} icon={Box}>
        <SubLabel>{parentLayer ? t('transform.positionRelative', { name: parentLayer.name }) : t('transform.position')}</SubLabel>
        <div className="grid grid-cols-2 gap-2">
          <IconNumberField label="X" icon={MoveHorizontal} value={relativeX} step={1} precision={1} onChange={setRelativeX} />
          <IconNumberField label="Y" icon={MoveVertical} value={relativeY} step={1} precision={1} onChange={setRelativeY} />
        </div>
        <SubLabel>{t('transform.size')}</SubLabel>
        <div className="grid grid-cols-[1fr_28px_1fr] gap-2 items-end">
          <IconNumberField label="W" icon={StretchHorizontal} value={effectiveW} min={1} step={1} precision={0} onChange={setWidth} />
          <button
            type="button"
            className={`icon-btn ${aspectLocked ? 'active' : ''}`}
            disabled={!canLockAspect}
            title={aspectLocked ? t('transform.unlockAspect') : t('transform.lockAspect')}
            onClick={() => setAspectLocked((locked) => !locked)}
            style={{ width: 28, minWidth: 28, height: 28, opacity: canLockAspect ? 1 : 0.35 }}
          >
            {aspectLocked ? <Link2 size={14} /> : <Unlink2 size={14} />}
          </button>
          <IconNumberField label={layer.type === 'line' ? t('transform.stroke') : 'H'} icon={StretchVertical} value={effectiveH} min={1} step={1} precision={0} onChange={setHeight} />
        </div>
        <SubLabel>{t('transform.alignTo', { target: parentLayer ? t('transform.parent') : t('transform.canvas') })}</SubLabel>
        <div className="grid grid-cols-3 gap-1 justify-items-stretch">
          <IconAction title={t('transform.alignLeft')} icon={AlignStartVertical} onClick={() => alignX('left')} />
          <IconAction title={t('transform.alignCenter')} icon={AlignCenterVertical} onClick={() => alignX('center')} />
          <IconAction title={t('transform.alignRight')} icon={AlignEndVertical} onClick={() => alignX('right')} />
          <IconAction title={t('transform.alignTop')} icon={AlignStartHorizontal} onClick={() => alignY('top')} />
          <IconAction title={t('transform.alignMiddle')} icon={AlignCenterHorizontal} onClick={() => alignY('middle')} />
          <IconAction title={t('transform.alignBottom')} icon={AlignEndHorizontal} onClick={() => alignY('bottom')} />
        </div>
        <SubLabel>{t('transform.sizingMode')}</SubLabel>
        <div className="grid grid-cols-3 gap-1">
        {([
          ['fixed', t('transform.fixed')],
          ['fit-content', t('transform.fit')],
          ['fill-canvas', t('transform.fill')],
        ] as const).map(([mode, label]) => (
          <button
            key={mode}
            onClick={() => setSizeMode(mode)}
            disabled={mode === 'fit-content' && !canFit}
            className="pill-btn text-[10px]"
            style={{
              height: 24,
              padding: '0 6px',
              background: sizeMode === mode ? 'var(--accent-bg)' : 'var(--input)',
              color: sizeMode === mode ? 'var(--accent)' : 'var(--text2)',
              opacity: mode === 'fit-content' && !canFit ? 0.45 : 1,
            }}
          >
            {label}
          </button>
        ))}
        </div>
      </PanelGroup>

      {canUseLayout && (
        <PanelGroup title={t('transform.layout')} icon={Maximize2}>
            <div className="grid grid-cols-3 gap-1">
              {LAYOUT_MODES.map((mode) => (
                <button
                  key={mode.value}
                  onClick={() => updateLayerProp(layer.id, 'layoutMode', mode.value)}
                  className="pill-btn text-[10px]"
                  style={{
                    height: 24,
                    padding: '0 6px',
                    background: layoutMode === mode.value ? 'var(--accent-bg)' : 'var(--input)',
                    color: layoutMode === mode.value ? 'var(--accent)' : 'var(--text2)',
                  }}
                >
                  {t(`transform.${mode.value}`, { defaultValue: mode.label })}
                </button>
              ))}
            </div>
            {layoutMode !== 'none' && (
              <>
                {layoutMode === 'flex' && (
                  <label className="flex items-center gap-2 text-xs" style={{ color: 'var(--text2)' }}>
                    {t('transform.direction')}
                    <select
                      value={layer.layoutDirection ?? 'row'}
                      onChange={(e) => updateLayerProp(layer.id, 'layoutDirection', e.target.value as LayoutDirection)}
                      className="input-base flex-1"
                    >
                      {LAYOUT_DIRECTIONS.map((direction) => <option key={direction.value} value={direction.value}>{t(`transform.${direction.value}`, { defaultValue: direction.label })}</option>)}
                    </select>
                  </label>
                )}
                <label className="flex items-center gap-2 text-xs" style={{ color: 'var(--text2)' }}>
                  {t('transform.align')}
                  <select
                    value={layer.layoutAlign ?? 'center'}
                    onChange={(e) => updateLayerProp(layer.id, 'layoutAlign', e.target.value as LayoutAlign)}
                    className="input-base flex-1"
                  >
                    {LAYOUT_ALIGNS.map((align) => <option key={align.value} value={align.value}>{t(`transform.${align.value}`, { defaultValue: align.label })}</option>)}
                  </select>
                </label>
                <label className="flex items-center gap-2 text-xs" style={{ color: 'var(--text2)' }}>
                  {t('transform.justify')}
                  <select
                    value={layer.layoutJustify ?? 'start'}
                    onChange={(e) => updateLayerProp(layer.id, 'layoutJustify', e.target.value as LayoutJustify)}
                    className="input-base flex-1"
                  >
                    {LAYOUT_JUSTIFIES.map((justify) => <option key={justify.value} value={justify.value}>{t(`transform.${justify.value === 'space-between' ? 'spaceBetween' : justify.value}`, { defaultValue: justify.label })}</option>)}
                  </select>
                </label>
              </>
            )}
          {layoutMode !== 'none' && (
            <>
              <ScrubField
                label={t('transform.padding')} value={layer.layoutPadding ?? 16} min={0} step={1} sensitivity={1} unit="px"
                onChange={(v) => updateLayerProp(layer.id, 'layoutPadding', Math.max(0, Math.round(v)))}
              />
              <ScrubField
                label={t('transform.gap')} value={layer.layoutGap ?? 12} min={0} step={1} sensitivity={1} unit="px"
                onChange={(v) => updateLayerProp(layer.id, 'layoutGap', Math.max(0, Math.round(v)))}
              />
              {layoutMode === 'grid' && (
                <ScrubField
                  label={t('transform.columns')} value={layer.gridColumns ?? 2} min={1} max={12} step={1} sensitivity={0.1}
                  onChange={(v) => updateLayerProp(layer.id, 'gridColumns', Math.max(1, Math.round(v)))}
                />
              )}
            </>
          )}
        </PanelGroup>
      )}

      {/* Transform section */}
      <PanelGroup title={t('transform.transform')} icon={Rotate3D}>
      <SubLabel>{t('transform.scale')}</SubLabel>
      <div className="grid grid-cols-2 gap-2">
        <IconNumberField label={t('transform.scale')} icon={Scaling} value={p.scale} step={0.01} precision={3} onChange={(v) => handleTransformChange('scale', v)} />
        <IconNumberField label="X" icon={StretchHorizontal} value={p.scaleX} step={0.01} precision={3} onChange={(v) => handleTransformChange('scaleX', v)} />
        <IconNumberField label="Y" icon={StretchVertical} value={p.scaleY} step={0.01} precision={3} onChange={(v) => handleTransformChange('scaleY', v)} />
      </div>
      <SubLabel>{t('transform.rotation')}</SubLabel>
      <div className="grid grid-cols-3 gap-2">
        <IconNumberField label="X" icon={RotateCw} value={p.rotateX} unit="deg" step={1} precision={1} onChange={(v) => handleTransformChange('rotateX', v)} />
        <IconNumberField label="Y" icon={RotateCw} value={p.rotateY} unit="deg" step={1} precision={1} onChange={(v) => handleTransformChange('rotateY', v)} />
        <IconNumberField label="Z" icon={RotateCw} value={p.rotateZ} unit="deg" step={1} precision={1} onChange={(v) => handleTransformChange('rotateZ', v)} />
      </div>
      <SubLabel>{t('transform.opacity')}</SubLabel>
      <ScrubField label={t('transform.opacity')} value={p.opacity} step={0.01} sensitivity={0.01} precision={2} onChange={(v) => handleTransformChange('opacity', v)} />
      <SubLabel>{t('transform.skew')}</SubLabel>
      <div className="grid grid-cols-2 gap-2">
        <IconNumberField label="X" icon={StretchHorizontal} value={p.skewX} unit="deg" step={0.5} precision={1} onChange={(v) => handleTransformChange('skewX', v)} />
        <IconNumberField label="Y" icon={StretchVertical} value={p.skewY} unit="deg" step={0.5} precision={1} onChange={(v) => handleTransformChange('skewY', v)} />
      </div>
      <SubLabel>{t('transform.origin')}</SubLabel>
      <div className="grid grid-cols-2 gap-2">
        <IconNumberField label="X" icon={MoveHorizontal} value={p.originX} unit="%" step={1} precision={1} onChange={(v) => handleTransformChange('originX', v)} />
        <IconNumberField label="Y" icon={MoveVertical} value={p.originY} unit="%" step={1} precision={1} onChange={(v) => handleTransformChange('originY', v)} />
      </div>
      <SubLabel>{t('transform.depth')}</SubLabel>
      <ScrubField label={t('transform.perspective')} value={p.perspective} step={10} sensitivity={10} precision={0} onChange={(v) => handleTransformChange('perspective', v)} />
      </PanelGroup>

      {/* Keyframe controls */}
      <PanelGroup title={t('transform.keyframe')} icon={Clock3}>
      <div className="px-3 py-2 flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xs flex-shrink-0" style={{ color: 'var(--text2)' }}>{t('transform.easing')}</span>
          <select
            value={activeKf?.easing ?? 'ease-out'}
            onChange={(e) => activeKf && updateKeyframeEasing(layer.id, activeKf.frame, e.target.value as PairEasingType, activeKf.bezier)}
            className="input-base flex-1"
          >
            {EASINGS.map((e) => <option key={e} value={e}>{e}</option>)}
          </select>
        </div>
        {activeKf?.easing === 'custom' && (
          <div className="grid grid-cols-2 gap-1">
            {(activeKf.bezier ?? [0.25, 0.1, 0.25, 1]).map((v, i) => (
              <label key={i} className="flex items-center gap-1 text-[10px]" style={{ color: 'var(--text3)' }}>
                {['x1', 'y1', 'x2', 'y2'][i]}
                <input
                  type="number"
                  min={0}
                  max={1}
                  step={0.01}
                  value={v}
                  onChange={(e) => {
                    if (!activeKf) return
                    const next = [...(activeKf.bezier ?? [0.25, 0.1, 0.25, 1])] as [number, number, number, number]
                    next[i] = Number(e.target.value)
                    updateKeyframeEasing(layer.id, activeKf.frame, 'custom', next)
                  }}
                  className="input-base w-full text-right"
                />
              </label>
            ))}
          </div>
        )}
        <div className="text-[10px]" style={{ color: 'var(--text3)' }}>
          {t('transform.appliesNext')}
        </div>
        <button
          onClick={handleAddKeyframe}
          className="w-full text-xs font-semibold rounded py-1.5 transition-colors"
          style={{ background: '#f59e0b', color: '#000' }}
        >
          ◆ {t('transform.addKeyframeAt', { frame: currentFrame })}
        </button>
        <div className="text-center" style={{ color: 'var(--text3)', fontSize: 10 }}>
          {t('transform.keyframesCount', { count: layer.keyframes.length })}
        </div>
      </div>
      </PanelGroup>
    </div>
  )
}

export function SectionHeader({ label, icon: Icon }: { label: string; icon?: typeof Box }) {
  return (
    <div className="px-3 pt-3 pb-1 flex items-center gap-1.5" style={{ color: 'var(--text3)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
      {Icon && <Icon size={12} />}
      {label}
    </div>
  )
}
