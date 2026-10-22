import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion'
import { T, lerp, mix, pop, type Pt } from './theme'
import { B } from './config'
import { Background } from './primitives/Background'
import { PhoneScreen } from './primitives/PhoneScreen'
import { CacheBlock, Cylinder, ServerNode } from './primitives/Nodes'
import { Meter } from './primitives/Meter'
import { Chip, TravelingChip } from './primitives/Chip'
import { Connector } from './primitives/Connector'
import { Caption, type Cue } from './primitives/Caption'
import { Handwriting } from './primitives/Handwriting'

/**
 * Hero shot: "How caching works", 9:16, 30 s at 30 fps.
 * Fictional app (Orbit) and illustrative numbers. Narration is carried by the
 * captions here; the cue frames are where the spoken words should land.
 */

const CUES: Cue[] = [
  { from: 0, to: 100, text: 'Your profile page takes 900 ms to load.', key: '900 ms' },
  { from: 100, to: 180, text: 'Almost all of it is one database query…', key: 'one database query' },
  { from: 180, to: 250, text: 'asked 40,000 times a minute.', key: '40,000 times', color: T.red },
  { from: 250, to: 330, text: 'Same question. Same answer. Every time.', key: 'Same answer.' },
  { from: 330, to: 400, text: 'So keep the answer in memory.', key: 'in memory', color: T.teal },
  { from: 400, to: 475, text: 'First request: a cache miss. Read the database…', key: 'cache miss', color: T.red },
  { from: 475, to: 560, text: '…then save a copy in the cache.', key: 'save a copy', color: T.teal },
  { from: 560, to: 650, text: 'Every request after that is a cache hit.', key: 'cache hit', color: T.teal },
  { from: 650, to: 760, text: 'Page load: 900 ms → 40 ms.', key: '40 ms', color: T.teal },
  { from: 760, to: 900, text: 'But what happens when Ada changes her name?', key: 'changes her name' },
]

// ── Layout (portrait-first) ────────────────────────────────────
const P = {
  app: { x: 540, y: 960 },
  cache: { x: 270, y: 1300 },
  db: { x: 810, y: 1300 },
}
const appToDb: [Pt, Pt] = [{ x: 610, y: 1022 }, { x: 790, y: 1188 }]
const appToCache: [Pt, Pt] = [{ x: 470, y: 1022 }, { x: 300, y: 1200 }]
const phoneToApp: [Pt, Pt] = [{ x: 540, y: 785 }, { x: 540, y: 898 }]
const mid = ([a, b]: [Pt, Pt], dx = 0, dy = 0) => ({ x: (a.x + b.x) / 2 + dx, y: (a.y + b.y) / 2 + dy })

/** Deterministic stream of chips along one path. */
const stream = (frame: number, path: [Pt, Pt], from: number, to: number, every: number, dur: number, text: string, color: string) => {
  const out = []
  for (let s = from; s <= to; s += every) {
    out.push(<TravelingChip key={`${text}-${s}`} frame={frame} from={path[0]} to={path[1]} start={s} dur={dur} text={text} color={color} scale={0.8} />)
  }
  return out
}

/** Did a stream chip arrive in the last `window` frames? Used for hit flashes. */
const arrivedRecently = (frame: number, from: number, to: number, every: number, dur: number, window = 6) => {
  for (let s = from; s <= to; s += every) {
    const a = s + dur
    if (frame >= a && frame < a + window) return 1 - (frame - a) / window
  }
  return 0
}

export const CachingHero = () => {
  const f = useCurrentFrame()
  const { fps } = useVideoConfig()

  // Camera: phone shrinks to the top once the system is introduced.
  const phoneScale = lerp(f, [B.zoomOut, B.zoomOut + 35], [1, 0.62])
  const phoneY = lerp(f, [B.zoomOut, B.zoomOut + 35], [860, 470])
  const loaded = lerp(f, [B.hits + 40, B.hits + 65], [0, 1])

  // The one memorable element: page-load time.
  const latency =
    f < B.hits + 40 ? lerp(f, [5, 70], [0, 900]) : lerp(f, [B.hits + 40, B.hits + 110], [900, 40])
  const latencyColor = f < B.hits + 40 ? T.amber : mix(T.amber, T.teal, lerp(f, [B.hits + 40, B.hits + 110], [0, 1]))
  const readoutX = lerp(f, [B.zoomOut, B.zoomOut + 35], [540, 878])
  const readoutY = lerp(f, [B.zoomOut, B.zoomOut + 35], [1450, 470])
  const readoutSize = lerp(f, [B.zoomOut, B.zoomOut + 35], [150, 92])
  const payoffPulse = f >= B.payoff ? 1 + 0.08 * Math.max(0, 1 - (f - B.payoff) / 12) : 1

  // System state.
  const dbLoad = lerp(f, [B.pressure, B.pressure + 80, B.hits + 30, B.hits + 140], [6, 92, 92, 14])
  const readsPerMin = Math.round(lerp(f, [B.pressure, B.pressure + 80, B.hits + 30, B.hits + 140], [0, 40000, 40000, 2400]) / 100) * 100
  const hitRate = lerp(f, [B.hits + 10, B.hits + 140], [0, 94])

  const appIn = pop(f, B.zoomOut + 20, fps)
  const dbIn = pop(f, B.zoomOut + 45, fps)
  const cacheIn = pop(f, B.cache + 8, fps)
  const stored = pop(f, B.firstReq + 148, fps)

  const hitFlash = arrivedRecently(f, B.hits + 5, B.end - 30, 7, 16)
  const missBadge = f >= B.firstReq + 30 && f < B.firstReq + 120 ? pop(f, B.firstReq + 30, fps) : 0

  const dbGlow = dbLoad > 70 ? T.red : undefined
  const walkthrough = f >= B.firstReq && f < B.hits

  return (
    <AbsoluteFill style={{ fontFamily: T.fonts.sans }}>
      <Background />

      {/* brand mark */}
      <div style={{ position: 'absolute', top: 56, left: 0, right: 0, textAlign: 'center', color: T.muted, fontSize: 26, letterSpacing: 1, opacity: 0.8 }}>
        emmanuelbyte · how caching works
      </div>

      {/* connectors */}
      <svg width={1080} height={1920} style={{ position: 'absolute', inset: 0 }}>
        <Connector from={phoneToApp[0]} to={phoneToApp[1]} draw={lerp(f, [B.zoomOut + 30, B.zoomOut + 50], [0, 1])} />
        <Connector
          from={appToDb[0]}
          to={appToDb[1]}
          draw={lerp(f, [B.zoomOut + 50, B.zoomOut + 70], [0, 1])}
          color={dbLoad > 70 ? mix(T.line, T.red, 0.6) : T.line}
          active={dbLoad > 70 && !walkthrough ? 1 : 0}
        />
        <Connector from={appToCache[0]} to={appToCache[1]} draw={lerp(f, [B.cache + 20, B.cache + 40], [0, 1])} color={f > B.hits ? mix(T.line, T.teal, 0.6) : T.line} active={f > B.hits ? 1 : 0} />
      </svg>

      {/* nodes */}
      <ServerNode x={P.app.x} y={P.app.y} label="App server" scale={appIn} opacity={appIn} />
      <Cylinder x={P.db.x} y={P.db.y} label="Database" color={T.blue} scale={dbIn} opacity={dbIn} glow={dbGlow} />
      <CacheBlock x={P.cache.x} y={P.cache.y} scale={cacheIn} opacity={cacheIn} stored={stored} glow={hitFlash > 0 ? T.teal : undefined} />

      {/* meters */}
      <Meter x={P.db.x} y={1460} label="DB load" value={dbLoad} sub={`${readsPerMin.toLocaleString('en-US')} reads/min`} opacity={lerp(f, [B.pressure, B.pressure + 15], [0, 1])} />
      <Meter x={P.cache.x} y={1460} label="Hit rate" value={hitRate} tone="good" opacity={lerp(f, [B.hits, B.hits + 15], [0, 1])} />

      {/* edge latency badges */}
      {f >= B.pressure + 40 && f < B.hits + 60 ? (
        <Chip {...mid(appToDb, 135, -55)} text="~800 ms" color={T.red} solid opacity={lerp(f, [B.pressure + 40, B.pressure + 50], [0, 1]) * lerp(f, [B.hits + 50, B.hits + 60], [1, 0])} scale={0.9} />
      ) : null}
      {f >= B.hits + 30 ? <Chip {...mid(appToCache, -80, -40)} text="0.4 ms" color={T.teal} solid scale={0.9 * pop(f, B.hits + 30, fps)} /> : null}

      {/* traffic: before the cache, the same query floods the database */}
      {stream(f, phoneToApp, B.zoomOut + 50, B.zoomOut + 50, 1, 22, 'GET /profile/42', T.blue)}
      {stream(f, appToDb, B.pressure, B.firstReq - 8, 9, 22, 'SELECT … id=42', T.blue)}

      {/* first request, slowly and one hop at a time */}
      <TravelingChip frame={f} from={appToCache[0]} to={appToCache[1]} start={B.firstReq} dur={30} text="GET profile:42" color={T.blue} />
      <TravelingChip frame={f} from={appToCache[1]} to={appToCache[0]} start={B.firstReq + 34} dur={22} text="nil" color={T.red} />
      <TravelingChip frame={f} from={appToDb[0]} to={appToDb[1]} start={B.firstReq + 60} dur={30} text="SELECT … id=42" color={T.blue} />
      <TravelingChip frame={f} from={appToDb[1]} to={appToDb[0]} start={B.firstReq + 94} dur={26} text="row: Ada" color={T.text} />
      <TravelingChip frame={f} from={appToCache[0]} to={appToCache[1]} start={B.firstReq + 120} dur={28} text="SET profile:42" color={T.teal} />
      {missBadge > 0 ? <Chip x={P.cache.x - 105} y={P.cache.y - 118} text="MISS" color={T.red} solid scale={missBadge} /> : null}

      {/* after: hits from memory, rare misses to the database */}
      {stream(f, appToCache, B.hits + 5, B.end - 30, 7, 16, 'GET 42', T.teal)}
      {stream(f, appToDb, B.hits + 70, B.end - 30, 70, 22, 'SELECT', T.blue)}
      {hitFlash > 0 ? <Chip x={P.cache.x - 105} y={P.cache.y - 118} text="HIT" color={T.teal} solid scale={0.9 + 0.15 * hitFlash} /> : null}

      {/* phone + the memorable number */}
      <div style={{ position: 'absolute', left: 540, top: phoneY, transform: `translate(-50%, -50%) scale(${phoneScale})` }}>
        <PhoneScreen frame={f} loaded={loaded} />
      </div>
      <div style={{ position: 'absolute', left: readoutX, top: readoutY, transform: `translate(-50%, -50%) scale(${payoffPulse})`, textAlign: 'center' }}>
        <div style={{ fontSize: readoutSize, fontWeight: 700, color: latencyColor, fontVariantNumeric: 'tabular-nums', lineHeight: 1, textShadow: `0 0 40px ${latencyColor}` }}>
          {Math.round(latency)}
          <span style={{ fontSize: readoutSize * 0.42, marginLeft: 8 }}>ms</span>
        </div>
        <div style={{ color: T.muted, fontSize: readoutSize * 0.24, marginTop: 10 }}>page load</div>
        <div style={{ color: T.muted, fontSize: readoutSize * 0.26, marginTop: 6, textDecoration: 'line-through', opacity: lerp(f, [B.payoff, B.payoff + 15], [0, 0.8]) }}>was 900 ms</div>
      </div>

      {/* handwritten accents */}
      <Handwriting frame={f} start={B.same + 8} end={B.cache} x={540} y={1598} text="same question, same answer" color={T.amber} size={50} />
      <Handwriting frame={f} start={B.tease + 15} x={540} y={1598} text="…until the answer changes" color={T.amber} size={50} rotate={-2} />

      <Caption frame={f} fps={fps} cues={CUES} y={1690} />
    </AbsoluteFill>
  )
}

