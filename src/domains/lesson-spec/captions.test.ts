import { describe, expect, it } from 'vitest'
import { buildCaptions, estimateWordTimes } from './captions'
import type { NarrationWord } from './types'

/** Words at 0.3s each with a 0.05s gap, unless a pause is given after a word. */
function words(text: string, pauses: Record<number, number> = {}): NarrationWord[] {
  let at = 0.2
  return text.split(' ').map((word, index) => {
    const start = at
    at += 0.3
    const end = at
    at += 0.05 + (pauses[index] ?? 0)
    return { text: word, start, end, timing: 'aligned' as const }
  })
}
const texts = (phrases: { text: string }[]) => phrases.map((phrase) => phrase.text)

describe('buildCaptions', () => {
  it('breaks at sentence ends', () => {
    const out = buildCaptions(words('The cache is fast. The database is slower today.'), { maxChars: 80 })
    expect(texts(out)).toEqual(['The cache is fast.', 'The database is slower today.'])
  })

  it('keeps short sentences together when they fit, and breaks at a comma once the phrase is long enough', () => {
    const out = buildCaptions(words('If the cache already has the profile, that is a cache hit.'), { maxChars: 60 })
    expect(texts(out)).toEqual(['If the cache already has the profile,', 'that is a cache hit.'])
  })

  it('never exceeds the character limit', () => {
    const long = 'Databases are reliable but memory is faster and a busy site can repeat this question thousands of times a minute.'
    for (const maxChars of [30, 40, 56, 70]) {
      for (const phrase of buildCaptions(words(long), { maxChars })) expect(phrase.text.length).toBeLessThanOrEqual(Math.ceil(maxChars * 1.15))
    }
  })

  it('does not end a caption on an article or preposition when it can avoid it', () => {
    const out = buildCaptions(words('A cache is a small very fast store between the app and the database'), { maxChars: 32 })
    for (const phrase of out.slice(0, -1)) expect(phrase.text).not.toMatch(/\b(a|the|of|to|in|and|between)$/i)
  })

  it('never splits inside a technical token, and keeps the words in order', () => {
    const text = 'The client sends POST /checkout with profile:42 using e.g. GET /api/v1/users?id=7 and waits'
    const out = buildCaptions(words(text), { maxChars: 28 })
    expect(out.map((phrase) => phrase.text).join(' ')).toBe(text)
    for (const token of ['POST', '/checkout', 'profile:42', 'e.g.', '/api/v1/users?id=7']) {
      expect(out.some((phrase) => phrase.text.split(' ').includes(token))).toBe(true)
    }
  })

  it('does not treat an abbreviation or decimal as a sentence end', () => {
    const out = buildCaptions(words('Use a cache e.g. Redis with a TTL of 0.5 seconds for hot keys'), { maxChars: 90 })
    expect(out).toHaveLength(1)
  })

  it('breaks where the speaker pauses', () => {
    const out = buildCaptions(words('Every request starts here and then continues onward', { 3: 0.6 }), { maxChars: 90 })
    expect(texts(out)).toEqual(['Every request starts here', 'and then continues onward'])
  })

  it('times captions to the words: starts just before the first word, ends after the last, never overlapping', () => {
    const w = words('The cache is fast. The database is slower today.')
    const out = buildCaptions(w, { maxChars: 80 })
    expect(out[0].start).toBeCloseTo(w[0].start - 0.06, 3)
    expect(out[0].end).toBeGreaterThanOrEqual(w[3].end)
    for (let i = 1; i < out.length; i += 1) {
      expect(out[i].start).toBeGreaterThanOrEqual(out[i - 1].end - 1e-9)
      expect(out[i].start).toBeLessThanOrEqual(w[4].start)
      expect(out[i].start).toBeGreaterThanOrEqual(w[3].end) // never before the previous word has finished
    }
  })

  it('never shows a caption before time zero and shows a one-word phrase long enough to read', () => {
    const out = buildCaptions([{ text: 'Yes.', start: 0.02, end: 0.2, timing: 'aligned' }], { maxChars: 40 })
    expect(out[0].start).toBe(0)
    expect(out[0].end - out[0].start).toBeGreaterThanOrEqual(0.7)
  })

  it('marks a phrase estimated if any word is', () => {
    const w = words('Short phrase here.')
    w[1] = { ...w[1], timing: 'estimated' }
    expect(buildCaptions(w, { maxChars: 60 })[0].timing).toBe('estimated')
  })

  it('handles empty input and a single overlong word', () => {
    expect(buildCaptions([], { maxChars: 40 })).toEqual([])
    expect(texts(buildCaptions(words('Supercalifragilisticexpialidocious'), { maxChars: 10 }))).toEqual(['Supercalifragilisticexpialidocious'])
  })
})

describe('estimateWordTimes', () => {
  it('spreads words in order over the range and marks them estimated', () => {
    const out = estimateWordTimes('One two, three four.'.split(' '), 1, 5)
    expect(out.every((word) => word.timing === 'estimated')).toBe(true)
    expect(out[0].start).toBe(1)
    expect(out[out.length - 1].end).toBeLessThanOrEqual(5.001)
    for (let i = 1; i < out.length; i += 1) expect(out[i].start).toBeGreaterThanOrEqual(out[i - 1].end)
  })
})
