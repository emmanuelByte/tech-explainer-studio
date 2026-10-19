import { describe, expect, it } from 'vitest'
import { narrationCueProblems, parseNarration, resolveCueTimes } from './narration'

describe('parseNarration', () => {
  it('returns one chunk and no cues for plain text', () => {
    expect(parseNarration('Hello there.')).toEqual({ plain: 'Hello there.', chunks: ['Hello there.'], cues: [] })
  })

  it('splits at cues and maps each cue to the chunk that follows it', () => {
    const parsed = parseNarration('[[a]]A load balancer sits in front, [[b]] and receives every request.')
    expect(parsed.chunks).toEqual(['A load balancer sits in front,', 'and receives every request.'])
    expect(parsed.cues).toEqual([{ id: 'a', chunkIndex: 0 }, { id: 'b', chunkIndex: 1 }])
    expect(parsed.plain).toBe('A load balancer sits in front, and receives every request.')
  })

  it('puts consecutive cues on the same chunk', () => {
    const parsed = parseNarration('First part. [[x]][[y]]Second part.')
    expect(parsed.chunks).toEqual(['First part.', 'Second part.'])
    expect(parsed.cues).toEqual([{ id: 'x', chunkIndex: 1 }, { id: 'y', chunkIndex: 1 }])
  })

  it('maps a trailing cue to the end of the speech', () => {
    const parsed = parseNarration('Only words. [[z]]')
    expect(parsed.cues).toEqual([{ id: 'z', chunkIndex: 1 }])
  })

  it('collapses whitespace and never yields empty chunks', () => {
    expect(parseNarration('  one \n  two  [[a]]   [[b]]  three ').chunks).toEqual(['one two', 'three'])
  })
})

describe('narrationCueProblems', () => {
  it('accepts well-formed cues and reports unbalanced or empty ones', () => {
    expect(narrationCueProblems('A [[a]] b')).toEqual([])
    expect(narrationCueProblems('A [[a b')).toHaveLength(1)
    expect(narrationCueProblems('A a]] b')).toHaveLength(1)
    expect(narrationCueProblems('A [[ ]] b')).toHaveLength(1)
  })
})

describe('resolveCueTimes', () => {
  it('uses cumulative chunk durations plus gaps', () => {
    const parsed = parseNarration('[[a]]One. [[b]]Two. [[c]]Three.')
    expect(resolveCueTimes(parsed, [1, 2, 3], 0.5)).toEqual({ a: 0, b: 1.5, c: 4 })
  })

  it('places a trailing cue at the end without the final gap', () => {
    const parsed = parseNarration('One. [[end]]')
    expect(resolveCueTimes(parsed, [2], 0.5)).toEqual({ end: 2 })
  })
})
