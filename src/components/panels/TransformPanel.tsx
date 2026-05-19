import { useStore } from '../../store'
import { interpolateProps } from '../../remotion/interpolateProps'
import { TransformProps, EasingType } from '../../types'

const TRANSFORM_FIELDS: { key: keyof TransformProps; label: string; step: number; unit?: string }[] = [
  { key: 'x', label: 'X', step: 1 },
  { key: 'y', label: 'Y', step: 1 },
  { key: 'scale', label: 'Scale', step: 0.01 },
  { key: 'opacity', label: 'Opacity', step: 0.01 },
  { key: 'rotateX', label: 'Rotate X', step: 1, unit: '°' },
  { key: 'rotateY', label: 'Rotate Y', step: 1, unit: '°' },
  { key: 'rotateZ', label: 'Rotate Z', step: 1, unit: '°' },
  { key: 'skewX', label: 'Skew X', step: 1, unit: '°' },
  { key: 'skewY', label: 'Skew Y', step: 1, unit: '°' },
  { key: 'perspective', label: 'Perspective', step: 10 },
  { key: 'originX', label: 'Origin X', step: 1, unit: '%' },
  { key: 'originY', label: 'Origin Y', step: 1, unit: '%' },
]

const EASINGS: EasingType[] = ['linear', 'ease', 'ease-in', 'ease-out', 'ease-in-out', 'spring', 'bounce']

function Field({ label, value, step, unit, onChange }: {
  label: string; value: number; step: number; unit?: string; onChange: (v: number) => void
}) {
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded hover:opacity-90" style={{ background: 'transparent' }}>
      <span className="text-xs w-20 flex-shrink-0" style={{ color: 'var(--text2)' }}>{label}{unit}</span>
      <input
        type="number"
        value={parseFloat(value.toFixed(3))}
        step={step}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        className="input-base flex-1 w-0 text-right"
      />
    </div>
  )
}

export function TransformPanel() {
  const { layers, selectedLayerIds, currentFrame, addKeyframe, updateLayerProp, updateKeyframeEasing } = useStore()
  const layer = layers.find((l) => l.id === selectedLayerIds[0])
  if (!layer) return null

  const p = interpolateProps(currentFrame, layer.keyframes)
  // Find active keyframe easing
  const sorted = [...layer.keyframes].sort((a, b) => a.frame - b.frame)
  const activeKf = sorted.reduce<typeof sorted[0] | null>((found, kf) => kf.frame <= currentFrame ? kf : found, null)

  function handleChange(key: keyof TransformProps, value: number) {
    addKeyframe(layer!.id, currentFrame, { ...p, [key]: value })
  }

  function handleAddKeyframe() {
    addKeyframe(layer!.id, currentFrame, { ...p })
  }

  // Size inputs
  return (
    <div className="flex flex-col gap-0">
      {/* Size section */}
      <SectionHeader label="Size" />
      <div className="flex items-center gap-2 px-3 py-1.5">
        <span className="text-xs w-20 flex-shrink-0" style={{ color: 'var(--text2)' }}>Width</span>
        <input type="number" value={layer.width}
          onChange={(e) => updateLayerProp(layer.id, 'width', Number(e.target.value))}
          className="input-base flex-1 w-0 text-right"
        />
      </div>
      {layer.type !== 'line' && (
        <div className="flex items-center gap-2 px-3 py-1.5">
          <span className="text-xs w-20 flex-shrink-0" style={{ color: 'var(--text2)' }}>Height</span>
          <input type="number" value={layer.height}
            onChange={(e) => updateLayerProp(layer.id, 'height', Number(e.target.value))}
            className="input-base flex-1 w-0 text-right"
          />
        </div>
      )}

      {/* Transform section */}
      <SectionHeader label="Transform" />
      {TRANSFORM_FIELDS.map(({ key, label, step, unit }) => (
        <Field key={key} label={label} value={p[key]} step={step} unit={unit} onChange={(v) => handleChange(key, v)} />
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
