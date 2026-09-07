import type { ConnectorPort, ConnectorRouting } from '../../types'

export type Rect = { x: number; y: number; width: number; height: number }
export type Point = { x: number; y: number }
export type PortAnchor = { point: Point; direction: Point }
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
  return routeConnector(
    { point: portPosition(source, sourcePort), direction: portVector(sourcePort) },
    { point: portPosition(target, targetPort), direction: portVector(targetPort) },
    routing,
  )
}

export function routeConnector(source: PortAnchor, target: PortAnchor, routing: ConnectorRouting = 'straight'): ConnectorPath {
  const from = source.point
  const to = target.point
  if (routing === 'straight') {
    const segments = [{ from, to }]
    const length = distance(from, to)
    return { d: `M ${from.x} ${from.y} L ${to.x} ${to.y}`, from, to, label: midpointOnSegments(segments, length), length, segments }
  }

  if (routing === 'orthogonal') {
    // Route between outward stubs so both endpoint ports are respected,
    // including mixed horizontal/vertical ports and targets behind the source.
    const stub = Math.max(24, Math.min(48, distance(from, to) / 3))
    const sourceVector = cardinalDirection(source.direction)
    const targetVector = cardinalDirection(target.direction)
    const start = { x: from.x + sourceVector.x * stub, y: from.y + sourceVector.y * stub }
    const end = { x: to.x + targetVector.x * stub, y: to.y + targetVector.y * stub }
    const sourceHorizontal = sourceVector.x !== 0
    const targetHorizontal = targetVector.x !== 0
    const bends = sourceHorizontal !== targetHorizontal
      ? [sourceHorizontal ? { x: end.x, y: start.y } : { x: start.x, y: end.y }]
      : sourceHorizontal
        ? [{ x: (start.x + end.x) / 2, y: start.y }, { x: (start.x + end.x) / 2, y: end.y }]
        : [{ x: start.x, y: (start.y + end.y) / 2 }, { x: end.x, y: (start.y + end.y) / 2 }]
    const points = [from, start, ...bends, end, to]
    const segments = pointsToSegments(points).filter((segment) => distance(segment.from, segment.to) > 0)
    const length = pointsLength(points)
    return { d: points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' '), from, to, label: midpointOnSegments(segments, length), length, segments }
  }

  const bend = Math.max(48, Math.min(180, distance(from, to) * 0.45))
  const control1 = { x: from.x + source.direction.x * bend, y: from.y + source.direction.y * bend }
  const control2 = { x: to.x + target.direction.x * bend, y: to.y + target.direction.y * bend }
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

function cardinalDirection(direction: Point): Point {
  return Math.abs(direction.x) >= Math.abs(direction.y)
    ? { x: Math.sign(direction.x) || 1, y: 0 }
    : { x: 0, y: Math.sign(direction.y) || 1 }
}
