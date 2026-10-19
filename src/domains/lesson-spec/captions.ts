import type { NarrationWord } from './types'

/**
 * Narration-synchronised captions: the spoken words (with their times in the
 * audio) are grouped into short readable phrases. Phrases break at the speaker's
 * own pauses and punctuation, never inside a token such as `POST /checkout` or
 * `profile:42`, and never leave a dangling article or preposition at the end.
 */

export interface CaptionPhrase {
  text: string
  /** Seconds from the start of the scene's audio. */
  start: number
  end: number
  /** `estimated` when any word of the phrase had no measured time. */
  timing: 'aligned' | 'estimated'
}

export interface CaptionOptions {
  /** Most characters one caption may hold (the frame decides: two lines of the caption font). */
  maxChars: number
  /** Fewest words a phrase may have unless the sentence is that short. */
  minWords?: number
}

/** Words a phrase should not end on: they belong to what follows. */
const DANGLING = new Set(['a', 'an', 'the', 'of', 'to', 'in', 'on', 'at', 'for', 'with', 'from', 'by', 'and', 'or', 'but', 'so', 'is', 'are', 'was', 'that', 'this', 'its', 'your', 'our', 'their', 'than', 'as', 'if', 'when', 'into', 'over'])
/** Words that naturally begin a new phrase. */
const OPENERS = new Set(['and', 'but', 'so', 'or', 'because', 'which', 'that', 'when', 'if', 'while', 'then', 'where', 'who'])
const ABBREVIATIONS = new Set(['e.g.', 'i.e.', 'vs.', 'etc.', 'mr.', 'mrs.', 'dr.', 'approx.', 'fig.', 'no.'])
const SENTENCE_END = /[.!?]["')\]]*$/
const CLAUSE_END = /[,;:]["')\]]*$/

/** Silence between words long enough that the speaker has clearly paused. */
const PAUSE_BREAK_SECONDS = 0.4
/** A caption appears this long before its first word, and stays this long after its last. */
export const CAPTION_LEAD_SECONDS = 0.06
export const CAPTION_HOLD_SECONDS = 0.3
const MIN_VISIBLE_SECONDS = 0.7

const bare = (word: string) => word.toLowerCase().replace(/[^a-z']/g, '')
const isSentenceEnd = (word: string) => SENTENCE_END.test(word) && !ABBREVIATIONS.has(word.toLowerCase())
const length = (words: NarrationWord[]) => words.reduce((sum, word) => sum + word.text.length, 0) + Math.max(0, words.length - 1)

function breakAfter(words: NarrationWord[], minWords: number, maxChars: number): number[] {
  const breaks: number[] = []
  let start = 0
  for (let i = 0; i < words.length; i += 1) {
    const phrase = words.slice(start, i + 1)
    const next = words[i + 1]
    if (!next) break
    const gap = next.start - words[i].end
    const tooLong = length(phrase) + 1 + next.text.length > maxChars
    const sentence = isSentenceEnd(words[i].text)
    const clause = CLAUSE_END.test(words[i].text) && phrase.length >= minWords && length(phrase) >= maxChars * 0.4
    const paused = gap >= PAUSE_BREAK_SECONDS && phrase.length >= minWords
    if (!(sentence || clause || paused || tooLong)) continue
    let at = i
    if (tooLong && !sentence) {
      // Break earlier, at the best natural point inside the phrase, if there is one.
      for (let j = i; j >= start + minWords - 1; j -= 1) {
        const before = bare(words[j].text)
        const after = bare(words[j + 1]?.text ?? '')
        if (CLAUSE_END.test(words[j].text) || (OPENERS.has(after) && !DANGLING.has(before))) { at = j; break }
        if (!DANGLING.has(before) && at === i) at = j // fall back to the last word that is a good place to stop
      }
      // Never strand a dangling word at the end.
      while (at > start + minWords - 1 && DANGLING.has(bare(words[at].text))) at -= 1
    }
    breaks.push(at)
    start = at + 1
    i = at
  }
  return breaks
}

/** Joins a one-word tail onto the phrase before it when it fits, so a sentence never ends on a stray word. */
function absorbStrays(groups: NarrationWord[][], maxChars: number, minWords: number): NarrationWord[][] {
  const out: NarrationWord[][] = []
  for (const group of groups) {
    const previous = out[out.length - 1]
    if (previous && group.length < Math.min(2, minWords) && !isSentenceEnd(previous[previous.length - 1].text) && length([...previous, ...group]) <= maxChars * 1.15) previous.push(...group)
    else out.push([...group])
  }
  return out
}

export function buildCaptions(words: NarrationWord[], options: CaptionOptions): CaptionPhrase[] {
  if (!words.length) return []
  const minWords = options.minWords ?? 3
  const cuts = new Set(breakAfter(words, minWords, options.maxChars))
  const groups: NarrationWord[][] = [[]]
  words.forEach((word, index) => {
    groups[groups.length - 1].push(word)
    if (cuts.has(index) && index < words.length - 1) groups.push([])
  })
  const phrases = absorbStrays(groups.filter((group) => group.length), options.maxChars, minWords)
  // A caption appears just before its first word, but never before the previous phrase's last word has finished.
  const starts = phrases.map((group, index) => Math.max(index ? phrases[index - 1][phrases[index - 1].length - 1].end : 0, group[0].start - CAPTION_LEAD_SECONDS, 0))
  return phrases.map((group, index) => {
    const last = group[group.length - 1]
    let end = Math.max(last.end + CAPTION_HOLD_SECONDS, starts[index] + MIN_VISIBLE_SECONDS)
    if (index + 1 < phrases.length) end = Math.min(end, starts[index + 1])
    return { text: group.map((word) => word.text).join(' '), start: starts[index], end, timing: group.every((word) => word.timing === 'aligned') ? 'aligned' : 'estimated' }
  })
}

/** Spreads words over [start, end] by letter count, with extra time after punctuation. Only a fallback: it is a guess, and its words are marked `estimated`. */
export function estimateWordTimes(words: string[], start: number, end: number): NarrationWord[] {
  const weight = (word: string) => Math.max(2, word.replace(/[^A-Za-z0-9]/g, '').length)
  const pause = (word: string) => (SENTENCE_END.test(word) ? 5 : CLAUSE_END.test(word) ? 3 : 0)
  const total = words.reduce((sum, word) => sum + weight(word) + pause(word), 0)
  const unit = total ? (end - start) / total : 0
  let cursor = start
  return words.map((text) => {
    const wordStart = cursor
    cursor += weight(text) * unit
    const wordEnd = cursor
    cursor += pause(text) * unit
    return { text, start: round(wordStart), end: round(wordEnd), timing: 'estimated' as const }
  })
}

const round = (value: number) => Math.round(value * 1000) / 1000
