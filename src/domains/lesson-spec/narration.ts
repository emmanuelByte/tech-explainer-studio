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
