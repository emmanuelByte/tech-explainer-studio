import { useTranslation } from 'react-i18next'
import { useStore } from '../../store'
import { TransformProps } from '../../types'
import { resolveLayerAnimation } from '../../animationProperties'
import { Section, Row, NumField, ToggleRow } from './_panelKit'
import { ColorPicker } from '../ColorPicker'

type SliderField = {
  propKey: keyof TransformProps
  label: string
  min: number
  max: number
  step: number
  unit?: string
  sensitivity?: number
}

const EFFECT_FIELDS: SliderField[] = [
  { propKey: 'blur', label: 'Blur', min: 0, max: 100, step: 0.5, unit: 'px', sensitivity: 0.5 },
  { propKey: 'backdropBlur', label: 'Backdrop Blur', min: 0, max: 100, step: 0.5, unit: 'px', sensitivity: 0.5 },
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

const SHADOW_ON_VALUES: Pick<TransformProps, 'shadowX' | 'shadowY' | 'shadowBlur' | 'shadowSpread'> = {
  shadowX: 0,
  shadowY: 12,
  shadowBlur: 28,
  shadowSpread: 0,
}

function hasVisibleShadow(p: TransformProps) {
  return Math.abs(p.shadowX) > 0.01
    || Math.abs(p.shadowY) > 0.01
    || Math.abs(p.shadowBlur) > 0.01
    || Math.abs(p.shadowSpread) > 0.01
}

/** Slider + numeric input combo for effect parameters */
function EffectField({
  label, value, min, max, step, unit, sensitivity, onChange,
  leading,
}: Omit<SliderField, 'propKey'> & {
  value: number
  onChange: (v: number) => void
  leading: string
}) {
  const { beginInteraction, endInteraction } = useStore()
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <Row label={label}>
        <NumField
          leading={leading}
          value={value}
          min={min}
          max={max}
          step={step}
          precision={step < 1 ? 1 : 0}
          sensitivity={sensitivity ?? step}
          unit={unit}
          onChange={onChange}
        />
      </Row>
      <input
        type="range"
        className="figma-range"
        min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        onPointerDown={() => beginInteraction(true)}
        onPointerUp={() => endInteraction()}
        onBlur={() => endInteraction()}
      />
    </div>
  )
}

export function EffectsPanel() {
  const { t } = useTranslation()
  const { layers, selectedLayerIds, currentFrame, setLayerAnimatedProperty, updateLayerProp, addKeyframes } = useStore()
  const layer = layers.find((l) => l.id === selectedLayerIds[0])
  if (!layer) return null

  const p = resolveLayerAnimation(layer, currentFrame).transform
  const shadowActiveAtFrame = !!layer.shadowEnabled && hasVisibleShadow(p)

  function handleChange(key: keyof TransformProps, value: number) {
    setLayerAnimatedProperty(layer!.id, key as never, value)
  }

  function handleShadowToggle(enabled: boolean) {
    updateLayerProp(layer!.id, 'shadowEnabled', true)
    addKeyframes([
      {
        layerId: layer!.id,
        props: {
          ...p,
          ...(enabled ? SHADOW_ON_VALUES : { shadowX: 0, shadowY: 0, shadowBlur: 0, shadowSpread: 0 }),
        },
      },
    ], currentFrame, 'ease-out')
  }

  const safeShadowColor = layer.shadowColor?.startsWith('rgba') ? '#000000' : (layer.shadowColor ?? '#000000')

  return (
    <div>
      {/* Filters */}
      <Section title={t('effects.filters')}>
        {EFFECT_FIELDS.map((f) => (
          <EffectField
            key={f.propKey}
            label={t(`effects.${f.propKey}`, { defaultValue: f.label })}
            leading={f.propKey.charAt(0).toUpperCase()}
            min={f.min}
            max={f.max}
            step={f.step}
            unit={f.unit}
            sensitivity={f.sensitivity}
            value={p[f.propKey] as number}
            onChange={(v) => handleChange(f.propKey, v)}
          />
        ))}
      </Section>

      {/* Shadow */}
      <Section title={t('effects.shadow')} defaultOpen={!!layer.shadowEnabled}>
        <ToggleRow
          label={t('effects.enableShadow')}
          checked={shadowActiveAtFrame}
          onChange={handleShadowToggle}
        />
        {layer.shadowEnabled && (
          <>
            <Row label={t('effects.color')}>
              <ColorPicker
                value={safeShadowColor}
                onChange={(value) => updateLayerProp(layer.id, 'shadowColor', value)}
                compact
              />
            </Row>
            <ToggleRow
              label={t('effects.followPerspective')}
              checked={!!layer.shadowFollowsPerspective}
              onChange={(v) => updateLayerProp(layer.id, 'shadowFollowsPerspective', v)}
            />
            {SHADOW_FIELDS.map((f) => (
              <EffectField
                key={f.propKey}
                label={t(`effects.${f.propKey}`, { defaultValue: f.label })}
                leading={f.propKey.includes('X') ? 'X' : f.propKey.includes('Y') ? 'Y' : f.propKey.charAt(f.propKey.length - 1).toUpperCase()}
                min={f.min}
                max={f.max}
                step={f.step}
                unit={f.unit}
                value={p[f.propKey] as number}
                onChange={(v) => handleChange(f.propKey, v)}
              />
            ))}
          </>
        )}
      </Section>
    </div>
  )
}
