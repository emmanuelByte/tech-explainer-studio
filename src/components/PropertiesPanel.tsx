import { useState } from 'react'
import { useStore } from '../store'
import { TransformPanel } from './panels/TransformPanel'
import { StylePanel } from './panels/StylePanel'
import { EffectsPanel } from './panels/EffectsPanel'
import { AnimationPresetsPanel } from './panels/AnimationPresetsPanel'

type Tab = 'transform' | 'style' | 'effects' | 'presets'

const TABS: { id: Tab; label: string }[] = [
  { id: 'transform', label: 'Transform' },
  { id: 'style', label: 'Style' },
  { id: 'effects', label: 'Effects' },
  { id: 'presets', label: 'Presets' },
]

export function PropertiesPanel() {
  const { selectedLayerIds, layers } = useStore()
  const [activeTab, setActiveTab] = useState<Tab>('transform')

  const layer = layers.find((l) => l.id === selectedLayerIds[0])

  return (
    <div
      className="flex flex-col h-full overflow-hidden"
      style={{ width: 230, background: 'var(--panel)', borderLeft: '1px solid var(--border)', flexShrink: 0 }}
    >
      {/* Header */}
      <div className="px-3 py-2 flex-shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
        <div className="text-xs font-semibold tracking-widest uppercase" style={{ color: 'var(--text2)' }}>
          Properties
        </div>
        {layer && (
          <div className="text-xs mt-0.5 truncate" style={{ color: 'var(--text)' }}>{layer.name}</div>
        )}
      </div>

      {!layer ? (
        <div className="flex-1 flex items-center justify-center">
          <span className="text-xs" style={{ color: 'var(--text3)' }}>Select a layer</span>
        </div>
      ) : (
        <>
          {/* Tabs */}
          <div className="grid grid-cols-4 flex-shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
            {TABS.map(({ id, label }) => (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className="py-1.5 text-[10px] transition-colors"
                style={{
                  color: activeTab === id ? 'var(--accent)' : 'var(--text2)',
                  borderBottom: activeTab === id ? '2px solid var(--accent)' : '2px solid transparent',
                  background: 'transparent',
                }}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Panel content */}
          <div className="flex-1 overflow-y-auto">
            {activeTab === 'transform' && <TransformPanel />}
            {activeTab === 'style' && <StylePanel />}
            {activeTab === 'effects' && <EffectsPanel />}
            {activeTab === 'presets' && <AnimationPresetsPanel />}
          </div>
        </>
      )}
    </div>
  )
}
