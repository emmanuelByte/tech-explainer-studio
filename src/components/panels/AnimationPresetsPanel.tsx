import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { RotateCcw } from 'lucide-react'
import { useStore } from '../../store'
import { interpolateProps } from '../../remotion/interpolateProps'
import { Keyframe, TransformProps, EasingType, Layer, TextRevealMode } from '../../types'
import { Section, Row, NumField, SegGroup, ToggleRow } from './_panelKit'

/* ──────────────────────────────────────────────────────────────
   Rotation3DGizmo — interactive 3D rotation editor with a
   cube body and colored axis sticks (X=red, Y=green, Z=blue).
   - Drag the body to rotate Y (horizontal) and X (vertical)
   - Shift + drag for Z rotation
   - Reset button in corner
   ────────────────────────────────────────────────────────────── */
function Rotation3DGizmo({ rotateX, rotateY, rotateZ, onChange }: {
  rotateX: number
  rotateY: number
  rotateZ: number
  /** Batched update — gizmo passes any subset of axes that changed. */
  onChange: (update: { rotateX?: number; rotateY?: number; rotateZ?: number }) => void
}) {
  const dragRef = useRef({
    active: false, startX: 0, startY: 0,
    startRotX: 0, startRotY: 0, startRotZ: 0,
  })
  const [dragging, setDragging] = useState(false)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  function onMouseDown(e: React.MouseEvent) {
    e.preventDefault()
    dragRef.current = {
      active: true,
      startX: e.clientX, startY: e.clientY,
      startRotX: rotateX, startRotY: rotateY, startRotZ: rotateZ,
    }
    setDragging(true)
  }

  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!dragRef.current.active) return
      const dx = e.clientX - dragRef.current.startX
      const dy = e.clientY - dragRef.current.startY
      if (e.shiftKey) {
        onChangeRef.current({ rotateZ: dragRef.current.startRotZ + dx * 0.8 })
      } else {
        // Single batched update so React doesn't drop one axis
        onChangeRef.current({
          rotateY: dragRef.current.startRotY + dx * 0.8,
          rotateX: dragRef.current.startRotX - dy * 0.8,
        })
      }
    }
    function onUp() {
      dragRef.current.active = false
      setDragging(false)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [])

  const AXIS = { x: '#ef4444', y: '#22c55e', z: '#3b82f6' } as const
  const CUBE = 36
  const STICK_LEN = 34
  const STICK_W = 2

  // Cube face style helper
  const face = (transform: string, bg: string, border: string): React.CSSProperties => ({
    position: 'absolute', inset: 0,
    background: bg, border: `1px solid ${border}`,
    transform,
  })

  // Axis stick (a thin bar coming out of the cube center along one axis)
  // Each stick is positioned with translateZ to extend from the cube
  const axisStick = (axis: 'x' | 'y' | 'z'): React.CSSProperties => {
    const color = AXIS[axis]
    if (axis === 'x') {
      // along X axis (horizontal right), extends to +X
      return {
        position: 'absolute',
        left: '50%', top: '50%',
        width: STICK_LEN, height: STICK_W,
        marginTop: -STICK_W / 2,
        background: color,
        transformOrigin: 'left center',
        transform: 'rotateY(0deg)',
      }
    }
    if (axis === 'y') {
      // along Y axis (vertical up). In screen space, up is -Y.
      return {
        position: 'absolute',
        left: '50%', top: '50%',
        width: STICK_W, height: STICK_LEN,
        marginLeft: -STICK_W / 2,
        background: color,
        transformOrigin: 'center bottom',
        transform: 'translateY(-100%)',
      }
    }
    // z axis — sticks toward camera (+Z)
    return {
      position: 'absolute',
      left: '50%', top: '50%',
      width: STICK_W, height: STICK_W,
      marginLeft: -STICK_W / 2, marginTop: -STICK_W / 2,
      background: color,
      boxShadow: `0 0 0 1px ${color}`,
      transform: `translateZ(${STICK_LEN}px)`,
    }
  }

  // Axis end-cap dot (small sphere indicator at the tip of each axis)
  const axisDot = (axis: 'x' | 'y' | 'z'): React.CSSProperties => {
    const color = AXIS[axis]
    const size = 6
    const base: React.CSSProperties = {
      position: 'absolute',
      width: size, height: size,
      borderRadius: '50%',
      background: color,
      boxShadow: `0 0 0 1px var(--panel)`,
    }
    if (axis === 'x') {
      return { ...base, left: '50%', top: '50%', marginLeft: STICK_LEN - size / 2, marginTop: -size / 2 }
    }
    if (axis === 'y') {
      return { ...base, left: '50%', top: '50%', marginLeft: -size / 2, marginTop: -STICK_LEN - size / 2 }
    }
    return {
      ...base, left: '50%', top: '50%', marginLeft: -size / 2, marginTop: -size / 2,
      transform: `translateZ(${STICK_LEN}px)`,
    }
  }

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <div
        onMouseDown={onMouseDown}
        style={{
          width: '100%', height: 140,
          background: 'var(--input)',
          border: `1px solid ${dragging ? 'var(--accent)' : 'var(--input-border)'}`,
          borderRadius: 3,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          perspective: 380,
          cursor: dragging ? 'grabbing' : 'grab',
          userSelect: 'none',
          overflow: 'hidden',
          transition: 'border-color 0.1s',
        }}
        title="Drag to rotate · Shift+drag for Z"
      >
        {/* World grid (faded reference) */}
        <svg
          viewBox="0 0 200 140"
          style={{ position: 'absolute', inset: 0, pointerEvents: 'none', opacity: 0.12 }}
        >
          <line x1={100} y1={10} x2={100} y2={130} stroke="currentColor" strokeWidth={0.5} />
          <line x1={20} y1={70} x2={180} y2={70} stroke="currentColor" strokeWidth={0.5} />
          <ellipse cx={100} cy={70} rx={50} ry={14} fill="none" stroke="currentColor" strokeWidth={0.5} />
        </svg>

        {/* 3D body + local axes */}
        <div
          style={{
            transformStyle: 'preserve-3d',
            transform: `rotateX(${rotateX}deg) rotateY(${rotateY}deg) rotateZ(${rotateZ}deg)`,
            width: CUBE, height: CUBE,
            position: 'relative',
            transition: dragging ? 'none' : 'transform 0.08s linear',
          }}
        >
          {/* Cube faces (6) — semi-transparent so axes stay visible */}
          <div style={face(`translateZ(${CUBE / 2}px)`, 'rgba(13,153,255,0.45)', 'rgba(13,153,255,0.7)')} />
          <div style={face(`rotateY(180deg) translateZ(${CUBE / 2}px)`, 'rgba(13,153,255,0.18)', 'rgba(13,153,255,0.35)')} />
          <div style={face(`rotateY(90deg) translateZ(${CUBE / 2}px)`, 'rgba(239,68,68,0.35)', 'rgba(239,68,68,0.6)')} />
          <div style={face(`rotateY(-90deg) translateZ(${CUBE / 2}px)`, 'rgba(239,68,68,0.18)', 'rgba(239,68,68,0.35)')} />
          <div style={face(`rotateX(90deg) translateZ(${CUBE / 2}px)`, 'rgba(34,197,94,0.35)', 'rgba(34,197,94,0.6)')} />
          <div style={face(`rotateX(-90deg) translateZ(${CUBE / 2}px)`, 'rgba(34,197,94,0.18)', 'rgba(34,197,94,0.35)')} />

          {/* Axis sticks — rotate with the body, showing local orientation */}
          <div style={axisStick('x')} />
          <div style={axisStick('y')} />
          <div style={axisStick('z')} />
          <div style={axisDot('x')} />
          <div style={axisDot('y')} />
          <div style={axisDot('z')} />
        </div>

        {/* Legend */}
        <div style={{ position: 'absolute', left: 6, bottom: 4, display: 'flex', gap: 8, fontSize: 9, color: 'var(--text3)' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: AXIS.x }} />X
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: AXIS.y }} />Y
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: AXIS.z }} />Z
          </span>
        </div>

        {/* Reset button */}
        <button
          type="button"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={() => onChange({ rotateX: 0, rotateY: 0, rotateZ: 0 })}
          title="Reset"
          style={{
            position: 'absolute', top: 4, right: 4,
            width: 22, height: 22, borderRadius: 3,
            background: 'transparent', color: 'var(--text3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'color 0.1s, background 0.1s',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = 'var(--hover)';
            (e.currentTarget as HTMLButtonElement).style.color = 'var(--text)'
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
            (e.currentTarget as HTMLButtonElement).style.color = 'var(--text3)'
          }}
        >
          <RotateCcw size={11} />
        </button>
      </div>
    </div>
  )
}

type PresetCategory = 'in' | 'out' | 'attention' | 'text'
type MotionBuilderKey = 'rotateX' | 'rotateY' | 'rotateZ' | 'skewX' | 'skewY' | 'scale' | 'opacity' | 'perspective' | 'lift'
type MotionBuilderState = Record<MotionBuilderKey, { enabled: boolean; to: number }>
type BreathingStyle = 'soft' | 'float' | 'glow' | 'bob'
const MAX_BREATHING_KEYFRAMES = 120

interface PresetDef {
  label: string
  category: PresetCategory
  textOnly?: boolean
  textRevealMode?: TextRevealMode
  generate: (start: number, dur: number, easing: EasingType, base: TransformProps, layer: Layer) => Keyframe[]
}

const PRESETS: Record<string, PresetDef> = {
  'fade-in': {
    label: 'Fade In', category: 'in',
    generate: (s, d, e, b) => [
      { frame: s, easing: e, props: { ...b, opacity: 0 } },
      { frame: s + d, easing: 'linear', props: { ...b, opacity: 1 } },
    ],
  },
  'fade-out': {
    label: 'Fade Out', category: 'out',
    generate: (s, d, e, b) => [
      { frame: s, easing: e, props: { ...b, opacity: 1 } },
      { frame: s + d, easing: 'linear', props: { ...b, opacity: 0 } },
    ],
  },
  'fade-up': {
    label: 'Fade In Up', category: 'in',
    generate: (s, d, e, b) => [
      { frame: s, easing: e, props: { ...b, opacity: 0, y: b.y + 40 } },
      { frame: s + d, easing: 'linear', props: { ...b, opacity: 1, y: b.y } },
    ],
  },
  'fade-down': {
    label: 'Fade In Down', category: 'in',
    generate: (s, d, e, b) => [
      { frame: s, easing: e, props: { ...b, opacity: 0, y: b.y - 40 } },
      { frame: s + d, easing: 'linear', props: { ...b, opacity: 1, y: b.y } },
    ],
  },
  'slide-left': {
    label: 'Slide In Left', category: 'in',
    generate: (s, d, e, b) => [
      { frame: s, easing: e, props: { ...b, x: b.x - 200, opacity: 0 } },
      { frame: s + d, easing: 'linear', props: { ...b, x: b.x, opacity: 1 } },
    ],
  },
  'slide-right': {
    label: 'Slide In Right', category: 'in',
    generate: (s, d, e, b) => [
      { frame: s, easing: e, props: { ...b, x: b.x + 200, opacity: 0 } },
      { frame: s + d, easing: 'linear', props: { ...b, x: b.x, opacity: 1 } },
    ],
  },
  'scale-in': {
    label: 'Scale In', category: 'in',
    generate: (s, d, e, b) => [
      { frame: s, easing: e, props: { ...b, scale: 0, opacity: 0 } },
      { frame: s + d, easing: 'linear', props: { ...b, scale: b.scale, opacity: 1 } },
    ],
  },
  'scale-out': {
    label: 'Scale Out', category: 'out',
    generate: (s, d, e, b) => [
      { frame: s, easing: e, props: { ...b } },
      { frame: s + d, easing: 'linear', props: { ...b, scale: 0, opacity: 0 } },
    ],
  },
  'bounce-in': {
    label: 'Bounce In', category: 'in',
    generate: (s, d, _e, b) => [
      { frame: s, easing: 'ease-out', props: { ...b, scale: 0, opacity: 0 } },
      { frame: s + Math.round(d * 0.6), easing: 'ease-out', props: { ...b, scale: b.scale * 1.2, opacity: 1 } },
      { frame: s + Math.round(d * 0.75), easing: 'ease-in-out', props: { ...b, scale: b.scale * 0.9, opacity: 1 } },
      { frame: s + Math.round(d * 0.9), easing: 'ease-in-out', props: { ...b, scale: b.scale * 1.05, opacity: 1 } },
      { frame: s + d, easing: 'linear', props: { ...b, scale: b.scale, opacity: 1 } },
    ],
  },
  'flip-x': {
    label: 'Flip In X', category: 'in',
    generate: (s, d, e, b) => [
      { frame: s, easing: e, props: { ...b, rotateX: 90, opacity: 0 } },
      { frame: s + d, easing: 'linear', props: { ...b, rotateX: 0, opacity: 1 } },
    ],
  },
  'flip-y': {
    label: 'Flip In Y', category: 'in',
    generate: (s, d, e, b) => [
      { frame: s, easing: e, props: { ...b, rotateY: 90, opacity: 0 } },
      { frame: s + d, easing: 'linear', props: { ...b, rotateY: 0, opacity: 1 } },
    ],
  },
  'blur-in': {
    label: 'Blur In', category: 'in',
    generate: (s, d, e, b) => [
      { frame: s, easing: e, props: { ...b, blur: 20, opacity: 0 } },
      { frame: s + d, easing: 'linear', props: { ...b, blur: 0, opacity: 1 } },
    ],
  },
  'wheel-in': {
    label: 'Wheel In', category: 'in', textOnly: true, textRevealMode: 'wheel-fade',
    generate: (s, d, e, b, layer) => {
      const travel = Math.max(96, Math.min(340, layer.fontSize * 2.8))
      return [
        { frame: s, easing: e, props: { ...b, y: b.y + travel, blur: 0, opacity: Math.min(b.opacity, 0.16), scale: b.scale * 0.98 } },
        { frame: s + Math.round(d * 0.72), easing: 'ease-out', props: { ...b, y: b.y - travel * 0.06, blur: 0, opacity: Math.max(b.opacity, 1), scale: b.scale * 1.006 } },
        { frame: s + d, easing: 'linear', props: { ...b, y: b.y, blur: 0, opacity: Math.max(b.opacity, 1), scale: b.scale } },
      ]
    },
  },
  'wheel-out': {
    label: 'Wheel Out', category: 'out', textOnly: true, textRevealMode: 'wheel-fade',
    generate: (s, d, e, b, layer) => {
      const travel = Math.max(96, Math.min(340, layer.fontSize * 2.8))
      return [
        { frame: s, easing: e, props: { ...b, y: b.y, blur: 0, opacity: Math.max(b.opacity, 1), scale: b.scale } },
        { frame: s + Math.round(d * 0.28), easing: 'ease-in', props: { ...b, y: b.y - travel * 0.12, blur: 0, opacity: Math.max(b.opacity, 1), scale: b.scale * 1.006 } },
        { frame: s + d, easing: 'linear', props: { ...b, y: b.y - travel, blur: 0, opacity: Math.min(b.opacity, 0.12), scale: b.scale * 0.98 } },
      ]
    },
  },
  'glitch': {
    label: 'Glitch', category: 'attention',
    generate: (s, d, _e, b) => {
      const frames: Keyframe[] = []
      for (let i = 0; i < 8; i++) {
        frames.push({
          frame: s + Math.round(i * d * 0.1),
          easing: 'linear',
          props: { ...b, x: b.x + (Math.random() - 0.5) * 30, y: b.y + (Math.random() - 0.5) * 15 },
        })
      }
      frames.push({ frame: s + d, easing: 'linear', props: { ...b } })
      return frames
    },
  },
  'typewriter': {
    label: 'Typewriter', category: 'text', textOnly: true, textRevealMode: 'plain',
    generate: (s, d, e, b) => [
      { frame: s, easing: e, props: { ...b, charProgress: 0, opacity: Math.max(0.35, b.opacity) } },
      { frame: s + d, easing: 'linear', props: { ...b, charProgress: 1 } },
    ],
  },
  'typewriter-soft': {
    label: 'Soft Type In', category: 'text', textOnly: true, textRevealMode: 'char-rise',
    generate: (s, d, e, b) => [
      { frame: s, easing: e, props: { ...b, charProgress: 0, opacity: 0, blur: 3, y: b.y + 10 } },
      { frame: s + Math.round(d * 0.35), easing: 'linear', props: { ...b, charProgress: 0.45, opacity: 1, blur: 1, y: b.y } },
      { frame: s + d, easing: 'linear', props: { ...b, charProgress: 1, opacity: 1, blur: 0, y: b.y } },
    ],
  },
  'char-pop-type': {
    label: 'Pop Characters', category: 'text', textOnly: true, textRevealMode: 'char-pop',
    generate: (s, d, e, b) => [
      { frame: s, easing: e, props: { ...b, charProgress: 0, opacity: 1 } },
      { frame: s + d, easing: 'linear', props: { ...b, charProgress: 1, opacity: 1 } },
    ],
  },
  'falling-letters': {
    label: 'Falling Letters', category: 'text', textOnly: true, textRevealMode: 'char-fall',
    generate: (s, d, e, b) => [
      { frame: s, easing: e, props: { ...b, charProgress: 0, opacity: 1 } },
      { frame: s + d, easing: 'linear', props: { ...b, charProgress: 1, opacity: 1 } },
    ],
  },
  'rising-letters': {
    label: 'Rising Letters', category: 'text', textOnly: true, textRevealMode: 'char-rise',
    generate: (s, d, e, b) => [
      { frame: s, easing: e, props: { ...b, charProgress: 0, opacity: 1 } },
      { frame: s + d, easing: 'linear', props: { ...b, charProgress: 1, opacity: 1 } },
    ],
  },
  'spin-type': {
    label: 'Spin Type', category: 'text', textOnly: true, textRevealMode: 'char-spin',
    generate: (s, d, e, b) => [
      { frame: s, easing: e, props: { ...b, charProgress: 0, opacity: 1 } },
      { frame: s + d, easing: 'linear', props: { ...b, charProgress: 1, opacity: 1 } },
    ],
  },
  'blur-type': {
    label: 'Blur Type', category: 'text', textOnly: true, textRevealMode: 'char-blur',
    generate: (s, d, e, b) => [
      { frame: s, easing: e, props: { ...b, charProgress: 0, opacity: 1 } },
      { frame: s + d, easing: 'linear', props: { ...b, charProgress: 1, opacity: 1 } },
    ],
  },
  'type-out': {
    label: 'Type Out', category: 'text', textOnly: true, textRevealMode: 'plain',
    generate: (s, d, e, b) => [
      { frame: s, easing: e, props: { ...b, charProgress: 1, opacity: 1 } },
      { frame: s + d, easing: 'linear', props: { ...b, charProgress: 0, opacity: Math.max(0, b.opacity * 0.35) } },
    ],
  },
  'word-reveal': {
    label: 'Word Rise', category: 'text', textOnly: true, textRevealMode: 'word-rise',
    generate: (s, d, e, b) => [
      { frame: s, easing: e, props: { ...b, charProgress: 0, opacity: 1 } },
      { frame: s + d, easing: 'linear', props: { ...b, charProgress: 1, opacity: 1 } },
    ],
  },
  'word-reveal-old': {
    label: 'Word Step Reveal', category: 'text', textOnly: true, textRevealMode: 'plain',
    generate: (s, d, _e, b, layer) => {
      const text = layer.text || ''
      const ends = [...text.matchAll(/\S+/g)].map((match) => (match.index ?? 0) + match[0].length)
      if (!ends.length) return [
        { frame: s, easing: 'linear', props: { ...b, charProgress: 0 } },
        { frame: s + d, easing: 'linear', props: { ...b, charProgress: 1 } },
      ]
      return [
        { frame: s, easing: 'linear', props: { ...b, charProgress: 0, opacity: 1 } },
        ...ends.map((end, index) => ({
          frame: s + Math.max(1, Math.round(((index + 1) / ends.length) * d)),
          easing: 'linear' as EasingType,
          props: { ...b, charProgress: Math.min(1, end / Math.max(1, text.length)), opacity: 1 },
        })),
      ]
    },
  },
  'word-blur-out': {
    label: 'Word Blur Out', category: 'out', textOnly: true, textRevealMode: 'word-rise',
    generate: (s, d, e, b) => [
      { frame: s, easing: e, props: { ...b, charProgress: 1, opacity: 1 } },
      { frame: s + d, easing: 'linear', props: { ...b, charProgress: 0, opacity: 1 } },
    ],
  },
  'line-reveal': {
    label: 'Line Reveal', category: 'text', textOnly: true, textRevealMode: 'plain',
    generate: (s, d, _e, b, layer) => {
      const text = layer.text || ''
      const lines = text.split('\n')
      const ends = lines.reduce<number[]>((acc, line, index) => {
        const previous = acc[index - 1] ?? 0
        acc.push(previous + line.length + (index < lines.length - 1 ? 1 : 0))
        return acc
      }, [])
      return [
        { frame: s, easing: 'linear', props: { ...b, charProgress: 0, opacity: 1 } },
        ...ends.map((end, index) => ({
          frame: s + Math.max(1, Math.round(((index + 1) / Math.max(1, ends.length)) * d)),
          easing: 'linear' as EasingType,
          props: { ...b, charProgress: Math.min(1, end / Math.max(1, text.length)), opacity: 1 },
        })),
      ]
    },
  },
  'text-pop': {
    label: 'Text Pop', category: 'text', textOnly: true, textRevealMode: 'char-pop',
    generate: (s, d, _e, b) => [
      { frame: s, easing: 'ease-out', props: { ...b, charProgress: 0, scale: b.scale * 0.94, opacity: 0 } },
      { frame: s + Math.round(d * 0.65), easing: 'ease-out', props: { ...b, charProgress: 1, scale: b.scale * 1.04, opacity: 1 } },
      { frame: s + d, easing: 'linear', props: { ...b, charProgress: 1, scale: b.scale, opacity: 1 } },
    ],
  },
  'text-flicker': {
    label: 'Flicker In', category: 'text', textOnly: true, textRevealMode: 'plain',
    generate: (s, d, _e, b) => [
      { frame: s, easing: 'linear', props: { ...b, charProgress: 1, opacity: 0 } },
      { frame: s + Math.round(d * 0.18), easing: 'linear', props: { ...b, charProgress: 1, opacity: 1 } },
      { frame: s + Math.round(d * 0.28), easing: 'linear', props: { ...b, charProgress: 1, opacity: 0.25 } },
      { frame: s + Math.round(d * 0.42), easing: 'linear', props: { ...b, charProgress: 1, opacity: 1 } },
      { frame: s + Math.round(d * 0.55), easing: 'linear', props: { ...b, charProgress: 1, opacity: 0.55 } },
      { frame: s + d, easing: 'linear', props: { ...b, charProgress: 1, opacity: 1 } },
    ],
  },
  'perspective-tilt': {
    label: 'Perspective Tilt', category: 'attention',
    generate: (s, d, _e, b) => [
      { frame: s, easing: 'ease-out', props: { ...b, rotateX: 15, rotateY: -10 } },
      { frame: s + Math.round(d * 0.5), easing: 'ease-in-out', props: { ...b, rotateX: -10, rotateY: 15 } },
      { frame: s + d, easing: 'ease-out', props: { ...b, rotateX: 0, rotateY: 0 } },
    ],
  },
}

const EASINGS: EasingType[] = ['linear', 'ease', 'ease-in', 'ease-out', 'ease-in-out', 'spring', 'bounce']
const CATEGORY_LABELS: Record<PresetCategory, string> = {
  in: 'In',
  out: 'Out',
  attention: 'Attention',
  text: 'Text',
}

const BUILDER_FIELDS: Array<{
  key: MotionBuilderKey
  labelKey: string
  unit: string
  step: number
  precision: number
  percent?: boolean
  min?: number
  max?: number
}> = [
  { key: 'rotateY', labelKey: 'rotateY', unit: 'deg', step: 1, precision: 0 },
  { key: 'rotateX', labelKey: 'rotateX', unit: 'deg', step: 1, precision: 0 },
  { key: 'rotateZ', labelKey: 'rotateZ', unit: 'deg', step: 1, precision: 0 },
  { key: 'skewX', labelKey: 'skewX', unit: 'deg', step: 1, precision: 0 },
  { key: 'skewY', labelKey: 'skewY', unit: 'deg', step: 1, precision: 0 },
  { key: 'scale', labelKey: 'scale', unit: '%', step: 1, precision: 0, percent: true, min: 0 },
  { key: 'opacity', labelKey: 'opacity', unit: '%', step: 1, precision: 0, percent: true, min: 0, max: 100 },
  { key: 'perspective', labelKey: 'perspective', unit: 'px', step: 25, precision: 0, min: 100 },
  { key: 'lift', labelKey: 'lift', unit: 'px', step: 4, precision: 0, min: 0 },
]

function makeBuilderState(base: TransformProps): MotionBuilderState {
  return {
    rotateY: { enabled: false, to: base.rotateY },
    rotateX: { enabled: false, to: base.rotateX },
    rotateZ: { enabled: false, to: base.rotateZ },
    skewX: { enabled: false, to: base.skewX },
    skewY: { enabled: false, to: base.skewY },
    scale: { enabled: false, to: base.scale },
    opacity: { enabled: false, to: base.opacity },
    perspective: { enabled: false, to: base.perspective },
    lift: { enabled: false, to: 32 },
  }
}

function displayValue(value: number, percent?: boolean) {
  return percent ? value * 100 : value
}

function storedValue(value: number, percent?: boolean) {
  return percent ? value / 100 : value
}

function inferLiftAmount(from: TransformProps, to: TransformProps) {
  const yLift = from.y - to.y
  const shadowLift = Math.max(0, (to.shadowBlur - from.shadowBlur) / 0.55)
  const lift = Math.max(yLift, shadowLift)
  return lift > 2 ? Math.round(Math.max(0, Math.min(240, lift))) : 0
}

function surfaceBaseFromLift(to: TransformProps, lift: number): TransformProps {
  if (lift <= 0) return { ...to }
  return {
    ...to,
    y: to.y + lift,
    scale: to.scale / (1 + lift / 900),
    shadowY: to.shadowY - lift * 0.35,
    shadowBlur: Math.max(0, to.shadowBlur - lift * 0.55),
    shadowSpread: to.shadowSpread - lift * 0.02,
  }
}

function breathingPeakProps(base: TransformProps, intensity: number, style: BreathingStyle): TransformProps {
  const amount = Math.max(0, intensity) / 100
  const lift = Math.max(0, intensity)
  const peak: TransformProps = { ...base }

  if (style === 'soft') {
    peak.scale = base.scale * (1 + amount)
    peak.shadowY = base.shadowY + lift * 0.65
    peak.shadowBlur = base.shadowBlur + lift * 2.4
    peak.shadowSpread = base.shadowSpread + lift * 0.06
    return peak
  }

  if (style === 'glow') {
    peak.scale = base.scale * (1 + amount * 0.75)
    peak.brightness = Math.min(160, base.brightness + lift * 1.4)
    peak.shadowY = base.shadowY + lift * 0.45
    peak.shadowBlur = base.shadowBlur + lift * 4.5
    peak.shadowSpread = base.shadowSpread + lift * 0.16
    return peak
  }

  peak.y = base.y - lift * 1.6
  peak.z = base.z + lift * 2.5
  peak.scale = base.scale * (1 + amount * 0.55)
  peak.rotateZ = base.rotateZ + Math.max(-0.8, Math.min(0.8, lift * 0.08))
  peak.shadowY = base.shadowY + lift * 1.15
  peak.shadowBlur = base.shadowBlur + lift * 3.4
  peak.shadowSpread = base.shadowSpread + lift * 0.08
  return peak
}

function generateBreathingKeyframes(start: number, end: number, interval: number, base: TransformProps, intensity: number, style: BreathingStyle): Keyframe[] {
  const startFrame = Math.max(0, Math.round(start))
  const endFrame = Math.max(startFrame + 1, Math.round(end))
  const pointsPerCycle = style === 'bob' ? 3 : 3
  const maxCycles = Math.max(1, Math.floor(MAX_BREATHING_KEYFRAMES / pointsPerCycle))
  const intervalFrames = Math.max(6, Math.round(interval), Math.ceil((endFrame - startFrame) / maxCycles))
  const peak = breathingPeakProps(base, intensity, style)
  const byFrame = new Map<number, Keyframe>()

  for (let frame = startFrame; frame < endFrame; frame += intervalFrames) {
    const cycleEnd = Math.min(endFrame, frame + intervalFrames)
    const peakFrame = frame + Math.max(1, Math.round((cycleEnd - frame) * 0.5))
    if (style === 'bob') {
      const travel = Math.max(1, intensity * 1.35)
      const upProps: TransformProps = {
        ...base,
        y: base.y - travel,
        shadowY: base.shadowY + travel * 0.45,
        shadowBlur: base.shadowBlur + travel * 0.9,
      }
      byFrame.set(frame, { frame, easing: 'ease-in-out', props: { ...base } })
      if (peakFrame > frame && peakFrame < cycleEnd) {
        byFrame.set(peakFrame, { frame: peakFrame, easing: 'ease-in-out', props: upProps })
      }
      byFrame.set(cycleEnd, { frame: cycleEnd, easing: 'ease-in-out', props: { ...base } })
      continue
    }
    byFrame.set(frame, { frame, easing: 'ease-in-out', props: { ...base } })
    if (peakFrame > frame && peakFrame < cycleEnd) {
      byFrame.set(peakFrame, { frame: peakFrame, easing: 'ease-in-out', props: { ...peak } })
    }
    byFrame.set(cycleEnd, { frame: cycleEnd, easing: 'ease-in-out', props: { ...base } })
  }

  const frames = [...byFrame.values()].sort((a, b) => a.frame - b.frame)
  if (frames.length) frames[frames.length - 1] = { ...frames[frames.length - 1], easing: 'linear' }
  return frames
}


export function AnimationPresetsPanel() {
  const { t } = useTranslation()
  const { layers, selectedLayerIds, currentFrame, fps, totalFrames, addKeyframe, addKeyframes, addKeyframeSequence, updateLayerProp, beginInteraction, endInteraction } = useStore()
  const layer = layers.find((l) => l.id === selectedLayerIds[0])

  const [duration, setDuration] = useState(30)
  const [startFrame, setStartFrame] = useState(currentFrame)
  const [timeUnit, setTimeUnit] = useState<'frames' | 'seconds'>('seconds')
  const [easing, setEasing] = useState<EasingType>('ease-out')
  const [activeCategory, setActiveCategory] = useState<PresetCategory>('in')
  const [builder, setBuilder] = useState<MotionBuilderState>(() => makeBuilderState(interpolateProps(0, [])))
  const [breathingStyle, setBreathingStyle] = useState<BreathingStyle>('float')
  const [breathingTimeUnit, setBreathingTimeUnit] = useState<'frames' | 'seconds'>('seconds')
  const [breathingStartFrame, setBreathingStartFrame] = useState(currentFrame)
  const [breathingEndFrame, setBreathingEndFrame] = useState(currentFrame + 90)
  const [breathingInterval, setBreathingInterval] = useState(1.2)
  const [breathingIntensity, setBreathingIntensity] = useState(4)
  const builderBaseRef = useRef<Record<string, TransformProps>>({})

  useEffect(() => {
    if (!layer) return
    const layerStart = layer.startFrame ?? 0
    const layerEnd = layer.endFrame ?? totalFrames
    const inferredStart = Math.max(layerStart, Math.min(currentFrame, Math.max(layerStart, layerEnd - 1)))
    const remaining = Math.max(1, layerEnd - inferredStart)
    const textLength = layer.type === 'text' ? Math.max(1, layer.text.length) : 0
    const textDuration = layer.type === 'text' ? Math.max(Math.round(fps * 0.8), Math.min(Math.round(fps * 2), textLength * 2)) : fps
    const inferredDuration = Math.max(1, Math.min(remaining, textDuration))
    const inferredTarget = Math.max(layerStart, Math.min(currentFrame, Math.max(layerStart, layerEnd - 1)))
    const inferredMotionStart = Math.max(layerStart, inferredTarget - inferredDuration)
    const from = interpolateProps(inferredMotionStart, layer.keyframes)
    const to = interpolateProps(inferredTarget, layer.keyframes)
    const inferredLift = inferLiftAmount(from, to)
    const base = surfaceBaseFromLift(to, inferredLift)
    const nextBuilder = makeBuilderState(base)
    if (inferredLift) nextBuilder.lift = { enabled: true, to: inferredLift }
    setStartFrame(inferredStart)
    setDuration(inferredDuration)
    setBreathingStartFrame(inferredStart)
    setBreathingEndFrame(Math.max(inferredStart + 1, layerEnd))
    if (layer.type === 'text') setActiveCategory('text')
    builderBaseRef.current = { [layer.id]: base }
    setBuilder(nextBuilder)
  }, [layer?.id, layer?.startFrame, layer?.endFrame, layer?.type, layer?.text, currentFrame, fps, totalFrames])

  if (!layer) return null

  const presetTargets = [layer]

  function applyPreset(key: string) {
    if (!layer) return
    const preset = PRESETS[key]
    const start = Math.max(0, Math.round(startFrame))
    const dur = Math.max(1, Math.round(duration))
    const targets = preset.textOnly ? presetTargets.filter((item) => item.type === 'text') : presetTargets
    targets.forEach((target) => {
      const base = interpolateProps(start, target.keyframes)
      const keyframes = preset.generate(start, dur, easing, base, target)
      if (preset.textRevealMode) updateLayerProp(target.id, 'textRevealMode', preset.textRevealMode)
      keyframes.forEach((kf) => addKeyframe(target.id, kf.frame, kf.props, kf.easing))
    })
  }

  function updateBuilder(key: MotionBuilderKey, patch: Partial<MotionBuilderState[MotionBuilderKey]>) {
    const next = { ...builder, [key]: { ...builder[key], ...patch } }
    setBuilder(next)
    applyBuilderMotion(next)
  }

  /**
   * Batched update for multiple builder axes at once.
   * Avoids React state-update collisions when the gizmo updates
   * rotateX and rotateY together during the same mouse event.
   */
  function updateBuilderBatch(updates: Partial<{ rotateX: number; rotateY: number; rotateZ: number; scale: number; opacity: number; perspective: number; skewX: number; skewY: number; lift: number }>) {
    const next = { ...builder }
    ;(Object.entries(updates) as Array<[MotionBuilderKey, number]>).forEach(([key, value]) => {
      if (typeof value === 'number' && Number.isFinite(value)) {
        next[key] = { enabled: true, to: value }
      }
    })
    setBuilder(next)
    applyBuilderMotion(next)
  }

  function applyBuilderMotion(nextBuilder = builder) {
    if (!layer) return
    const enabled = BUILDER_FIELDS.filter(({ key }) => nextBuilder[key].enabled)
    if (!enabled.length) return
    const dur = Math.max(1, Math.round(duration))
    const layerStart = layer.startFrame ?? 0
    const layerEnd = layer.endFrame ?? totalFrames
    const targetFrame = Math.max(layerStart, Math.min(Math.round(currentFrame), Math.max(layerStart, layerEnd - 1)))
    const start = Math.max(layerStart, targetFrame - dur)
    const fromUpdates: Array<{ layerId: string; props: TransformProps }> = []
    const toUpdates: Array<{ layerId: string; props: TransformProps }> = []

    presetTargets.forEach((target) => {
      const base = interpolateProps(start, target.keyframes)
      const fromProps: TransformProps = { ...base }
      const targetBase = builderBaseRef.current[target.id] ?? interpolateProps(targetFrame, target.keyframes)
      const toProps: TransformProps = { ...targetBase }
      enabled.forEach(({ key }) => {
        if (key === 'lift') {
          const lift = Math.max(0, nextBuilder.lift.to)
          toProps.y = targetBase.y - lift
          if (!nextBuilder.scale.enabled) toProps.scale = targetBase.scale * (1 + lift / 900)
          if (!nextBuilder.perspective.enabled) toProps.perspective = Math.max(targetBase.perspective, 900)
          toProps.shadowY = targetBase.shadowY + lift * 0.35
          toProps.shadowBlur = targetBase.shadowBlur + lift * 0.55
          toProps.shadowSpread = targetBase.shadowSpread + lift * 0.02
          updateLayerProp(target.id, 'shadowEnabled', true)
          return
        }
        toProps[key] = nextBuilder[key].to
      })
      fromUpdates.push({ layerId: target.id, props: fromProps })
      toUpdates.push({ layerId: target.id, props: toProps })
    })

    addKeyframes(fromUpdates, start, easing)
    addKeyframes(toUpdates, targetFrame, 'linear')
  }

  function applyBreathing() {
    if (!layer) return
    const layerStart = layer.startFrame ?? 0
    const layerEnd = layer.endFrame ?? totalFrames
    const start = Math.max(layerStart, Math.min(Math.round(breathingStartFrame), Math.max(layerStart, layerEnd - 1)))
    const end = Math.min(layerEnd, Math.max(start + 1, Math.round(breathingEndFrame)))
    const intervalFrames = Math.max(Math.round(fps * 0.35), Math.round(breathingInterval * fps))
    beginInteraction(true)
    try {
      presetTargets.forEach((target) => {
        const base = interpolateProps(start, target.keyframes)
        const keyframes = generateBreathingKeyframes(start, end, intervalFrames, base, breathingIntensity, breathingStyle)
        updateLayerProp(target.id, 'shadowEnabled', true)
        addKeyframeSequence(target.id, keyframes)
      })
    } finally {
      endInteraction()
    }
  }

  const categories = (layer.type === 'text' ? ['text', 'in', 'out', 'attention'] : ['in', 'out', 'attention']) as PresetCategory[]
  const safeActiveCategory = categories.includes(activeCategory) ? activeCategory : categories[0]
  const durationValue = timeUnit === 'seconds' ? Number((duration / fps).toFixed(2)) : duration
  const startValue = timeUnit === 'seconds' ? Number((startFrame / fps).toFixed(2)) : startFrame
  const unitLabel = timeUnit === 'seconds' ? 's' : 'fr'
  const breathingStartValue = breathingTimeUnit === 'seconds' ? Number((breathingStartFrame / fps).toFixed(2)) : breathingStartFrame
  const breathingEndValue = breathingTimeUnit === 'seconds' ? Number((breathingEndFrame / fps).toFixed(2)) : breathingEndFrame
  const breathingUnitLabel = breathingTimeUnit === 'seconds' ? 's' : 'fr'
  const maxStartFrame = Math.max(0, (layer.endFrame ?? totalFrames) - 1)
  const maxEndFrame = Math.max(1, layer.endFrame ?? totalFrames)

  const setDurationFromInput = (value: number) => {
    if (!Number.isFinite(value)) return
    const nextFrames = timeUnit === 'seconds' ? Math.round(value * fps) : Math.round(value)
    setDuration(Math.max(1, nextFrames))
  }

  const setStartFromInput = (value: number) => {
    if (!Number.isFinite(value)) return
    const nextFrame = timeUnit === 'seconds' ? Math.round(value * fps) : Math.round(value)
    setStartFrame(Math.max(0, Math.min(maxStartFrame, nextFrame)))
  }

  const setBreathingStartFromInput = (value: number) => {
    if (!Number.isFinite(value)) return
    const nextFrame = breathingTimeUnit === 'seconds' ? Math.round(value * fps) : Math.round(value)
    const clamped = Math.max(0, Math.min(maxStartFrame, nextFrame))
    setBreathingStartFrame(clamped)
    if (breathingEndFrame <= clamped) setBreathingEndFrame(Math.min(maxEndFrame, clamped + 1))
  }

  const setBreathingEndFromInput = (value: number) => {
    if (!Number.isFinite(value)) return
    const nextFrame = breathingTimeUnit === 'seconds' ? Math.round(value * fps) : Math.round(value)
    setBreathingEndFrame(Math.max(breathingStartFrame + 1, Math.min(maxEndFrame, nextFrame)))
  }

  const syncToPlayhead = () => {
    const layerStart = layer.startFrame ?? 0
    const layerEnd = layer.endFrame ?? totalFrames
    const nextStart = Math.max(layerStart, Math.min(currentFrame, Math.max(layerStart, layerEnd - 1)))
    setStartFrame(nextStart)
    setDuration(Math.max(1, Math.min(duration, layerEnd - nextStart)))
  }

  const builderRotateXYZ = ['rotateX', 'rotateY', 'rotateZ'] as const
  const builderSkewXY = ['skewX', 'skewY'] as const
  const otherBuilderFields = BUILDER_FIELDS.filter((f) => !builderRotateXYZ.includes(f.key as typeof builderRotateXYZ[number]) && !builderSkewXY.includes(f.key as typeof builderSkewXY[number]) && f.key !== 'lift')

  return (
    <div>
      {/* ── PARAMETERS ─────────────────────────────────── */}
      <Section title={t('motion.parameters')}>
        <Row label={t('motion.duration')}>
          <SegGroup
            value={timeUnit}
            options={[
              { value: 'seconds', label: t('motion.seconds') },
              { value: 'frames', label: t('motion.frames') },
            ]}
            onChange={setTimeUnit}
          />
        </Row>
        <Row label={t('motion.duration')}>
          <NumField
            leading="D"
            value={durationValue}
            min={timeUnit === 'seconds' ? 0.01 : 1}
            step={timeUnit === 'seconds' ? 0.1 : 1}
            precision={timeUnit === 'seconds' ? 2 : 0}
            unit={unitLabel}
            sensitivity={timeUnit === 'seconds' ? 0.05 : 0.5}
            onChange={setDurationFromInput}
          />
        </Row>
        <Row label={t('motion.startAt')}>
          <NumField
            leading="S"
            value={startValue}
            min={0}
            step={timeUnit === 'seconds' ? 0.1 : 1}
            precision={timeUnit === 'seconds' ? 2 : 0}
            unit={unitLabel}
            sensitivity={timeUnit === 'seconds' ? 0.05 : 0.5}
            onChange={setStartFromInput}
          />
        </Row>
        <button
          onClick={syncToPlayhead}
          style={{
            width: '100%', height: 26, fontSize: 11,
            background: 'var(--input)', color: 'var(--text2)',
            border: '1px solid var(--input-border)', borderRadius: 3,
            transition: 'background 0.1s',
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--hover)' }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--input)' }}
        >
          {t('motion.usePlayhead', { seconds: (currentFrame / fps).toFixed(2), frames: currentFrame })}
        </button>
        <Row label={t('motion.easing')}>
          <select value={easing} onChange={(e) => setEasing(e.target.value as EasingType)} className="input-base" style={{ flex: 1, height: 26 }}>
            {EASINGS.map((e) => <option key={e} value={e}>{e}</option>)}
          </select>
        </Row>
      </Section>

      {/* ── BREATHING LOOP ─────────────────────────────── */}
      <Section title={t('motion.breathing')} defaultOpen={false}>
        <Row label={t('motion.timeUnit')}>
          <SegGroup
            value={breathingTimeUnit}
            options={[
              { value: 'seconds', label: t('motion.seconds') },
              { value: 'frames', label: t('motion.frames') },
            ]}
            onChange={setBreathingTimeUnit}
          />
        </Row>
        <Row label={t('motion.style')}>
          <select
            className="input-base"
            value={breathingStyle}
            onChange={(e) => setBreathingStyle(e.target.value as BreathingStyle)}
            style={{ flex: 1, height: 26 }}
          >
            <option value="soft">{t('motion.breathingSoft')}</option>
            <option value="float">{t('motion.breathingFloat')}</option>
            <option value="bob">{t('motion.breathingBob')}</option>
            <option value="glow">{t('motion.breathingGlow')}</option>
          </select>
        </Row>
        <Row label={t('motion.start')}>
          <NumField
            leading="S"
            value={breathingStartValue}
            min={0}
            max={breathingTimeUnit === 'seconds' ? maxStartFrame / fps : maxStartFrame}
            step={breathingTimeUnit === 'seconds' ? 0.1 : 1}
            precision={breathingTimeUnit === 'seconds' ? 2 : 0}
            unit={breathingUnitLabel}
            sensitivity={breathingTimeUnit === 'seconds' ? 0.05 : 0.5}
            onChange={setBreathingStartFromInput}
          />
        </Row>
        <Row label={t('motion.end')}>
          <NumField
            leading="E"
            value={breathingEndValue}
            min={breathingTimeUnit === 'seconds' ? (breathingStartFrame + 1) / fps : breathingStartFrame + 1}
            max={breathingTimeUnit === 'seconds' ? maxEndFrame / fps : maxEndFrame}
            step={breathingTimeUnit === 'seconds' ? 0.1 : 1}
            precision={breathingTimeUnit === 'seconds' ? 2 : 0}
            unit={breathingUnitLabel}
            sensitivity={breathingTimeUnit === 'seconds' ? 0.05 : 0.5}
            onChange={setBreathingEndFromInput}
          />
        </Row>
        <Row label={t('motion.interval')}>
          <NumField
            leading="I"
            value={breathingInterval}
            min={0.35}
            step={0.1}
            precision={2}
            unit="s"
            sensitivity={0.03}
            onChange={(v) => setBreathingInterval(Math.max(0.35, v))}
          />
        </Row>
        <Row label={t('motion.intensity')}>
          <NumField
            leading="%"
            value={breathingIntensity}
            min={0}
            max={30}
            step={1}
            precision={0}
            unit="%"
            sensitivity={0.5}
            onChange={(v) => setBreathingIntensity(Math.max(0, Math.min(30, Math.round(v))))}
          />
        </Row>
        <button
          onClick={applyBreathing}
          style={{
            width: '100%', height: 28, fontSize: 11,
            background: 'var(--accent-bg)', color: '#0d99ff',
            border: '1px solid var(--accent)', borderRadius: 3,
            transition: 'background 0.1s',
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--hover)' }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--accent-bg)' }}
        >
          {t('motion.applyBreathing')}
        </button>
      </Section>

      {/* ── CUSTOM 3D ─────────────────────────────────── */}
      <Section title={t('motion.custom3d')} defaultOpen={false}>
        {/* Interactive 3D gizmo */}
        <Rotation3DGizmo
          rotateX={builder.rotateX.to}
          rotateY={builder.rotateY.to}
          rotateZ={builder.rotateZ.to}
          onChange={(update) => updateBuilderBatch(update)}
        />

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '6px 0 2px' }}>
          <ToggleRow
            label={t('motion.lift')}
            checked={builder.lift.enabled}
            onChange={(v) => updateBuilder('lift', { enabled: v })}
          />
          {builder.lift.enabled && (
            <Row label={t('motion.height')}>
              <NumField
                leading="H"
                value={builder.lift.to}
                min={0}
                max={240}
                step={4}
                precision={0}
                unit="px"
                sensitivity={1}
                onChange={(v) => updateBuilder('lift', { enabled: true, to: Math.max(0, Math.round(v)) })}
              />
            </Row>
          )}
        </div>

        {/* Rotation (3 axes) — numeric inputs sync with gizmo */}
        <div style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.04em', marginTop: 6, marginBottom: 2 }}>
          {t('motion.rotation')}
        </div>
        {builderRotateXYZ.map((key) => {
          const item = builder[key]
          const axisColor = key === 'rotateX' ? '#ef4444' : key === 'rotateY' ? '#22c55e' : '#3b82f6'
          const axisLetter = key === 'rotateX' ? 'X' : key === 'rotateY' ? 'Y' : 'Z'
          return (
            <Row key={key} label={axisLetter}>
              <NumField
                leading={<span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: axisColor }} />{axisLetter}</span>}
                value={item.to}
                step={1}
                precision={0}
                unit="°"
                onChange={(v) => updateBuilder(key, { enabled: true, to: v })}
              />
            </Row>
          )
        })}

        {/* Skew (2 axes) */}
        <div style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.04em', marginTop: 8, marginBottom: 2 }}>
          {t('motion.skew')}
        </div>
        {builderSkewXY.map((key) => {
          const item = builder[key]
          const axisLetter = key === 'skewX' ? 'X' : 'Y'
          return (
            <Row key={key} label={axisLetter}>
              <NumField
                leading={axisLetter}
                value={item.to}
                step={1}
                precision={0}
                unit="°"
                onChange={(v) => updateBuilder(key, { enabled: true, to: v })}
              />
            </Row>
          )
        })}

        {/* Other builder fields (scale, opacity, perspective) */}
        {otherBuilderFields.length > 0 && (
          <div style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.04em', marginTop: 8, marginBottom: 2 }}>
            {t('motion.target')}
          </div>
        )}
        {otherBuilderFields.map((field) => {
          const item = builder[field.key]
          return (
            <div key={field.key} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <ToggleRow
                label={t(`motion.${field.labelKey}`)}
                checked={item.enabled}
                onChange={(v) => updateBuilder(field.key, { enabled: v })}
              />
              {item.enabled && (
                <Row label="">
                  <NumField
                    leading={field.key.charAt(0).toUpperCase()}
                    value={Number(displayValue(item.to, field.percent).toFixed(field.precision))}
                    min={field.min}
                    max={field.max}
                    step={field.step}
                    precision={field.precision}
                    unit={field.unit === 'deg' ? '°' : field.unit}
                    onChange={(v) => updateBuilder(field.key, { to: storedValue(v, field.percent) })}
                  />
                </Row>
              )}
            </div>
          )
        })}
      </Section>

      {/* ── PRESETS ──────────────────────────────────────── */}
      <Section title={t('motion.presets')}>
        <SegGroup
          value={safeActiveCategory}
          options={categories.map((cat) => ({
            value: cat,
            label: t(`motion.${cat}`, { defaultValue: CATEGORY_LABELS[cat] }),
          }))}
          onChange={setActiveCategory}
        />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 4, marginTop: 6 }}>
          {Object.entries(PRESETS)
            .filter(([, def]) => def.category === safeActiveCategory && (!def.textOnly || layer.type === 'text'))
            .map(([key, def]) => (
              <button
                key={key}
                onClick={() => applyPreset(key)}
                style={{
                  fontSize: 11, color: 'var(--text)', textAlign: 'left',
                  padding: '6px 8px', borderRadius: 3,
                  background: 'var(--input)',
                  border: '1px solid var(--input-border)',
                  transition: 'background 0.1s, border-color 0.1s',
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background = 'var(--hover)';
                  (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--accent)';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background = 'var(--input)';
                  (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--input-border)';
                }}
              >
                {t(`motion.${key}`, { defaultValue: def.label })}
              </button>
            ))}
        </div>
      </Section>
    </div>
  )
}
