import { DEFAULT_TRANSFORM, type CameraKeyframe, type Keyframe, type Layer, type LayerType } from '../../types'
import { contentCentreOffset, contentHeight } from './frame'
import { baseLayer, staticKeyframe, type BuildContext } from './layerKit'
import { arrowPath, layoutSequence } from './sequence'
import { fitText, GLYPH_WIDTH, wrapWords } from './textFit'
import type { SpecBullets, SpecCard, SpecComparison, SpecSequence } from './types'

/**
 * Overlays are drawn in world coordinates at the centre of the scene's camera
 * framing and scaled by 1/zoom, so they keep a fixed on-screen size over a
 * backdrop that dims the diagram. Sizes are on-screen pixels for the frame's
 * native format (scaled by `frame.unit`), and every panel shrinks to fit the
 * content area above the captions, so one semantic lesson serves 16:9 and 9:16.
 */

type LayerOverrides = Partial<Layer>

interface Scaffold {
  group: Layer
  child: (id: string, type: LayerType, offsetX: number, offsetY: number, overrides: LayerOverrides, keyframes?: Keyframe[]) => Layer
  /** Keyframes that hold a child invisible until `frame`, then fade it in. */
  fadeIn: (frame: number, offsetX: number, offsetY: number) => Keyframe[]
  backdrop: Layer
}

function scaffold(
  ctx: BuildContext,
  framing: CameraKeyframe,
  spec: { groupId: string; name: string; width: number; height: number; fit: number; start: number; end: number; revealAt: number },
): Scaffold {
  const { frame, theme } = ctx
  const { groupId, start, end, revealAt } = spec
  const x = framing.x - frame.width / 2
  const y = framing.y - frame.height / 2 + contentCentreOffset(frame) / framing.zoom
  const scale = spec.fit / framing.zoom
  const timing = { startFrame: start, endFrame: end }
  const at = (opacity: number) => ({ ...DEFAULT_TRANSFORM, x, y, scale, opacity })
  const group = baseLayer(theme, 'group', {
    id: groupId, name: spec.name, width: spec.width, height: spec.height, ...timing,
    keyframes: [
      { frame: start, easing: 'linear', props: at(0) },
      { frame: revealAt, easing: 'ease-out', props: at(0) },
      { frame: revealAt + theme.motion.cardFadeFrames, easing: 'linear', props: at(1) },
      { frame: end - theme.motion.cardFadeFrames, easing: 'ease-in', props: at(1) },
      { frame: end, easing: 'linear', props: at(0) },
    ],
  })
  const child: Scaffold['child'] = (id, type, offsetX, offsetY, overrides, keyframes) => baseLayer(theme, type, {
    id: `${groupId}__${id}`, parentId: groupId, ...timing,
    keyframes: keyframes ?? staticKeyframe(start, offsetX, offsetY), ...overrides,
  } as Parameters<typeof baseLayer>[2])
  const fadeIn: Scaffold['fadeIn'] = (frameAt, offsetX, offsetY) => {
    const shown = { ...DEFAULT_TRANSFORM, x: offsetX, y: offsetY }
    return [
      { frame: start, easing: 'linear', props: { ...shown, opacity: 0 } },
      { frame: frameAt, easing: 'ease-out', props: { ...shown, opacity: 0 } },
      { frame: frameAt + theme.motion.cardFadeFrames, easing: 'ease-out', props: shown },
    ]
  }
  const backdrop = child('backdrop', 'rectangle', 0, 0, { name: 'Backdrop', width: 8000, height: 6000, fillColor: theme.colors.cardBackdrop })
  return { group, child, fadeIn, backdrop }
}

/** Largest scale (<= 1) at which a panel fits the content area above the captions. */
function fitScale(ctx: BuildContext, width: number, height: number) {
  const margin = 40 * ctx.frame.unit
  return Math.min(1, (contentHeight(ctx.frame) - margin) / height, (ctx.frame.width - margin) / width)
}

const LINE_HEIGHT_RATIO = 1.57
const MAX_FONT = 28
const MIN_FONT = 20
/** Below this size a row is wrapped onto a second line rather than shrunk further. */
const COMFORT_FONT = 24

interface WrappedRow {
  lines: string[]
  frame: number
}

/** One font for the whole panel: the largest at which every row stays on one line, else the largest at which none exceeds two. */
function fitRows(rows: string[], innerWidth: number, glyph: number, maxFont = MAX_FONT) {
  for (let font = maxFont; font >= COMFORT_FONT; font -= 1) {
    const maxChars = Math.floor(innerWidth / (glyph * font))
    if (rows.every((row) => row.length <= maxChars)) return { font, wrapped: rows.map((row) => [row]) }
  }
  for (let font = maxFont; font >= MIN_FONT; font -= 1) {
    const maxChars = Math.floor(innerWidth / (glyph * font))
    const wrapped = rows.map((row) => wrapWords(row, maxChars))
    if (wrapped.every((lines) => lines.length <= 2 && lines.every((line) => line.length <= maxChars))) return { font, wrapped }
  }
  const maxChars = Math.max(1, Math.floor(innerWidth / (glyph * MIN_FONT)))
  return { font: MIN_FONT, wrapped: rows.map((row) => wrapWords(row, maxChars)) }
}

interface TextPanelOptions {
  groupId: string
  name: string
  title?: string
  rows: string[]
  rowFrames: number[]
  font: 'mono' | 'sans'
  accent: string
  panelColor: string
  /** Prefix wrapped continuation lines so they hang under the first line's text. */
  hangingIndent?: string
  width: number
  fit?: number
}

/** A titled panel whose rows appear one by one on their frames. Rows wrap, and rows below grow to make room. */
function textPanel(
  ctx: BuildContext,
  framing: CameraKeyframe,
  timing: { start: number; end: number; revealAt: number },
  options: TextPanelOptions,
): Layer[] {
  const { theme, frame } = ctx
  const { spacing: SPACE, colors: COLORS, typography: TYPE } = theme
  const unit = frame.unit
  const padding = SPACE.cardPadding * unit
  const titleHeight = options.title ? SPACE.cardTitleHeight * unit * frame.overlayTextScale : 0
  const innerWidth = options.width - 2 * padding
  const glyph = options.font === 'mono' ? GLYPH_WIDTH.mono : GLYPH_WIDTH.sans
  const fitted = fitRows(options.rows, innerWidth, glyph, MAX_FONT * unit * frame.overlayTextScale)
  const lineHeight = fitted.font * LINE_HEIGHT_RATIO
  const rows: WrappedRow[] = fitted.wrapped.map((lines, index) => ({
    lines: lines.map((line, lineIndex) => (lineIndex > 0 && options.hangingIndent ? `${options.hangingIndent}${line}` : line)),
    frame: options.rowFrames[index],
  }))
  const bodyHeight = rows.reduce((sum, row) => sum + row.lines.length * lineHeight, 0)
  const height = padding * 2 + titleHeight + bodyHeight
  const s = scaffold(ctx, framing, {
    groupId: options.groupId, name: options.name, width: options.width, height,
    fit: options.fit ?? fitScale(ctx, options.width, height), ...timing,
  })
  const top = -height / 2
  const layers: Layer[] = [
    s.group,
    s.backdrop,
    s.child('panel', 'rectangle', 0, 0, {
      name: 'Panel', width: options.width, height, fillColor: options.panelColor,
      strokeEnabled: true, strokeColor: options.accent, strokeWidth: 2, borderRadius: 20,
    }),
  ]
  if (options.title) {
    layers.push(s.child('title', 'text', 0, top + padding + titleHeight / 2, {
      name: 'Title', text: options.title, width: innerWidth, height: titleHeight,
      fontSize: 32 * unit * frame.overlayTextScale, fontWeight: '700', textColor: options.accent === COLORS.accent ? COLORS.mutedText : options.accent, textAlign: 'left', htmlText: true, htmlWhiteSpace: 'pre',
    }))
  }
  let cursor = top + padding + titleHeight
  rows.forEach((row, index) => {
    const rowHeight = row.lines.length * lineHeight
    const offsetY = cursor + rowHeight / 2
    cursor += rowHeight
    layers.push(s.child(`line${index + 1}`, 'text', 0, offsetY, {
      name: `Line ${index + 1}`, text: row.lines.join('\n'), width: innerWidth, height: rowHeight,
      fontFamily: options.font === 'mono' ? TYPE.mono : TYPE.sans, fontSize: fitted.font, fontWeight: options.font === 'mono' ? '500' : '600',
      lineHeight: LINE_HEIGHT_RATIO, textColor: COLORS.cardText, textAlign: 'left', htmlText: true, htmlWhiteSpace: 'pre',
    }, s.fadeIn(row.frame, 0, offsetY)))
  })
  return layers
}

/** A code/request panel for one scene. */
export function cardLayers(ctx: BuildContext, card: SpecCard, framing: CameraKeyframe, start: number, end: number, cardStart: number, lineFrames: number[]): Layer[] {
  return textPanel(ctx, framing, { start, end, revealAt: cardStart }, {
    groupId: `card_${card.id}`, name: card.title ?? 'Card', title: card.title, rows: card.lines, rowFrames: lineFrames,
    font: 'mono', accent: ctx.theme.colors.accent, panelColor: ctx.theme.colors.panel,
    width: Math.min(ctx.theme.spacing.cardWidth * ctx.frame.unit, ctx.frame.overlayMaxWidth),
  })
}

/** Bullet/explanation cards reuse the card geometry and animation; the tone picks the accent. */
export function bulletLayers(ctx: BuildContext, bullets: SpecBullets, framing: CameraKeyframe, start: number, end: number, bulletStart: number, lineFrames: number[]): Layer[] {
  const accent = bullets.tone === 'positive' ? ctx.theme.colors.positive : bullets.tone === 'negative' ? ctx.theme.colors.negative : ctx.theme.colors.accent
  return textPanel(ctx, framing, { start, end, revealAt: bulletStart }, {
    groupId: `card_bullets_${bullets.id}`, name: bullets.title, title: bullets.title,
    rows: bullets.items.map((item) => `• ${item}`), rowFrames: lineFrames, hangingIndent: '  ',
    font: 'sans', accent, panelColor: ctx.theme.colors.panel,
    width: Math.min(ctx.theme.spacing.cardWidth * ctx.frame.unit, ctx.frame.overlayMaxWidth),
  })
}

/**
 * Two teaching columns. Landscape sets them side by side; portrait stacks them,
 * since two half-width columns would be too narrow to read.
 */
export function comparisonLayers(
  ctx: BuildContext,
  comparison: SpecComparison,
  framing: CameraKeyframe,
  start: number,
  end: number,
  comparisonStart: number,
  leftLineFrames: number[],
  rightLineFrames: number[],
): Layer[] {
  const { theme, frame } = ctx
  const { colors: COLORS, spacing: SPACE, typography: TYPE } = theme
  const unit = frame.unit
  const stacked = frame.orientation === 'portrait'
  const gap = SPACE.comparisonGap * unit
  const padding = SPACE.cardPadding * unit
  const titleHeight = SPACE.cardTitleHeight * unit * frame.overlayTextScale
  const panelWidth = stacked ? Math.min(frame.overlayMaxWidth, SPACE.comparisonPanelWidth * 2 * unit) : Math.min(SPACE.comparisonPanelWidth * unit, (frame.overlayMaxWidth - gap) / 2)
  const innerWidth = panelWidth - 2 * padding
  const sides = (['left', 'right'] as const).map((side) => ({
    side,
    data: comparison[side],
    frames: side === 'left' ? leftLineFrames : rightLineFrames,
    panelColor: side === 'left' ? COLORS.comparisonLeftPanel : COLORS.comparisonRightPanel,
    accent: side === 'left' ? COLORS.comparisonLeftAccent : COLORS.comparisonRightAccent,
  }))
  // Both sides share one font so the columns look like a pair.
  const rowsOf = (data: SpecComparison['left']) => data.lines.map((line) => `• ${line}`)
  const fitted = fitRows(sides.flatMap(({ data }) => rowsOf(data)), innerWidth, GLYPH_WIDTH.sans, MAX_FONT * unit * frame.overlayTextScale)
  const lineHeight = fitted.font * LINE_HEIGHT_RATIO
  const wrapRows = (data: SpecComparison['left']) => rowsOf(data).map((row) => wrapWords(row, Math.max(1, Math.floor(innerWidth / (GLYPH_WIDTH.sans * fitted.font)))).map((line, i) => (i > 0 ? `  ${line}` : line)))
  const built = sides.map((side) => {
    const wrapped = wrapRows(side.data)
    return { ...side, wrapped, height: padding * 2 + titleHeight + wrapped.reduce((sum, lines) => sum + lines.length * lineHeight, 0) }
  })
  const columnHeight = Math.max(...built.map((side) => side.height))
  const totalWidth = stacked ? panelWidth : panelWidth * 2 + gap
  const totalHeight = stacked ? built.reduce((sum, side) => sum + side.height, 0) + gap : columnHeight
  const s = scaffold(ctx, framing, {
    groupId: `comparison_${comparison.id}`, name: 'Comparison', width: totalWidth, height: totalHeight,
    fit: fitScale(ctx, totalWidth, totalHeight), start, end, revealAt: comparisonStart,
  })
  const layers: Layer[] = [s.group, s.backdrop]
  let stackTop = -totalHeight / 2
  built.forEach((side, sideIndex) => {
    const centreX = stacked ? 0 : (sideIndex === 0 ? -(panelWidth + gap) / 2 : (panelWidth + gap) / 2)
    const height = stacked ? side.height : columnHeight
    const centreY = stacked ? stackTop + height / 2 : 0
    const top = centreY - height / 2
    layers.push(
      s.child(`${side.side}-panel`, 'rectangle', centreX, centreY, {
        name: `${side.data.title} panel`, width: panelWidth, height, fillColor: side.panelColor,
        strokeEnabled: true, strokeColor: side.accent, strokeWidth: 2, borderRadius: 20,
      }),
      s.child(`${side.side}-title`, 'text', centreX, top + padding + titleHeight / 2, {
        name: `${side.data.title} title`, text: side.data.title, width: innerWidth, height: titleHeight,
        fontSize: 32 * unit * frame.overlayTextScale, fontWeight: '700', textColor: side.accent, textAlign: 'left',
      }),
    )
    let cursor = top + padding + titleHeight
    side.wrapped.forEach((lines, index) => {
      const rowHeight = lines.length * lineHeight
      const offsetY = cursor + rowHeight / 2
      cursor += rowHeight
      layers.push(s.child(`${side.side}-line${index + 1}`, 'text', centreX, offsetY, {
        name: `${side.data.title} line ${index + 1}`, text: lines.join('\n'), width: innerWidth, height: rowHeight,
        fontFamily: TYPE.sans, fontSize: fitted.font, fontWeight: '500', lineHeight: LINE_HEIGHT_RATIO, textColor: COLORS.cardText, textAlign: 'left',
        htmlText: true, htmlWhiteSpace: 'pre',
      }, s.fadeIn(side.frames[index], centreX, offsetY)))
    })
    stackTop += height + gap
  })
  return layers
}

/** Frames a message arrow takes to draw from sender to receiver. */
const ARROW_DRAW_FRAMES = 14

/**
 * A conventional sequence diagram: participant headers, dashed lifelines, and
 * real arrows (filled head = synchronous request, open head = asynchronous
 * message, dashed line = response) that draw in on their narration cue.
 */
export function sequenceLayers(
  ctx: BuildContext,
  sequence: SpecSequence,
  framing: CameraKeyframe,
  start: number,
  end: number,
  sequenceStart: number,
  messageFrames: number[],
): Layer[] {
  const { theme, frame } = ctx
  const { colors: COLORS, typography: TYPE, components: PALETTE } = theme
  const geometry = layoutSequence(sequence, frame)
  const groupId = `sequence_${sequence.id}`
  const s = scaffold(ctx, framing, {
    groupId, name: 'Sequence diagram', width: geometry.width, height: geometry.height, fit: geometry.fit, start, end, revealAt: sequenceStart,
  })
  const draw = (id: string, at: number): Layer['propertyKeyframes'] => ({
    drawProgress: [
      { id: `${id}_d0`, frame: start, value: 0, easing: 'linear' },
      { id: `${id}_d1`, frame: at, value: 0, easing: 'ease-out' },
      { id: `${id}_d2`, frame: at + ARROW_DRAW_FRAMES, value: 1, easing: 'linear' },
    ],
  })
  const palette = Object.values(PALETTE)
  const layers: Layer[] = [
    s.group,
    s.backdrop,
    s.child('panel', 'rectangle', 0, 0, { name: 'Sequence panel', width: geometry.width, height: geometry.height, fillColor: COLORS.panel, strokeEnabled: true, strokeColor: COLORS.accent, strokeWidth: 2, borderRadius: 20 }),
  ]
  // Lifelines sit under everything else in the panel; children stack last-on-top.
  for (const participant of geometry.participants) {
    const length = participant.lifelineBottom - participant.lifelineTop
    const centreY = participant.lifelineTop + length / 2
    layers.push(s.child(`lifeline-${participant.id}`, 'path', participant.x, centreY, {
      name: `${participant.id} lifeline`, width: 4, height: length, pathData: dashedVertical(length, 4), strokeEnabled: true,
      strokeColor: COLORS.lifeline, strokeWidth: 3, fillType: 'none', sketchEnabled: false,
      propertyKeyframes: draw(`${groupId}_${participant.id}`, sequenceStart),
    }, s.fadeIn(sequenceStart, participant.x, centreY)))
  }
  const labelLayers: Layer[] = []
  geometry.messages.forEach((message, index) => {
    const at = messageFrames[index]
    const colour = message.kind === 'async' ? COLORS.messageAsync : message.kind === 'response' ? COLORS.messageResponse : COLORS.messageSync
    const arrow = arrowPath(message.kind, message.fromX, message.toX)
    const centreX = (message.fromX + message.toX) / 2
    const shown = { ...DEFAULT_TRANSFORM, x: centreX, y: message.y }
    layers.push(
      // A panel-coloured patch behind the label keeps lifelines from striking through the text.
      s.child(`message-${message.id}-knockout`, 'rectangle', message.labelX, message.labelY, {
        name: `${message.id} label background`, width: message.labelWidth, height: message.labelHeight, fillColor: COLORS.panel, borderRadius: 6,
      }, s.fadeIn(at, message.labelX, message.labelY)),
      s.child(`message-${message.id}-arrow`, 'path', centreX, message.y, {
        name: `${message.id} arrow`, width: arrow.width, height: arrow.height, pathData: arrow.d, strokeEnabled: true,
        strokeColor: colour, strokeWidth: 4, fillType: message.kind === 'sync' ? 'solid' : 'none', fillColor: colour, sketchEnabled: false,
        propertyKeyframes: draw(`${groupId}_${message.id}`, at),
      }, [
        { frame: start, easing: 'linear', props: { ...shown, opacity: 0 } },
        { frame: at, easing: 'linear', props: { ...shown, opacity: 0 } },
        { frame: at + 1, easing: 'linear', props: shown },
      ]),
    )
    labelLayers.push(s.child(`message-${message.id}-label`, 'text', message.labelX, message.labelY, {
      name: `${message.id} label`, text: message.labelLines.join('\n'), width: message.labelWidth, height: message.labelHeight,
      fontFamily: TYPE.mono, fontSize: message.labelFontSize, fontWeight: '600', lineHeight: 1.25,
      textColor: message.kind === 'response' ? COLORS.messageResponse : COLORS.cardText, htmlText: true, htmlWhiteSpace: 'pre',
    }, s.fadeIn(at, message.labelX, message.labelY)))
  })
  layers.push(...labelLayers)
  geometry.participants.forEach((participant, index) => {
    const header = sequence.participants[index]
    const colours = palette[index % palette.length]
    layers.push(
      s.child(`participant-${participant.id}`, 'rectangle', participant.x, participant.headerY, {
        name: `${header.label} participant`, width: participant.headerWidth, height: participant.headerHeight,
        fillColor: colours.fill, strokeEnabled: true, strokeColor: colours.stroke, strokeWidth: 2, borderRadius: 12,
      }, s.fadeIn(sequenceStart, participant.x, participant.headerY)),
      s.child(`participant-${participant.id}-label`, 'text', participant.x, participant.headerY, {
        name: `${header.label} label`, text: participant.labelLines.join('\n'), width: participant.headerWidth - 12,
        height: Math.ceil(participant.labelLines.length * participant.labelFontSize * 1.15),
        fontSize: participant.labelFontSize, fontWeight: '700', lineHeight: 1.15, htmlText: true, htmlWhiteSpace: 'pre',
      }, s.fadeIn(sequenceStart, participant.x, participant.headerY)),
    )
  })
  return layers
}

/** A vertical dashed line of the given length, drawn in a layer of the given width. */
function dashedVertical(length: number, width: number) {
  const dash = 12
  const gap = 8
  const parts: string[] = []
  for (let at = 0; at < length; at += dash + gap) parts.push(`M ${width / 2} ${at} L ${width / 2} ${Math.min(length, at + dash)}`)
  return parts.join(' ')
}

/**
 * A silent title or closing card, centred on the frame and scaled by 1/zoom so
 * it keeps a fixed on-screen size. The intro is opaque and fades out; the outro
 * dims the diagram behind it and holds to the end of the video. Text wraps and
 * shrinks to the frame, so long titles work in portrait.
 */
export function titleCardLayers(
  ctx: BuildContext,
  id: string,
  title: string,
  subtitle: string | undefined,
  framing: CameraKeyframe,
  start: number,
  end: number,
  mode: 'intro' | 'outro',
): Layer[] {
  const { theme, frame } = ctx
  const { colors: COLORS } = theme
  const unit = frame.unit
  const x = framing.x - frame.width / 2
  const y = framing.y - frame.height / 2
  const scale = 1 / framing.zoom
  const groupId = `title_${id}`
  const timing = { startFrame: start, endFrame: end }
  const at = (opacity: number) => ({ ...DEFAULT_TRANSFORM, x, y, scale, opacity })
  const keyframes: Keyframe[] = [
    { frame: start, easing: 'ease-out', props: at(0) },
    { frame: start + theme.motion.cardFadeFrames, easing: 'linear', props: at(1) },
  ]
  if (mode === 'intro') {
    keyframes.push({ frame: end - theme.motion.cardFadeFrames, easing: 'ease-in', props: at(1) }, { frame: end, easing: 'linear', props: at(0) })
  }
  const boxWidth = Math.min(1600 * unit, frame.width - 120 * unit)
  const heading = fitText(title, boxWidth, (mode === 'intro' ? 84 : 64) * unit, 44 * unit, 3, GLYPH_WIDTH.sans)
  const headingHeight = heading.lines.length * heading.fontSize * 1.2
  const sub = subtitle ? fitText(subtitle, boxWidth, 40 * unit, 26 * unit, 2, GLYPH_WIDTH.sans) : undefined
  const subHeight = sub ? sub.lines.length * sub.fontSize * 1.3 : 0
  const gap = sub ? 28 * unit : 0
  const blockHeight = headingHeight + gap + subHeight
  const child = (name: string, type: LayerType, offsetY: number, overrides: LayerOverrides) => baseLayer(theme, type, {
    id: `${groupId}__${name}`, parentId: groupId, name, ...timing, keyframes: staticKeyframe(start, 0, offsetY), ...overrides,
  } as Parameters<typeof baseLayer>[2])
  const layers: Layer[] = [
    baseLayer(theme, 'group', { id: groupId, name: mode === 'intro' ? 'Title card' : 'Outro card', width: boxWidth, height: blockHeight, ...timing, keyframes }),
    child('backdrop', 'rectangle', 0, { width: 8000, height: 6000, fillColor: mode === 'intro' ? COLORS.introBackdrop : COLORS.outroBackdrop }),
    child('title', 'text', -blockHeight / 2 + headingHeight / 2, {
      text: heading.lines.join('\n'), width: boxWidth, height: headingHeight, fontSize: heading.fontSize, fontWeight: '800',
      lineHeight: 1.2, textColor: COLORS.text, htmlText: true, htmlWhiteSpace: 'pre',
    }),
  ]
  if (sub) {
    layers.push(child('subtitle', 'text', blockHeight / 2 - subHeight / 2, {
      text: sub.lines.join('\n'), width: boxWidth, height: subHeight, fontSize: sub.fontSize, fontWeight: '500',
      lineHeight: 1.3, textColor: COLORS.mutedText, htmlText: true, htmlWhiteSpace: 'pre',
    }))
  }
  return layers
}
