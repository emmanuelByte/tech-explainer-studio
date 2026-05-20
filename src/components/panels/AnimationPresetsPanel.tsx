import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useStore } from '../../store'
import { interpolateProps } from '../../remotion/interpolateProps'
import { Keyframe, TransformProps, EasingType, Layer, TextRevealMode } from '../../types'
import { SectionHeader } from './TransformPanel'

type PresetCategory = 'in' | 'out' | 'attention' | 'text'
type MotionBuilderKey = 'rotateX' | 'rotateY' | 'rotateZ' | 'skewX' | 'skewY' | 'scale' | 'opacity' | 'perspective'
type MotionBuilderState = Record<MotionBuilderKey, { enabled: boolean; to: number }>

interface PresetDef {
  label: string
  category: PresetCategory
  textOnly?: boolean
  textRevealMode?: TextRevealMode
  generate: (start: number, dur: number, easing: EasingType, base: TransformProps, layer: Layer) => Keyframe[]
}

const PRESETS: Record<string, PresetDef> = {
  'fade-in': {
    label: 'Fade In', category: 'in',
    generate: (s, d, e, b) => [
      { frame: s, easing: e, props: { ...b, opacity: 0 } },
      { frame: s + d, easing: 'linear', props: { ...b, opacity: 1 } },
    ],
  },
  'fade-out': {
    label: 'Fade Out', category: 'out',
    generate: (s, d, e, b) => [
      { frame: s, easing: e, props: { ...b, opacity: 1 } },
      { frame: s + d, easing: 'linear', props: { ...b, opacity: 0 } },
    ],
  },
  'fade-up': {
    label: 'Fade In Up', category: 'in',
    generate: (s, d, e, b) => [
      { frame: s, easing: e, props: { ...b, opacity: 0, y: b.y + 40 } },
      { frame: s + d, easing: 'linear', props: { ...b, opacity: 1, y: b.y } },
    ],
  },
  'fade-down': {
    label: 'Fade In Down', category: 'in',
    generate: (s, d, e, b) => [
      { frame: s, easing: e, props: { ...b, opacity: 0, y: b.y - 40 } },
      { frame: s + d, easing: 'linear', props: { ...b, opacity: 1, y: b.y } },
    ],
  },
  'slide-left': {
    label: 'Slide In Left', category: 'in',
    generate: (s, d, e, b) => [
      { frame: s, easing: e, props: { ...b, x: b.x - 200, opacity: 0 } },
      { frame: s + d, easing: 'linear', props: { ...b, x: b.x, opacity: 1 } },
    ],
  },
  'slide-right': {
    label: 'Slide In Right', category: 'in',
    generate: (s, d, e, b) => [
      { frame: s, easing: e, props: { ...b, x: b.x + 200, opacity: 0 } },
      { frame: s + d, easing: 'linear', props: { ...b, x: b.x, opacity: 1 } },
    ],
  },
  'scale-in': {
    label: 'Scale In', category: 'in',
    generate: (s, d, e, b) => [
      { frame: s, easing: e, props: { ...b, scale: 0, opacity: 0 } },
      { frame: s + d, easing: 'linear', props: { ...b, scale: b.scale, opacity: 1 } },
    ],
  },
  'scale-out': {
    label: 'Scale Out', category: 'out',
    generate: (s, d, e, b) => [
      { frame: s, easing: e, props: { ...b } },
      { frame: s + d, easing: 'linear', props: { ...b, scale: 0, opacity: 0 } },
    ],
  },
  'bounce-in': {
    label: 'Bounce In', category: 'in',
    generate: (s, d, _e, b) => [
      { frame: s, easing: 'ease-out', props: { ...b, scale: 0, opacity: 0 } },
      { frame: s + Math.round(d * 0.6), easing: 'ease-out', props: { ...b, scale: b.scale * 1.2, opacity: 1 } },
      { frame: s + Math.round(d * 0.75), easing: 'ease-in-out', props: { ...b, scale: b.scale * 0.9, opacity: 1 } },
      { frame: s + Math.round(d * 0.9), easing: 'ease-in-out', props: { ...b, scale: b.scale * 1.05, opacity: 1 } },
      { frame: s + d, easing: 'linear', props: { ...b, scale: b.scale, opacity: 1 } },
    ],
  },
  'flip-x': {
    label: 'Flip In X', category: 'in',
    generate: (s, d, e, b) => [
      { frame: s, easing: e, props: { ...b, rotateX: 90, opacity: 0 } },
      { frame: s + d, easing: 'linear', props: { ...b, rotateX: 0, opacity: 1 } },
    ],
  },
  'flip-y': {
    label: 'Flip In Y', category: 'in',
    generate: (s, d, e, b) => [
      { frame: s, easing: e, props: { ...b, rotateY: 90, opacity: 0 } },
      { frame: s + d, easing: 'linear', props: { ...b, rotateY: 0, opacity: 1 } },
    ],
  },
  'blur-in': {
    label: 'Blur In', category: 'in',
    generate: (s, d, e, b) => [
      { frame: s, easing: e, props: { ...b, blur: 20, opacity: 0 } },
      { frame: s + d, easing: 'linear', props: { ...b, blur: 0, opacity: 1 } },
    ],
  },
  'glitch': {
    label: 'Glitch', category: 'attention',
    generate: (s, d, _e, b) => {
      const frames: Keyframe[] = []
      for (let i = 0; i < 8; i++) {
        frames.push({
          frame: s + Math.round(i * d * 0.1),
          easing: 'linear',
          props: { ...b, x: b.x + (Math.random() - 0.5) * 30, y: b.y + (Math.random() - 0.5) * 15 },
        })
      }
      frames.push({ frame: s + d, easing: 'linear', props: { ...b } })
      return frames
    },
  },
  'typewriter': {
    label: 'Typewriter', category: 'text', textOnly: true, textRevealMode: 'plain',
    generate: (s, d, e, b) => [
      { frame: s, easing: e, props: { ...b, charProgress: 0, opacity: Math.max(0.35, b.opacity) } },
      { frame: s + d, easing: 'linear', props: { ...b, charProgress: 1 } },
    ],
  },
  'typewriter-soft': {
    label: 'Soft Type In', category: 'text', textOnly: true, textRevealMode: 'char-rise',
    generate: (s, d, e, b) => [
      { frame: s, easing: e, props: { ...b, charProgress: 0, opacity: 0, blur: 3, y: b.y + 10 } },
      { frame: s + Math.round(d * 0.35), easing: 'linear', props: { ...b, charProgress: 0.45, opacity: 1, blur: 1, y: b.y } },
      { frame: s + d, easing: 'linear', props: { ...b, charProgress: 1, opacity: 1, blur: 0, y: b.y } },
    ],
  },
  'char-pop-type': {
    label: 'Pop Characters', category: 'text', textOnly: true, textRevealMode: 'char-pop',
    generate: (s, d, e, b) => [
      { frame: s, easing: e, props: { ...b, charProgress: 0, opacity: 1 } },
      { frame: s + d, easing: 'linear', props: { ...b, charProgress: 1, opacity: 1 } },
    ],
  },
  'falling-letters': {
    label: 'Falling Letters', category: 'text', textOnly: true, textRevealMode: 'char-fall',
    generate: (s, d, e, b) => [
      { frame: s, easing: e, props: { ...b, charProgress: 0, opacity: 1 } },
      { frame: s + d, easing: 'linear', props: { ...b, charProgress: 1, opacity: 1 } },
    ],
  },
  'rising-letters': {
    label: 'Rising Letters', category: 'text', textOnly: true, textRevealMode: 'char-rise',
    generate: (s, d, e, b) => [
      { frame: s, easing: e, props: { ...b, charProgress: 0, opacity: 1 } },
      { frame: s + d, easing: 'linear', props: { ...b, charProgress: 1, opacity: 1 } },
    ],
  },
  'spin-type': {
    label: 'Spin Type', category: 'text', textOnly: true, textRevealMode: 'char-spin',
    generate: (s, d, e, b) => [
      { frame: s, easing: e, props: { ...b, charProgress: 0, opacity: 1 } },
      { frame: s + d, easing: 'linear', props: { ...b, charProgress: 1, opacity: 1 } },
    ],
  },
  'blur-type': {
    label: 'Blur Type', category: 'text', textOnly: true, textRevealMode: 'char-blur',
    generate: (s, d, e, b) => [
      { frame: s, easing: e, props: { ...b, charProgress: 0, opacity: 1 } },
      { frame: s + d, easing: 'linear', props: { ...b, charProgress: 1, opacity: 1 } },
    ],
  },
  'type-out': {
    label: 'Type Out', category: 'text', textOnly: true, textRevealMode: 'plain',
    generate: (s, d, e, b) => [
      { frame: s, easing: e, props: { ...b, charProgress: 1, opacity: 1 } },
      { frame: s + d, easing: 'linear', props: { ...b, charProgress: 0, opacity: Math.max(0, b.opacity * 0.35) } },
    ],
  },
  'word-reveal': {
    label: 'Word Reveal', category: 'text', textOnly: true, textRevealMode: 'plain',
    generate: (s, d, _e, b, layer) => {
      const text = layer.text || ''
      const ends = [...text.matchAll(/\S+/g)].map((match) => (match.index ?? 0) + match[0].length)
      if (!ends.length) return [
        { frame: s, easing: 'linear', props: { ...b, charProgress: 0 } },
        { frame: s + d, easing: 'linear', props: { ...b, charProgress: 1 } },
      ]
      return [
        { frame: s, easing: 'linear', props: { ...b, charProgress: 0, opacity: 1 } },
        ...ends.map((end, index) => ({
          frame: s + Math.max(1, Math.round(((index + 1) / ends.length) * d)),
          easing: 'linear' as EasingType,
          props: { ...b, charProgress: Math.min(1, end / Math.max(1, text.length)), opacity: 1 },
        })),
      ]
    },
  },
  'line-reveal': {
    label: 'Line Reveal', category: 'text', textOnly: true, textRevealMode: 'plain',
    generate: (s, d, _e, b, layer) => {
      const text = layer.text || ''
      const lines = text.split('\n')
      const ends = lines.reduce<number[]>((acc, line, index) => {
        const previous = acc[index - 1] ?? 0
        acc.push(previous + line.length + (index < lines.length - 1 ? 1 : 0))
        return acc
      }, [])
      return [
        { frame: s, easing: 'linear', props: { ...b, charProgress: 0, opacity: 1 } },
        ...ends.map((end, index) => ({
          frame: s + Math.max(1, Math.round(((index + 1) / Math.max(1, ends.length)) * d)),
          easing: 'linear' as EasingType,
          props: { ...b, charProgress: Math.min(1, end / Math.max(1, text.length)), opacity: 1 },
        })),
      ]
    },
  },
  'text-pop': {
    label: 'Text Pop', category: 'text', textOnly: true, textRevealMode: 'char-pop',
    generate: (s, d, _e, b) => [
      { frame: s, easing: 'ease-out', props: { ...b, charProgress: 0, scale: b.scale * 0.94, opacity: 0 } },
      { frame: s + Math.round(d * 0.65), easing: 'ease-out', props: { ...b, charProgress: 1, scale: b.scale * 1.04, opacity: 1 } },
      { frame: s + d, easing: 'linear', props: { ...b, charProgress: 1, scale: b.scale, opacity: 1 } },
    ],
  },
  'text-flicker': {
    label: 'Flicker In', category: 'text', textOnly: true, textRevealMode: 'plain',
    generate: (s, d, _e, b) => [
      { frame: s, easing: 'linear', props: { ...b, charProgress: 1, opacity: 0 } },
      { frame: s + Math.round(d * 0.18), easing: 'linear', props: { ...b, charProgress: 1, opacity: 1 } },
      { frame: s + Math.round(d * 0.28), easing: 'linear', props: { ...b, charProgress: 1, opacity: 0.25 } },
      { frame: s + Math.round(d * 0.42), easing: 'linear', props: { ...b, charProgress: 1, opacity: 1 } },
      { frame: s + Math.round(d * 0.55), easing: 'linear', props: { ...b, charProgress: 1, opacity: 0.55 } },
      { frame: s + d, easing: 'linear', props: { ...b, charProgress: 1, opacity: 1 } },
    ],
  },
  'perspective-tilt': {
    label: 'Perspective Tilt', category: 'attention',
    generate: (s, d, _e, b) => [
      { frame: s, easing: 'ease-out', props: { ...b, rotateX: 15, rotateY: -10 } },
      { frame: s + Math.round(d * 0.5), easing: 'ease-in-out', props: { ...b, rotateX: -10, rotateY: 15 } },
      { frame: s + d, easing: 'ease-out', props: { ...b, rotateX: 0, rotateY: 0 } },
    ],
  },
}

const EASINGS: EasingType[] = ['linear', 'ease', 'ease-in', 'ease-out', 'ease-in-out', 'spring', 'bounce']
const CATEGORY_LABELS: Record<PresetCategory, string> = {
  in: 'In',
  out: 'Out',
  attention: 'Attention',
  text: 'Text',
}

const BUILDER_FIELDS: Array<{
  key: MotionBuilderKey
  labelKey: string
  unit: string
  step: number
  precision: number
  percent?: boolean
  min?: number
  max?: number
}> = [
  { key: 'rotateY', labelKey: 'rotateY', unit: 'deg', step: 1, precision: 0 },
  { key: 'rotateX', labelKey: 'rotateX', unit: 'deg', step: 1, precision: 0 },
  { key: 'rotateZ', labelKey: 'rotateZ', unit: 'deg', step: 1, precision: 0 },
  { key: 'skewX', labelKey: 'skewX', unit: 'deg', step: 1, precision: 0 },
  { key: 'skewY', labelKey: 'skewY', unit: 'deg', step: 1, precision: 0 },
  { key: 'scale', labelKey: 'scale', unit: '%', step: 1, precision: 0, percent: true, min: 0 },
  { key: 'opacity', labelKey: 'opacity', unit: '%', step: 1, precision: 0, percent: true, min: 0, max: 100 },
  { key: 'perspective', labelKey: 'perspective', unit: 'px', step: 25, precision: 0, min: 100 },
]

function makeBuilderState(base: TransformProps): MotionBuilderState {
  return {
    rotateY: { enabled: false, to: base.rotateY },
    rotateX: { enabled: false, to: base.rotateX },
    rotateZ: { enabled: false, to: base.rotateZ },
    skewX: { enabled: false, to: base.skewX },
    skewY: { enabled: false, to: base.skewY },
    scale: { enabled: false, to: base.scale },
    opacity: { enabled: false, to: base.opacity },
    perspective: { enabled: false, to: base.perspective },
  }
}

function displayValue(value: number, percent?: boolean) {
  return percent ? value * 100 : value
}

function storedValue(value: number, percent?: boolean) {
  return percent ? value / 100 : value
}

function NumberTargetInput({ label, unit, value, disabled, step, min, max, precision, percent, onChange }: {
  label: string
  unit: string
  value: number
  disabled?: boolean
  step: number
  min?: number
  max?: number
  precision: number
  percent?: boolean
  onChange: (value: number) => void
}) {
  return (
    <label className="block min-w-0">
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={Number(displayValue(value, percent).toFixed(precision))}
        disabled={disabled}
        onChange={(e) => onChange(storedValue(Number(e.target.value), percent))}
        className="input-base w-full text-right"
      />
      <span className="block text-[9px] leading-3 mt-0.5 uppercase" style={{ color: 'var(--text3)' }}>
        {label}{unit ? ` (${unit})` : ''}
      </span>
    </label>
  )
}

function MiniStepButton({ label, disabled, onClick }: { label: string; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="icon-btn text-xs"
      style={{ width: 28, height: 28, minWidth: 28, opacity: disabled ? 0.45 : 1 }}
    >
      {label}
    </button>
  )
}

export function AnimationPresetsPanel() {
  const { t } = useTranslation()
  const { layers, selectedLayerIds, currentFrame, fps, totalFrames, addKeyframe, addKeyframes, updateLayerProp } = useStore()
  const layer = layers.find((l) => l.id === selectedLayerIds[0])

  const [duration, setDuration] = useState(30)
  const [startFrame, setStartFrame] = useState(currentFrame)
  const [timeUnit, setTimeUnit] = useState<'frames' | 'seconds'>('seconds')
  const [easing, setEasing] = useState<EasingType>('ease-out')
  const [activeCategory, setActiveCategory] = useState<PresetCategory>('in')
  const [builder, setBuilder] = useState<MotionBuilderState>(() => makeBuilderState(interpolateProps(0, [])))

  useEffect(() => {
    if (!layer) return
    const layerStart = layer.startFrame ?? 0
    const layerEnd = layer.endFrame ?? totalFrames
    const inferredStart = Math.max(layerStart, Math.min(currentFrame, Math.max(layerStart, layerEnd - 1)))
    const remaining = Math.max(1, layerEnd - inferredStart)
    const textLength = layer.type === 'text' ? Math.max(1, layer.text.length) : 0
    const textDuration = layer.type === 'text' ? Math.max(Math.round(fps * 0.8), Math.min(Math.round(fps * 2), textLength * 2)) : fps
    const inferredDuration = Math.max(1, Math.min(remaining, textDuration))
    setStartFrame(inferredStart)
    setDuration(inferredDuration)
    if (layer.type === 'text') setActiveCategory('text')
    setBuilder(makeBuilderState(interpolateProps(inferredStart, layer.keyframes)))
  }, [layer?.id, layer?.startFrame, layer?.endFrame, layer?.type, layer?.text, currentFrame, fps, totalFrames])

  if (!layer) return null

  const presetTargets = [layer]

  function applyPreset(key: string) {
    if (!layer) return
    const preset = PRESETS[key]
    const start = Math.max(0, Math.round(startFrame))
    const dur = Math.max(1, Math.round(duration))
    const targets = preset.textOnly ? presetTargets.filter((item) => item.type === 'text') : presetTargets
    targets.forEach((target) => {
      const base = interpolateProps(start, target.keyframes)
      const keyframes = preset.generate(start, dur, easing, base, target)
      if (preset.textRevealMode) updateLayerProp(target.id, 'textRevealMode', preset.textRevealMode)
      keyframes.forEach((kf) => addKeyframe(target.id, kf.frame, kf.props, kf.easing))
    })
  }

  function updateBuilder(key: MotionBuilderKey, patch: Partial<MotionBuilderState[MotionBuilderKey]>) {
    const next = { ...builder, [key]: { ...builder[key], ...patch } }
    setBuilder(next)
    applyBuilderMotion(next)
  }

  function applyBuilderMotion(nextBuilder = builder) {
    if (!layer) return
    const enabled = BUILDER_FIELDS.filter(({ key }) => nextBuilder[key].enabled)
    if (!enabled.length) return
    const dur = Math.max(1, Math.round(duration))
    const layerStart = layer.startFrame ?? 0
    const layerEnd = layer.endFrame ?? totalFrames
    const targetFrame = Math.max(layerStart, Math.min(Math.round(currentFrame), Math.max(layerStart, layerEnd - 1)))
    const start = Math.max(layerStart, targetFrame - dur)
    const fromUpdates: Array<{ layerId: string; props: TransformProps }> = []
    const toUpdates: Array<{ layerId: string; props: TransformProps }> = []

    presetTargets.forEach((target) => {
      const base = interpolateProps(start, target.keyframes)
      const fromProps: TransformProps = { ...base }
      const toProps: TransformProps = { ...interpolateProps(targetFrame, target.keyframes) }
      enabled.forEach(({ key }) => {
        toProps[key] = nextBuilder[key].to
      })
      fromUpdates.push({ layerId: target.id, props: fromProps })
      toUpdates.push({ layerId: target.id, props: toProps })
    })

    addKeyframes(fromUpdates, start, easing)
    addKeyframes(toUpdates, targetFrame, 'linear')
  }

  const categories = (layer.type === 'text' ? ['text', 'in', 'out', 'attention'] : ['in', 'out', 'attention']) as PresetCategory[]
  const safeActiveCategory = categories.includes(activeCategory) ? activeCategory : categories[0]
  const durationValue = timeUnit === 'seconds' ? Number((duration / fps).toFixed(2)) : duration
  const startValue = timeUnit === 'seconds' ? Number((startFrame / fps).toFixed(2)) : startFrame
  const unitLabel = timeUnit === 'seconds' ? 's' : 'fr'
  const maxStartFrame = Math.max(0, (layer.endFrame ?? totalFrames) - 1)

  const setDurationFromInput = (value: number) => {
    if (!Number.isFinite(value)) return
    const nextFrames = timeUnit === 'seconds' ? Math.round(value * fps) : Math.round(value)
    setDuration(Math.max(1, nextFrames))
  }

  const setStartFromInput = (value: number) => {
    if (!Number.isFinite(value)) return
    const nextFrame = timeUnit === 'seconds' ? Math.round(value * fps) : Math.round(value)
    setStartFrame(Math.max(0, Math.min(maxStartFrame, nextFrame)))
  }

  const syncToPlayhead = () => {
    const layerStart = layer.startFrame ?? 0
    const layerEnd = layer.endFrame ?? totalFrames
    const nextStart = Math.max(layerStart, Math.min(currentFrame, Math.max(layerStart, layerEnd - 1)))
    setStartFrame(nextStart)
    setDuration(Math.max(1, Math.min(duration, layerEnd - nextStart)))
  }

  return (
    <div className="flex flex-col gap-0">
      <SectionHeader label={t('motion.parameters')} />
      <div className="px-3 pb-2 flex flex-col gap-1.5">
        <div className="grid grid-cols-2 gap-1">
          {(['seconds', 'frames'] as const).map((unit) => (
            <button
              key={unit}
              onClick={() => setTimeUnit(unit)}
              className="text-xs rounded py-1 transition-colors"
              style={{
                background: timeUnit === unit ? 'var(--accent-bg)' : 'var(--input)',
                color: timeUnit === unit ? '#0d99ff' : 'var(--text2)',
                border: '1px solid var(--border)',
              }}
            >
              {unit === 'seconds' ? t('motion.seconds') : t('motion.frames')}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs w-16" style={{ color: 'var(--text2)' }}>{t('motion.duration')}</span>
          <input
            type="number"
            min={timeUnit === 'seconds' ? 0.01 : 1}
            step={timeUnit === 'seconds' ? 0.1 : 1}
            value={durationValue}
            onChange={(e) => setDurationFromInput(Number(e.target.value))}
            className="input-base flex-1 w-0 text-right"
          />
          <span style={{ color: 'var(--text3)', fontSize: 10 }}>{unitLabel}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs w-16" style={{ color: 'var(--text2)' }}>{t('motion.startAt')}</span>
          <input
            type="number"
            min={0}
            step={timeUnit === 'seconds' ? 0.1 : 1}
            value={startValue}
            onChange={(e) => setStartFromInput(Number(e.target.value))}
            className="input-base flex-1 w-0 text-right"
          />
          <span style={{ color: 'var(--text3)', fontSize: 10 }}>{unitLabel}</span>
        </div>
        <button
          onClick={syncToPlayhead}
          className="text-xs rounded py-1 transition-colors"
          style={{ background: 'var(--input)', color: 'var(--text2)', border: '1px solid var(--border)' }}
        >
          {t('motion.usePlayhead', { seconds: (currentFrame / fps).toFixed(2), frames: currentFrame })}
        </button>
        <div className="flex items-center gap-2">
          <span className="text-xs w-16" style={{ color: 'var(--text2)' }}>{t('motion.easing')}</span>
          <select value={easing} onChange={(e) => setEasing(e.target.value as EasingType)}
            className="input-base flex-1"
          >
            {EASINGS.map((e) => <option key={e} value={e}>{e}</option>)}
          </select>
        </div>
      </div>

      <SectionHeader label={t('motion.custom3d')} />
      <div className="px-3 pb-3 flex flex-col gap-2">
        <div className="rounded-md px-2 py-2" style={{ background: 'var(--input)', border: '1px solid var(--border)' }}>
          <div className="text-[10px] font-semibold uppercase mb-1.5" style={{ color: 'var(--text3)' }}>
            {t('motion.rotation')}
          </div>
          <div className="grid grid-cols-[58px_1fr_58px] gap-1.5 items-center">
            <NumberTargetInput
              label="Y" unit="deg" value={builder.rotateY.to} step={1} precision={0}
              onChange={(value) => updateBuilder('rotateY', { enabled: true, to: value })}
            />
            <div className="grid grid-cols-3 gap-1 place-items-center">
              <span />
              <MiniStepButton label="↑" onClick={() => updateBuilder('rotateX', { enabled: true, to: builder.rotateX.to - 15 })} />
              <span />
              <MiniStepButton label="←" onClick={() => updateBuilder('rotateY', { enabled: true, to: builder.rotateY.to - 15 })} />
              <button
                type="button"
                className="rounded-full"
                onClick={() => updateBuilder('rotateZ', { enabled: true, to: builder.rotateZ.to + 15 })}
                title={t('motion.rotateZ')}
                style={{ width: 26, height: 26, border: '1px solid var(--border)', background: 'var(--panel)', color: '#0d99ff' }}
              >
                •
              </button>
              <MiniStepButton label="→" onClick={() => updateBuilder('rotateY', { enabled: true, to: builder.rotateY.to + 15 })} />
              <span />
              <MiniStepButton label="↓" onClick={() => updateBuilder('rotateX', { enabled: true, to: builder.rotateX.to + 15 })} />
              <span />
            </div>
            <NumberTargetInput
              label="Z" unit="deg" value={builder.rotateZ.to} step={1} precision={0}
              onChange={(value) => updateBuilder('rotateZ', { enabled: true, to: value })}
            />
          </div>
          <div className="mt-1.5">
            <NumberTargetInput
              label="X" unit="deg" value={builder.rotateX.to} step={1} precision={0}
              onChange={(value) => updateBuilder('rotateX', { enabled: true, to: value })}
            />
          </div>
        </div>

        <div className="rounded-md px-2 py-2" style={{ background: 'var(--input)', border: '1px solid var(--border)' }}>
          <div className="text-[10px] font-semibold uppercase mb-1.5" style={{ color: 'var(--text3)' }}>
            {t('motion.skew')}
          </div>
          <div className="grid grid-cols-[58px_1fr_58px] gap-1.5 items-center">
            <NumberTargetInput
              label="X" unit="deg" value={builder.skewX.to} step={1} precision={0}
              onChange={(value) => updateBuilder('skewX', { enabled: true, to: value })}
            />
            <div className="grid grid-cols-3 gap-1 place-items-center">
              <span />
              <MiniStepButton label="↑" onClick={() => updateBuilder('skewY', { enabled: true, to: builder.skewY.to - 5 })} />
              <span />
              <MiniStepButton label="←" onClick={() => updateBuilder('skewX', { enabled: true, to: builder.skewX.to - 5 })} />
              <span style={{ width: 22, height: 22, borderRadius: 999, border: '1px solid var(--border)', background: 'var(--panel)' }} />
              <MiniStepButton label="→" onClick={() => updateBuilder('skewX', { enabled: true, to: builder.skewX.to + 5 })} />
              <span />
              <MiniStepButton label="↓" onClick={() => updateBuilder('skewY', { enabled: true, to: builder.skewY.to + 5 })} />
              <span />
            </div>
            <NumberTargetInput
              label="Y" unit="deg" value={builder.skewY.to} step={1} precision={0}
              onChange={(value) => updateBuilder('skewY', { enabled: true, to: value })}
            />
          </div>
        </div>

        {BUILDER_FIELDS.map((field) => {
          if (field.key === 'rotateX' || field.key === 'rotateY' || field.key === 'rotateZ' || field.key === 'skewX' || field.key === 'skewY') return null
          const item = builder[field.key]
          const disabled = !item.enabled
          return (
            <div
              key={field.key}
              className="rounded-md px-2 py-1.5"
              style={{ background: 'var(--input)', border: '1px solid var(--border)', opacity: disabled ? 0.62 : 1 }}
            >
              <label className="flex items-center gap-2 min-w-0">
                <input
                  type="checkbox"
                  checked={item.enabled}
                  onChange={(e) => updateBuilder(field.key, { enabled: e.target.checked })}
                  className="accent-[#0d99ff] flex-shrink-0"
                  aria-label={t(`motion.${field.labelKey}`)}
                />
                <span className="text-xs font-medium min-w-0 flex-1" style={{ color: disabled ? 'var(--text3)' : 'var(--text2)' }}>
                  {t(`motion.${field.labelKey}`)}
                </span>
                <span className="text-[10px] flex-shrink-0" style={{ color: 'var(--text3)' }}>{field.unit}</span>
              </label>
              <label className="block min-w-0 mt-1.5">
                <input
                  type="number"
                  min={field.min}
                  max={field.max}
                  step={field.step}
                  value={Number(displayValue(item.to, field.percent).toFixed(field.precision))}
                  disabled={disabled}
                  onChange={(e) => updateBuilder(field.key, { to: storedValue(Number(e.target.value), field.percent) })}
                  className="input-base w-full text-right"
                />
                <span className="block text-[9px] leading-3 mt-0.5 uppercase" style={{ color: 'var(--text3)' }}>
                  {t('motion.target')}
                </span>
              </label>
            </div>
          )
        })}
      </div>

      <SectionHeader label={t('motion.presets')} />
      {/* Category tabs */}
      <div className="px-3 pb-2 flex gap-1">
        {categories.map((cat) => (
          <button key={cat}
            onClick={() => setActiveCategory(cat)}
            className="flex-1 text-xs rounded py-1 capitalize transition-colors"
            style={{
              background: safeActiveCategory === cat ? 'var(--accent)' : 'var(--input)',
              color: safeActiveCategory === cat ? '#fff' : 'var(--text2)',
              border: '1px solid var(--border)',
            }}
          >
            {t(`motion.${cat}`, { defaultValue: CATEGORY_LABELS[cat] })}
          </button>
        ))}
      </div>

      <div className="px-3 pb-3 grid grid-cols-2 gap-1.5">
        {Object.entries(PRESETS)
          .filter(([, def]) => def.category === safeActiveCategory && (!def.textOnly || layer.type === 'text'))
          .map(([key, def]) => (
            <button
              key={key}
              onClick={() => applyPreset(key)}
              className="text-xs rounded px-2 py-2 text-left transition-all hover:scale-[1.02] active:scale-95"
              style={{
                background: 'var(--input)',
                color: 'var(--text)',
                border: '1px solid var(--border)',
              }}
            >
              {t(`motion.${key}`, { defaultValue: def.label })}
            </button>
          ))}
      </div>
    </div>
  )
}
