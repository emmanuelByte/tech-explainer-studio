import { useEffect, useRef, useState } from 'react'

interface ScrubFieldProps {
  label: string
  value: number
  onChange: (v: number) => void
  step?: number
  min?: number
  max?: number
  unit?: string
  precision?: number
  /** Units to change per pixel dragged at 1× speed */
  sensitivity?: number
}

export function ScrubField({
  label, value, onChange,
  step = 1, min, max, unit,
  precision = 2, sensitivity = 1,
}: ScrubFieldProps) {
  const [editing, setEditing] = useState(false)
  const [editVal, setEditVal] = useState('')
  const [scrubbing, setScrubbing] = useState(false)

  const startX = useRef(0)
  const startV = useRef(0)
  const onChangeRef = useRef(onChange)
  const sensitivityRef = useRef(sensitivity)
  onChangeRef.current = onChange
  sensitivityRef.current = sensitivity

  function clamp(v: number) {
    if (min !== undefined) v = Math.max(min, v)
    if (max !== undefined) v = Math.min(max, v)
    return v
  }

  function startEditing() {
    setEditVal(String(parseFloat(value.toFixed(precision))))
    setEditing(true)
  }

  function commitEdit(raw: string) {
    const v = parseFloat(raw)
    if (!isNaN(v)) onChangeRef.current(clamp(parseFloat(v.toFixed(precision))))
    setEditing(false)
  }

  function onLabelMouseDown(e: React.MouseEvent) {
    if (editing) return
    e.preventDefault()
    startX.current = e.clientX
    startV.current = value
    setScrubbing(true)
  }

  useEffect(() => {
    if (!scrubbing) return

    function onMove(e: MouseEvent) {
      const dx = e.clientX - startX.current
      const mult = e.shiftKey ? 10 : e.altKey ? 0.1 : 1
      const raw = startV.current + dx * sensitivityRef.current * mult
      const clamped = clamp(parseFloat(raw.toFixed(precision)))
      onChangeRef.current(clamped)
    }
    function onUp() { setScrubbing(false) }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrubbing, precision])

  const displayVal = parseFloat(value.toFixed(precision))

  if (editing) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5">
        <span className="text-xs w-20 flex-shrink-0" style={{ color: 'var(--text2)' }}>{label}</span>
        <input
          autoFocus
          type="number"
          value={editVal}
          step={step}
          onChange={(e) => setEditVal(e.target.value)}
          onBlur={(e) => commitEdit(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitEdit(editVal)
            if (e.key === 'Escape') setEditing(false)
          }}
          className="input-base flex-1 w-0 text-right text-xs"
        />
        {unit && <span className="text-xs flex-shrink-0" style={{ color: 'var(--text3)' }}>{unit}</span>}
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 group/scrub">
      {/* Scrubable label */}
      <span
        className="text-xs w-20 flex-shrink-0 select-none"
        style={{ color: 'var(--text2)', cursor: 'ew-resize' }}
        onMouseDown={onLabelMouseDown}
        title={`Drag to scrub · Shift=×10 · Alt=×0.1 · Click value to type`}
      >
        {label}
      </span>

      {/* Value display — click to type */}
      <div
        className="flex-1 flex items-center justify-end gap-0.5 rounded text-xs px-1.5 py-0.5 select-none"
        style={{
          background: scrubbing ? 'rgba(99,102,241,0.12)' : 'var(--input)',
          border: `1px solid ${scrubbing ? '#6366f1' : 'var(--border)'}`,
          cursor: scrubbing ? 'ew-resize' : 'text',
          minHeight: 24,
          fontVariantNumeric: 'tabular-nums',
          color: 'var(--text)',
          transition: 'border-color 0.1s, background 0.1s',
        }}
        onMouseDown={onLabelMouseDown}
        onClick={() => { if (!scrubbing) startEditing() }}
      >
        <span>{displayVal}</span>
        {unit && <span style={{ color: 'var(--text3)', fontSize: 9, marginLeft: 1 }}>{unit}</span>}
      </div>
    </div>
  )
}
