import { T, pop } from '../theme'

export type Cue = { from: number; to: number; text: string; key?: string; color?: string }

/** Short-phrase caption with one highlighted keyword (shorts standard). */
export const Caption = ({ frame, fps, cues, y }: { frame: number; fps: number; cues: Cue[]; y: number }) => {
  const cue = cues.find((c) => frame >= c.from && frame < c.to)
  if (!cue) return null
  const s = pop(frame, cue.from, fps)
  const out = Math.min(1, (cue.to - frame) / 5)
  const [before, after] = cue.key ? cue.text.split(cue.key) : [cue.text, '']
  return (
    <div
      style={{
        position: 'absolute',
        left: 80,
        right: 80,
        top: y,
        textAlign: 'center',
        fontFamily: T.fonts.sans,
        fontWeight: 700,
        fontSize: 54,
        lineHeight: 1.3,
        color: T.text,
        opacity: out,
        transform: `translateY(${(1 - s) * 24}px) scale(${0.94 + 0.06 * s})`,
        textShadow: '0 4px 24px rgba(0,0,0,0.6)',
      }}
    >
      {before}
      {cue.key ? (
        <span style={{ background: cue.color ?? T.amber, color: T.bg0, borderRadius: 12, padding: '0 14px', boxDecorationBreak: 'clone', WebkitBoxDecorationBreak: 'clone' }}>
          {cue.key}
        </span>
      ) : null}
      {after}
    </div>
  )
}
