import {
  AlignCenterHorizontal, AlignCenterVertical, AlignEndHorizontal, AlignEndVertical,
  AlignStartHorizontal, AlignStartVertical, Box, Clock3, Maximize2, MoveHorizontal,
  MoveVertical, Rotate3D, RotateCw, Scaling, StretchHorizontal, StretchVertical,
} from 'lucide-react'
import { useStore } from '../../store'
import { LayoutAlign, LayoutDirection, LayoutJustify, LayoutMode, TransformProps, PairEasingType, SizeMode } from '../../types'
import { ScrubField } from './ScrubField'
import { resolveLayerAnimation } from '../../animationProperties'
import { descendantsOf } from '../../layerTree'

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
  const display = Number.isInteger(value) ? String(value) : String(parseFloat(value.toFixed(precision)))
  return (
    <label className="min-w-0">
      <div className="flex items-center gap-1 mb-1" style={{ color: 'var(--text3)' }}>
        <Icon size={13} />
        <span className="text-[10px] uppercase">{label}</span>
      </div>
      <div className="relative">
        <input
          type="number"
          value={display}
          min={min}
          step={step}
          onChange={(e) => {
            const next = Number(e.target.value)
            if (Number.isFinite(next)) onChange(next)
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
    <section className="mx-2 my-2 rounded-md overflow-hidden" style={{ border: '1px solid var(--border)', background: 'var(--panel)' }}>
      <div className="flex items-center gap-1.5 px-2.5 py-2" style={{ borderBottom: '1px solid var(--border)', color: 'var(--text2)' }}>
        <Icon size={13} />
        <span className="text-[10px] font-semibold uppercase tracking-widest">{title}</span>
      </div>
      <div className="p-2 flex flex-col gap-2">
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

export function TransformPanel() {
  const {
    layers, selectedLayerIds, currentFrame,
    canvasPreset, customWidth, customHeight,
    addKeyframe, setLayerAnimatedProperty, updateLayerProp,
    updateKeyframeEasing,
  } = useStore()
  const layer = layers.find((l) => l.id === selectedLayerIds[0])
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
  const parentP = parentLayer ? resolveLayerAnimation(parentLayer, currentFrame).transform : null
  const relativeX = p.x - (parentP?.x ?? 0)
  const relativeY = p.y - (parentP?.y ?? 0)
  const animatedLayer = resolveLayerAnimation(layer, currentFrame).layer
  const effectiveW = sizeMode === 'fill-canvas' ? canvasW : animatedLayer.width
  const effectiveH = sizeMode === 'fill-canvas' ? canvasH : animatedLayer.type === 'line' ? animatedLayer.strokeWidth || 2 : animatedLayer.height
  const parentW = parentLayer ? (parentLayer.sizeMode === 'fill-canvas' ? canvasW : parentLayer.width) : canvasW
  const parentH = parentLayer ? (parentLayer.sizeMode === 'fill-canvas' ? canvasH : parentLayer.type === 'line' ? parentLayer.strokeWidth || 2 : parentLayer.height) : canvasH
  const canFit = layer.type === 'text' || layer.autoFit || layer.type === 'group'

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
    const delta = rounded - p[key]
    setLayerAnimatedProperty(layer.id, key, rounded)
    descendantsOf(layers, layer.id).forEach((child) => {
      const childP = resolveLayerAnimation(child, currentFrame).transform
      setLayerAnimatedProperty(child.id, key, Math.round(childP[key] + delta))
    })
  }
  const setRelativeX = (value: number) => moveLayerTree('x', (parentP?.x ?? 0) + value)
  const setRelativeY = (value: number) => moveLayerTree('y', (parentP?.y ?? 0) + value)
  const setWidth = (value: number) => {
    materializeAutoFrame()
    if (sizeMode !== 'fixed') updateLayerProp(layer.id, 'sizeMode', 'fixed')
    setLayerAnimatedProperty(layer.id, 'width', Math.max(1, Math.round(value)))
  }
  const setHeight = (value: number) => {
    materializeAutoFrame()
    if (sizeMode !== 'fixed') updateLayerProp(layer.id, 'sizeMode', 'fixed')
    if (layer.type === 'line') updateLayerProp(layer.id, 'strokeWidth', Math.max(1, Math.round(value)))
    else setLayerAnimatedProperty(layer.id, 'height', Math.max(1, Math.round(value)))
  }
  const boxVisualW = Math.abs(effectiveW * p.scale * p.scaleX)
  const boxVisualH = Math.abs(effectiveH * p.scale * p.scaleY)
  const mediaVisual = visibleImageSize(animatedLayer, boxVisualW, boxVisualH)
  const visualW = mediaVisual.width
  const visualH = mediaVisual.height
  const alignX = (mode: 'left' | 'center' | 'right') => {
    const next = mode === 'left' ? -parentW / 2 + visualW / 2 : mode === 'right' ? parentW / 2 - visualW / 2 : 0
    setRelativeX(Math.round(next))
  }
  const alignY = (mode: 'top' | 'middle' | 'bottom') => {
    const next = mode === 'top' ? -parentH / 2 + visualH / 2 : mode === 'bottom' ? parentH / 2 - visualH / 2 : 0
    setRelativeY(Math.round(next))
  }

  return (
    <div className="flex flex-col gap-0 pb-2">
      <PanelGroup title="Frame" icon={Box}>
        <SubLabel>{parentLayer ? `Position relative to ${parentLayer.name}` : 'Position'}</SubLabel>
        <div className="grid grid-cols-2 gap-2">
          <IconNumberField label="X" icon={MoveHorizontal} value={relativeX} step={1} precision={1} onChange={setRelativeX} />
          <IconNumberField label="Y" icon={MoveVertical} value={relativeY} step={1} precision={1} onChange={setRelativeY} />
        </div>
        <SubLabel>Size</SubLabel>
        <div className="grid grid-cols-2 gap-2">
          <IconNumberField label="W" icon={StretchHorizontal} value={effectiveW} min={1} step={1} precision={0} onChange={setWidth} />
          <IconNumberField label={layer.type === 'line' ? 'Stroke' : 'H'} icon={StretchVertical} value={effectiveH} min={1} step={1} precision={0} onChange={setHeight} />
        </div>
        <SubLabel>Align to {parentLayer ? 'parent' : 'canvas'}</SubLabel>
        <div className="grid grid-cols-3 gap-1 justify-items-stretch">
          <IconAction title="Align left" icon={AlignStartVertical} onClick={() => alignX('left')} />
          <IconAction title="Align center" icon={AlignCenterVertical} onClick={() => alignX('center')} />
          <IconAction title="Align right" icon={AlignEndVertical} onClick={() => alignX('right')} />
          <IconAction title="Align top" icon={AlignStartHorizontal} onClick={() => alignY('top')} />
          <IconAction title="Align middle" icon={AlignCenterHorizontal} onClick={() => alignY('middle')} />
          <IconAction title="Align bottom" icon={AlignEndHorizontal} onClick={() => alignY('bottom')} />
        </div>
        <SubLabel>Sizing mode</SubLabel>
        <div className="grid grid-cols-3 gap-1">
        {([
          ['fixed', 'Fixed'],
          ['fit-content', 'Fit'],
          ['fill-canvas', 'Fill'],
        ] as const).map(([mode, label]) => (
          <button
            key={mode}
            onClick={() => setSizeMode(mode)}
            disabled={mode === 'fit-content' && !canFit}
            className="pill-btn text-[10px]"
            style={{
              height: 24,
              padding: '0 6px',
              background: sizeMode === mode ? 'rgba(32,213,248,0.16)' : 'var(--input)',
              color: sizeMode === mode ? '#20d5f8' : 'var(--text2)',
              opacity: mode === 'fit-content' && !canFit ? 0.45 : 1,
            }}
          >
            {label}
          </button>
        ))}
        </div>
      </PanelGroup>

      {canUseLayout && (
        <PanelGroup title="Layout" icon={Maximize2}>
            <div className="grid grid-cols-3 gap-1">
              {LAYOUT_MODES.map((mode) => (
                <button
                  key={mode.value}
                  onClick={() => updateLayerProp(layer.id, 'layoutMode', mode.value)}
                  className="pill-btn text-[10px]"
                  style={{
                    height: 24,
                    padding: '0 6px',
                    background: layoutMode === mode.value ? 'rgba(32,213,248,0.16)' : 'var(--input)',
                    color: layoutMode === mode.value ? '#20d5f8' : 'var(--text2)',
                  }}
                >
                  {mode.label}
                </button>
              ))}
            </div>
            {layoutMode !== 'none' && (
              <>
                {layoutMode === 'flex' && (
                  <label className="flex items-center gap-2 text-xs" style={{ color: 'var(--text2)' }}>
                    Direction
                    <select
                      value={layer.layoutDirection ?? 'row'}
                      onChange={(e) => updateLayerProp(layer.id, 'layoutDirection', e.target.value as LayoutDirection)}
                      className="input-base flex-1"
                    >
                      {LAYOUT_DIRECTIONS.map((direction) => <option key={direction.value} value={direction.value}>{direction.label}</option>)}
                    </select>
                  </label>
                )}
                <label className="flex items-center gap-2 text-xs" style={{ color: 'var(--text2)' }}>
                  Align
                  <select
                    value={layer.layoutAlign ?? 'center'}
                    onChange={(e) => updateLayerProp(layer.id, 'layoutAlign', e.target.value as LayoutAlign)}
                    className="input-base flex-1"
                  >
                    {LAYOUT_ALIGNS.map((align) => <option key={align.value} value={align.value}>{align.label}</option>)}
                  </select>
                </label>
                <label className="flex items-center gap-2 text-xs" style={{ color: 'var(--text2)' }}>
                  Justify
                  <select
                    value={layer.layoutJustify ?? 'start'}
                    onChange={(e) => updateLayerProp(layer.id, 'layoutJustify', e.target.value as LayoutJustify)}
                    className="input-base flex-1"
                  >
                    {LAYOUT_JUSTIFIES.map((justify) => <option key={justify.value} value={justify.value}>{justify.label}</option>)}
                  </select>
                </label>
              </>
            )}
          {layoutMode !== 'none' && (
            <>
              <ScrubField
                label="Padding" value={layer.layoutPadding ?? 16} min={0} step={1} sensitivity={1} unit="px"
                onChange={(v) => updateLayerProp(layer.id, 'layoutPadding', Math.max(0, Math.round(v)))}
              />
              <ScrubField
                label="Gap" value={layer.layoutGap ?? 12} min={0} step={1} sensitivity={1} unit="px"
                onChange={(v) => updateLayerProp(layer.id, 'layoutGap', Math.max(0, Math.round(v)))}
              />
              {layoutMode === 'grid' && (
                <ScrubField
                  label="Columns" value={layer.gridColumns ?? 2} min={1} max={12} step={1} sensitivity={0.1}
                  onChange={(v) => updateLayerProp(layer.id, 'gridColumns', Math.max(1, Math.round(v)))}
                />
              )}
            </>
          )}
        </PanelGroup>
      )}

      {/* Transform section */}
      <PanelGroup title="Transform" icon={Rotate3D}>
      <SubLabel>Scale</SubLabel>
      <div className="grid grid-cols-2 gap-2">
        <IconNumberField label="Scale" icon={Scaling} value={p.scale} step={0.01} precision={3} onChange={(v) => handleTransformChange('scale', v)} />
        <IconNumberField label="X" icon={StretchHorizontal} value={p.scaleX} step={0.01} precision={3} onChange={(v) => handleTransformChange('scaleX', v)} />
        <IconNumberField label="Y" icon={StretchVertical} value={p.scaleY} step={0.01} precision={3} onChange={(v) => handleTransformChange('scaleY', v)} />
      </div>
      <SubLabel>Rotation</SubLabel>
      <div className="grid grid-cols-3 gap-2">
        <IconNumberField label="X" icon={RotateCw} value={p.rotateX} unit="deg" step={1} precision={1} onChange={(v) => handleTransformChange('rotateX', v)} />
        <IconNumberField label="Y" icon={RotateCw} value={p.rotateY} unit="deg" step={1} precision={1} onChange={(v) => handleTransformChange('rotateY', v)} />
        <IconNumberField label="Z" icon={RotateCw} value={p.rotateZ} unit="deg" step={1} precision={1} onChange={(v) => handleTransformChange('rotateZ', v)} />
      </div>
      <SubLabel>Opacity</SubLabel>
      <ScrubField label="Opacity" value={p.opacity} step={0.01} sensitivity={0.01} precision={2} onChange={(v) => handleTransformChange('opacity', v)} />
      <SubLabel>Skew</SubLabel>
      <div className="grid grid-cols-2 gap-2">
        <IconNumberField label="X" icon={StretchHorizontal} value={p.skewX} unit="deg" step={0.5} precision={1} onChange={(v) => handleTransformChange('skewX', v)} />
        <IconNumberField label="Y" icon={StretchVertical} value={p.skewY} unit="deg" step={0.5} precision={1} onChange={(v) => handleTransformChange('skewY', v)} />
      </div>
      <SubLabel>Origin</SubLabel>
      <div className="grid grid-cols-2 gap-2">
        <IconNumberField label="X" icon={MoveHorizontal} value={p.originX} unit="%" step={1} precision={1} onChange={(v) => handleTransformChange('originX', v)} />
        <IconNumberField label="Y" icon={MoveVertical} value={p.originY} unit="%" step={1} precision={1} onChange={(v) => handleTransformChange('originY', v)} />
      </div>
      <SubLabel>Depth</SubLabel>
      <ScrubField label="Perspective" value={p.perspective} step={10} sensitivity={10} precision={0} onChange={(v) => handleTransformChange('perspective', v)} />
      </PanelGroup>

      {/* Keyframe controls */}
      <PanelGroup title="Keyframe" icon={Clock3}>
      <div className="px-3 py-2 flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xs flex-shrink-0" style={{ color: 'var(--text2)' }}>Easing</span>
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
          Applies from the active keyframe to the next keyframe.
        </div>
        <button
          onClick={handleAddKeyframe}
          className="w-full text-xs font-semibold rounded py-1.5 transition-colors"
          style={{ background: '#f59e0b', color: '#000' }}
        >
          ◆ Add Keyframe at {currentFrame}
        </button>
        <div className="text-center" style={{ color: 'var(--text3)', fontSize: 10 }}>
          {layer.keyframes.length} keyframe{layer.keyframes.length !== 1 ? 's' : ''}
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
