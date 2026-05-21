import { Plus, Trash2, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useStore } from '../store'

function normalizeHexColor(value: string) {
  const trimmed = value.trim().toLowerCase()
  const short = trimmed.match(/^#([0-9a-f]{3})$/i)
  if (short) {
    const [, hex] = short
    return `#${hex[0]}${hex[0]}${hex[1]}${hex[1]}${hex[2]}${hex[2]}`.toLowerCase()
  }
  if (/^#[0-9a-f]{6}$/i.test(trimmed)) return trimmed
  return null
}

export function ColorPicker({
  value,
  onChange,
  compact = false,
}: {
  value: string
  onChange: (value: string) => void
  compact?: boolean
}) {
  const { t } = useTranslation()
  const {
    beginInteraction,
    endInteraction,
    colorPalettes,
    activeColorPaletteId,
    setActiveColorPalette,
    createColorPalette,
    deleteColorPalette,
    addColorToPalette,
    removeColorFromPalette,
  } = useStore()
  const safeValue = normalizeHexColor(value) ?? '#000000'
  const [local, setLocal] = useState(safeValue)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newPaletteName, setNewPaletteName] = useState('')
  const timer = useRef<number | null>(null)
  const active = useRef(false)
  const activePalette = colorPalettes.find((palette) => palette.id === activeColorPaletteId) ?? colorPalettes[0]

  useEffect(() => {
    if (!active.current) setLocal(safeValue)
  }, [safeValue])

  useEffect(() => () => {
    if (timer.current) window.clearTimeout(timer.current)
    if (active.current) endInteraction()
    active.current = false
  }, [endInteraction])

  function commit(next: string) {
    const normalized = normalizeHexColor(next)
    if (!normalized) return
    setLocal(normalized)
    onChange(normalized)
  }

  function schedule(next: string) {
    setLocal(next)
    if (timer.current) window.clearTimeout(timer.current)
    timer.current = null
    const normalized = normalizeHexColor(next)
    if (!normalized) return
    if (!active.current) {
      active.current = true
      beginInteraction(true)
    }
    timer.current = window.setTimeout(() => {
      onChange(normalized)
      setLocal(normalized)
      timer.current = null
      active.current = false
      endInteraction()
    }, 120)
  }

  function flush() {
    if (timer.current) window.clearTimeout(timer.current)
    timer.current = null
    const normalized = normalizeHexColor(local)
    if (normalized) {
      onChange(normalized)
      setLocal(normalized)
    } else {
      setLocal(safeValue)
    }
    if (active.current) endInteraction()
    active.current = false
  }

  function savePalette() {
    if (!newPaletteName.trim()) return
    const id = createColorPalette(newPaletteName)
    setActiveColorPalette(id)
    addColorToPalette(local, id)
    setNewPaletteName('')
    setCreating(false)
  }

  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <input
          type="color"
          value={normalizeHexColor(local) ?? safeValue}
          onChange={(e) => schedule(e.target.value)}
          onBlur={flush}
          style={{
            width: compact ? 24 : 28,
            height: compact ? 22 : 26,
            borderRadius: 4,
            cursor: 'pointer',
            border: '1px solid var(--input-border)',
            background: 'var(--input)',
            padding: 1,
            flexShrink: 0,
          }}
        />
        <input
          type="text"
          value={local}
          onChange={(e) => schedule(e.target.value)}
          onBlur={flush}
          className="input-base"
          spellCheck={false}
          style={{ flex: 1, height: compact ? 22 : 26, fontFamily: 'monospace', fontSize: 10, textTransform: 'uppercase', minWidth: 0 }}
        />
        <button
          type="button"
          className="icon-btn"
          title={t('style.saveColor')}
          onClick={() => {
            addColorToPalette(local)
            setPaletteOpen(true)
          }}
          style={{ width: compact ? 22 : 26, minWidth: compact ? 22 : 26, height: compact ? 22 : 26 }}
        >
          <Plus size={13} />
        </button>
        <button
          type="button"
          className={`icon-btn ${paletteOpen ? 'active' : ''}`}
          title={t('style.palettes')}
          onClick={() => setPaletteOpen((open) => !open)}
          style={{
            width: compact ? 22 : 26,
            minWidth: compact ? 22 : 26,
            height: compact ? 22 : 26,
            background: `linear-gradient(135deg, ${activePalette?.colors[0] ?? '#0d99ff'}, ${activePalette?.colors[1] ?? '#a855f7'})`,
          }}
        />
      </div>

      {paletteOpen && (
        <div
          style={{
            marginTop: 6,
            padding: 8,
            border: '1px solid var(--border)',
            borderRadius: 6,
            background: 'var(--input)',
          }}
        >
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <select
              value={activePalette?.id ?? ''}
              onChange={(e) => setActiveColorPalette(e.target.value)}
              className="input-base"
              style={{ flex: 1, height: 24, minWidth: 0 }}
            >
              {colorPalettes.map((palette) => (
                <option key={palette.id} value={palette.id}>{palette.name}</option>
              ))}
            </select>
            <button type="button" className="icon-btn" title={t('style.newPalette')} onClick={() => setCreating(true)} style={{ width: 24, minWidth: 24, height: 24 }}>
              <Plus size={13} />
            </button>
            {activePalette && colorPalettes.length > 1 && (
              <button type="button" className="icon-btn" title={t('style.deletePalette')} onClick={() => deleteColorPalette(activePalette.id)} style={{ width: 24, minWidth: 24, height: 24 }}>
                <Trash2 size={12} />
              </button>
            )}
          </div>

          {creating && (
            <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
              <input
                autoFocus
                value={newPaletteName}
                onChange={(e) => setNewPaletteName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') savePalette()
                  if (e.key === 'Escape') setCreating(false)
                }}
                className="input-base"
                placeholder={t('style.paletteName')}
                style={{ flex: 1, height: 24, minWidth: 0 }}
              />
              <button type="button" className="icon-btn" onClick={savePalette} style={{ width: 24, minWidth: 24, height: 24 }}>
                <Plus size={13} />
              </button>
              <button type="button" className="icon-btn" onClick={() => setCreating(false)} style={{ width: 24, minWidth: 24, height: 24 }}>
                <X size={13} />
              </button>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 5, marginTop: 8 }}>
            {(activePalette?.colors ?? []).map((color) => (
              <button
                key={color}
                type="button"
                title={color}
                onClick={() => commit(color)}
                onContextMenu={(e) => {
                  e.preventDefault()
                  removeColorFromPalette(color)
                }}
                style={{
                  height: 18,
                  borderRadius: 4,
                  border: color.toLowerCase() === safeValue ? '2px solid var(--accent)' : '1px solid var(--input-border)',
                  background: color,
                  boxShadow: color === '#ffffff' ? 'inset 0 0 0 1px rgba(0,0,0,0.16)' : undefined,
                }}
              />
            ))}
          </div>
          {!activePalette?.colors.length && (
            <div style={{ marginTop: 8, fontSize: 10, color: 'var(--text3)' }}>{t('style.emptyPalette')}</div>
          )}
          <div style={{ marginTop: 6, fontSize: 10, color: 'var(--text3)' }}>{t('style.removeColorHint')}</div>
        </div>
      )}
    </div>
  )
}
