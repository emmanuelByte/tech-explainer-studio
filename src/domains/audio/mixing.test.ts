import { describe, expect, it } from 'vitest'
import { isEffectivelyMuted } from './mixing'
import type { LayerType } from '../../types'

type TestLayer = { type: LayerType; audioMuted?: boolean; solo?: boolean }

const audio = (overrides: Partial<TestLayer> = {}): TestLayer => ({ type: 'audio', audioMuted: false, solo: false, ...overrides })

describe('isEffectivelyMuted', () => {
  it('falls back to audioMuted when no layer is soloed', () => {
    const a = audio()
    const b = audio({ audioMuted: true })
    const layers = [a, b]
    expect(isEffectivelyMuted(a, layers)).toBe(false)
    expect(isEffectivelyMuted(b, layers)).toBe(true)
  })

  it('mutes every non-soloed audio layer once one layer is soloed', () => {
    const soloed = audio({ solo: true })
    const other = audio()
    const layers = [soloed, other]
    expect(isEffectivelyMuted(soloed, layers)).toBe(false)
    expect(isEffectivelyMuted(other, layers)).toBe(true)
  })

  it('keeps every soloed layer audible when multiple layers are soloed', () => {
    const a = audio({ solo: true })
    const b = audio({ solo: true })
    const c = audio()
    const layers = [a, b, c]
    expect(isEffectivelyMuted(a, layers)).toBe(false)
    expect(isEffectivelyMuted(b, layers)).toBe(false)
    expect(isEffectivelyMuted(c, layers)).toBe(true)
  })

  it('mute always wins, even on the soloed layer itself', () => {
    const soloedAndMuted = audio({ solo: true, audioMuted: true })
    const layers = [soloedAndMuted, audio()]
    expect(isEffectivelyMuted(soloedAndMuted, layers)).toBe(true)
  })

  it('ignores a solo flag on a non-audio layer', () => {
    const nonAudioSolo: TestLayer = { type: 'video', solo: true }
    const a = audio()
    const layers = [nonAudioSolo, a]
    expect(isEffectivelyMuted(a, layers)).toBe(false)
  })
})
