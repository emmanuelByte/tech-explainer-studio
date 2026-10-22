import { T, easeInOut, lerp, type Pt } from '../theme'

type ChipProps = { x: number; y: number; text: string; color: string; scale?: number; opacity?: number; solid?: boolean }

/** A message or status pill. Library candidate: `chip` / `badge`. */
export const Chip = ({ x, y, text, color, scale = 1, opacity = 1, solid }: ChipProps) => (
  <div
    style={{
      position: 'absolute',
      left: x,
      top: y,
      transform: `translate(-50%, -50%) scale(${scale})`,
      opacity,
      padding: '8px 16px',
      borderRadius: 999,
      whiteSpace: 'nowrap',
      fontFamily: T.fonts.mono,
      fontSize: 24,
      fontWeight: 600,
      color: solid ? T.bg0 : color,
      background: solid ? color : `${color}26`,
      border: `2px solid ${color}`,
      boxShadow: `0 0 22px ${color}55`,
    }}
  >
    {text}
  </div>
)

type TravelProps = { frame: number; from: Pt; to: Pt; start: number; dur: number; text: string; color: string; scale?: number }

/** A chip that travels along a connector. Library candidate: action `send(from, to, payload)`. */
export const TravelingChip = ({ frame, from, to, start, dur, text, color, scale = 1 }: TravelProps) => {
  if (frame < start || frame > start + dur) return null
  const t = lerp(frame, [start, start + dur], [0, 1], easeInOut)
  const fade = Math.min(1, (frame - start) / 4, (start + dur - frame) / 4)
  return <Chip x={from.x + (to.x - from.x) * t} y={from.y + (to.y - from.y) * t} text={text} color={color} scale={scale} opacity={fade} />
}
