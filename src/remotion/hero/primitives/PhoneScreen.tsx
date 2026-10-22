import { T } from '../theme'

type Props = {
  frame: number
  /** 0 = skeleton loading, 1 = profile loaded (crossfades in between). */
  loaded: number
  name?: string
  handle?: string
}

const W = 560
const H = 1000

const Skeleton = ({ w, h, frame, r = 10, mt = 0 }: { w: number | string; h: number; frame: number; r?: number; mt?: number }) => {
  const shift = ((frame * 14) % 900) - 300
  return (
    <div
      style={{
        width: w,
        height: h,
        marginTop: mt,
        borderRadius: r,
        background: `linear-gradient(90deg, #E3E8F1 0%, #E3E8F1 ${shift}px, #F1F4F9 ${shift + 120}px, #E3E8F1 ${shift + 240}px)`,
      }}
    />
  )
}

/** A fictional app's profile screen inside a phone frame. Library candidate: `phoneScreen`. */
export const PhoneScreen = ({ frame, loaded, name = 'Ada Okafor', handle = '@ada.builds' }: Props) => {
  const spin = (frame * 12) % 360
  return (
    <div
      style={{
        width: W,
        height: H,
        borderRadius: 72,
        background: '#050A16',
        padding: 16,
        boxShadow: '0 40px 120px rgba(0,0,0,0.55), 0 0 0 2px #22345A',
      }}
    >
      <div style={{ width: '100%', height: '100%', borderRadius: 58, background: T.paper, overflow: 'hidden', position: 'relative', fontFamily: T.fonts.sans }}>
        {/* status bar + app bar */}
        <div style={{ height: 56, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <div style={{ width: 120, height: 30, borderRadius: 20, background: '#050A16' }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 36px 18px', borderBottom: '1px solid #E2E7F0' }}>
          <div style={{ fontWeight: 700, fontSize: 34, color: T.ink, letterSpacing: -0.5 }}>
            <span style={{ display: 'inline-block', width: 22, height: 22, borderRadius: 11, border: `5px solid ${T.blue}`, marginRight: 10, verticalAlign: -2 }} />
            Orbit
          </div>
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: 17,
              border: '5px solid #D5DCE8',
              borderTopColor: T.blue,
              transform: `rotate(${spin}deg)`,
              opacity: 1 - loaded,
            }}
          />
        </div>

        {/* skeleton layer */}
        <div style={{ position: 'absolute', inset: '150px 36px 0', opacity: 1 - loaded }}>
          <div style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
            <Skeleton w={120} h={120} r={60} frame={frame} />
            <div style={{ flex: 1 }}>
              <Skeleton w="80%" h={30} frame={frame} />
              <Skeleton w="50%" h={22} frame={frame} mt={14} />
            </div>
          </div>
          <Skeleton w="100%" h={84} frame={frame} mt={36} r={16} />
          {[0, 1, 2].map((i) => (
            <div key={i} style={{ marginTop: 34 }}>
              <Skeleton w="92%" h={22} frame={frame} />
              <Skeleton w="70%" h={22} frame={frame} mt={12} />
              <Skeleton w="100%" h={120} frame={frame} mt={14} r={16} />
            </div>
          ))}
        </div>

        {/* loaded layer */}
        <div style={{ position: 'absolute', inset: '150px 36px 0', opacity: loaded, transform: `translateY(${(1 - loaded) * 18}px)` }}>
          <div style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
            <div style={{ width: 120, height: 120, borderRadius: 60, background: `linear-gradient(135deg, ${T.blue}, ${T.teal})`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 700, fontSize: 44 }}>
              AO
            </div>
            <div>
              <div style={{ fontSize: 36, fontWeight: 700, color: T.ink }}>{name}</div>
              <div style={{ fontSize: 24, color: '#5B6B88', marginTop: 4 }}>{handle}</div>
            </div>
          </div>
          <div style={{ display: 'flex', marginTop: 36, background: 'white', borderRadius: 16, padding: '18px 0', boxShadow: '0 2px 0 #E2E7F0' }}>
            {[
              ['128', 'Posts'],
              ['4.2k', 'Followers'],
              ['311', 'Following'],
            ].map(([n, l]) => (
              <div key={l} style={{ flex: 1, textAlign: 'center' }}>
                <div style={{ fontSize: 30, fontWeight: 700, color: T.ink }}>{n}</div>
                <div style={{ fontSize: 20, color: '#5B6B88' }}>{l}</div>
              </div>
            ))}
          </div>
          {[
            ['Shipped dark mode today', 'Took three tries and one long night.'],
            ['Notes on rate limiting', 'Token buckets are simpler than they look.'],
            ['Weekend build log', 'A tiny CLI for my grocery list.'],
          ].map(([t, s], i) => (
            <div key={i} style={{ marginTop: 30 }}>
              <div style={{ fontSize: 26, fontWeight: 600, color: T.ink }}>{t}</div>
              <div style={{ fontSize: 22, color: '#5B6B88', marginTop: 6 }}>{s}</div>
              <div style={{ height: 120, marginTop: 14, borderRadius: 16, background: ['#DCE8FF', '#D7F5EE', '#FFEFD6'][i] }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

PhoneScreen.size = { w: W, h: H }
