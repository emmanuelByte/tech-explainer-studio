import { resolveLayerAnimation } from '../../animationProperties'
import type { Connector, ConnectorPort, Layer, TransformProps } from '../../types'
import { portPosition, routeConnector, type Point, type PortAnchor } from './geometry'

/** Apply the renderer's 2D CSS transform order around its authored origin. */
function transformPoint(point: Point, transform: TransformProps, width: number, height: number): Point {
  const originX = (transform.originX / 100 - 0.5) * width
  const originY = (transform.originY / 100 - 0.5) * height
  let x = (point.x - originX) * transform.scale * transform.scaleX
  let y = (point.y - originY) * transform.scale * transform.scaleY
  y += x * Math.tan(transform.skewY * Math.PI / 180)
  x += y * Math.tan(transform.skewX * Math.PI / 180)
  const angle = transform.rotateZ * Math.PI / 180
  return {
    x: x * Math.cos(angle) - y * Math.sin(angle) + originX + transform.x,
    y: x * Math.sin(angle) + y * Math.cos(angle) + originY + transform.y,
  }
}

/** Port positions shared by rendering, hit testing, and drag/drop affordances.
 * Layers use center-relative coordinates within their parent. Apply each local
 * transform from the endpoint outward, preserving nonuniform scale and origin.
 * This is the 2D diagram plane; perspective and X/Y 3D rotation are not supported.
 */
export function resolveComponentPorts(layerId: string, layers: Layer[], frame: number, canvasWidth: number, canvasHeight: number) {
  const byId = new Map(layers.map((layer) => [layer.id, layer]))
  const chain: Array<{ transform: TransformProps; width: number; height: number }> = []
  const seen = new Set<string>()
  let current = byId.get(layerId)
  if (!current) return null
  let opacity = 1
  while (current) {
    if (seen.has(current.id)) return null
    seen.add(current.id)
    if (!current.visible || frame < (current.startFrame ?? 0) || frame > (current.endFrame ?? Infinity)) return null
    const resolved = resolveLayerAnimation(current, frame)
    opacity *= resolved.transform.opacity
    chain.push({
      transform: resolved.transform,
      width: resolved.layer.sizeMode === 'fill-canvas' ? canvasWidth : resolved.layer.width,
      height: resolved.layer.sizeMode === 'fill-canvas' ? canvasHeight : resolved.layer.height,
    })
    current = current.parentId ? byId.get(current.parentId) : undefined
  }
  const toWorld = (point: Point) => {
    for (const item of chain) point = transformPoint(point, item.transform, item.width, item.height)
    return { x: point.x + canvasWidth / 2, y: point.y + canvasHeight / 2 }
  }
  const { width, height } = chain[0]
  const rect = { x: -width / 2, y: -height / 2, width, height }
  const anchor = (port: ConnectorPort): PortAnchor => {
    const local = portPosition(rect, port)
    const offset = { x: port === 'left' ? -1 : port === 'right' ? 1 : 0, y: port === 'top' ? -1 : port === 'bottom' ? 1 : 0 }
    const point = toWorld(local)
    const outward = toWorld({ x: local.x + offset.x, y: local.y + offset.y })
    const length = Math.hypot(outward.x - point.x, outward.y - point.y) || 1
    return { point, direction: { x: (outward.x - point.x) / length, y: (outward.y - point.y) / length } }
  }
  return { ports: { left: anchor('left'), right: anchor('right'), top: anchor('top'), bottom: anchor('bottom') }, opacity }
}

export function resolveConnector(connector: Connector, layers: Layer[], frame: number, canvasWidth: number, canvasHeight: number) {
  const source = resolveComponentPorts(connector.sourceLayerId, layers, frame, canvasWidth, canvasHeight)
  const target = resolveComponentPorts(connector.targetLayerId, layers, frame, canvasWidth, canvasHeight)
  if (!source || !target) return null
  return {
    path: routeConnector(source.ports[connector.sourcePort], target.ports[connector.targetPort], connector.routing),
    opacity: Math.min(source.opacity, target.opacity),
  }
}
