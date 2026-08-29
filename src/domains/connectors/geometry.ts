import type { ConnectorPort } from '../../types'

export type Rect = { x: number; y: number; width: number; height: number }
export type Point = { x: number; y: number }

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
