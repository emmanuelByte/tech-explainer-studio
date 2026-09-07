export interface SketchPoint {
  x: number
  y: number
}

export interface SketchStrokeVariant {
  d: string
  opacity: number
  widthScale: number
}

export type SketchPrimitive = 'rectangle' | 'ellipse' | 'triangle' | 'line'

function hashSeed(value: string) {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function seededRandom(seed: number) {
  let state = seed >>> 0
  return () => {
    state += 0x6d2b79f5
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

function finite(value: number, fallback = 0) {
  return Number.isFinite(value) ? value : fallback
}

export function clampSketchRoughness(value: number) {
  return Math.max(0.25, Math.min(3, finite(value, 1)))
}

function fmt(value: number) {
  return Number(value.toFixed(2))
}

function jitteredPolyline(points: SketchPoint[], seed: string, roughness: number, closed: boolean) {
  if (points.length < 2) return ''
  const random = seededRandom(hashSeed(seed))
  const amount = clampSketchRoughness(roughness) * 1.6
  const adjusted = points.map((point, index) => {
    const preserveEndpoint = !closed && (index === 0 || index === points.length - 1)
    if (preserveEndpoint) return point
    return {
      x: point.x + (random() - 0.5) * amount * 2,
      y: point.y + (random() - 0.5) * amount * 2,
    }
  })
  const commands = [`M ${fmt(adjusted[0].x)} ${fmt(adjusted[0].y)}`]
  adjusted.slice(1).forEach((point) => commands.push(`L ${fmt(point.x)} ${fmt(point.y)}`))
  if (closed) commands.push('Z')
  return commands.join(' ')
}

function rectanglePoints(width: number, height: number): SketchPoint[] {
  return [
    { x: 0, y: 0 }, { x: width / 2, y: 0 }, { x: width, y: 0 },
    { x: width, y: height / 2 }, { x: width, y: height },
    { x: width / 2, y: height }, { x: 0, y: height }, { x: 0, y: height / 2 },
  ]
}

function ellipsePoints(width: number, height: number): SketchPoint[] {
  return Array.from({ length: 24 }, (_, index) => {
    const angle = index / 24 * Math.PI * 2
    return { x: width / 2 + Math.cos(angle) * width / 2, y: height / 2 + Math.sin(angle) * height / 2 }
  })
}

function primitivePoints(primitive: SketchPrimitive, width: number, height: number): { points: SketchPoint[]; closed: boolean } {
  const safeWidth = Math.max(1, finite(width, 1))
  const safeHeight = Math.max(1, finite(height, 1))
  if (primitive === 'ellipse') return { points: ellipsePoints(safeWidth, safeHeight), closed: true }
  if (primitive === 'triangle') {
    return {
      points: [
        { x: safeWidth / 2, y: 0 },
        { x: safeWidth * 0.75, y: safeHeight / 2 },
        { x: safeWidth, y: safeHeight },
        { x: safeWidth / 2, y: safeHeight },
        { x: 0, y: safeHeight },
        { x: safeWidth * 0.25, y: safeHeight / 2 },
      ],
      closed: true,
    }
  }
  if (primitive === 'line') {
    return {
      points: [{ x: 0, y: safeHeight / 2 }, { x: safeWidth / 2, y: safeHeight / 2 }, { x: safeWidth, y: safeHeight / 2 }],
      closed: false,
    }
  }
  return { points: rectanglePoints(safeWidth, safeHeight), closed: true }
}

export function sketchPolylineVariants(points: SketchPoint[], stableId: string, roughness = 1, closed = false): SketchStrokeVariant[] {
  return [
    { d: jitteredPolyline(points, `${stableId}:primary`, roughness, closed), opacity: 0.92, widthScale: 1 },
    { d: jitteredPolyline(points, `${stableId}:secondary`, roughness * 1.15, closed), opacity: 0.42, widthScale: 0.72 },
  ]
}

export function sketchPrimitiveVariants(primitive: SketchPrimitive, width: number, height: number, stableId: string, roughness = 1) {
  const { points, closed } = primitivePoints(primitive, width, height)
  return sketchPolylineVariants(points, stableId, roughness, closed)
}

function jitterPathData(pathData: string, seed: string, roughness: number) {
  const tokens = pathData.match(/[MLCQZ]|-?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? []
  const numberIndexes = tokens.flatMap((token, index) => Number.isFinite(Number(token)) ? [index] : [])
  const pairs = Array.from({ length: Math.floor(numberIndexes.length / 2) }, (_, index) => [numberIndexes[index * 2], numberIndexes[index * 2 + 1]] as const)
  if (!pairs.length) return pathData
  const closed = tokens.some((token) => token.toUpperCase() === 'Z')
  const random = seededRandom(hashSeed(seed))
  const amount = clampSketchRoughness(roughness) * 1.6
  pairs.forEach(([xIndex, yIndex], pairIndex) => {
    const preserveEndpoint = !closed && (pairIndex === 0 || pairIndex === pairs.length - 1)
    if (preserveEndpoint) return
    tokens[xIndex] = String(fmt(Number(tokens[xIndex]) + (random() - 0.5) * amount * 2))
    tokens[yIndex] = String(fmt(Number(tokens[yIndex]) + (random() - 0.5) * amount * 2))
  })
  return tokens.join(' ')
}

export function sketchPathVariants(pathData: string, stableId: string, roughness = 1): SketchStrokeVariant[] {
  return [
    { d: jitterPathData(pathData, `${stableId}:primary`, roughness), opacity: 0.92, widthScale: 1 },
    { d: jitterPathData(pathData, `${stableId}:secondary`, roughness * 1.15), opacity: 0.42, widthScale: 0.72 },
  ]
}
