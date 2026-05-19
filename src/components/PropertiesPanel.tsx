import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store'
import { TransformPanel } from './panels/TransformPanel'
import { StylePanel } from './panels/StylePanel'
import { EffectsPanel } from './panels/EffectsPanel'
import { AnimationPresetsPanel } from './panels/AnimationPresetsPanel'

type Tab = 'comp' | 'transform' | 'style' | 'effects' | 'presets'

const TABS: { id: Tab; label: string }[] = [
  { id: 'comp', label: 'Comp' },
  { id: 'transform', label: 'Transform' },
  { id: 'style', label: 'Style' },
  { id: 'effects', label: 'Effects' },
  { id: 'presets', label: 'Presets' },
]

function CompositionPanel() {
  const {
    canvasBackgroundColor, setCanvasBackgroundColor,
    fps, totalFrames, setTotalFrames,
    beginInteraction, endInteraction,
  } = useStore()
  const [color, setColor] = useState(canvasBackgroundColor)
  const timer = useRef<number | null>(null)
  const active = useRef(false)

  useEffect(() => {
    if (!active.current) setColor(canvasBackgroundColor)
  }, [canvasBackgroundColor])

  function scheduleColor(next: string) {
    setColor(next)
    if (!active.current) {
      active.current = true
      beginInteraction(true)
    }
    if (timer.current) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      setCanvasBackgroundColor(next)
      active.current = false
      endInteraction()
    }, 120)
  }

  function flushColor() {
    if (timer.current) window.clearTimeout(timer.current)
    setCanvasBackgroundColor(color)
    if (active.current) endInteraction()
    active.current = false
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="px-3 pt-3 pb-1" style={{ color: 'var(--text3)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
        Composition
      </div>
      <div className="px-3 py-1.5 flex items-center gap-2">
        <span className="text-xs flex-1" style={{ color: 'var(--text2)' }}>Background</span>
        <input type="color" value={color} onChange={(e) => scheduleColor(e.target.value)} onBlur={flushColor} className="w-8 h-7 rounded cursor-pointer border-0 bg-transparent" />
        <span className="text-xs font-mono" style={{ color: 'var(--text2)' }}>{color}</span>
      </div>
      <div className="px-3 py-1.5 flex items-center gap-2">
        <span className="text-xs flex-1" style={{ color: 'var(--text2)' }}>Duration</span>
        <input
          type="number"
          min={0.1}
          step={0.1}
          value={parseFloat((totalFrames / fps).toFixed(2))}
          onChange={(e) => setTotalFrames(Math.max(1, Math.round(Number(e.target.value) * fps)))}
          className="input-base w-20 text-right"
        />
        <span className="text-xs" style={{ color: 'var(--text3)' }}>s</span>
      </div>
      <div className="px-3 py-1.5 text-[10px]" style={{ color: 'var(--text3)' }}>
        {totalFrames} frames at {fps}fps
      </div>
    </div>
  )
}

export function PropertiesPanel() {
  const { selectedLayerIds, layers } = useStore()
  const [activeTab, setActiveTab] = useState<Tab>('comp')

  const layer = layers.find((l) => l.id === selectedLayerIds[0])
  const visibleTabs = layer ? TABS : TABS.filter((tab) => tab.id === 'comp')

  useEffect(() => {
    if (!layer && activeTab !== 'comp') setActiveTab('comp')
  }, [activeTab, layer])

  return (
    <div
      className="flex flex-col h-full overflow-hidden"
      style={{ width: 250, background: 'var(--panel-glass)', borderLeft: '1px solid var(--border)', flexShrink: 0 }}
    >
      {/* Header */}
      <div className="px-3 py-2 flex-shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
        <div className="text-xs font-semibold tracking-widest uppercase" style={{ color: 'var(--text2)' }}>
          Properties
        </div>
        {layer ? (
          <div className="text-xs mt-0.5 truncate" style={{ color: 'var(--text)' }}>{layer.name}</div>
        ) : (
          <div className="text-xs mt-0.5 truncate" style={{ color: 'var(--text)' }}>Composition</div>
        )}
      </div>

      {(
        <>
          {/* Tabs */}
          <div className="grid flex-shrink-0" style={{ gridTemplateColumns: `repeat(${visibleTabs.length}, minmax(0, 1fr))`, borderBottom: '1px solid var(--border)' }}>
            {visibleTabs.map(({ id, label }) => (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className="py-2 text-[10px] transition-colors"
                style={{
                  color: activeTab === id ? '#20d5f8' : 'var(--text2)',
                  borderBottom: activeTab === id ? '2px solid var(--accent)' : '2px solid transparent',
                  background: activeTab === id ? 'rgba(32,213,248,0.08)' : 'transparent',
                }}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Panel content */}
          <div className="flex-1 overflow-y-auto">
            {activeTab === 'comp' && <CompositionPanel />}
            {layer && activeTab === 'transform' && <TransformPanel />}
            {layer && activeTab === 'style' && <StylePanel />}
            {layer && activeTab === 'effects' && <EffectsPanel />}
            {layer && activeTab === 'presets' && <AnimationPresetsPanel />}
          </div>
        </>
      )}
    </div>
  )
}
