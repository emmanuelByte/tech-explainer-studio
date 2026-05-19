import { useEffect, useRef, useState } from 'react'
import { useStore } from '../../store'
import { Layer, FillType, GradientStop, GOOGLE_FONTS } from '../../types'
import { SectionHeader } from './TransformPanel'
import { ScrubField } from './ScrubField'
import { resolveLayerAnimation } from '../../animationProperties'

function estimateTextSize(text: string, fontSize: number, lineHeight: number, letterSpacing: number) {
  const lines = (text || 'Text').split('\n')
  const longest = Math.max(...lines.map((line) => line.length), 1)
  return {
    width: Math.ceil(longest * (fontSize * 0.58 + letterSpacing) + 24),
    height: Math.ceil(lines.length * fontSize * lineHeight + 16),
  }
}

function DebouncedColorInput({ value, onChange, className }: {
  value: string
  onChange: (value: string) => void
  className?: string
}) {
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

  return (
    <input
      type="color"
      value={local}
      onChange={(e) => schedule(e.target.value)}
      onBlur={flush}
      className={className ?? 'w-8 h-7 cursor-pointer border-0 bg-transparent'}
    />
  )
}

export function StylePanel() {
  const {
    layers, selectedLayerIds, currentFrame, updateLayerProp, setLayerAnimatedProperty,
    setTextSelection, updateTextSelectionStyle, beginInteraction, endInteraction,
  } = useStore()
  const maybeLayer = layers.find((l) => l.id === selectedLayerIds[0])
  if (!maybeLayer) return null

  // Narrow type in closures
  const sourceLayer: Layer = maybeLayer
  const layer: Layer = resolveLayerAnimation(sourceLayer, currentFrame).layer
  const upd = <K extends keyof Layer>(k: K, v: Layer[K]) => updateLayerProp(sourceLayer.id, k, v)
  const updateTextSizing = (next: Partial<Layer>) => {
    if ((sourceLayer.sizeMode ?? 'fixed') !== 'fit-content') return
    const sized = estimateTextSize(
      String(next.text ?? sourceLayer.text),
      Number(next.fontSize ?? sourceLayer.fontSize),
      Number(next.lineHeight ?? sourceLayer.lineHeight),
      Number(next.letterSpacing ?? sourceLayer.letterSpacing),
    )
    setLayerAnimatedProperty(sourceLayer.id, 'width', sized.width)
    setLayerAnimatedProperty(sourceLayer.id, 'height', sized.height)
  }

  function addGradientStop() {
    upd('gradientStops', [...layer.gradientStops, { color: '#ffffff', position: 100 }])
  }

  function updateStop(idx: number, key: keyof GradientStop, val: string | number) {
    const stops = layer.gradientStops.map((s, i) => i === idx ? { ...s, [key]: val } : s)
    upd('gradientStops', stops)
  }

  function removeStop(idx: number) {
    upd('gradientStops', layer.gradientStops.filter((_, i) => i !== idx))
  }

  return (
    <div className="flex flex-col gap-0">
      {/* Fill */}
      <SectionHeader label="Fill" />
      <div className="px-3 pb-1 flex gap-1">
        {(['solid', 'linear-gradient', 'radial-gradient', 'none'] as FillType[]).map((t) => (
          <button
            key={t}
            onClick={() => upd('fillType', t)}
            className="flex-1 text-[10px] rounded py-1 transition-colors truncate"
            style={{
              background: layer.fillType === t ? 'var(--accent)' : 'var(--input)',
              color: layer.fillType === t ? '#fff' : 'var(--text2)',
              border: '1px solid var(--border)',
            }}
          >
            {t === 'linear-gradient' ? 'Linear' : t === 'radial-gradient' ? 'Radial' : t === 'none' ? 'None' : 'Solid'}
          </button>
        ))}
      </div>

      {layer.fillType === 'solid' && (
        <div className="flex items-center gap-2 px-3 py-1.5">
          <span className="text-xs" style={{ color: 'var(--text2)' }}>Color</span>
          <DebouncedColorInput value={layer.fillColor}
            onChange={(value) => setLayerAnimatedProperty(layer.id, 'fillColor', value)}
            className="w-8 h-7 rounded cursor-pointer border-0 bg-transparent"
          />
          <span className="text-xs font-mono" style={{ color: 'var(--text2)' }}>{layer.fillColor}</span>
        </div>
      )}

      {(layer.fillType === 'linear-gradient' || layer.fillType === 'radial-gradient') && (
        <div className="px-3 pb-2 flex flex-col gap-2">
          {layer.fillType === 'linear-gradient' && (
            <div className="flex items-center gap-2">
              <span className="text-xs" style={{ color: 'var(--text2)' }}>Angle</span>
              <input type="range" min={0} max={360} value={layer.gradientAngle}
                onChange={(e) => upd('gradientAngle', Number(e.target.value))}
                onPointerDown={() => beginInteraction(true)}
                onPointerUp={() => endInteraction()}
                onBlur={() => endInteraction()}
                className="flex-1"
              />
              <span className="text-xs w-8 text-right" style={{ color: 'var(--text3)' }}>{layer.gradientAngle}°</span>
            </div>
          )}
          {/* Gradient preview */}
          <div
            style={{
              height: 20,
              borderRadius: 4,
              background: layer.fillType === 'linear-gradient'
                ? `linear-gradient(${layer.gradientAngle}deg, ${layer.gradientStops.map((s) => `${s.color} ${s.position}%`).join(', ')})`
                : `radial-gradient(circle, ${layer.gradientStops.map((s) => `${s.color} ${s.position}%`).join(', ')})`,
            }}
          />
          {/* Stops */}
          {layer.gradientStops.map((stop, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <DebouncedColorInput value={stop.color}
                onChange={(value) => updateStop(i, 'color', value)}
                className="w-7 h-6 cursor-pointer border-0 bg-transparent rounded"
              />
              <input type="number" min={0} max={100} value={stop.position}
                onChange={(e) => updateStop(i, 'position', Number(e.target.value))}
                className="input-base w-14 text-right"
              />
              <span style={{ color: 'var(--text3)', fontSize: 10 }}>%</span>
              {layer.gradientStops.length > 2 && (
                <button onClick={() => removeStop(i)}
                  style={{ color: 'var(--text3)', fontSize: 14, lineHeight: 1 }}
                  className="ml-auto hover:text-red-400"
                >×</button>
              )}
            </div>
          ))}
          <button onClick={addGradientStop}
            className="text-xs py-1 rounded"
            style={{ background: 'var(--input)', color: 'var(--text2)', border: '1px solid var(--border)' }}
          >+ Add Stop</button>
        </div>
      )}

      {/* Stroke */}
      <SectionHeader label="Stroke" />
      <div className="px-3 pb-2 flex flex-col gap-1.5">
        <label className="flex items-center gap-2 text-xs cursor-pointer" style={{ color: 'var(--text2)' }}>
          <input type="checkbox" checked={layer.strokeEnabled}
            onChange={(e) => upd('strokeEnabled', e.target.checked)} className="accent-[#6366f1]"
          />
          Enable stroke
        </label>
        {layer.strokeEnabled && (
          <>
            <div className="flex items-center gap-2">
              <span className="text-xs w-16" style={{ color: 'var(--text2)' }}>Color</span>
              <DebouncedColorInput value={layer.strokeColor}
                onChange={(value) => setLayerAnimatedProperty(layer.id, 'strokeColor', value)}
                className="w-8 h-7 cursor-pointer border-0 bg-transparent"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs w-16" style={{ color: 'var(--text2)' }}>Width</span>
              <ScrubField label="" value={layer.strokeWidth} min={0} step={1} sensitivity={1} precision={0}
                onChange={(v) => setLayerAnimatedProperty(layer.id, 'strokeWidth', Math.round(v))}
                compact />
            </div>
          </>
        )}
      </div>

      {/* Border radius */}
      {layer.type !== 'line' && layer.type !== 'ellipse' && layer.type !== 'triangle' && (
        <>
          <SectionHeader label="Border Radius" />
          <ScrubField label="Radius" value={layer.borderRadius} min={0} max={200} step={1} sensitivity={1} precision={0} unit="px"
            onChange={(v) => setLayerAnimatedProperty(layer.id, 'borderRadius', Math.round(v))}
          />
        </>
      )}

      {/* Text options */}
      {layer.type === 'text' && (
        <>
          <SectionHeader label="Text" />
          <div className="px-3 pb-2 flex flex-col gap-1.5">
            <textarea
              value={layer.text}
              onChange={(e) => {
                upd('text', e.target.value)
                updateTextSizing({ text: e.target.value } as Partial<Layer>)
              }}
              onSelect={(e) => {
                const el = e.currentTarget
                setTextSelection({ layerId: layer.id, start: el.selectionStart, end: el.selectionEnd })
              }}
              className="input-base w-full resize-none"
              rows={3}
            />
            <div className="flex items-center gap-2">
              <span className="text-xs w-16" style={{ color: 'var(--text2)' }}>Font</span>
              <select value={layer.fontFamily}
                onChange={(e) => updateTextSelectionStyle(layer.id, { fontFamily: e.target.value })}
                className="input-base flex-1"
              >
                {GOOGLE_FONTS.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
            <div className="flex gap-2">
              <div className="flex items-center gap-1 flex-1">
                <span className="text-xs" style={{ color: 'var(--text2)' }}>Size</span>
                <ScrubField label="" value={layer.fontSize} min={6} step={1} sensitivity={1} precision={0}
                  onChange={(v) => {
                    updateTextSelectionStyle(layer.id, { fontSize: Math.round(v) })
                    updateTextSizing({ fontSize: Math.round(v) } as Partial<Layer>)
                  }}
                  compact />
              </div>
              <div className="flex items-center gap-1 flex-1">
                <span className="text-xs" style={{ color: 'var(--text2)' }}>Weight</span>
                <select value={layer.fontWeight}
                  onChange={(e) => updateTextSelectionStyle(layer.id, { fontWeight: e.target.value })}
                  className="input-base flex-1"
                >
                  {['300', '400', '500', '600', '700', '800', '900'].map((w) => (
                    <option key={w} value={w}>{w}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs w-16" style={{ color: 'var(--text2)' }}>Color</span>
              <DebouncedColorInput value={layer.textColor}
                onChange={(value) => useStore.getState().updateTextSelectionStyle(layer.id, { textColor: value })}
                className="w-8 h-7 cursor-pointer border-0 bg-transparent"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs w-16" style={{ color: 'var(--text2)' }}>Align</span>
              {(['left', 'center', 'right'] as const).map((a) => (
                <button key={a} onClick={() => upd('textAlign', a)}
                  className="flex-1 text-xs rounded py-1 transition-colors"
                  style={{
                    background: layer.textAlign === a ? 'var(--accent)' : 'var(--input)',
                    color: layer.textAlign === a ? '#fff' : 'var(--text2)',
                    border: '1px solid var(--border)',
                  }}
                >{a[0].toUpperCase() + a.slice(1)}</button>
              ))}
            </div>
            <div className="flex gap-2">
              <div className="flex items-center gap-1 flex-1">
                <span className="text-xs" style={{ color: 'var(--text2)' }}>LS</span>
                <ScrubField label="" value={layer.letterSpacing} step={0.1} sensitivity={0.1} precision={2}
                  onChange={(v) => {
                    updateTextSelectionStyle(layer.id, { letterSpacing: v })
                    updateTextSizing({ letterSpacing: v } as Partial<Layer>)
                  }}
                  compact />
              </div>
              <div className="flex items-center gap-1 flex-1">
                <span className="text-xs" style={{ color: 'var(--text2)' }}>LH</span>
                <ScrubField label="" value={layer.lineHeight} min={0.1} step={0.05} sensitivity={0.01} precision={2}
                  onChange={(v) => {
                    setLayerAnimatedProperty(layer.id, 'lineHeight', v)
                    updateTextSizing({ lineHeight: v } as Partial<Layer>)
                  }}
                  compact />
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
