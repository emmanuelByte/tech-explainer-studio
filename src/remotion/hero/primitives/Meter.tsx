import { T, mix } from '../theme'

type Props = { x: number; y: number; label: string; value: number; sub?: string; opacity?: number; tone?: 'load' | 'good' }

/** Labelled bar with a live percentage. Library candidate: `meter`. */
export const Meter = ({ x, y, label, value, sub, opacity = 1, tone = 'load' }: Props) => {
  const color =
    tone === 'good' ? T.teal : value > 75 ? T.red : value > 45 ? mix(T.amber, T.red, (value - 45) / 30) : mix(T.teal, T.amber, value / 45)
  const w = 270
  return (
    <div style={{ position: 'absolute', left: x - w / 2, top: y, width: w, opacity, fontFamily: T.fonts.sans }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', color: T.muted, fontSize: 24, marginBottom: 8 }}>
        <span>{label}</span>
        <span style={{ color, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{Math.round(value)}%</span>
      </div>
      <div style={{ height: 16, borderRadius: 8, background: '#1A2B4F', overflow: 'hidden' }}>
        <div style={{ width: `${value}%`, height: '100%', borderRadius: 8, background: color, boxShadow: `0 0 18px ${color}` }} />
      </div>
      {sub ? <div style={{ color: T.muted, fontSize: 22, marginTop: 8, fontVariantNumeric: 'tabular-nums' }}>{sub}</div> : null}
    </div>
  )
}
