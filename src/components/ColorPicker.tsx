import { Check, ChevronDown, Pipette, Plus, Trash2, X } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
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
  const rgb = trimmed.match(/^rgba?\(\s*([\d.]+)(?:\s+|,\s*)([\d.]+)(?:\s+|,\s*)([\d.]+)(?:\s*[,/]\s*[\d.]+%?)?\s*\)$/i)
  if (rgb) {
    const toHex = (raw: string) => Math.max(0, Math.min(255, Math.round(Number(raw))))
      .toString(16)
      .padStart(2, '0')
    return `#${toHex(rgb[1])}${toHex(rgb[2])}${toHex(rgb[3])}`.toLowerCase()
  }
  if (typeof document !== 'undefined') {
    const probe = document.createElement('span')
    probe.style.color = ''
    probe.style.color = trimmed
    if (probe.style.color) {
      document.body.appendChild(probe)
      const computed = getComputedStyle(probe).color
      probe.remove()
      if (computed && computed !== trimmed) return normalizeHexColor(computed)
    }
  }
  return null
}

/** Helper: best foreground color (black/white) for a given hex background. */
function readableOn(hex: string) {
  const normalized = normalizeHexColor(hex) ?? '#000000'
  const r = parseInt(normalized.slice(1, 3), 16)
  const g = parseInt(normalized.slice(3, 5), 16)
  const b = parseInt(normalized.slice(5, 7), 16)
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return lum > 0.6 ? '#000000' : '#ffffff'
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
  const safeValue = normalizeHexColor(value) ?? '#000000'
  const [local, setLocal] = useState(safeValue)
  const [popoverOpen, setPopoverOpen] = useState(false)
  const triggerRef = useRef<HTMLDivElement>(null)
  const { beginInteraction, endInteraction } = useStore()
  const timer = useRef<number | null>(null)
  const active = useRef(false)

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

  const swatchSize = compact ? 22 : 26
  const fieldHeight = compact ? 22 : 26

  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div ref={triggerRef} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        {/* Color swatch: click opens picker popover */}
        <button
          type="button"
          onClick={() => setPopoverOpen((open) => !open)}
          style={{
            width: swatchSize,
            height: swatchSize,
            borderRadius: 3,
            background: safeValue,
            border: '1px solid var(--input-border)',
            flexShrink: 0,
            cursor: 'pointer',
            // Checker pattern peek-through (visual cue that swatches can show transparency)
            backgroundImage: `linear-gradient(${safeValue}, ${safeValue})`,
            transition: 'border-color 0.1s',
          }}
          aria-label="Open color picker"
        />
        {/* Hex input */}
        <input
          type="text"
          value={local.replace(/^#/, '').toUpperCase()}
          onChange={(e) => schedule(e.target.value.startsWith('#') ? e.target.value : `#${e.target.value}`)}
          onBlur={flush}
          spellCheck={false}
          className="input-base"
          style={{
            flex: 1,
            height: fieldHeight,
            fontFamily: 'monospace',
            fontSize: 10,
            textTransform: 'uppercase',
            minWidth: 0,
            paddingLeft: 6,
          }}
        />
      </div>

      {popoverOpen && (
        <ColorPickerPopover
          triggerRef={triggerRef}
          value={safeValue}
          onChange={(next) => { schedule(next) }}
          onCommit={commit}
          onClose={() => setPopoverOpen(false)}
        />
      )}
    </div>
  )
}

/* ──────────────────────────────────────────────────────────────
   Figma-style floating popover with native color input,
   hex input, eyedropper, and saved color palettes.
   ────────────────────────────────────────────────────────────── */
function ColorPickerPopover({
  triggerRef, value, onChange, onCommit, onClose,
}: {
  triggerRef: React.RefObject<HTMLDivElement | null>
  value: string
  onChange: (value: string) => void
  onCommit: (value: string) => void
  onClose: () => void
}) {
  const { t } = useTranslation()
  const {
    colorPalettes,
    activeColorPaletteId,
    setActiveColorPalette,
    createColorPalette,
    deleteColorPalette,
    addColorToPalette,
    removeColorFromPalette,
  } = useStore()
  const activePalette = colorPalettes.find((palette) => palette.id === activeColorPaletteId) ?? colorPalettes[0]
  const popoverRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null)
  const [creating, setCreating] = useState(false)
  const [newPaletteName, setNewPaletteName] = useState('')
  const [paletteSwitcherOpen, setPaletteSwitcherOpen] = useState(false)
  const [hexInput, setHexInput] = useState(value.replace(/^#/, '').toUpperCase())

  useEffect(() => { setHexInput(value.replace(/^#/, '').toUpperCase()) }, [value])

  // Position popover next to trigger, prefer left of right-side panels.
  useLayoutEffect(() => {
    const trigger = triggerRef.current
    const popover = popoverRef.current
    if (!trigger || !popover) return
    const triggerRect = trigger.getBoundingClientRect()
    const popoverWidth = popover.offsetWidth || 260
    const popoverHeight = popover.offsetHeight || 320
    const margin = 6

    // Prefer placement to the LEFT of the trigger (because color pickers in
    // the right panel have no space on the right side).
    let left = triggerRect.left - popoverWidth - margin
    if (left < margin) left = triggerRect.right + margin
    if (left + popoverWidth > window.innerWidth - margin) {
      left = window.innerWidth - popoverWidth - margin
    }

    // Vertically align with trigger top, but clamp to viewport.
    let top = triggerRect.top
    if (top + popoverHeight > window.innerHeight - margin) {
      top = window.innerHeight - popoverHeight - margin
    }
    if (top < margin) top = margin

    setPosition({ left, top })
  }, [triggerRef])

  // ESC + click-outside to close
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { e.preventDefault(); onClose() }
    }
    function onMouseDown(e: MouseEvent) {
      const popover = popoverRef.current
      const trigger = triggerRef.current
      if (!popover) return
      const target = e.target as Node
      if (popover.contains(target)) return
      if (trigger && trigger.contains(target)) return
      onClose()
    }
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('mousedown', onMouseDown, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('mousedown', onMouseDown, true)
    }
  }, [onClose, triggerRef])

  function commitHex() {
    const next = normalizeHexColor(hexInput.startsWith('#') ? hexInput : `#${hexInput}`)
    if (next) onCommit(next)
    else setHexInput(value.replace(/^#/, '').toUpperCase())
  }

  function savePalette() {
    if (!newPaletteName.trim()) return
    const id = createColorPalette(newPaletteName)
    setActiveColorPalette(id)
    addColorToPalette(value, id)
    setNewPaletteName('')
    setCreating(false)
  }

  async function pickWithEyedropper() {
    // EyeDropper API — Chrome/Edge support it; falls back gracefully.
    type EyeDropperConstructor = new () => { open(): Promise<{ sRGBHex: string }> }
    const eyeDropper = (window as unknown as { EyeDropper?: EyeDropperConstructor }).EyeDropper
    if (!eyeDropper) return
    try {
      const inst = new eyeDropper()
      const result = await inst.open()
      onCommit(result.sRGBHex)
    } catch {
      // user cancelled
    }
  }

  const hasEyeDropper = typeof window !== 'undefined' && 'EyeDropper' in window

  return createPortal(
    <div
      ref={popoverRef}
      role="dialog"
      aria-label={t('style.colorPicker', { defaultValue: 'Color picker' })}
      style={{
        position: 'fixed',
        left: position?.left ?? -9999,
        top: position?.top ?? -9999,
        width: 240,
        background: 'var(--panel)',
        border: '1px solid var(--border)',
        borderRadius: 6,
        boxShadow: '0 12px 40px rgba(0,0,0,0.4)',
        zIndex: 3000,
        userSelect: 'none',
        visibility: position ? 'visible' : 'hidden',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', borderBottom: '1px solid var(--border)' }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text)' }}>
          {t('style.colorPicker', { defaultValue: 'Color picker' })}
        </span>
        <button
          onClick={onClose}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 20, height: 20, borderRadius: 3,
            color: 'var(--text3)', background: 'transparent',
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--hover)' }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
          title={t('common.closeEsc')}
        >
          <X size={12} />
        </button>
      </div>

      {/* Large preview + native color input */}
      <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <label
          style={{
            position: 'relative',
            display: 'block',
            height: 64,
            borderRadius: 4,
            background: value,
            border: '1px solid var(--input-border)',
            cursor: 'pointer',
            overflow: 'hidden',
          }}
        >
          <input
            type="color"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer' }}
          />
          <span style={{
            position: 'absolute', bottom: 4, right: 6,
            fontFamily: 'monospace', fontSize: 10, fontWeight: 500,
            color: readableOn(value),
            textTransform: 'uppercase',
            pointerEvents: 'none',
          }}>
            {value}
          </span>
        </label>

        {/* Hex input + eyedropper */}
        <div style={{ display: 'flex', gap: 4 }}>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 4, padding: '0 6px', background: 'var(--input)', border: '1px solid var(--input-border)', borderRadius: 3, height: 24 }}>
            <span style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'monospace' }}>#</span>
            <input
              type="text"
              value={hexInput}
              onChange={(e) => setHexInput(e.target.value.replace(/^#/, '').toUpperCase())}
              onBlur={commitHex}
              onKeyDown={(e) => { if (e.key === 'Enter') { commitHex(); (e.target as HTMLInputElement).blur() } }}
              spellCheck={false}
              style={{
                flex: 1, minWidth: 0, border: 'none', outline: 'none',
                background: 'transparent', color: 'var(--text)',
                fontFamily: 'monospace', fontSize: 11, textTransform: 'uppercase',
                padding: 0,
              }}
            />
          </div>
          {hasEyeDropper && (
            <button
              type="button"
              onClick={pickWithEyedropper}
              title={t('style.eyedropper', { defaultValue: 'Pick a color' })}
              style={{
                width: 24, height: 24, borderRadius: 3, flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'var(--input)', color: 'var(--text2)',
                border: '1px solid var(--input-border)',
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--hover)' }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--input)' }}
            >
              <Pipette size={12} />
            </button>
          )}
        </div>
      </div>

      {/* Library section */}
      <div style={{ borderTop: '1px solid var(--border)', padding: '8px 10px' }}>
        {/* Palette switcher + new */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 6, position: 'relative' }}>
          <button
            type="button"
            onClick={() => setPaletteSwitcherOpen((o) => !o)}
            style={{
              flex: 1, height: 22, borderRadius: 3, padding: '0 6px',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              background: 'transparent', color: 'var(--text)', fontSize: 11,
              border: '1px solid transparent',
              minWidth: 0,
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--hover)' }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
              <span style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                {t('style.library', { defaultValue: 'Library' })}
              </span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text2)' }}>
                {activePalette?.name ?? '—'}
              </span>
            </span>
            <ChevronDown size={11} style={{ color: 'var(--text3)', flexShrink: 0 }} />
          </button>
          <button
            type="button"
            onClick={() => { addColorToPalette(value) }}
            title={t('style.saveColor', { defaultValue: 'Save current color' })}
            style={{
              width: 22, height: 22, borderRadius: 3, flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'var(--input)', color: 'var(--text2)',
              border: '1px solid var(--input-border)',
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--accent-bg)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--accent)' }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--input)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--text2)' }}
          >
            <Plus size={11} />
          </button>

          {/* Palette switcher dropdown */}
          {paletteSwitcherOpen && (
            <div
              style={{
                position: 'absolute', top: 24, left: 0, right: 0,
                background: 'var(--panel)', border: '1px solid var(--border)',
                borderRadius: 4, padding: 4, zIndex: 10,
                boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
                maxHeight: 180, overflowY: 'auto',
              }}
            >
              {colorPalettes.map((palette) => (
                <button
                  key={palette.id}
                  type="button"
                  onClick={() => { setActiveColorPalette(palette.id); setPaletteSwitcherOpen(false) }}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    width: '100%', padding: '4px 6px',
                    fontSize: 11, color: palette.id === activePalette?.id ? 'var(--accent)' : 'var(--text)',
                    background: 'transparent', borderRadius: 3,
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--hover)' }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
                >
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{palette.name}</span>
                  {palette.id === activePalette?.id && <Check size={11} />}
                </button>
              ))}
              <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
              {!creating ? (
                <button
                  type="button"
                  onClick={() => setCreating(true)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 4, width: '100%',
                    padding: '4px 6px', fontSize: 11, color: 'var(--text2)',
                    background: 'transparent', borderRadius: 3,
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--hover)' }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
                >
                  <Plus size={11} />{t('style.newPalette', { defaultValue: 'New palette' })}
                </button>
              ) : (
                <div style={{ display: 'flex', gap: 4, padding: 2 }}>
                  <input
                    autoFocus
                    value={newPaletteName}
                    onChange={(e) => setNewPaletteName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') { savePalette(); setPaletteSwitcherOpen(false) }
                      if (e.key === 'Escape') setCreating(false)
                    }}
                    className="input-base"
                    placeholder={t('style.paletteName', { defaultValue: 'Name' })}
                    style={{ flex: 1, height: 22, fontSize: 11, minWidth: 0 }}
                  />
                  <button
                    type="button"
                    onClick={() => { savePalette(); setPaletteSwitcherOpen(false) }}
                    style={{
                      width: 22, height: 22, borderRadius: 3, flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: 'var(--accent-bg)', color: 'var(--accent)', border: 'none',
                    }}
                  >
                    <Check size={11} />
                  </button>
                </div>
              )}
              {activePalette && colorPalettes.length > 1 && (
                <button
                  type="button"
                  onClick={() => { deleteColorPalette(activePalette.id); setPaletteSwitcherOpen(false) }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 4, width: '100%',
                    padding: '4px 6px', fontSize: 11, color: '#ef4444',
                    background: 'transparent', borderRadius: 3,
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(239,68,68,0.1)' }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
                >
                  <Trash2 size={11} />{t('style.deletePalette', { defaultValue: 'Delete palette' })}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Color grid */}
        {activePalette?.colors.length ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
            {activePalette.colors.map((color) => {
              const isActive = color.toLowerCase() === value.toLowerCase()
              return (
                <button
                  key={color}
                  type="button"
                  title={color}
                  onClick={() => onCommit(color)}
                  onContextMenu={(e) => { e.preventDefault(); removeColorFromPalette(color) }}
                  style={{
                    width: '100%',
                    aspectRatio: '1 / 1',
                    borderRadius: 3,
                    background: color,
                    border: isActive ? '2px solid var(--accent)' : '1px solid rgba(255,255,255,0.08)',
                    boxShadow: color.toLowerCase() === '#ffffff' ? 'inset 0 0 0 1px rgba(0,0,0,0.14)' : undefined,
                    cursor: 'pointer',
                    padding: 0,
                  }}
                />
              )
            })}
          </div>
        ) : (
          <div style={{ fontSize: 10, color: 'var(--text3)', textAlign: 'center', padding: '6px 0' }}>
            {t('style.emptyPalette', { defaultValue: 'No saved colors yet' })}
          </div>
        )}
        <div style={{ marginTop: 6, fontSize: 9, color: 'var(--text3)' }}>
          {t('style.removeColorHint', { defaultValue: 'Right-click swatch to remove' })}
        </div>
      </div>
    </div>,
    document.body,
  )
}
