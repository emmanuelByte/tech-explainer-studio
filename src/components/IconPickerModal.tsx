import { useEffect, useMemo, useRef, useState } from 'react'
import { Search } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import dynamicIconImports from 'lucide-react/dynamicIconImports.mjs'
import { renderToStaticMarkup } from 'react-dom/server'
import { useTranslation } from 'react-i18next'

export type IconPick = {
  name: string
  src: string
}

type IconChoice = {
  name: string
  label: string
  loader: () => Promise<{ default: LucideIcon }>
}

function iconLabel(name: string) {
  return name
    .replace(/-/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

const ICON_CHOICES: IconChoice[] = Object.entries(dynamicIconImports as Record<string, () => Promise<{ default: LucideIcon }>>)
  .map(([name, loader]) => ({ name, label: iconLabel(name), loader }))
  .sort((a, b) => a.label.localeCompare(b.label))

function iconToSvgDataUrl(Icon: LucideIcon) {
  const markup = renderToStaticMarkup(
    <Icon
      size={128}
      color="#ffffff"
      strokeWidth={2}
      absoluteStrokeWidth
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    />,
  )
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`
}

function LazyIconPreview({ choice }: { choice: IconChoice }) {
  const ref = useRef<HTMLSpanElement>(null)
  const [Icon, setIcon] = useState<LucideIcon | null>(null)

  useEffect(() => {
    const node = ref.current
    if (!node || Icon) return
    let mounted = true
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return
      observer.disconnect()
      void choice.loader().then((module) => {
        if (mounted) setIcon(() => module.default)
      })
    }, { rootMargin: '160px' })
    observer.observe(node)
    return () => {
      mounted = false
      observer.disconnect()
    }
  }, [choice, Icon])

  return (
    <span ref={ref} className="flex items-center justify-center" style={{ width: 24, height: 24 }}>
      {Icon ? <Icon size={22} strokeWidth={2} /> : <span style={{ width: 18, height: 18, border: '1px solid var(--border)', borderRadius: 4 }} />}
    </span>
  )
}

export function IconPickerModal({ onClose, onPick }: { onClose: () => void; onPick: (choice: IconPick) => void }) {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')

  // ESC handler
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { e.preventDefault(); onClose() }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])

  const filteredIcons = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    if (!normalized) return ICON_CHOICES
    return ICON_CHOICES.filter((choice) => (
      choice.name.toLowerCase().includes(normalized)
      || choice.label.toLowerCase().includes(normalized)
    ))
  }, [query])

  async function pickIcon(choice: IconChoice) {
    const module = await choice.loader()
    onPick({ name: choice.label, src: iconToSvgDataUrl(module.default) })
  }

  return (
    <div
      className="fixed inset-0"
      style={{ zIndex: 2700, background: 'rgba(0,0,0,0.22)' }}
      onMouseDown={onClose}
    >
      <div
        className="rounded-md p-3 flex flex-col"
        style={{
          position: 'fixed',
          left: 228,
          top: 92,
          width: 520,
          maxWidth: 'calc(100vw - 248px)',
          height: 'min(620px, calc(100vh - 116px))',
          background: 'var(--panel)',
          border: '1px solid var(--border)',
          boxShadow: '0 18px 60px rgba(0,0,0,0.35)',
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{t('layers.iconPickerTitle')}</div>
            <div className="text-[10px]" style={{ color: 'var(--text3)' }}>{filteredIcons.length} / {ICON_CHOICES.length}</div>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} title={t('common.close')}>x</button>
        </div>
        <div className="input-base flex items-center gap-2 mb-3">
          <Search size={14} style={{ color: 'var(--text3)' }} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
            className="bg-transparent outline-none flex-1 text-xs"
            placeholder={t('layers.searchIcons')}
          />
        </div>
        <div className="overflow-y-auto pr-1 min-h-0">
          <div className="grid grid-cols-[repeat(auto-fill,minmax(72px,1fr))] gap-2">
            {filteredIcons.map((choice) => (
              <button
                key={choice.name}
                type="button"
                onClick={() => void pickIcon(choice)}
                title={choice.label}
                className="icon-grid-item flex flex-col items-center justify-center gap-1 rounded-md"
                style={{ height: 64 }}
              >
                <LazyIconPreview choice={choice} />
                <span className="text-[9px] leading-tight truncate max-w-full px-1">{choice.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
