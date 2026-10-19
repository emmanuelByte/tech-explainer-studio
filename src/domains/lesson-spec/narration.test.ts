import { describe, expect, it } from 'vitest'
import { chunkLooksWrong, narrationCueProblems, narrationWords, parseNarration, resolveCueTimes, splitSentences } from './narration'

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

describe('chunkLooksWrong', () => {
  it('flags a stretched short phrase but not normal speech', () => {
    expect(chunkLooksWrong('storage,', 2.72)).toBe(true)
    expect(chunkLooksWrong('storage,', 0.7)).toBe(false)
    expect(chunkLooksWrong('Instead of doing the work itself, the app drops a job onto', 3.56)).toBe(false)
  })
})

describe('narrationWords and splitSentences', () => {
  it('lists spoken words with each cue at the word that follows it', () => {
    const { words, cues } = narrationWords('Every time you open a page, [[browser]]your browser asks [[app]]the app. [[end]]')
    expect(words.slice(0, 3)).toEqual(['Every', 'time', 'you'])
    expect(cues).toEqual([{ id: 'browser', wordIndex: 6 }, { id: 'app', wordIndex: 9 }, { id: 'end', wordIndex: words.length }])
    expect(words[6]).toBe('your')
  })

  const sentences = (text: string) => {
    const { words } = narrationWords(text)
    return splitSentences(words).map((range) => words.slice(range.start, range.end).join(' '))
  }

  it('speaks whole sentences, so a cue in the middle of one does not split it', () => {
    expect(sentences('The app asks [[db]]the database for that profile. It is slow when busy today.')).toEqual([
      'The app asks the database for that profile.',
      'It is slow when busy today.',
    ])
  })

  it('does not split at abbreviations, decimals or endpoints', () => {
    expect(sentences('Use a cache, e.g. Redis, with a TTL of 0.5 seconds for GET /api/v1.2/users today.')).toHaveLength(1)
  })

  it('joins very short sentences to a neighbour, since the voice garbles tiny utterances', () => {
    expect(sentences('That is a cache hit. Fast. The answer comes straight back to the user.')).toHaveLength(2)
  })

  it('splits an overlong sentence at a clause boundary', () => {
    const long = `${'The request travels through many layers of the system, '.repeat(3)}and finally reaches the database server that holds the data, which then answers.`
    const parts = sentences(long)
    expect(parts.length).toBeGreaterThan(1)
    expect(parts.join(' ')).toBe(long)
  })
})
