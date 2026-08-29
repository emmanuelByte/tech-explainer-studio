import { describe, expect, it } from 'vitest'
import { connectorLine, portPosition } from './geometry'

describe('connector geometry', () => {
  const rect = { x: 100, y: 200, width: 80, height: 40 }
  it('resolves deterministic port positions', () => {
    expect(portPosition(rect, 'right')).toEqual({ x: 180, y: 220 })
    expect(portPosition(rect, 'top')).toEqual({ x: 140, y: 200 })
  })
  it('connects selected endpoint ports', () => {
    expect(connectorLine(rect, 'right', { x: 300, y: 200, width: 100, height: 60 }, 'left')).toEqual({ from: { x: 180, y: 220 }, to: { x: 300, y: 230 } })
  })
})
