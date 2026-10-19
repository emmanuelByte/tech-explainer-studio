import { contentHeight, type FrameSpec } from './frame'
import { fitText as fitTextFull, GLYPH_WIDTH as GLYPHS } from './textFit'
import type { SpecSequence } from './types'

const GLYPH_WIDTH = GLYPHS.mono
const fitText = (text: string, width: number, maxFont: number, minFont: number, maxLines: number) => {
  const fitted = fitTextFull(text, width, maxFont, minFont, maxLines, GLYPH_WIDTH)
  return { lines: fitted.lines, font: fitted.fontSize }
}

/**
 * Pure geometry for a sequence diagram. All numbers are on-screen pixels
 * relative to the panel centre; the compiler scales the finished panel to fit
 * the canvas, so the same semantic sequence works in 16:9 and 9:16.
 */

const PANEL_MAX_WIDTH = 1180
/** Breathing room kept between a panel and the edge of its content area. */
const PANEL_SIDE_MARGIN = 80
const PADDING = 40
const HEADER_HEIGHT = 76
const HEADER_GAP = 28
const HEADER_MAX_WIDTH = 190
const ROW_PADDING = 30
const ARROW_BAND = 22
const LABEL_FONT_MAX = 24
const LABEL_FONT_MIN = 18
const HEADER_FONT_MAX = 22
const LABEL_LINE_HEIGHT = 1.25
const LABEL_MAX_LINES = 3

export interface SequenceParticipantGeometry {
  id: string
  x: number
  headerWidth: number
  headerHeight: number
  headerY: number
  labelLines: string[]
  labelFontSize: number
  lifelineTop: number
  lifelineBottom: number
}

export interface SequenceMessageGeometry {
  id: string
  kind: 'sync' | 'async' | 'response'
  fromX: number
  toX: number
  /** Y of the arrow line. */
  y: number
  labelLines: string[]
  labelFontSize: number
  labelX: number
  /** Centre Y of the label block, above the arrow. */
  labelY: number
  labelWidth: number
  labelHeight: number
}

export interface SequenceGeometry {
  width: number
  height: number
  /** Multiplier (<= 1) that makes the panel fit the available area. */
  fit: number
  participants: SequenceParticipantGeometry[]
  messages: SequenceMessageGeometry[]
}

/** The most a sequence's vertical spacing is opened up to use spare room (portrait has plenty). */
const MAX_STRETCH = 1.9
/** Share of the content area a stretched sequence should aim to fill. */
const TARGET_FILL = 0.72

/**
 * Lays the sequence out at natural spacing, then, when the frame has room to
 * spare, opens the row spacing up so a short sequence does not sit as a thin
 * band in a tall frame.
 */
export function layoutSequence(sequence: SpecSequence, frame: FrameSpec): SequenceGeometry {
  const natural = layoutWithStretch(sequence, frame, 1)
  const room = (contentHeight(frame) - PANEL_SIDE_MARGIN) * TARGET_FILL
  const stretch = Math.max(1, Math.min(MAX_STRETCH, room / natural.height))
  return stretch > 1.05 ? layoutWithStretch(sequence, frame, stretch) : natural
}

function layoutWithStretch(sequence: SpecSequence, frame: FrameSpec, stretch: number): SequenceGeometry {
  const rowPadding = ROW_PADDING * stretch
  const headerGap = HEADER_GAP * Math.sqrt(stretch)
  const count = sequence.participants.length
  const width = Math.min(PANEL_MAX_WIDTH, frame.overlayMaxWidth)
  const usable = width - 2 * PADDING
  const headerWidth = Math.min(HEADER_MAX_WIDTH, Math.floor(usable / count) - 16)
  const step = count > 1 ? (usable - headerWidth) / (count - 1) : 0
  const centreX = (index: number) => -usable / 2 + headerWidth / 2 + index * step

  const rowHeights: number[] = []
  const headerTop = PADDING
  const rowsTop = headerTop + HEADER_HEIGHT + headerGap
  const xOf = new Map(sequence.participants.map((participant, index) => [participant.id, centreX(index)]))

  const messages: SequenceMessageGeometry[] = []
  let cursor = rowsTop
  for (const message of sequence.messages) {
    const fromX = xOf.get(message.from) ?? 0
    const toX = xOf.get(message.to) ?? 0
    const span = Math.abs(toX - fromX)
    // Prefer to sit between the two lifelines; a long label may wrap, shrink, or (last resort) widen up to the panel.
    const room = Math.max(span - 24, headerWidth)
    const { lines, font } = fitText(message.label, Math.min(room, usable), LABEL_FONT_MAX * frame.overlayTextScale, LABEL_FONT_MIN, LABEL_MAX_LINES)
    const labelHeight = lines.length * font * LABEL_LINE_HEIGHT
    const labelWidth = Math.max(...lines.map((line) => line.length)) * font * GLYPH_WIDTH + 16
    const rowHeight = labelHeight + rowPadding + ARROW_BAND
    const y = cursor + labelHeight + rowPadding / 2 + ARROW_BAND / 2
    const middle = (fromX + toX) / 2
    // Keep a widened label inside the panel.
    const limit = width / 2 - PADDING / 2 - labelWidth / 2
    messages.push({
      id: message.id,
      kind: message.kind ?? 'sync',
      fromX,
      toX,
      y,
      labelLines: lines,
      labelFontSize: font,
      labelX: Math.max(-limit, Math.min(limit, middle)),
      labelY: cursor + rowPadding / 4 + labelHeight / 2,
      labelWidth,
      labelHeight,
    })
    rowHeights.push(rowHeight)
    cursor += rowHeight
  }

  const bottom = cursor + PADDING / 2
  const height = bottom + PADDING / 2
  const participants = sequence.participants.map((participant, index): SequenceParticipantGeometry => {
    const { lines, font } = fitText(participant.label, headerWidth - 16, HEADER_FONT_MAX * frame.overlayTextScale, 15, 2)
    return {
      id: participant.id,
      x: centreX(index),
      headerWidth,
      headerHeight: HEADER_HEIGHT,
      headerY: headerTop + HEADER_HEIGHT / 2,
      labelLines: lines,
      labelFontSize: font,
      lifelineTop: headerTop + HEADER_HEIGHT,
      lifelineBottom: bottom,
    }
  })

  const fit = Math.min(1, (contentHeight(frame) - PANEL_SIDE_MARGIN) / height)
  // Re-centre vertically: callers place the panel with its centre at the origin.
  const shift = height / 2
  for (const participant of participants) {
    participant.headerY -= shift
    participant.lifelineTop -= shift
    participant.lifelineBottom -= shift
  }
  for (const message of messages) {
    message.y -= shift
    message.labelY -= shift
  }
  return { width, height, fit, participants, messages }
}

/** Arrow outline in the local space of a layer of size (|toX-fromX|, ARROW_BAND), pointing at the target end. */
export function arrowPath(kind: SequenceMessageGeometry['kind'], fromX: number, toX: number): { d: string; width: number; height: number } {
  const width = Math.abs(toX - fromX)
  const height = ARROW_BAND
  const mid = height / 2
  const forward = toX >= fromX
  const tip = forward ? width : 0
  const back = forward ? -1 : 1
  const head = 16
  const wing = 9
  const baseX = tip + back * head
  const parts: string[] = []
  if (kind === 'response') {
    // Dashed shaft, drawn as separate segments (the renderer has no dash style on paths).
    const dash = 14
    const gap = 9
    const start = forward ? 0 : width
    const direction = forward ? 1 : -1
    const end = baseX
    for (let at = 0; ; at += dash + gap) {
      const from = start + direction * at
      if ((end - from) * direction <= 0) break
      const to = Math.abs(end - from) < dash ? end : from + direction * dash
      parts.push(`M ${round(from)} ${mid} L ${round(to)} ${mid}`)
    }
  } else {
    parts.push(`M ${forward ? 0 : width} ${mid} L ${round(baseX)} ${mid}`)
  }
  if (kind === 'sync') parts.push(`M ${tip} ${mid} L ${round(baseX)} ${mid - wing} L ${round(baseX)} ${mid + wing} Z`)
  else parts.push(`M ${round(baseX)} ${mid - wing} L ${tip} ${mid} L ${round(baseX)} ${mid + wing}`)
  return { d: parts.join(' '), width, height }
}

const round = (value: number) => Math.round(value * 100) / 100

export const SEQUENCE_ARROW_BAND = ARROW_BAND
