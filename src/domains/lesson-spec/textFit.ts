/**
 * Text measurement without a DOM. Glyph widths are deliberately generous so a
 * label that "fits" here never overruns its box when rendered.
 */
export const GLYPH_WIDTH = { mono: 0.6, sans: 0.56 } as const

/** Greedy word wrap; a word longer than a line is kept whole on its own line. */
export function wrapWords(text: string, maxChars: number): string[] {
  const lines: string[] = []
  let current = ''
  for (const word of text.trim().split(/\s+/)) {
    if (current && (current.length + 1 + word.length) > maxChars) {
      lines.push(current)
      current = word
    } else {
      current = current ? `${current} ${word}` : word
    }
  }
  if (current) lines.push(current)
  return lines
}

export interface FittedText {
  lines: string[]
  fontSize: number
  /** Estimated width of the widest line. */
  width: number
}

/** Largest font (down to `minFont`) at which `text` wraps into at most `maxLines` lines no wider than `width`. */
export function fitText(text: string, width: number, maxFont: number, minFont: number, maxLines: number, glyph: number = GLYPH_WIDTH.mono): FittedText {
  const measure = (lines: string[], fontSize: number): FittedText => ({ lines, fontSize, width: Math.max(...lines.map((line) => line.length)) * fontSize * glyph })
  for (let font = Math.floor(maxFont); font >= minFont; font -= 1) {
    const maxChars = Math.floor(width / (glyph * font))
    const lines = wrapWords(text, maxChars)
    if (lines.length <= maxLines && lines.every((line) => line.length <= maxChars)) return measure(lines, font)
  }
  // Nothing fits cleanly: take the minimum font and let the longest word set the width.
  return measure(wrapWords(text, Math.max(1, Math.floor(width / (glyph * minFont)))), minFont)
}
