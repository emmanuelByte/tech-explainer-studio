import {
  AnimatableProperty,
  DEFAULT_TRANSFORM,
  EasingType,
  Layer,
  PairEasingType,
  PropertyKeyframe,
  TransformProps,
} from './types'
import { interpolateProps } from './remotion/interpolateProps'

export const ANIMATION_GROUPS: {
  id: 'transform' | 'style' | 'effects'
  label: string
  color: string
  keys: AnimatableProperty[]
}[] = [
  {
    id: 'transform',
    label: 'Transform',
    color: '#6366f1',
    keys: ['x', 'y', 'z', 'width', 'height', 'scale', 'scaleX', 'scaleY', 'rotateX', 'rotateY', 'rotateZ', 'skewX', 'skewY', 'perspective', 'originX', 'originY'],
  },
  {
    id: 'style',
    label: 'Style',
    color: '#22c55e',
    keys: [
      'opacity', 'fillColor', 'textColor', 'strokeColor', 'strokeWidth', 'borderRadius',
      'strokeTopWidth', 'strokeRightWidth', 'strokeBottomWidth', 'strokeLeftWidth',
      'borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomRightRadius', 'borderBottomLeftRadius',
      'fontSize', 'letterSpacing', 'lineHeight',
    ],
  },
  {
    id: 'effects',
    label: 'Effects',
    color: '#06b6d4',
    keys: ['blur', 'brightness', 'contrast', 'grayscale', 'shadowX', 'shadowY', 'shadowBlur', 'shadowSpread', 'backdropBlur'],
  },
]

export const PROPERTY_LABELS: Record<AnimatableProperty, string> = {
  x: 'X',
  y: 'Y',
  z: 'Z',
  width: 'Width',
  height: 'Height',
  scale: 'Scale',
  scaleX: 'Scale X',
  scaleY: 'Scale Y',
  rotateX: 'Rotate X',
  rotateY: 'Rotate Y',
  rotateZ: 'Rotate Z',
  skewX: 'Skew X',
  skewY: 'Skew Y',
  perspective: 'Perspective',
  originX: 'Origin X',
  originY: 'Origin Y',
  opacity: 'Opacity',
  fillColor: 'Fill',
  textColor: 'Text',
  strokeColor: 'Stroke',
  strokeWidth: 'Stroke W',
  strokeTopWidth: 'Stroke T',
  strokeRightWidth: 'Stroke R',
  strokeBottomWidth: 'Stroke B',
  strokeLeftWidth: 'Stroke L',
  borderRadius: 'Radius',
  borderTopLeftRadius: 'Radius TL',
  borderTopRightRadius: 'Radius TR',
  borderBottomRightRadius: 'Radius BR',
  borderBottomLeftRadius: 'Radius BL',
  fontSize: 'Font Size',
  letterSpacing: 'Letter',
  lineHeight: 'Line H',
  blur: 'Blur',
  brightness: 'Brightness',
  contrast: 'Contrast',
  grayscale: 'Grayscale',
  shadowX: 'Shadow X',
  shadowY: 'Shadow Y',
  shadowBlur: 'Shadow Blur',
  shadowSpread: 'Shadow Spread',
  backdropBlur: 'Backdrop',
}

export const NUMERIC_PROPERTIES = new Set<AnimatableProperty>(
  ANIMATION_GROUPS.flatMap((group) => group.keys).filter((key) => !key.toLowerCase().includes('color'))
)

const TRANSFORM_KEYS = new Set<keyof TransformProps>(Object.keys(DEFAULT_TRANSFORM) as (keyof TransformProps)[])

const EASING_FNS: Record<EasingType, (t: number) => number> = {
  linear: (t) => t,
  ease: (t) => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2,
  'ease-in': (t) => t * t * t,
  'ease-out': (t) => 1 - Math.pow(1 - t, 3),
  'ease-in-out': (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
  spring: (t) => t === 0 || t === 1 ? t : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1,
  bounce: (t) => {
    const n = 7.5625
    const d = 2.75
    if (t < 1 / d) return n * t * t
    if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75
    if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375
    return n * (t -= 2.625 / d) * t + 0.984375
  },
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}

function cubicBezierY(t: number, bezier: [number, number, number, number]) {
  const [, y1, , y2] = bezier
  const inv = 1 - t
  return 3 * inv * inv * t * y1 + 3 * inv * t * t * y2 + t * t * t
}

export function easingProgress(easing: PairEasingType, t: number, bezier?: [number, number, number, number]) {
  const clamped = Math.max(0, Math.min(1, t))
  if (easing === 'custom') return cubicBezierY(clamped, bezier ?? [0.25, 0.1, 0.25, 1])
  return EASING_FNS[easing](clamped)
}

function parseHexColor(value: string) {
  const hex = value.replace('#', '').trim()
  if (hex.length !== 6) return null
  const int = Number.parseInt(hex, 16)
  if (Number.isNaN(int)) return null
  return { r: (int >> 16) & 255, g: (int >> 8) & 255, b: int & 255 }
}

function mixColor(a: string, b: string, t: number) {
  const ca = parseHexColor(a)
  const cb = parseHexColor(b)
  if (!ca || !cb) return t < 1 ? a : b
  const toHex = (n: number) => Math.round(n).toString(16).padStart(2, '0')
  return `#${toHex(lerp(ca.r, cb.r, t))}${toHex(lerp(ca.g, cb.g, t))}${toHex(lerp(ca.b, cb.b, t))}`
}

export function getStaticPropertyValue(layer: Layer, transform: TransformProps, key: AnimatableProperty): number | string {
  if (key === 'width') return layer.width
  if (key === 'height') return layer.type === 'line' ? layer.strokeWidth || 2 : layer.height
  if (key === 'fillColor') return layer.fillColor
  if (key === 'textColor') return layer.textColor
  if (key === 'strokeColor') return layer.strokeColor
  if (key === 'strokeWidth') return layer.strokeWidth
  if (key === 'strokeTopWidth') return layer.strokeTopWidth ?? layer.strokeWidth
  if (key === 'strokeRightWidth') return layer.strokeRightWidth ?? layer.strokeWidth
  if (key === 'strokeBottomWidth') return layer.strokeBottomWidth ?? layer.strokeWidth
  if (key === 'strokeLeftWidth') return layer.strokeLeftWidth ?? layer.strokeWidth
  if (key === 'borderRadius') return layer.borderRadius
  if (key === 'borderTopLeftRadius') return layer.borderTopLeftRadius ?? layer.borderRadius
  if (key === 'borderTopRightRadius') return layer.borderTopRightRadius ?? layer.borderRadius
  if (key === 'borderBottomRightRadius') return layer.borderBottomRightRadius ?? layer.borderRadius
  if (key === 'borderBottomLeftRadius') return layer.borderBottomLeftRadius ?? layer.borderRadius
  if (key === 'fontSize') return layer.fontSize
  if (key === 'letterSpacing') return layer.letterSpacing
  if (key === 'lineHeight') return layer.lineHeight
  return transform[key as keyof TransformProps] as number
}

export function getPropertyKeyframes(layer: Layer, key: AnimatableProperty): PropertyKeyframe[] {
  return [...(layer.propertyKeyframes?.[key] ?? [])].sort((a, b) => a.frame - b.frame)
}

export function getAnimatedPropertyValue(layer: Layer, key: AnimatableProperty, frame: number, transform = interpolateProps(frame, layer.keyframes)) {
  const keyframes = getPropertyKeyframes(layer, key)
  if (keyframes.length === 0) return getStaticPropertyValue(layer, transform, key)
  if (frame <= keyframes[0].frame) return keyframes[0].value
  if (frame >= keyframes[keyframes.length - 1].frame) return keyframes[keyframes.length - 1].value
  for (let i = 0; i < keyframes.length - 1; i += 1) {
    const a = keyframes[i]
    const b = keyframes[i + 1]
    if (frame >= a.frame && frame <= b.frame) {
      const raw = (frame - a.frame) / Math.max(1, b.frame - a.frame)
      const eased = easingProgress(a.easing, raw, a.bezier)
      if (typeof a.value === 'number' && typeof b.value === 'number') return lerp(a.value, b.value, eased)
      return mixColor(String(a.value), String(b.value), eased)
    }
  }
  return keyframes[keyframes.length - 1].value
}

export function resolveLayerAnimation(layer: Layer, frame: number) {
  const transform = interpolateProps(frame, layer.keyframes)
  const animated: Layer = { ...layer }
  const nextTransform: TransformProps = { ...transform }

  for (const group of ANIMATION_GROUPS) {
    for (const key of group.keys) {
      if (!layer.propertyKeyframes?.[key]?.length) continue
      const value = getAnimatedPropertyValue(layer, key, frame, transform)
      if (TRANSFORM_KEYS.has(key as keyof TransformProps)) {
        nextTransform[key as keyof TransformProps] = value as never
      } else if (key in animated) {
        ;(animated as unknown as Record<string, number | string>)[key] = value
      }
    }
  }

  return { layer: animated, transform: nextTransform }
}

export function hasPropertyAnimation(layer: Layer, key: AnimatableProperty) {
  return Boolean(layer.propertyKeyframes?.[key]?.length)
}
