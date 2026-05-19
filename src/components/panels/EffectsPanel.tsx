import { useStore } from '../../store'
import { interpolateProps } from '../../remotion/interpolateProps'
import { TransformProps } from '../../types'
import { SectionHeader } from './TransformPanel'

type SliderField = {
  propKey: keyof TransformProps
  label: string
  min: number
  max: number
  step: number
  unit?: string
}

const EFFECT_FIELDS: SliderField[] = [
  { propKey: 'blur', label: 'Blur', min: 0, max: 100, step: 0.5, unit: 'px' },
  { propKey: 'backdropBlur', label: 'Backdrop Blur', min: 0, max: 100, step: 0.5, unit: 'px' },
  { propKey: 'brightness', label: 'Brightness', min: 0, max: 200, step: 1, unit: '%' },
  { propKey: 'contrast', label: 'Contrast', min: 0, max: 200, step: 1, unit: '%' },
  { propKey: 'grayscale', label: 'Grayscale', min: 0, max: 100, step: 1, unit: '%' },
]

const SHADOW_FIELDS: SliderField[] = [
  { propKey: 'shadowX', label: 'Offset X', min: -100, max: 100, step: 1, unit: 'px' },
  { propKey: 'shadowY', label: 'Offset Y', min: -100, max: 100, step: 1, unit: 'px' },
  { propKey: 'shadowBlur', label: 'Blur', min: 0, max: 100, step: 1, unit: 'px' },
  { propKey: 'shadowSpread', label: 'Spread', min: -50, max: 100, step: 1, unit: 'px' },
]

function SliderRow({ label, value, min, max, step, unit, onChange }: Omit<SliderField, 'propKey'> & {
  value: number; onChange: (v: number) => void
}) {
  return (
    <div className="px-3 py-1">
      <div className="flex items-center justify-between mb-0.5">
        <span className="text-xs" style={{ color: 'var(--text2)' }}>{label}</span>
        <div className="flex items-center gap-1">
          <input
            type="number"
            value={parseFloat(value.toFixed(2))}
            min={min} max={max} step={step}
            onChange={(e) => onChange(parseFloat(e.target.value))}
            className="input-base w-14 text-right"
          />
          {unit && <span style={{ color: 'var(--text3)', fontSize: 10, minWidth: 16 }}>{unit}</span>}
        </div>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full"
        style={{ accentColor: 'var(--accent)' }}
      />
    </div>
  )
}

export function EffectsPanel() {
  const { layers, selectedLayerIds, currentFrame, addKeyframe, updateLayerProp } = useStore()
  const layer = layers.find((l) => l.id === selectedLayerIds[0])
  if (!layer) return null

  const p = interpolateProps(currentFrame, layer.keyframes)

  function handleChange(key: keyof TransformProps, value: number) {
    addKeyframe(layer!.id, currentFrame, { ...p, [key]: value })
  }

  return (
    <div className="flex flex-col gap-0">
      <SectionHeader label="Filters" />
      {EFFECT_FIELDS.map((f) => (
        <SliderRow
          key={f.propKey}
          label={f.label} min={f.min} max={f.max} step={f.step} unit={f.unit}
          value={p[f.propKey] as number}
          onChange={(v) => handleChange(f.propKey, v)}
        />
      ))}

      <SectionHeader label="Shadow" />
      <div className="px-3 pb-1">
        <label className="flex items-center gap-2 text-xs cursor-pointer" style={{ color: 'var(--text2)' }}>
          <input
            type="checkbox"
            checked={layer.shadowEnabled}
            onChange={(e) => updateLayerProp(layer.id, 'shadowEnabled', e.target.checked)}
            className="accent-[#6366f1]"
          />
          Enable shadow
        </label>
      </div>

      {layer.shadowEnabled && (
        <>
          <div className="flex items-center gap-2 px-3 pb-2">
            <span className="text-xs" style={{ color: 'var(--text2)' }}>Color</span>
            <input
              type="color"
              value={layer.shadowColor.startsWith('rgba')
                ? '#000000'
                : layer.shadowColor}
              onChange={(e) => updateLayerProp(layer.id, 'shadowColor', e.target.value)}
              className="w-8 h-7 cursor-pointer border-0 bg-transparent"
            />
          </div>
          {SHADOW_FIELDS.map((f) => (
            <SliderRow
              key={f.propKey}
              label={f.label} min={f.min} max={f.max} step={f.step} unit={f.unit}
              value={p[f.propKey] as number}
              onChange={(v) => handleChange(f.propKey, v)}
            />
          ))}
        </>
      )}
    </div>
  )
}
