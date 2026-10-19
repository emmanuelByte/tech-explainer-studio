import { describe, expect, it } from 'vitest'
import { sameArrayContents } from './useStableArray'

describe('sameArrayContents', () => {
  it('is true for two different array wrappers holding the same elements in the same order', () => {
    const a = { id: 'a' }
    const b = { id: 'b' }
    expect(sameArrayContents([a, b], [a, b])).toBe(true)
  })

  it('is false when lengths differ', () => {
    const a = { id: 'a' }
    expect(sameArrayContents([a], [a, { id: 'b' }])).toBe(false)
  })

  it('is false when an element was replaced by a new reference, even with the same shape', () => {
    const a = { id: 'a' }
    expect(sameArrayContents([a], [{ id: 'a' }])).toBe(false)
  })

  it('is false when order differs', () => {
    const a = { id: 'a' }
    const b = { id: 'b' }
    expect(sameArrayContents([a, b], [b, a])).toBe(false)
  })

  it('is true for two empty arrays', () => {
    expect(sameArrayContents([], [])).toBe(true)
  })
})
