import { useEffect, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

/* ── Platform-specific shortcut formatter ──────────────────────── */
const IS_MAC = typeof navigator !== 'undefined' && /mac|iphone|ipad/i.test(navigator.platform || navigator.userAgent)

/** Format a shortcut like `mod+e` or `shift+mod+z` into a platform glyph. */
export function formatShortcut(spec: string): string {
  const parts = spec.toLowerCase().split('+').map((p) => p.trim())
  const out: string[] = []
  for (const p of parts) {
    if (p === 'mod') out.push(IS_MAC ? '⌘' : 'Ctrl')
    else if (p === 'shift') out.push(IS_MAC ? '⇧' : 'Shift')
    else if (p === 'alt' || p === 'option') out.push(IS_MAC ? '⌥' : 'Alt')
    else if (p === 'ctrl') out.push(IS_MAC ? '⌃' : 'Ctrl')
    else out.push(p.toUpperCase())
  }
  return IS_MAC ? out.join('') : out.join('+')
}

export interface MenuItem {
  type?: 'item'
  label: string
  icon?: LucideIcon
  shortcut?: string
  disabled?: boolean
  active?: boolean
  onClick: () => void
}

export interface MenuSeparator {
  type: 'separator'
}

export type TopMenuEntry = MenuItem | MenuSeparator

/**
 * Compact Figma/Linear-style dropdown menu used in the editor topbar.
 * Click the trigger button to open; ESC, click outside, or selecting an item
 * closes it.
 */
export function TopMenu({
  label, items, icon: Icon,
}: {
  label: string
  items: TopMenuEntry[]
  icon?: LucideIcon
}) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDocDown(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation()
        setOpen(false)
      }
    }
    window.addEventListener('mousedown', onDocDown)
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('mousedown', onDocDown)
      window.removeEventListener('keydown', onKey, true)
    }
  }, [open])

  return (
    <div ref={wrapRef} style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        onClick={() => setOpen((v) => !v)}
        className={`pill-btn ${open ? 'active' : ''}`}
        style={{
          height: 28,
          padding: '0 8px',
          fontSize: 11,
          fontWeight: 500,
          color: open ? 'var(--text)' : 'var(--text2)',
          background: open ? 'var(--hover)' : 'transparent',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
        }}
      >
        {Icon && <Icon size={13} />}
        <span>{label}</span>
        <ChevronDown size={11} style={{ opacity: 0.7 }} />
      </button>
      {open && (
        <div
          role="menu"
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            minWidth: 220,
            background: 'var(--panel)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            padding: 4,
            boxShadow: '0 1px 0 rgba(0,0,0,0.04), 0 8px 24px rgba(0,0,0,0.18)',
            zIndex: 100,
            display: 'flex',
            flexDirection: 'column',
            gap: 1,
          }}
        >
          {items.map((entry, i) => {
            if (entry.type === 'separator') {
              return (
                <div
                  key={`sep-${i}`}
                  style={{
                    height: 1,
                    background: 'var(--border)',
                    margin: '4px 4px',
                    opacity: 0.7,
                  }}
                />
              )
            }
            const ItemIcon = entry.icon
            return (
              <button
                key={`${entry.label}-${i}`}
                role="menuitem"
                disabled={entry.disabled}
                onClick={() => {
                  if (entry.disabled) return
                  entry.onClick()
                  setOpen(false)
                }}
                className="popover-menu-item"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  height: 28,
                  padding: '0 8px',
                  borderRadius: 4,
                  fontSize: 11,
                  fontWeight: 500,
                  color: entry.active ? 'var(--tool-active-color)' : 'var(--text)',
                  background: entry.active ? 'var(--tool-active-bg)' : undefined,
                  textAlign: 'left',
                  width: '100%',
                  opacity: entry.disabled ? 0.45 : 1,
                  cursor: entry.disabled ? 'default' : 'pointer',
                }}
              >
                {ItemIcon ? (
                  <ItemIcon size={13} style={{ flexShrink: 0, opacity: 0.85 }} />
                ) : (
                  <span style={{ width: 13, flexShrink: 0 }} />
                )}
                <span style={{ flex: 1, whiteSpace: 'nowrap' }}>{entry.label}</span>
                {entry.shortcut && (
                  <span
                    style={{
                      fontSize: 10,
                      color: 'var(--text3)',
                      letterSpacing: IS_MAC ? '0.05em' : 0,
                      fontFamily: IS_MAC ? 'inherit' : "'JetBrains Mono', ui-monospace, monospace",
                      flexShrink: 0,
                    }}
                  >
                    {formatShortcut(entry.shortcut)}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
