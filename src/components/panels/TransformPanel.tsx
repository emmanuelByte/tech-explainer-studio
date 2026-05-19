import { useStore } from '../../store'
import { TransformProps, PairEasingType, SizeMode } from '../../types'
import { ScrubField } from './ScrubField'
import { resolveLayerAnimation } from '../../animationProperties'

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
  { key: 'scaleX',      label: 'Scale X',   step: 0.01, sensitivity: 0.01, precision: 3 },
  { key: 'scaleY',      label: 'Scale Y',   step: 0.01, sensitivity: 0.01, precision: 3 },
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

const EASINGS: PairEasingType[] = ['linear', 'ease', 'ease-in', 'ease-out', 'ease-in-out', 'spring', 'bounce', 'custom']

function estimateTextSize(text: string, fontSize: number, lineHeight: number, letterSpacing: number) {
  const lines = (text || 'Text').split('\n')
  const longest = Math.max(...lines.map((line) => line.length), 1)
  return {
    width: Math.ceil(longest * (fontSize * 0.58 + letterSpacing) + 24),
    height: Math.ceil(lines.length * fontSize * lineHeight + 16),
  }
}

export function TransformPanel() {
  const {
    layers, selectedLayerIds, currentFrame, totalFrames, fps,
    canvasPreset, customWidth, customHeight,
    addKeyframe, setLayerAnimatedProperty, updateLayerProp,
    updateKeyframeEasing, updateLayerTimeRange,
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
  const durationSec = totalFrames / fps

  function setSizeMode(mode: SizeMode) {
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

  return (
    <div className="flex flex-col gap-0">
      {/* Size section */}
      <SectionHeader label="Size" />
      <div className="px-3 pb-1 grid grid-cols-3 gap-1">
        {([
          ['fixed', 'Fixed'],
          ['fit-content', 'Fit'],
          ['fill-canvas', 'Fill'],
        ] as const).map(([mode, label]) => (
          <button
            key={mode}
            onClick={() => setSizeMode(mode)}
            className="pill-btn text-[10px]"
            style={{
              height: 24,
              padding: '0 6px',
              background: sizeMode === mode ? 'rgba(32,213,248,0.16)' : 'var(--input)',
              color: sizeMode === mode ? '#20d5f8' : 'var(--text2)',
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <ScrubField
        label="Width" value={layer.width} min={1} step={1} sensitivity={1}
        onChange={(v) => setLayerAnimatedProperty(layer.id, 'width', Math.round(v))}
      />
      {layer.type !== 'line' && (
        <ScrubField
          label="Height" value={layer.height} min={1} step={1} sensitivity={1}
          onChange={(v) => setLayerAnimatedProperty(layer.id, 'height', Math.round(v))}
        />
      )}

      {/* Time range */}
      <SectionHeader label="Time Range" />
      <ScrubField
        label="Start"
        value={(layer.startFrame ?? 0) / fps}
        min={0} max={((layer.endFrame ?? totalFrames) - 1) / fps}
        step={0.1} sensitivity={0.05} precision={2} unit="s"
        onChange={(v) => updateLayerTimeRange(layer.id, Math.round(v * fps), layer.endFrame ?? totalFrames)}
      />
      <ScrubField
        label="End"
        value={(layer.endFrame ?? totalFrames) / fps}
        min={((layer.startFrame ?? 0) + 1) / fps} max={durationSec}
        step={0.1} sensitivity={0.05} precision={2} unit="s"
        onChange={(v) => updateLayerTimeRange(layer.id, layer.startFrame ?? 0, Math.round(v * fps))}
      />
      <div className="px-3 pb-1 text-[10px]" style={{ color: 'var(--text3)' }}>
        Frames {layer.startFrame ?? 0}-{layer.endFrame ?? totalFrames}
      </div>

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
