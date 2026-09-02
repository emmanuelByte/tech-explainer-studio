import { describe, expect, it } from 'vitest'
import { connectorDash, connectorDrawProgress } from './draw'

describe('connector draw animation', () => {
  it('clamps progress to its authored frame range', () => {
    expect(connectorDrawProgress(0, 10, 30)).toBe(0)
    expect(connectorDrawProgress(20, 10, 30)).toBe(0.5)
    expect(connectorDrawProgress(40, 10, 30)).toBe(1)
    expect(connectorDrawProgress(20)).toBe(1)
  })

  it('creates a deterministic dash reveal', () => {
    expect(connectorDash(200, 0.25)).toEqual({ dashArray: 200, dashOffset: 150 })
  })
})
