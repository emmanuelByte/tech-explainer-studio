import { useEffect, useState } from 'react'
import { useStore } from '../../store'
import { interpolateProps } from '../../remotion/interpolateProps'
import { Keyframe, TransformProps, EasingType, Layer, TextRevealMode } from '../../types'
import { SectionHeader } from './TransformPanel'

type PresetCategory = 'in' | 'out' | 'attention' | 'text'

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

export function AnimationPresetsPanel() {
  const { layers, selectedLayerIds, currentFrame, fps, totalFrames, addKeyframe, updateLayerProp } = useStore()
  const layer = layers.find((l) => l.id === selectedLayerIds[0])

  const [duration, setDuration] = useState(30)
  const [startFrame, setStartFrame] = useState(currentFrame)
  const [timeUnit, setTimeUnit] = useState<'frames' | 'seconds'>('seconds')
  const [easing, setEasing] = useState<EasingType>('ease-out')
  const [activeCategory, setActiveCategory] = useState<PresetCategory>('in')

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
  }, [layer?.id, layer?.startFrame, layer?.endFrame, layer?.type, layer?.text, currentFrame, fps, totalFrames])

  if (!layer) return null

  function applyPreset(key: string) {
    if (!layer) return
    const preset = PRESETS[key]
    const start = Math.max(0, Math.round(startFrame))
    const dur = Math.max(1, Math.round(duration))
    const base = interpolateProps(start, layer.keyframes)
    const keyframes = preset.generate(start, dur, easing, base, layer)
    if (preset.textRevealMode) updateLayerProp(layer.id, 'textRevealMode', preset.textRevealMode)
    keyframes.forEach((kf) => addKeyframe(layer.id, kf.frame, kf.props, kf.easing))
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
      <SectionHeader label="Parameters" />
      <div className="px-3 pb-2 flex flex-col gap-1.5">
        <div className="grid grid-cols-2 gap-1">
          {(['seconds', 'frames'] as const).map((unit) => (
            <button
              key={unit}
              onClick={() => setTimeUnit(unit)}
              className="text-xs rounded py-1 transition-colors"
              style={{
                background: timeUnit === unit ? 'rgba(32,213,248,0.16)' : 'var(--input)',
                color: timeUnit === unit ? '#20d5f8' : 'var(--text2)',
                border: '1px solid var(--border)',
              }}
            >
              {unit === 'seconds' ? 'Seconds' : 'Frames'}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs w-16" style={{ color: 'var(--text2)' }}>Duration</span>
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
          <span className="text-xs w-16" style={{ color: 'var(--text2)' }}>Start at</span>
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
          Use playhead: {(currentFrame / fps).toFixed(2)}s / {currentFrame}fr
        </button>
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
            {CATEGORY_LABELS[cat]}
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
              {def.label}
            </button>
          ))}
      </div>
    </div>
  )
}
