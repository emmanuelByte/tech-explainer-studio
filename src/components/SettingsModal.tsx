import { useTranslation } from 'react-i18next'
import { Moon, Sun, X } from 'lucide-react'
import { useStore } from '../store'

export function SettingsModal({ title, children, onClose }: {
  title?: string
  children?: React.ReactNode
  onClose: () => void
}) {
  const { t, i18n } = useTranslation()
  const { theme, setTheme } = useStore()

  return (
    <div className="fixed inset-0 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.42)', zIndex: 2500 }}>
      <div
        className="w-[520px] max-w-[calc(100vw-32px)] rounded-md overflow-hidden"
        style={{ background: 'var(--panel)', border: '1px solid var(--border)', color: 'var(--text)', boxShadow: '0 24px 80px rgba(0,0,0,0.32)' }}
      >
        <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
          <div>
            <div className="text-base font-semibold">{title ?? t('settings.title')}</div>
            <div className="text-xs mt-0.5" style={{ color: 'var(--text3)' }}>{t('settings.editor')}</div>
          </div>
          <button onClick={onClose} className="icon-btn" title={t('common.close')}><X size={15} /></button>
        </div>

        <div className="p-4 flex flex-col gap-4">
          <section>
            <label className="block text-xs mb-1" style={{ color: 'var(--text2)' }}>{t('common.language')}</label>
            <select
              className="input-base w-full"
              value={i18n.language}
              onChange={(e) => i18n.changeLanguage(e.target.value)}
            >
              <option value="en">{t('common.english')}</option>
              <option value="cs">{t('common.czech')}</option>
            </select>
          </section>

          <section>
            <div className="text-xs mb-1" style={{ color: 'var(--text2)' }}>{t('common.theme')}</div>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setTheme('light')}
                className="pill-btn"
                style={{ background: theme === 'light' ? 'rgba(32,213,248,0.16)' : 'var(--input)', color: theme === 'light' ? '#20d5f8' : 'var(--text2)' }}
              >
                <Sun size={14} />{t('common.light')}
              </button>
              <button
                onClick={() => setTheme('dark')}
                className="pill-btn"
                style={{ background: theme === 'dark' ? 'rgba(32,213,248,0.16)' : 'var(--input)', color: theme === 'dark' ? '#20d5f8' : 'var(--text2)' }}
              >
                <Moon size={14} />{t('common.dark')}
              </button>
            </div>
          </section>

          {children}
        </div>
      </div>
    </div>
  )
}
