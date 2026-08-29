import { useTranslation } from 'react-i18next'
import { Moon, Sun } from 'lucide-react'
import { useStore } from '../store'
import { Modal } from './Modal'

export function SettingsModal({ title, children, onClose }: {
  title?: string
  children?: React.ReactNode
  onClose: () => void
}) {
  const { t } = useTranslation()
  const { theme, setTheme } = useStore()

  return (
    <Modal title={title ?? t('settings.title')} onClose={onClose} width={520} zIndex={2500}>
      <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <section>
          <div style={{ fontSize: 11, marginBottom: 6, color: 'var(--text2)' }}>{t('common.theme')}</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <button
              onClick={() => setTheme('light')}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                height: 32, fontSize: 12, borderRadius: 4,
                background: theme === 'light' ? 'var(--accent-bg)' : 'var(--input)',
                color: theme === 'light' ? '#0d99ff' : 'var(--text2)',
                border: `1px solid ${theme === 'light' ? '#0d99ff' : 'var(--input-border)'}`,
              }}
            >
              <Sun size={14} />{t('common.light')}
            </button>
            <button
              onClick={() => setTheme('dark')}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                height: 32, fontSize: 12, borderRadius: 4,
                background: theme === 'dark' ? 'var(--accent-bg)' : 'var(--input)',
                color: theme === 'dark' ? '#0d99ff' : 'var(--text2)',
                border: `1px solid ${theme === 'dark' ? '#0d99ff' : 'var(--input-border)'}`,
              }}
            >
              <Moon size={14} />{t('common.dark')}
            </button>
          </div>
        </section>

        {children}
      </div>
    </Modal>
  )
}
