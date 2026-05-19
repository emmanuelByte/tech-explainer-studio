import { interpolate } from 'remotion'
import { Keyframe, TransformProps, DEFAULT_TRANSFORM } from '../types'

export function interpolateProps(frame: number, keyframes: Keyframe[]): TransformProps {
  if (keyframes.length === 0) return { ...DEFAULT_TRANSFORM }
  if (keyframes.length === 1) return { ...keyframes[0].props }

  const sorted = [...keyframes].sort((a, b) => a.frame - b.frame)
  const frames = sorted.map((k) => k.frame)

  const lerp = (key: keyof TransformProps) => {
    const values = sorted.map((k) => k.props[key] as number)
    return interpolate(frame, frames, values, {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    })
  }

  return {
    x: lerp('x'),
    y: lerp('y'),
    scale: lerp('scale'),
    opacity: lerp('opacity'),
    rotateX: lerp('rotateX'),
    rotateY: lerp('rotateY'),
    rotateZ: lerp('rotateZ'),
    skewX: lerp('skewX'),
    perspective: lerp('perspective'),
  }
}

export function buildTransform(p: TransformProps): string {
  return [
    `translate(${p.x}px, ${p.y}px)`,
    `scale(${p.scale})`,
    `rotateX(${p.rotateX}deg)`,
    `rotateY(${p.rotateY}deg)`,
    `rotateZ(${p.rotateZ}deg)`,
    `skewX(${p.skewX}deg)`,
  ].join(' ')
}
