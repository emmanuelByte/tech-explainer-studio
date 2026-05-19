import { useEffect, useRef, useState } from 'react'
import { useStore } from '../../store'
import { TransformProps } from '../../types'
import { SectionHeader } from './TransformPanel'
import { ScrubField } from './ScrubField'
import { resolveLayerAnimation } from '../../animationProperties'

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
  const { beginInteraction, endInteraction } = useStore()
  return (
    <div className="px-3 py-1">
      <div className="flex items-center justify-between mb-0.5">
        <ScrubField label={label} value={value} min={min} max={max} step={step} sensitivity={step} unit={unit} onChange={onChange} />
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        onPointerDown={() => beginInteraction(true)}
        onPointerUp={() => endInteraction()}
        onBlur={() => endInteraction()}
        className="w-full"
        style={{ accentColor: 'var(--accent)' }}
      />
    </div>
  )
}

function DebouncedColorInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [local, setLocal] = useState(value)
  const timer = useRef<number | null>(null)
  const active = useRef(false)
  const { beginInteraction, endInteraction } = useStore()

  useEffect(() => {
    if (!active.current) setLocal(value)
  }, [value])

  function schedule(next: string) {
    setLocal(next)
    if (!active.current) {
      active.current = true
      beginInteraction(true)
    }
    if (timer.current) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      onChange(next)
      active.current = false
      endInteraction()
    }, 120)
  }

  function flush() {
    if (timer.current) window.clearTimeout(timer.current)
    onChange(local)
    if (active.current) endInteraction()
    active.current = false
  }

  return <input type="color" value={local} onChange={(e) => schedule(e.target.value)} onBlur={flush} className="w-8 h-7 cursor-pointer border-0 bg-transparent" />
}

export function EffectsPanel() {
  const { layers, selectedLayerIds, currentFrame, setLayerAnimatedProperty, updateLayerProp } = useStore()
  const layer = layers.find((l) => l.id === selectedLayerIds[0])
  if (!layer) return null

  const p = resolveLayerAnimation(layer, currentFrame).transform

  function handleChange(key: keyof TransformProps, value: number) {
    setLayerAnimatedProperty(layer!.id, key, value)
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
            <DebouncedColorInput
              value={layer.shadowColor.startsWith('rgba')
                ? '#000000'
                : layer.shadowColor}
              onChange={(value) => updateLayerProp(layer.id, 'shadowColor', value)}
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
