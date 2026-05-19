import { useStore } from '../store'
import { interpolateProps } from '../remotion/interpolateProps'
import { Layer, TransformProps } from '../types'

const PROPS: { key: keyof TransformProps; label: string; step: number; unit?: string }[] = [
  { key: 'x', label: 'X', step: 1 },
  { key: 'y', label: 'Y', step: 1 },
  { key: 'scale', label: 'Scale', step: 0.01 },
  { key: 'opacity', label: 'Opacity', step: 0.01 },
  { key: 'rotateX', label: 'Rotate X', step: 1, unit: '°' },
  { key: 'rotateY', label: 'Rotate Y', step: 1, unit: '°' },
  { key: 'rotateZ', label: 'Rotate Z', step: 1, unit: '°' },
  { key: 'skewX', label: 'Skew X', step: 1, unit: '°' },
  { key: 'perspective', label: 'Perspective', step: 10 },
]

function NumInput({
  label, value, step, unit, onChange,
}: {
  label: string
  value: number
  step: number
  unit?: string
  onChange: (v: number) => void
}) {
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 group hover:bg-[#1d1d1d] rounded">
      <span className="w-20 text-xs text-[#666] flex-shrink-0">{label}{unit}</span>
      <input
        type="number"
        value={parseFloat(value.toFixed(4))}
        step={step}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        className="flex-1 bg-[#222] text-xs text-[#e0e0e0] border border-[#333] rounded px-2 py-1 outline-none focus:border-[#6366f1] w-0"
      />
    </div>
  )
}

export function PropertiesPanel() {
  const { layers, selectedLayerId, currentFrame, addKeyframe, updateLayerProp } = useStore()

  const maybeLayer = layers.find((l) => l.id === selectedLayerId)

  if (!maybeLayer) {
    return (
      <div
        className="flex flex-col h-full bg-[#161616] border-l border-[#2a2a2a]"
        style={{ width: 220 }}
      >
        <div className="px-3 py-2 border-b border-[#2a2a2a]">
          <span className="text-xs font-semibold text-[#888] uppercase tracking-widest">Properties</span>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <span className="text-xs text-[#444]">Select a layer</span>
        </div>
      </div>
    )
  }

  // Narrow to non-optional after guard for use in closures
  const layer: Layer = maybeLayer
  const currentProps = interpolateProps(currentFrame, layer.keyframes)

  function handleChange(key: keyof TransformProps, value: number) {
    const updated = { ...currentProps, [key]: value }
    addKeyframe(layer.id, currentFrame, updated)
  }

  function handleAddKeyframe() {
    addKeyframe(layer.id, currentFrame, currentProps)
  }

  return (
    <div
      className="flex flex-col h-full bg-[#161616] border-l border-[#2a2a2a] overflow-y-auto"
      style={{ width: 220 }}
    >
      <div className="px-3 py-2 border-b border-[#2a2a2a]">
        <span className="text-xs font-semibold text-[#888] uppercase tracking-widest">Properties</span>
      </div>

      {/* Layer meta */}
      <div className="px-3 py-2 border-b border-[#2a2a2a]">
        <div className="text-xs text-[#aaa] font-medium truncate">{layer.name}</div>
        <div className="text-[10px] text-[#555] mt-0.5">Frame {currentFrame}</div>
      </div>

      {/* Layer size / color (rectangle) */}
      {layer.type === 'rectangle' && (
        <div className="border-b border-[#2a2a2a] py-1">
          <div className="px-3 py-1 text-[10px] text-[#555] uppercase tracking-widest">Shape</div>
          <div className="flex items-center gap-2 px-3 py-1.5">
            <span className="w-20 text-xs text-[#666]">Width</span>
            <input
              type="number"
              value={layer.width}
              onChange={(e) => updateLayerProp(layer.id, 'width', Number(e.target.value))}
              className="flex-1 bg-[#222] text-xs text-[#e0e0e0] border border-[#333] rounded px-2 py-1 outline-none w-0"
            />
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5">
            <span className="w-20 text-xs text-[#666]">Height</span>
            <input
              type="number"
              value={layer.height}
              onChange={(e) => updateLayerProp(layer.id, 'height', Number(e.target.value))}
              className="flex-1 bg-[#222] text-xs text-[#e0e0e0] border border-[#333] rounded px-2 py-1 outline-none w-0"
            />
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5">
            <span className="w-20 text-xs text-[#666]">Color</span>
            <input
              type="color"
              value={layer.color}
              onChange={(e) => updateLayerProp(layer.id, 'color', e.target.value)}
              className="w-8 h-6 rounded cursor-pointer border border-[#333] bg-transparent"
            />
          </div>
        </div>
      )}

      {/* Transform */}
      <div className="py-1 border-b border-[#2a2a2a]">
        <div className="px-3 py-1 text-[10px] text-[#555] uppercase tracking-widest">Transform</div>
        {PROPS.map(({ key, label, step, unit }) => (
          <NumInput
            key={key}
            label={label}
            value={currentProps[key]}
            step={step}
            unit={unit}
            onChange={(v) => handleChange(key, v)}
          />
        ))}
      </div>

      {/* Keyframe button */}
      <div className="px-3 py-3">
        <button
          onClick={handleAddKeyframe}
          className="w-full text-xs bg-[#f59e0b] hover:bg-[#d97706] text-black font-semibold rounded px-3 py-2 transition-colors"
        >
          ◆ Add Keyframe
        </button>
        <div className="text-[10px] text-[#555] text-center mt-1">
          {layer.keyframes.length} keyframe{layer.keyframes.length !== 1 ? 's' : ''}
        </div>
      </div>
    </div>
  )
}
