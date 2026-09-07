import { describe, expect, it } from 'vitest'
import { connectorLine, connectorPath, portPosition } from './geometry'
import type { ConnectorPort } from '../../types'

describe('connector geometry', () => {
  const rect = { x: 100, y: 200, width: 80, height: 40 }
  it('resolves deterministic port positions', () => {
    expect(portPosition(rect, 'right')).toEqual({ x: 180, y: 220 })
    expect(portPosition(rect, 'top')).toEqual({ x: 140, y: 200 })
  })
  it('connects selected endpoint ports', () => {
    expect(connectorLine(rect, 'right', { x: 300, y: 200, width: 100, height: 60 }, 'left')).toEqual({ from: { x: 180, y: 220 }, to: { x: 300, y: 230 } })
  })
  it('builds deterministic orthogonal and bezier routes', () => {
    const target = { x: 300, y: 200, width: 100, height: 60 }
    const orthogonal = connectorPath(rect, 'right', target, 'left', 'orthogonal')
    const bezier = connectorPath(rect, 'right', target, 'left', 'bezier')
    expect(orthogonal.segments.every(({ from, to }) => from.x === to.x || from.y === to.y)).toBe(true)
    expect(orthogonal.length).toBe(130)
    expect(bezier.d).toContain('C')
    expect(bezier.length).toBeGreaterThan(120)
    expect(bezier.segments).toHaveLength(24)
  })
})

const ports: ConnectorPort[] = ['left', 'right', 'top', 'bottom']
describe('port approach directions', () => {
  for (const sourcePort of ports) for (const targetPort of ports) {
    it(`approaches ${sourcePort} → ${targetPort} from outside each component`, () => {
      const path = connectorPath({ x: 0, y: 0, width: 100, height: 60 }, sourcePort, { x: 300, y: 200, width: 100, height: 60 }, targetPort, 'bezier')
      const first = path.segments[0]
      const last = path.segments[path.segments.length - 1]
      const outward = (port: ConnectorPort, dx: number, dy: number) => port === 'left' ? -dx : port === 'right' ? dx : port === 'top' ? -dy : dy
      expect(outward(sourcePort, first.to.x - first.from.x, first.to.y - first.from.y)).toBeGreaterThan(0)
      expect(outward(targetPort, last.from.x - last.to.x, last.from.y - last.to.y)).toBeGreaterThan(0)
      expect(connectorPath({ x: 0, y: 0, width: 100, height: 60 }, sourcePort, { x: 300, y: 200, width: 100, height: 60 }, targetPort, 'bezier')).toEqual(path)
    })
  }
  it('keeps coincident endpoints and labels finite', () => {
    const rect = { x: 0, y: 0, width: 100, height: 60 }
    for (const route of ['straight', 'orthogonal', 'bezier'] as const) {
      const path = connectorPath(rect, 'top', rect, 'top', route)
      expect(Number.isFinite(path.label.x)).toBe(true)
      expect(Number.isFinite(path.length)).toBe(true)
    }
  })
})
