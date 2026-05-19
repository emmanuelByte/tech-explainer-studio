import { useStore } from '../../store'
import { interpolateProps } from '../../remotion/interpolateProps'
import { TransformProps, EasingType } from '../../types'
import { ScrubField } from './ScrubField'

interface FieldDef {
  key: keyof TransformProps
  label: string
  step: number
  unit?: string
  sensitivity: number
  precision?: number
}

const TRANSFORM_FIELDS: FieldDef[] = [
  { key: 'x',           label: 'X',         step: 1,    sensitivity: 1 },
  { key: 'y',           label: 'Y',         step: 1,    sensitivity: 1 },
  { key: 'scale',       label: 'Scale',     step: 0.01, sensitivity: 0.01, precision: 3 },
  { key: 'opacity',     label: 'Opacity',   step: 0.01, sensitivity: 0.01, precision: 2 },
  { key: 'rotateX',     label: 'Rotate X',  step: 1,    sensitivity: 1,   unit: '°' },
  { key: 'rotateY',     label: 'Rotate Y',  step: 1,    sensitivity: 1,   unit: '°' },
  { key: 'rotateZ',     label: 'Rotate Z',  step: 1,    sensitivity: 1,   unit: '°' },
  { key: 'skewX',       label: 'Skew X',    step: 0.5,  sensitivity: 0.5, unit: '°' },
  { key: 'skewY',       label: 'Skew Y',    step: 0.5,  sensitivity: 0.5, unit: '°' },
  { key: 'perspective', label: 'Perspective',step: 10,  sensitivity: 10 },
  { key: 'originX',     label: 'Origin X',  step: 1,    sensitivity: 1,   unit: '%' },
  { key: 'originY',     label: 'Origin Y',  step: 1,    sensitivity: 1,   unit: '%' },
]

const EASINGS: EasingType[] = ['linear', 'ease', 'ease-in', 'ease-out', 'ease-in-out', 'spring', 'bounce']

export function TransformPanel() {
  const {
    layers, selectedLayerIds, currentFrame, totalFrames,
    autoKeyframe, addKeyframe, updateLayerProp,
    updateKeyframeEasing, updateLayerTimeRange,
  } = useStore()
  const layer = layers.find((l) => l.id === selectedLayerIds[0])
  if (!layer) return null

  const p = interpolateProps(currentFrame, layer.keyframes)
  const sorted = [...layer.keyframes].sort((a, b) => a.frame - b.frame)
  const activeKf = sorted.reduce<typeof sorted[0] | null>((found, kf) => kf.frame <= currentFrame ? kf : found, null)

  function handleTransformChange(key: keyof TransformProps, value: number) {
    const targetFrame = autoKeyframe ? currentFrame : (layer!.keyframes[0]?.frame ?? 0)
    const baseProps = autoKeyframe ? p : interpolateProps(targetFrame, layer!.keyframes)
    addKeyframe(layer!.id, targetFrame, { ...baseProps, [key]: value })
  }

  function handleAddKeyframe() {
    addKeyframe(layer!.id, currentFrame, { ...p })
  }

  return (
    <div className="flex flex-col gap-0">
      {/* Size section */}
      <SectionHeader label="Size" />
      <ScrubField
        label="Width" value={layer.width} min={1} step={1} sensitivity={1}
        onChange={(v) => updateLayerProp(layer.id, 'width', Math.round(v))}
      />
      {layer.type !== 'line' && (
        <ScrubField
          label="Height" value={layer.height} min={1} step={1} sensitivity={1}
          onChange={(v) => updateLayerProp(layer.id, 'height', Math.round(v))}
        />
      )}

      {/* Time range */}
      <SectionHeader label="Time Range" />
      <ScrubField
        label="Start frame"
        value={layer.startFrame ?? 0}
        min={0} max={(layer.endFrame ?? totalFrames) - 1}
        step={1} sensitivity={1} precision={0}
        onChange={(v) => updateLayerTimeRange(layer.id, Math.round(v), layer.endFrame ?? totalFrames)}
      />
      <ScrubField
        label="End frame"
        value={layer.endFrame ?? totalFrames}
        min={(layer.startFrame ?? 0) + 1} max={totalFrames}
        step={1} sensitivity={1} precision={0}
        onChange={(v) => updateLayerTimeRange(layer.id, layer.startFrame ?? 0, Math.round(v))}
      />

      {/* Transform section */}
      <SectionHeader label="Transform" />
      {TRANSFORM_FIELDS.map(({ key, label, step, unit, sensitivity, precision }) => (
        <ScrubField
          key={key}
          label={label} value={p[key] as number} step={step} unit={unit}
          sensitivity={sensitivity} precision={precision ?? 2}
          onChange={(v) => handleTransformChange(key, v)}
        />
      ))}

      {/* Keyframe controls */}
      <SectionHeader label="Keyframe" />
      <div className="px-3 py-2 flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xs flex-shrink-0" style={{ color: 'var(--text2)' }}>Easing</span>
          <select
            value={activeKf?.easing ?? 'ease-out'}
            onChange={(e) => activeKf && updateKeyframeEasing(layer.id, activeKf.frame, e.target.value)}
            className="input-base flex-1"
          >
            {EASINGS.map((e) => <option key={e} value={e}>{e}</option>)}
          </select>
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
    </div>
  )
}

export function SectionHeader({ label }: { label: string }) {
  return (
    <div className="px-3 pt-3 pb-1" style={{ color: 'var(--text3)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
      {label}
    </div>
  )
}
