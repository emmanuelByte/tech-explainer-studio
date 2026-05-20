import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronRight } from 'lucide-react'
import { useStore } from '../../store'

/* ──────────────────────────────────────────────────────────────
   Shared Figma-style panel UI primitives.

   - Section: collapsible accordion with chevron + uppercase title
   - Row:     label + flex content row (consistent 56px label width)
   - NumField: compact numeric input with scrubbable leading icon
   - IconBtn:  flat icon button with active state
   ────────────────────────────────────────────────────────────── */

export function formatNumber(value: number, precision: number) {
  return Number.isInteger(value) ? String(value) : String(parseFloat(value.toFixed(precision)))
}

/* ── Section accordion ─────────────────────────────────── */
export function Section({
  title, defaultOpen = true, headerExtra, children,
}: {
  title: string
  defaultOpen?: boolean
  headerExtra?: React.ReactNode
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div style={{ borderBottom: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', paddingRight: 10 }}>
        <button
          onClick={() => setOpen(!open)}
          className={`accordion-header ${open ? 'open' : ''}`}
          style={{ flex: 1 }}
        >
          <ChevronRight size={11} className="chev" />
          <span style={{ textTransform: 'uppercase', letterSpacing: '0.06em', fontSize: 10 }}>{title}</span>
        </button>
        {headerExtra && <div style={{ display: 'flex', alignItems: 'center' }}>{headerExtra}</div>}
      </div>
      {open && (
        <div style={{ padding: '4px 10px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {children}
        </div>
      )}
    </div>
  )
}

/* ── Row with label + flex content ──────────────────────── */
export function Row({ label, children }: { label?: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, minHeight: 26 }}>
      {label && (
        <span style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.04em', width: 56, flexShrink: 0 }}>
          {label}
        </span>
      )}
      <div style={{ flex: 1, display: 'flex', gap: 4, minWidth: 0 }}>{children}</div>
    </div>
  )
}

/* ── Numeric input with leading scrub label and unit suffix ── */
export function NumField({
  leading, value, onChange, unit, step = 1, min, max, precision = 2,
  sensitivity = 1, ariaLabel,
}: {
  leading: React.ReactNode
  value: number
  onChange: (value: number) => void
  unit?: string
  step?: number
  min?: number
  max?: number
  precision?: number
  sensitivity?: number
  ariaLabel?: string
}) {
  const { t } = useTranslation()
  const beginInteraction = useStore((s) => s.beginInteraction)
  const endInteraction = useStore((s) => s.endInteraction)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(formatNumber(value, precision))
  const [scrubbing, setScrubbing] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const editingRef = useRef(false)
  const onChangeRef = useRef(onChange)
  const sensitivityRef = useRef(sensitivity)
  const scrubStart = useRef({ x: 0, v: 0 })
  onChangeRef.current = onChange
  sensitivityRef.current = sensitivity

  useEffect(() => {
    if (!editingRef.current) setDraft(formatNumber(value, precision))
  }, [value, precision])

  function clamp(v: number) {
    let next = v
    if (min !== undefined) next = Math.max(min, next)
    if (max !== undefined) next = Math.min(max, next)
    return next
  }

  function applyValue(raw: string) {
    const next = Number(raw)
    if (!Number.isFinite(next)) return
    onChangeRef.current(clamp(parseFloat(next.toFixed(precision))))
  }

  function startEditing() {
    if (editingRef.current) return
    editingRef.current = true
    setEditing(true)
    setDraft(formatNumber(value, precision))
    beginInteraction(true)
    requestAnimationFrame(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    })
  }

  function stopEditing(commit: boolean) {
    if (!editingRef.current) return
    if (commit) applyValue(draft)
    else setDraft(formatNumber(value, precision))
    editingRef.current = false
    setEditing(false)
    endInteraction()
  }

  function onLeadingMouseDown(e: React.MouseEvent) {
    if (editing) return
    e.preventDefault()
    scrubStart.current = { x: e.clientX, v: value }
    setScrubbing(true)
    beginInteraction(true)
  }

  useEffect(() => {
    if (!scrubbing) return
    function onMove(e: MouseEvent) {
      const dx = e.clientX - scrubStart.current.x
      const mult = e.shiftKey ? 10 : e.altKey ? 0.1 : 1
      const raw = scrubStart.current.v + dx * sensitivityRef.current * mult
      onChangeRef.current(clamp(parseFloat(raw.toFixed(precision))))
    }
    function onUp() { setScrubbing(false); endInteraction() }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrubbing, precision])

  const unitWidth = unit ? Math.max(14, unit.length * 6 + 6) : 0

  return (
    <div
      aria-label={ariaLabel}
      style={{
        display: 'flex',
        alignItems: 'center',
        height: 26,
        background: scrubbing ? 'var(--accent-bg)' : 'var(--input)',
        border: `1px solid ${scrubbing ? 'var(--accent)' : editing ? 'var(--accent)' : 'var(--input-border)'}`,
        borderRadius: 3,
        overflow: 'hidden',
        transition: 'border-color 0.1s, background 0.1s',
        cursor: editing ? 'text' : undefined,
        minWidth: 0,
      }}
    >
      <span
        onMouseDown={onLeadingMouseDown}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minWidth: 20,
          paddingLeft: 4,
          paddingRight: 4,
          height: '100%',
          color: 'var(--text3)',
          fontSize: 10,
          cursor: 'ew-resize',
          userSelect: 'none',
          flexShrink: 0,
        }}
        title={t('transform.scrubHelp')}
      >
        {leading}
      </span>
      <input
        ref={inputRef}
        type="number"
        value={editing ? draft : formatNumber(value, precision)}
        min={min}
        max={max}
        step={step}
        onFocus={startEditing}
        onChange={(e) => { setDraft(e.target.value); applyValue(e.target.value) }}
        onBlur={() => stopEditing(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
          if (e.key === 'Escape') { e.preventDefault(); stopEditing(false); e.currentTarget.blur() }
        }}
        style={{
          flex: 1,
          minWidth: 0,
          height: '100%',
          background: 'transparent',
          border: 'none',
          outline: 'none',
          color: 'var(--text)',
          fontSize: 11,
          fontFamily: 'inherit',
          fontVariantNumeric: 'tabular-nums',
          textAlign: 'right',
          padding: `0 ${unitWidth + 4}px 0 2px`,
        }}
      />
      {unit && (
        <span
          style={{
            position: 'relative',
            marginLeft: -unitWidth,
            width: unitWidth,
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            paddingRight: 6,
            fontSize: 9,
            color: 'var(--text3)',
            pointerEvents: 'none',
            userSelect: 'none',
            flexShrink: 0,
          }}
        >
          {unit}
        </span>
      )}
    </div>
  )
}

/* ── Flat icon button with active state ─────────────────── */
export function IconBtn({ title, children, onClick, active, disabled }: {
  title?: string
  children: React.ReactNode
  onClick: () => void
  active?: boolean
  disabled?: boolean
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      disabled={disabled}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: 26, borderRadius: 3,
        background: active ? 'var(--accent-bg)' : 'transparent',
        color: active ? 'var(--accent)' : 'var(--text2)',
        transition: 'background 0.1s, color 0.1s',
      }}
      onMouseEnter={(e) => { if (!active && !disabled) (e.currentTarget as HTMLButtonElement).style.background = 'var(--hover)' }}
      onMouseLeave={(e) => { if (!active) (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
    >
      {children}
    </button>
  )
}

/* ── Segmented tab/button group (e.g. Fixed / Fit / Fill) ── */
export function SegGroup<T extends string>({ value, options, onChange }: {
  value: T
  options: { value: T; label: string; disabled?: boolean }[]
  onChange: (v: T) => void
}) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${options.length}, 1fr)`, gap: 2, flex: 1 }}>
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          disabled={opt.disabled}
          style={{
            height: 24, fontSize: 10, borderRadius: 3,
            background: value === opt.value ? 'var(--accent-bg)' : 'transparent',
            color: value === opt.value ? 'var(--accent)' : 'var(--text2)',
            opacity: opt.disabled ? 0.4 : 1,
            transition: 'background 0.1s, color 0.1s',
          }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

/* ── Toggle row (e.g. Enable Shadow) ──────────────────── */
export function ToggleRow({ label, checked, onChange }: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 26 }}>
      <span style={{ fontSize: 11, color: 'var(--text2)', flex: 1, userSelect: 'none' }}>
        {label}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        style={{
          position: 'relative',
          width: 26, height: 14,
          borderRadius: 999,
          background: checked ? 'var(--accent)' : 'var(--input-border)',
          transition: 'background 0.15s',
          flexShrink: 0,
        }}
      >
        <span
          style={{
            position: 'absolute',
            top: 1,
            left: checked ? 13 : 1,
            width: 12, height: 12,
            borderRadius: '50%',
            background: '#ffffff',
            transition: 'left 0.15s',
            boxShadow: '0 1px 2px rgba(0,0,0,0.3)',
          }}
        />
      </button>
    </div>
  )
}

/* ── Color swatch + hex input ───────────────────────────── */
export function ColorRow({ label, value, onChange }: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, minHeight: 26 }}>
      <span style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.04em', width: 56, flexShrink: 0 }}>
        {label}
      </span>
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: 24, height: 22, borderRadius: 3, cursor: 'pointer',
          border: '1px solid var(--input-border)',
          background: 'var(--input)',
          padding: 1,
          flexShrink: 0,
        }}
      />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="input-base"
        style={{ flex: 1, height: 22, fontFamily: 'monospace', fontSize: 10, textTransform: 'uppercase' }}
      />
    </div>
  )
}
