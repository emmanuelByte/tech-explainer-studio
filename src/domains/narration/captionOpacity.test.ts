import { describe, expect, it } from 'vitest'
import type { ScriptSegment } from '../../types'
import { captionOpacity } from './model'

const seg = (id: string, startFrame: number, endFrame: number): ScriptSegment => ({ id, text: id, startFrame, endFrame })

describe('captionOpacity', () => {
  const a = seg('a', 10, 40)
  const b = seg('b', 40, 70)
  const alone = seg('c', 100, 130)

  it('fades in over the first frames and is fully visible after', () => {
    const all = [a, b, alone]
    expect(captionOpacity(all, alone, 100)).toBeLessThan(1)
    expect(captionOpacity(all, alone, 100)).toBeGreaterThan(0)
    expect(captionOpacity(all, alone, 110)).toBe(1)
  })

  it('fades out at the end when nothing follows', () => {
    expect(captionOpacity([alone], alone, 129)).toBeLessThan(1)
    expect(captionOpacity([alone], alone, 120)).toBe(1)
  })

  it('does not fade out when the next caption follows straight away', () => {
    expect(captionOpacity([a, b], a, 39)).toBe(1)
  })

  it('stays within 0..1', () => {
    for (let frame = 0; frame < 140; frame += 1) {
      const value = captionOpacity([a, b, alone], alone, frame)
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThanOrEqual(1)
    }
  })
})
