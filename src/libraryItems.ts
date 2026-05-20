import { getAnimatedPropertyValue, resolveLayerAnimation } from './animationProperties'
import { interpolateProps } from './remotion/interpolateProps'
import type { AnimatableProperty, Keyframe, KeyframeSelection, Layer, PropertyKeyframe, TransformProps } from './types'

function uid() {
  return Math.random().toString(36).slice(2, 9)
}

function isGroupLayer(layer: Layer) {
  return layer.type === 'group' || layer.isGroup
}

export function selectedWithDescendants(layers: Layer[], selectedIds: string[]) {
  const ids = new Set(selectedIds)
  let changed = true
  while (changed) {
    changed = false
    layers.forEach((layer) => {
      if (layer.parentId && ids.has(layer.parentId) && !ids.has(layer.id)) {
        ids.add(layer.id)
        changed = true
      }
    })
  }
  return layers.filter((layer) => ids.has(layer.id))
}

export function rootLayerIds(layers: Layer[]) {
  const ids = new Set(layers.map((layer) => layer.id))
  return layers.filter((layer) => !layer.parentId || !ids.has(layer.parentId)).map((layer) => layer.id)
}

export function frameRangeFromSelection(layers: Layer[], selectedKeyframes: KeyframeSelection[]) {
  const layerIds = new Set(layers.map((layer) => layer.id))
  const keyframeFrames = selectedKeyframes.filter((kf) => layerIds.has(kf.layerId)).map((kf) => kf.frame)
  if (keyframeFrames.length) {
    const start = Math.min(...keyframeFrames)
    const end = Math.max(...keyframeFrames)
    return { start, end: Math.max(start + 1, end), source: 'selected keyframes' }
  }
  const start = Math.min(...layers.map((layer) => layer.startFrame ?? 0))
  const end = Math.max(...layers.map((layer) => layer.endFrame ?? start + 1))
  return { start, end: Math.max(start + 1, end), source: 'layer ranges' }
}

export function designLayerAtFrame(layer: Layer, frame: number, totalFrames: number): Layer {
  const resolved = resolveLayerAnimation(layer, frame)
  const next: Layer = {
    ...resolved.layer,
    id: layer.id,
    parentId: layer.parentId ?? null,
    startFrame: 0,
    endFrame: totalFrames,
    keyframes: [{ frame: 0, easing: 'ease-out', props: { ...resolved.transform } }],
    propertyKeyframes: undefined,
  }
  if (isGroupLayer(next)) {
    next.groupOriginX = resolved.transform.x
    next.groupOriginY = resolved.transform.y
  }
  return next
}

function keyframeAt(frame: number, props: TransformProps, easing: Keyframe['easing'] = 'ease-out'): Keyframe {
  return { frame, easing, props: { ...props } }
}

function clipTransformKeyframes(layer: Layer, start: number, end: number) {
  const duration = Math.max(1, end - start)
  const startProps = interpolateProps(start, layer.keyframes)
  const endProps = interpolateProps(end, layer.keyframes)
  const inRange = layer.keyframes
    .filter((kf) => kf.frame >= start && kf.frame <= end)
    .map((kf) => ({ ...kf, frame: kf.frame - start, props: { ...kf.props } }))
    .sort((a, b) => a.frame - b.frame)

  if (!inRange.some((kf) => kf.frame === 0)) inRange.unshift(keyframeAt(0, startProps))
  if (!inRange.some((kf) => kf.frame === duration)) inRange.push(keyframeAt(duration, endProps))
  return inRange.sort((a, b) => a.frame - b.frame)
}

function propertyKeyframeAt(frame: number, value: number | string, easing: PropertyKeyframe['easing'] = 'ease-out'): PropertyKeyframe {
  return { id: uid(), frame, value, easing }
}

function clipPropertyKeyframes(layer: Layer, start: number, end: number): Layer['propertyKeyframes'] {
  if (!layer.propertyKeyframes) return undefined
  const duration = Math.max(1, end - start)
  const transformAtStart = interpolateProps(start, layer.keyframes)
  const transformAtEnd = interpolateProps(end, layer.keyframes)
  const entries = Object.entries(layer.propertyKeyframes).map(([key, frames]) => {
    const propKey = key as AnimatableProperty
    const inRange = (frames ?? [])
      .filter((kf) => kf.frame >= start && kf.frame <= end)
      .map((kf) => ({ ...kf, id: uid(), frame: kf.frame - start }))
      .sort((a, b) => a.frame - b.frame)
    if (!inRange.some((kf) => kf.frame === 0)) {
      inRange.unshift(propertyKeyframeAt(0, getAnimatedPropertyValue(layer, propKey, start, transformAtStart)))
    }
    if (!inRange.some((kf) => kf.frame === duration)) {
      inRange.push(propertyKeyframeAt(duration, getAnimatedPropertyValue(layer, propKey, end, transformAtEnd)))
    }
    return [key, inRange] as const
  })
  return Object.fromEntries(entries) as Layer['propertyKeyframes']
}

export function animationLayerInRange(layer: Layer, start: number, end: number): Layer {
  const duration = Math.max(1, end - start)
  const keyframes = clipTransformKeyframes(layer, start, end)
  const startTransform = keyframes[0]?.props ?? interpolateProps(start, layer.keyframes)
  const next: Layer = {
    ...layer,
    startFrame: 0,
    endFrame: duration,
    keyframes,
    propertyKeyframes: clipPropertyKeyframes(layer, start, end),
  }
  if (isGroupLayer(next)) {
    next.groupOriginX = startTransform.x
    next.groupOriginY = startTransform.y
  }
  return next
}
