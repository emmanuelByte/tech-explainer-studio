import { T } from '../theme'

type Base = { x: number; y: number; scale?: number; opacity?: number; glow?: string }

const place = ({ x, y, scale = 1, opacity = 1 }: Base, w: number, h: number): React.CSSProperties => ({
  position: 'absolute',
  left: x - w / 2,
  top: y - h / 2,
  width: w,
  height: h,
  transform: `scale(${scale})`,
  opacity,
})

/** Application server panel. Library candidate: `server`. */
export const ServerNode = (p: Base & { label: string }) => (
  <div
    style={{
      ...place(p, 340, 116),
      borderRadius: 22,
      background: T.panel,
      border: `2px solid ${p.glow ?? '#35507F'}`,
      boxShadow: p.glow ? `0 0 40px ${p.glow}55` : 'none',
      display: 'flex',
      alignItems: 'center',
      gap: 22,
      padding: '0 28px',
      fontFamily: T.fonts.sans,
    }}
  >
    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
      {[0, 1, 2].map((i) => (
        <div key={i} style={{ width: 54, height: 14, borderRadius: 4, border: `2px solid ${T.blue}`, position: 'relative' }}>
          <div style={{ position: 'absolute', right: 5, top: 3, width: 4, height: 4, borderRadius: 2, background: T.teal }} />
        </div>
      ))}
    </div>
    <div style={{ color: T.text, fontSize: 34, fontWeight: 600, whiteSpace: 'nowrap' }}>{p.label}</div>
  </div>
)

/** Database cylinder. Library candidate: `database` with states. */
export const Cylinder = (p: Base & { label: string; color: string }) => {
  const w = 200
  const h = 176
  const ry = 26
  return (
    <div style={{ ...place(p, w, h + 56), fontFamily: T.fonts.sans }}>
      <svg width={w} height={h} style={{ overflow: 'visible', filter: p.glow ? `drop-shadow(0 0 26px ${p.glow})` : undefined }}>
        <path d={`M2 ${ry} V${h - ry} A${w / 2 - 2} ${ry} 0 0 0 ${w - 2} ${h - ry} V${ry}`} fill={p.color} />
        {[0.38, 0.66].map((t) => (
          <path key={t} d={`M2 ${h * t} A${w / 2 - 2} ${ry} 0 0 0 ${w - 2} ${h * t}`} fill="none" stroke="rgba(255,255,255,0.28)" strokeWidth={3} />
        ))}
        <ellipse cx={w / 2} cy={ry} rx={w / 2 - 2} ry={ry} fill="#8DB6FF" />
      </svg>
      <div style={{ textAlign: 'center', color: T.text, fontSize: 32, fontWeight: 600, marginTop: 10 }}>{p.label}</div>
    </div>
  )
}

/** In-memory cache, drawn as a memory module. Library candidate: `cache`. */
export const CacheBlock = (p: Base & { stored?: number }) => {
  const w = 270
  const h = 150
  return (
    <div style={{ ...place(p, w, h + 56), fontFamily: T.fonts.sans }}>
      <div
        style={{
          width: w,
          height: h,
          borderRadius: 20,
          background: '#0C2B33',
          border: `3px solid ${T.teal}`,
          boxShadow: p.glow ? `0 0 44px ${p.glow}66` : 'none',
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} style={{ position: 'absolute', bottom: -14, left: 26 + i * 33, width: 14, height: 12, background: T.teal, borderRadius: 2 }} />
        ))}
        <div style={{ color: T.teal, fontSize: 22, fontFamily: T.fonts.mono, opacity: 0.85 }}>in memory</div>
        <div
          style={{
            marginTop: 10,
            padding: '6px 14px',
            borderRadius: 10,
            background: 'rgba(47,213,181,0.16)',
            color: '#BFF5EA',
            fontFamily: T.fonts.mono,
            fontSize: 24,
            opacity: p.stored ?? 0,
            transform: `scale(${0.7 + 0.3 * (p.stored ?? 0)})`,
          }}
        >
          profile:42 ✓
        </div>
      </div>
      <div style={{ textAlign: 'center', color: T.text, fontSize: 32, fontWeight: 600, marginTop: 22 }}>Cache</div>
    </div>
  )
}
