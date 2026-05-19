import { useState } from 'react'
import { Clapperboard, Palette, SlidersHorizontal, Sparkles } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useStore } from '../store'
import { TransformPanel } from './panels/TransformPanel'
import { StylePanel } from './panels/StylePanel'
import { EffectsPanel } from './panels/EffectsPanel'
import { AnimationPresetsPanel } from './panels/AnimationPresetsPanel'
import { TimingPanel } from './panels/TimingPanel'

type Tab = 'transform' | 'style' | 'effects' | 'presets'

const TABS: { id: Tab; label: string; icon: LucideIcon }[] = [
  { id: 'transform', label: 'Design', icon: SlidersHorizontal },
  { id: 'style', label: 'Style', icon: Palette },
  { id: 'effects', label: 'FX', icon: Sparkles },
  { id: 'presets', label: 'Motion', icon: Clapperboard },
]

export function PropertiesPanel() {
  const { selectedLayerIds, layers } = useStore()
  const [activeTab, setActiveTab] = useState<Tab>('transform')

  const layer = layers.find((l) => l.id === selectedLayerIds[0])

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
          <div className="text-xs mt-0.5 truncate" style={{ color: 'var(--text3)' }}>Select a layer</div>
        )}
      </div>

      {!layer ? (
        <div className="flex-1 flex items-center justify-center px-4 text-center">
          <span className="text-xs" style={{ color: 'var(--text3)' }}>Select a layer to edit its properties.</span>
        </div>
      ) : (
        <>
          {/* Tabs */}
          <div className="grid grid-cols-4 flex-shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
            {TABS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className="py-2 text-[10px] transition-colors flex flex-col items-center gap-1"
                style={{
                  color: activeTab === id ? '#20d5f8' : 'var(--text2)',
                  borderBottom: activeTab === id ? '2px solid var(--accent)' : '2px solid transparent',
                  background: activeTab === id ? 'rgba(32,213,248,0.08)' : 'transparent',
                }}
              >
                <Icon size={14} />
                {label}
              </button>
            ))}
          </div>

          {/* Panel content */}
          <div className="flex-1 overflow-y-auto">
            {activeTab === 'transform' && <TransformPanel />}
            {activeTab === 'style' && <StylePanel />}
            {activeTab === 'effects' && <EffectsPanel />}
            {activeTab === 'presets' && (
              <>
                <TimingPanel />
                <AnimationPresetsPanel />
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}
