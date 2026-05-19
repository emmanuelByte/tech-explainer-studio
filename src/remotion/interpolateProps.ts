import { Keyframe, TransformProps, DEFAULT_TRANSFORM, EasingType } from '../types'

// Standard easing functions
const easings: Record<EasingType, (t: number) => number> = {
  linear: (t) => t,
  ease: (t) => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2,
  'ease-in': (t) => t * t * t,
  'ease-out': (t) => 1 - Math.pow(1 - t, 3),
  'ease-in-out': (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
  spring: (t) => {
    const c4 = (2 * Math.PI) / 3
    return t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1
  },
  bounce: (t) => {
    const n = 7.5625, d = 2.75
    if (t < 1 / d) return n * t * t
    if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75
    if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375
    return n * (t -= 2.625 / d) * t + 0.984375
  },
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

export function interpolateProps(frame: number, keyframes: Keyframe[]): TransformProps {
  if (keyframes.length === 0) return { ...DEFAULT_TRANSFORM }

  const sorted = [...keyframes].sort((a, b) => a.frame - b.frame)

  if (frame <= sorted[0].frame) return { ...sorted[0].props }
  if (frame >= sorted[sorted.length - 1].frame) return { ...sorted[sorted.length - 1].props }

  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i], b = sorted[i + 1]
    if (frame >= a.frame && frame <= b.frame) {
      const raw = (frame - a.frame) / (b.frame - a.frame)
      const eased = easings[a.easing](Math.max(0, Math.min(1, raw)))
      const result = {} as TransformProps
      for (const key of Object.keys(DEFAULT_TRANSFORM) as Array<keyof TransformProps>) {
        result[key] = lerp(a.props[key] as number, b.props[key] as number, eased) as never
      }
      return result
    }
  }

  return { ...sorted[sorted.length - 1].props }
}

export function buildTransform(p: TransformProps): string {
  return [
    `translate(${p.x}px,${p.y}px)`,
    `scale(${p.scale})`,
    `rotateX(${p.rotateX}deg)`,
    `rotateY(${p.rotateY}deg)`,
    `rotateZ(${p.rotateZ}deg)`,
    `skewX(${p.skewX}deg)`,
    `skewY(${p.skewY}deg)`,
  ].join(' ')
}

export function buildFilter(p: TransformProps): string {
  const parts: string[] = []
  if (p.blur > 0) parts.push(`blur(${p.blur}px)`)
  if (p.brightness !== 100) parts.push(`brightness(${p.brightness}%)`)
  if (p.contrast !== 100) parts.push(`contrast(${p.contrast}%)`)
  if (p.grayscale > 0) parts.push(`grayscale(${p.grayscale}%)`)
  return parts.length ? parts.join(' ') : 'none'
}

export function buildBoxShadow(p: TransformProps, color: string, enabled: boolean): string {
  if (!enabled) return 'none'
  return `${p.shadowX}px ${p.shadowY}px ${p.shadowBlur}px ${p.shadowSpread}px ${color}`
}
