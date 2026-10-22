import { T, lerp } from '../theme'

type Props = { frame: number; start: number; end?: number; x: number; y: number; text: string; color?: string; size?: number; rotate?: number }

/** Handwritten annotation that writes itself left to right, with a drawn underline. */
export const Handwriting = ({ frame, start, end = Infinity, x, y, text, color = T.amber, size = 58, rotate = -3 }: Props) => {
  if (frame < start || frame > end) return null
  const write = lerp(frame, [start, start + 22], [0, 100])
  const line = lerp(frame, [start + 16, start + 30], [0, 1])
  const fade = end === Infinity ? 1 : lerp(frame, [end - 8, end], [1, 0])
  return (
    <div style={{ position: 'absolute', left: x, top: y, transform: `translate(-50%, -50%) rotate(${rotate}deg)`, opacity: fade, textAlign: 'center' }}>
      <div style={{ fontFamily: T.fonts.hand, fontWeight: 700, fontSize: size, color, whiteSpace: 'nowrap', clipPath: `inset(-20% ${100 - write}% -20% 0)` }}>{text}</div>
      <svg width="100%" height="24" viewBox="0 0 400 24" preserveAspectRatio="none" style={{ display: 'block' }}>
        <path d="M6 14 C 90 4, 200 22, 394 8" fill="none" stroke={color} strokeWidth={5} strokeLinecap="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - line} />
      </svg>
    </div>
  )
}
