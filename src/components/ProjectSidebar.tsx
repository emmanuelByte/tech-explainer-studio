import { FileText, Layers, ListVideo } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LayersPanel } from './LayersPanel'
import { ScriptScenesPanel } from './ScriptScenesPanel'

type SidebarTab = 'layers' | 'script' | 'scenes'

const tabs: Array<{ id: SidebarTab; icon: typeof Layers; labelKey: string }> = [
  { id: 'layers', icon: Layers, labelKey: 'layers.title' },
  { id: 'script', icon: FileText, labelKey: 'scenes.script' },
  { id: 'scenes', icon: ListVideo, labelKey: 'scenes.title' },
]

export function ProjectSidebar() {
  const { t } = useTranslation()
  const [tab, setTab] = useState<SidebarTab>('layers')

  return (
    <div className="flex flex-col h-full min-h-0" style={{ width: 320, background: 'var(--panel)', borderRight: '1px solid var(--border)', flexShrink: 0 }}>
      <nav className="flex items-center gap-1 px-2 py-1.5" style={{ borderBottom: '1px solid var(--border)', background: 'var(--toolbar)' }} aria-label={t('scenes.sidebarNavigation')}>
        {tabs.map(({ id, icon: Icon, labelKey }) => (
          <button
            key={id}
            className="flex items-center justify-center gap-1.5 text-[11px] rounded px-2 h-7"
            title={t(labelKey)}
            aria-label={t(labelKey)}
            aria-pressed={tab === id}
            onClick={() => setTab(id)}
            style={{ flex: 1, color: tab === id ? 'var(--accent)' : 'var(--text3)', background: tab === id ? 'var(--accent-bg)' : 'transparent' }}
          >
            <Icon size={14} />
            <span>{t(labelKey)}</span>
          </button>
        ))}
      </nav>
      <div className="min-w-0 min-h-0 flex-1">
        {tab === 'layers' ? <LayersPanel width={320} /> : <ScriptScenesPanel mode={tab} />}
      </div>
    </div>
  )
}
