import { describe, expect, it } from 'vitest'
import { connectorLine, connectorPath, portPosition } from './geometry'

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
    expect(orthogonal.d).toBe('M 180 220 L 240 220 L 240 230 L 300 230')
    expect(orthogonal.length).toBe(130)
    expect(bezier.d).toContain('C')
    expect(bezier.length).toBeGreaterThan(120)
    expect(bezier.segments).toHaveLength(24)
  })
})
