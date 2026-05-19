import { useState } from 'react'
import { useStore } from '../../store'
import { interpolateProps } from '../../remotion/interpolateProps'
import { Keyframe, TransformProps, EasingType, DEFAULT_TRANSFORM } from '../../types'
import { SectionHeader } from './TransformPanel'

interface PresetDef {
  label: string
  category: 'in' | 'out' | 'attention'
  generate: (start: number, dur: number, easing: EasingType, base: TransformProps) => Keyframe[]
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
    label: 'Typewriter', category: 'in',
    generate: (s, d, e, b) => [
      { frame: s, easing: e, props: { ...b, charProgress: 0 } },
      { frame: s + d, easing: 'linear', props: { ...b, charProgress: 1 } },
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
const CATEGORIES = ['in', 'out', 'attention'] as const

export function AnimationPresetsPanel() {
  const { layers, selectedLayerIds, currentFrame, addKeyframe } = useStore()
  const layer = layers.find((l) => l.id === selectedLayerIds[0])

  const [duration, setDuration] = useState(30)
  const [delay, setDelay] = useState(0)
  const [easing, setEasing] = useState<EasingType>('ease-out')
  const [activeCategory, setActiveCategory] = useState<'in' | 'out' | 'attention'>('in')

  if (!layer) return null

  function applyPreset(key: string) {
    if (!layer) return
    const preset = PRESETS[key]
    const base = interpolateProps(currentFrame, layer.keyframes)
    const keyframes = preset.generate(delay, duration, easing, base)
    keyframes.forEach((kf) => addKeyframe(layer.id, kf.frame, kf.props, kf.easing))
  }

  return (
    <div className="flex flex-col gap-0">
      <SectionHeader label="Parameters" />
      <div className="px-3 pb-2 flex flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <span className="text-xs w-16" style={{ color: 'var(--text2)' }}>Duration</span>
          <input type="number" min={1} value={duration}
            onChange={(e) => setDuration(Number(e.target.value))}
            className="input-base flex-1 w-0 text-right"
          />
          <span style={{ color: 'var(--text3)', fontSize: 10 }}>fr</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs w-16" style={{ color: 'var(--text2)' }}>Start at</span>
          <input type="number" min={0} value={delay}
            onChange={(e) => setDelay(Number(e.target.value))}
            className="input-base flex-1 w-0 text-right"
          />
          <span style={{ color: 'var(--text3)', fontSize: 10 }}>fr</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs w-16" style={{ color: 'var(--text2)' }}>Easing</span>
          <select value={easing} onChange={(e) => setEasing(e.target.value as EasingType)}
            className="input-base flex-1"
          >
            {EASINGS.map((e) => <option key={e} value={e}>{e}</option>)}
          </select>
        </div>
      </div>

      <SectionHeader label="Presets" />
      {/* Category tabs */}
      <div className="px-3 pb-2 flex gap-1">
        {CATEGORIES.map((cat) => (
          <button key={cat}
            onClick={() => setActiveCategory(cat)}
            className="flex-1 text-xs rounded py-1 capitalize transition-colors"
            style={{
              background: activeCategory === cat ? 'var(--accent)' : 'var(--input)',
              color: activeCategory === cat ? '#fff' : 'var(--text2)',
              border: '1px solid var(--border)',
            }}
          >
            {cat}
          </button>
        ))}
      </div>

      <div className="px-3 pb-3 grid grid-cols-2 gap-1.5">
        {Object.entries(PRESETS)
          .filter(([, def]) => def.category === activeCategory)
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
              {def.label}
            </button>
          ))}
      </div>
    </div>
  )
}
