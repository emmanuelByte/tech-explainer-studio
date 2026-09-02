import type { ConnectorPort, ConnectorRouting } from '../../types'

export type Rect = { x: number; y: number; width: number; height: number }
export type Point = { x: number; y: number }
export type ConnectorPath = { d: string; from: Point; to: Point; label: Point; length: number; segments: Array<{ from: Point; to: Point }> }

export function portPosition(rect: Rect, port: ConnectorPort): Point {
  const centerX = rect.x + rect.width / 2
  const centerY = rect.y + rect.height / 2
  if (port === 'left') return { x: rect.x, y: centerY }
  if (port === 'right') return { x: rect.x + rect.width, y: centerY }
  if (port === 'top') return { x: centerX, y: rect.y }
  return { x: centerX, y: rect.y + rect.height }
}

/** Deterministic straight-line geometry shared by canvas preview and export. */
export function connectorLine(source: Rect, sourcePort: ConnectorPort, target: Rect, targetPort: ConnectorPort) {
  return { from: portPosition(source, sourcePort), to: portPosition(target, targetPort) }
}

function distance(from: Point, to: Point) {
  return Math.hypot(to.x - from.x, to.y - from.y)
}

function pointsToSegments(points: Point[]) {
  return points.slice(1).map((to, index) => ({ from: points[index], to }))
}

function pointsLength(points: Point[]) {
  return pointsToSegments(points).reduce((total, segment) => total + distance(segment.from, segment.to), 0)
}

function midpointOnSegments(segments: Array<{ from: Point; to: Point }>, length: number) {
  let remaining = length / 2
  for (const segment of segments) {
    const segmentLength = distance(segment.from, segment.to)
    if (remaining <= segmentLength || segment === segments[segments.length - 1]) {
      const ratio = segmentLength === 0 ? 0 : remaining / segmentLength
      return { x: segment.from.x + (segment.to.x - segment.from.x) * ratio, y: segment.from.y + (segment.to.y - segment.from.y) * ratio }
    }
    remaining -= segmentLength
  }
  return segments[0]?.from ?? { x: 0, y: 0 }
}

function portVector(port: ConnectorPort): Point {
  if (port === 'left') return { x: -1, y: 0 }
  if (port === 'right') return { x: 1, y: 0 }
  if (port === 'top') return { x: 0, y: -1 }
  return { x: 0, y: 1 }
}

/**
 * Deterministic path geometry shared by the editor and Remotion export.
 * Curves are sampled for length, hit-testing and label placement so animation
 * does not depend on browser-only SVG path measurement APIs.
 */
export function connectorPath(source: Rect, sourcePort: ConnectorPort, target: Rect, targetPort: ConnectorPort, routing: ConnectorRouting = 'straight'): ConnectorPath {
  const { from, to } = connectorLine(source, sourcePort, target, targetPort)
  if (routing === 'straight') {
    const segments = [{ from, to }]
    const length = distance(from, to)
    return { d: `M ${from.x} ${from.y} L ${to.x} ${to.y}`, from, to, label: midpointOnSegments(segments, length), length, segments }
  }

  if (routing === 'orthogonal') {
    const sourceHorizontal = sourcePort === 'left' || sourcePort === 'right'
    const middle = sourceHorizontal
      ? { x: (from.x + to.x) / 2, y: from.y }
      : { x: from.x, y: (from.y + to.y) / 2 }
    const beforeTarget = sourceHorizontal
      ? { x: middle.x, y: to.y }
      : { x: to.x, y: middle.y }
    const points = [from, middle, beforeTarget, to]
    const segments = pointsToSegments(points).filter((segment) => distance(segment.from, segment.to) > 0)
    const length = pointsLength(points)
    return { d: `M ${from.x} ${from.y} L ${middle.x} ${middle.y} L ${beforeTarget.x} ${beforeTarget.y} L ${to.x} ${to.y}`, from, to, label: midpointOnSegments(segments, length), length, segments }
  }

  const sourceVector = portVector(sourcePort)
  const targetVector = portVector(targetPort)
  const bend = Math.max(48, Math.min(180, distance(from, to) * 0.45))
  const control1 = { x: from.x + sourceVector.x * bend, y: from.y + sourceVector.y * bend }
  const control2 = { x: to.x - targetVector.x * bend, y: to.y - targetVector.y * bend }
  const points: Point[] = []
  for (let index = 0; index <= 24; index += 1) {
    const t = index / 24
    const inverse = 1 - t
    points.push({
      x: inverse ** 3 * from.x + 3 * inverse ** 2 * t * control1.x + 3 * inverse * t ** 2 * control2.x + t ** 3 * to.x,
      y: inverse ** 3 * from.y + 3 * inverse ** 2 * t * control1.y + 3 * inverse * t ** 2 * control2.y + t ** 3 * to.y,
    })
  }
  const segments = pointsToSegments(points)
  const length = pointsLength(points)
  return { d: `M ${from.x} ${from.y} C ${control1.x} ${control1.y}, ${control2.x} ${control2.y}, ${to.x} ${to.y}`, from, to, label: midpointOnSegments(segments, length), length, segments }
}
