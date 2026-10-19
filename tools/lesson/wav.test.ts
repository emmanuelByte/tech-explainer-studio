import { describe, expect, it } from 'vitest'
import { encodeWav, joinWavs, parseWav, wavSeconds, type Wav } from './wav'

function tone(format: number, bits: number, seconds: number, rate = 8000): Wav {
  const samples = Math.round(seconds * rate)
  const data = Buffer.alloc(samples * (bits / 8))
  for (let i = 0; i < samples; i += 1) {
    if (format === 3) data.writeFloatLE(Math.sin(i / 10) * 0.5, i * 4)
    else data.writeInt16LE(Math.round(Math.sin(i / 10) * 10000), i * 2)
  }
  return { format, channels: 1, sampleRate: rate, bitsPerSample: bits, data }
}

describe('wav', () => {
  it.each([[3, 32], [1, 16]])('round-trips format %i / %i-bit', (format, bits) => {
    const original = tone(format, bits, 0.5)
    const parsed = parseWav(encodeWav(original))
    expect(parsed).toEqual(original)
    expect(wavSeconds(parsed)).toBeCloseTo(0.5, 5)
  })

  it('joins clips with silence between them', () => {
    const joined = joinWavs([tone(3, 32, 1), tone(3, 32, 2)], 0.25)
    expect(wavSeconds(joined)).toBeCloseTo(3.25, 5)
    // The gap is silent.
    const gapStart = 1 * 8000 * 4
    expect(joined.data.subarray(gapStart, gapStart + 0.25 * 8000 * 4).every((byte) => byte === 0)).toBe(true)
  })
})
