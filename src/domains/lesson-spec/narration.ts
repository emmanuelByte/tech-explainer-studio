/**
 * Narration text may contain inline cues, `[[id]]`, meaning "reveal (or hide)
 * `id` when the words that follow begin". Text is synthesised one chunk at a
 * time, split at the cues, so each cue's time is the measured start of its
 * chunk and needs no speech-recognition step.
 */

export interface ParsedNarration {
  /** Narration with cues removed; used for captions and the script. */
  plain: string
  /** Spoken chunks, in order. Never empty strings. */
  chunks: string[]
  /** Cue id -> index of the chunk whose start it marks (chunks.length = the very end). */
  cues: { id: string; chunkIndex: number }[]
}

const CUE = /\[\[([^\]]*)\]\]/g

/** Cue ids as written in the text; malformed markers are reported by `narrationCueProblems`. */
export function parseNarration(text: string): ParsedNarration {
  const chunks: string[] = []
  const cues: ParsedNarration['cues'] = []
  let cursor = 0
  const flush = (segment: string) => {
    const trimmed = segment.replace(/\s+/g, ' ').trim()
    if (trimmed) chunks.push(trimmed)
  }
  for (const match of text.matchAll(CUE)) {
    flush(text.slice(cursor, match.index))
    cues.push({ id: match[1].trim(), chunkIndex: chunks.length })
    cursor = match.index + match[0].length
  }
  flush(text.slice(cursor))
  return { plain: chunks.join(' '), chunks, cues }
}

/** Problems with the marker syntax itself (unbalanced brackets, empty ids). */
export function narrationCueProblems(text: string): string[] {
  const problems: string[] = []
  const stripped = text.replace(CUE, '')
  if (stripped.includes('[[') || stripped.includes(']]')) problems.push('Unbalanced "[[" or "]]" in narration.')
  for (const match of text.matchAll(CUE)) {
    if (!match[1].trim()) problems.push('Empty cue "[[]]".')
  }
  return problems
}

/**
 * The voice model sometimes stretches or garbles a short phrase (a one-word
 * chunk once took 2.7 s). A phrase is suspect when it is much longer than its
 * text should take: more than max(1.2 s, 0.18 s per character).
 */
export function chunkLooksWrong(text: string, seconds: number) {
  return seconds > Math.max(1.2, text.length * 0.18)
}

/**
 * Cue id -> seconds from the start of the scene's audio, given each chunk's
 * measured duration and the silence inserted between chunks.
 */
export function resolveCueTimes(
  parsed: ParsedNarration,
  chunkSeconds: number[],
  gapSeconds: number,
): Record<string, number> {
  const starts: number[] = []
  let cursor = 0
  for (const seconds of chunkSeconds) {
    starts.push(cursor)
    cursor += seconds + gapSeconds
  }
  const end = Math.max(0, cursor - gapSeconds)
  const times: Record<string, number> = {}
  for (const cue of parsed.cues) {
    times[cue.id] = cue.chunkIndex < starts.length ? starts[cue.chunkIndex] : end
  }
  return times
}

export interface NarrationWords {
  words: string[]
  /** Cue id -> index of the first word after it (words.length = after the last word). */
  cues: { id: string; wordIndex: number }[]
}

/** The spoken words of a narration, and where each cue falls among them. */
export function narrationWords(text: string): NarrationWords {
  const parsed = parseNarration(text)
  const words: string[] = []
  const chunkStart: number[] = []
  for (const chunk of parsed.chunks) {
    chunkStart.push(words.length)
    words.push(...chunk.split(' ').filter(Boolean))
  }
  return { words, cues: parsed.cues.map((cue) => ({ id: cue.id, wordIndex: cue.chunkIndex < chunkStart.length ? chunkStart[cue.chunkIndex] : words.length })) }
}

const ABBREVIATIONS = new Set(['e.g.', 'i.e.', 'vs.', 'etc.', 'mr.', 'mrs.', 'dr.', 'approx.', 'fig.', 'no.'])
const SENTENCE_END = /[.!?]["')\]]*$/
const MIN_SENTENCE_WORDS = 4
const MAX_SENTENCE_CHARS = 210

/**
 * Groups words into the units the voice speaks in one go. Whole sentences keep
 * natural intonation (a chunk cut mid-sentence ends on a falling pitch), so cues
 * no longer split speech: their times come from the aligned words instead.
 * Very short sentences join their neighbour (the voice garbles one- and
 * two-word utterances) and very long ones split at a clause boundary.
 */
export function splitSentences(words: string[]): { start: number; end: number }[] {
  const ends = (index: number) => {
    const word = words[index]
    if (!SENTENCE_END.test(word) || ABBREVIATIONS.has(word.toLowerCase())) return false
    const next = words[index + 1]
    return next === undefined || /^["'([]?[A-Z0-9]/.test(next)
  }
  let groups: { start: number; end: number }[] = []
  let start = 0
  words.forEach((_, index) => {
    if (ends(index) || index === words.length - 1) { groups.push({ start, end: index + 1 }); start = index + 1 }
  })
  // Split overlong sentences at the clause boundary nearest the middle.
  groups = groups.flatMap((group) => {
    const text = words.slice(group.start, group.end).join(' ')
    if (text.length <= MAX_SENTENCE_CHARS) return [group]
    const breaks = [...Array(group.end - group.start - 1).keys()].map((i) => group.start + i).filter((i) => /[,;:]$/.test(words[i]))
    if (!breaks.length) return [group]
    const middle = (group.start + group.end) / 2
    const at = breaks.reduce((best, candidate) => (Math.abs(candidate + 1 - middle) < Math.abs(best + 1 - middle) ? candidate : best)) + 1
    return [{ start: group.start, end: at }, { start: at, end: group.end }]
  })
  const merged: { start: number; end: number }[] = []
  for (const group of groups) {
    const previous = merged[merged.length - 1]
    if (previous && (group.end - group.start < MIN_SENTENCE_WORDS || previous.end - previous.start < MIN_SENTENCE_WORDS)) previous.end = group.end
    else merged.push({ ...group })
  }
  return merged
}
