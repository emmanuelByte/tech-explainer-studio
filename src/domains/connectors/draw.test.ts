import { describe, expect, it } from 'vitest'
import { CONNECTOR_HIDE_FADE_FRAMES, connectorDash, connectorDrawProgress, connectorHideOpacity, connectorLineDash } from './draw'

describe('connector hide fade', () => {
  it('is fully visible without a hide frame and until the hide frame', () => {
    expect(connectorHideOpacity(500)).toBe(1)
    expect(connectorHideOpacity(99, 100)).toBe(1)
    expect(connectorHideOpacity(100, 100)).toBe(1)
  })

  it('fades to zero over the fade duration and stays hidden', () => {
    expect(connectorHideOpacity(100 + CONNECTOR_HIDE_FADE_FRAMES / 2, 100)).toBe(0.5)
    expect(connectorHideOpacity(100 + CONNECTOR_HIDE_FADE_FRAMES, 100)).toBe(0)
    expect(connectorHideOpacity(1000, 100)).toBe(0)
  })
})

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

  it('derives a stable dashed-line pattern from the line width', () => {
    expect(connectorLineDash(4)).toBe('12 8')
    expect(connectorLineDash(100)).toBe('48 32')
  })
})
