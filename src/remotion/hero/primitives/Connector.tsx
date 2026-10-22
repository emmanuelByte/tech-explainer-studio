import { T, type Pt } from '../theme'

type Props = { from: Pt; to: Pt; draw: number; color?: string; active?: number }

/** A straight connector that draws itself in. Lives inside one shared <svg>. */
export const Connector = ({ from, to, draw, color = T.line, active = 0 }: Props) => {
  const len = Math.hypot(to.x - from.x, to.y - from.y)
  return (
    <g>
      <line
        x1={from.x}
        y1={from.y}
        x2={to.x}
        y2={to.y}
        stroke={color}
        strokeWidth={4}
        strokeLinecap="round"
        strokeDasharray={len}
        strokeDashoffset={len * (1 - draw)}
      />
      {active > 0 ? (
        <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke={color} strokeWidth={14} strokeLinecap="round" opacity={0.18 * active} />
      ) : null}
    </g>
  )
}
