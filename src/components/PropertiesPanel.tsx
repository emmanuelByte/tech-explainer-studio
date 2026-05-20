import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Clapperboard, Palette, SlidersHorizontal, Sparkles } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useStore } from '../store'
import { TransformPanel } from './panels/TransformPanel'
import { StylePanel } from './panels/StylePanel'
import { EffectsPanel } from './panels/EffectsPanel'
import { AnimationPresetsPanel } from './panels/AnimationPresetsPanel'
import { TimingPanel } from './panels/TimingPanel'

type Tab = 'transform' | 'style' | 'effects' | 'presets'

const TABS: { id: Tab; labelKey: string; icon: LucideIcon }[] = [
  { id: 'transform', labelKey: 'panels.design', icon: SlidersHorizontal },
  { id: 'style', labelKey: 'panels.style', icon: Palette },
  { id: 'effects', labelKey: 'panels.fx', icon: Sparkles },
  { id: 'presets', labelKey: 'panels.motion', icon: Clapperboard },
]

export function PropertiesPanel() {
  const { t } = useTranslation()
  const { selectedLayerIds, layers, autoKeyframe, setAutoKeyframe } = useStore()
  const [activeTab, setActiveTab] = useState<Tab>('transform')

  const layer = layers.find((l) => l.id === selectedLayerIds[0])

  return (
    <div
      className="flex flex-col h-full overflow-hidden"
      style={{ width: 240, background: 'var(--panel)', borderLeft: '1px solid var(--border)', flexShrink: 0 }}
    >
      {/* Header */}
      <div className="px-3 pt-3 pb-2 flex-shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
        <div className="section-header" style={{ padding: 0, marginBottom: 2 }}>
          {t('panels.properties')}
        </div>
        {layer ? (
          <div className="truncate" style={{ fontSize: 11, color: 'var(--text)', fontWeight: 500 }}>{layer.name}</div>
        ) : (
          <div className="truncate" style={{ fontSize: 11, color: 'var(--text3)' }}>{t('panels.selectLayer')}</div>
        )}
        {layer && (
          <div className="grid grid-cols-2 mt-2" style={{ background: 'var(--input)', border: '1px solid var(--input-border)', borderRadius: 3 }}>
            <button
              type="button"
              onClick={() => setAutoKeyframe(false)}
              style={{
                fontSize: 10,
                padding: '4px 0',
                borderRadius: '2px 0 0 2px',
                background: !autoKeyframe ? 'var(--accent-bg)' : 'transparent',
                color: !autoKeyframe ? 'var(--accent)' : 'var(--text3)',
                transition: 'background 0.1s, color 0.1s',
              }}
            >
              {t('panels.design')}
            </button>
            <button
              type="button"
              onClick={() => setAutoKeyframe(true)}
              style={{
                fontSize: 10,
                padding: '4px 0',
                borderRadius: '0 2px 2px 0',
                background: autoKeyframe ? 'rgba(245,158,11,0.12)' : 'transparent',
                color: autoKeyframe ? '#f59e0b' : 'var(--text3)',
                transition: 'background 0.1s, color 0.1s',
              }}
            >
              {t('panels.animate')}
            </button>
          </div>
        )}
      </div>

      {!layer ? (
        <div className="flex-1 flex items-center justify-center px-4 text-center">
          <span style={{ color: 'var(--text3)', fontSize: 11 }}>{t('panels.selectLayerHelp')}</span>
        </div>
      ) : (
        <>
          {/* Tabs */}
          <div className="grid grid-cols-4 flex-shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
            {TABS.map(({ id, labelKey, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className="py-2 flex flex-col items-center gap-0.5 transition-colors"
                style={{
                  fontSize: 10,
                  color: activeTab === id ? 'var(--accent)' : 'var(--text3)',
                  borderBottom: activeTab === id ? '1px solid var(--accent)' : '1px solid transparent',
                  background: 'transparent',
                }}
              >
                <Icon size={13} strokeWidth={activeTab === id ? 2.2 : 1.8} />
                {t(labelKey)}
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
