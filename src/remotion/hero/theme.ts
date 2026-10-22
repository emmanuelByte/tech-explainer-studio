import { Easing, interpolate, spring } from 'remotion'

/** Design tokens for the hero shot. Colour roles follow the visual benchmark. */
export const T = {
  bg0: '#060D1F',
  bg1: '#12244A',
  line: '#2A3F6B',
  panel: '#0E1C3A',
  text: '#EAF0FA',
  muted: '#8EA0C2',
  blue: '#4C8DFF',
  teal: '#2FD5B5',
  amber: '#FFB547',
  red: '#FF5A6A',
  paper: '#F5F7FB',
  ink: '#0F1B33',
  fonts: {
    sans: '"IBM Plex Sans", system-ui, sans-serif',
    hand: 'Kalam, "Comic Neue", cursive',
    mono: '"JetBrains Mono", ui-monospace, monospace',
  },
} as const

export const ease = Easing.bezier(0.22, 1, 0.36, 1)
export const easeInOut = Easing.bezier(0.65, 0, 0.35, 1)

/** Clamped interpolate: the workhorse for every state change in the shot. */
export const lerp = (f: number, input: number[], output: number[], easing = ease) =>
  interpolate(f, input, output, { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing })

/** Springy 0→1 entrance with a little overshoot. */
export const pop = (f: number, start: number, fps: number) =>
  f < start ? 0 : spring({ frame: f - start, fps, config: { damping: 13, stiffness: 170, mass: 0.8 } })

/** Mix two hex colours. */
export const mix = (a: string, b: string, t: number) => {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
  const [x, y] = [p(a), p(b)]
  const c = x.map((v, i) => Math.round(v + (y[i] - v) * Math.min(1, Math.max(0, t))))
  return `rgb(${c.join(',')})`
}

export type Pt = { x: number; y: number }
