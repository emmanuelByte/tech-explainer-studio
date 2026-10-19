import {
  DEFAULT_TRANSFORM,
  type CameraKeyframe,
  type Connector,
  type Keyframe,
  type Layer,
  type LayerType,
  type MotionProject,
  type PropertyKeyframe,
  type Scene,
  type ScriptSegment,
  type TechnicalComponentKind,
} from '../../types'
import { CURRENT_PROJECT_SCHEMA_VERSION } from '../project/migrations'
import { parseNarration } from './narration'
import { LESSON_THEME } from './theme'
import { SPEC_DEFAULTS, type LessonSpec, type NarrationManifest, type SpecBullets, type SpecCard, type SpecComparison, type SpecNode, type SpecScene, type SpecSequence } from './types'
import { computeRanks, validateLessonSpec } from './validate'

/** Raw SVG source per component kind; injected so this module stays free of Vite/Node imports. */
export type ComponentArtwork = Record<TechnicalComponentKind, string>

export interface CompileOptions {
  artwork: ComponentArtwork
  /** ISO timestamp; injected so compilation is deterministic. */
  now: string
  /** Real narration audio. When given, scene lengths and reveal times follow the audio. */
  narration?: NarrationManifest
}

export class LessonSpecError extends Error {
  constructor(public readonly issues: { path: string; message: string }[]) {
    super(`Invalid lesson spec:\n${issues.map((issue) => `  ${issue.path || '(root)'}: ${issue.message}`).join('\n')}`)
    this.name = 'LessonSpecError'
  }
}

const { spacing: SPACE, motion: MOTION, colors: COLORS, sketch: SKETCH, typography: TYPE, components: PALETTE } = LESSON_THEME
const { nodeWidth: NODE_WIDTH, nodeHeight: NODE_HEIGHT, columnStep: COLUMN_STEP, rowStep: ROW_STEP, cameraMarginX: CAMERA_MARGIN_X, cameraMarginY: CAMERA_MARGIN_Y, captionReserve: CAPTION_RESERVE, cardWidth: CARD_WIDTH, cardPadding: CARD_PADDING, cardTitleHeight: CARD_TITLE_HEIGHT, cardLineHeight: CARD_LINE_HEIGHT } = SPACE
const { nodeFadeFrames: NODE_FADE_FRAMES, edgeDrawFrames: EDGE_DRAW_FRAMES, revealLeadFrames: REVEAL_LEAD_FRAMES, cameraMoveFrames: CAMERA_MOVE_FRAMES, cardFadeFrames: CARD_FADE_FRAMES, emphasisRampFrames: EMPHASIS_RAMP_FRAMES, emphasisScale: EMPHASIS_SCALE, emphasisGlowBlur: EMPHASIS_GLOW_BLUR, emphasisGlowSpread: EMPHASIS_GLOW_SPREAD, titleSeconds: DEFAULT_TITLE_SECONDS } = MOTION
const MAX_CAMERA_ZOOM = 2
const WORDS_PER_SECOND = 2.5
/** Silence before the voice starts and after it ends, per scene. */
const NARRATION_LEAD_SECONDS = 0.5
const NARRATION_TAIL_SECONDS = 0.7

function svgDataUrl(svg: string) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

/** Mirrors the editor's makeLayer defaults, minus its randomness, so output is deterministic. */
function baseLayer(type: LayerType, overrides: Partial<Layer> & Pick<Layer, 'id' | 'name' | 'startFrame' | 'endFrame' | 'keyframes'>): Layer {
  const layer: Layer = {
    type,
    visible: true,
    locked: false,
    parentId: null,
    collapsed: false,
    isGroup: type === 'group',
    autoFit: false,
    clipChildren: false,
    width: 200,
    height: 140,
    sizeMode: 'fixed',
    layoutMode: 'none',
    layoutDirection: 'row',
    layoutGap: 12,
    layoutPadding: 16,
    layoutAlign: 'center',
    layoutJustify: 'start',
    gridColumns: 2,
    fillType: type === 'text' || type === 'group' ? 'none' : 'solid',
    fillColor: type === 'text' || type === 'group' ? 'transparent' : COLORS.accentMuted,
    gradientStops: [{ color: COLORS.accentMuted, position: 0 }, { color: COLORS.accentSecondary, position: 100 }],
    gradientAngle: 135,
    strokeEnabled: false,
    strokeColor: COLORS.text,
    strokeWidth: 0,
    strokeTopWidth: 0,
    strokeRightWidth: 0,
    strokeBottomWidth: 0,
    strokeLeftWidth: 0,
    strokeWidthLinked: true,
    borderRadius: 0,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    borderBottomRightRadius: 0,
    borderBottomLeftRadius: 0,
    borderRadiusLinked: true,
    pathClosed: false,
    sketchEnabled: SKETCH.enabled,
    sketchRoughness: SKETCH.roughness,
    shadowEnabled: false,
    shadowColor: COLORS.shadow,
    shadowFollowsPerspective: false,
    text: '',
    fontFamily: TYPE.sans,
    fontSize: 48,
    fontWeight: '600',
    textAlign: 'center',
    letterSpacing: 0,
    lineHeight: 1.2,
    textColor: COLORS.text,
    textSpans: [],
    textRevealMode: 'plain',
    imageFit: 'contain',
    svgStrokeColor: COLORS.text,
    svgFillColor: COLORS.text,
    svgFillEnabled: false,
    svgStrokeWidth: 2,
    scope: 'global',
    ...overrides,
  }
  // The editor draws per-side borders and per-corner radii, so a plain width/radius must set all of them.
  if (overrides.strokeWidth !== undefined && overrides.strokeTopWidth === undefined) {
    layer.strokeTopWidth = layer.strokeRightWidth = layer.strokeBottomWidth = layer.strokeLeftWidth = overrides.strokeWidth
  }
  if (overrides.borderRadius !== undefined && overrides.borderTopLeftRadius === undefined) {
    layer.borderTopLeftRadius = layer.borderTopRightRadius = layer.borderBottomRightRadius = layer.borderBottomLeftRadius = overrides.borderRadius
  }
  return layer
}

function staticKeyframe(frame: number, x: number, y: number): Keyframe[] {
  return [{ frame, easing: 'ease-out', props: { ...DEFAULT_TRANSFORM, x, y } }]
}

function sceneFrames(scene: SpecScene, fps: number) {
  const words = parseNarration(scene.narration).plain.split(/\s+/).length
  const seconds = scene.durationSeconds ?? Math.max(4, Math.ceil(words / WORDS_PER_SECOND) + 1)
  return Math.round(seconds * fps)
}

export interface NodePlacement {
  x: number
  y: number
}

/** Left-to-right layered layout, computed once for the whole lesson so positions never jump between scenes. */
export function layoutNodes(spec: Pick<LessonSpec, 'nodes' | 'edges'>, canvas: { width: number; height: number } = SPEC_DEFAULTS): Map<string, NodePlacement> {
  const ranks = computeRanks(spec)
  if (!ranks) throw new LessonSpecError([{ path: 'edges', message: 'Edges form a cycle.' }])
  const columns = Math.max(...ranks.values()) + 1
  const byRank = new Map<number, SpecNode[]>()
  for (const node of spec.nodes) {
    const rank = ranks.get(node.id) ?? 0
    byRank.set(rank, [...(byRank.get(rank) ?? []), node])
  }
  const placements = new Map<string, NodePlacement>()
  const portrait = canvas.height > canvas.width
  for (const [rank, members] of byRank) {
    members.forEach((node, index) => {
      placements.set(node.id, {
        // Portrait is composed top-to-bottom, retaining full-size components
        // and letting the camera move between ranks instead of shrinking text.
        x: portrait ? (index - (members.length - 1) / 2) * ROW_STEP : (rank - (columns - 1) / 2) * COLUMN_STEP,
        y: portrait ? (rank - (columns - 1) / 2) * Math.max(280, ROW_STEP + 80) : (index - (members.length - 1) / 2) * ROW_STEP,
      })
    })
  }
  return placements
}

function nodeLayers(
  node: SpecNode,
  placement: NodePlacement,
  revealFrame: number,
  hideFrame: number | undefined,
  emphasis: { start: number; end: number }[],
  totalFrames: number,
  artwork: ComponentArtwork,
): Layer[] {
  const palette = PALETTE[node.kind]
  const groupId = `node_${node.id}`
  const hidden = { ...DEFAULT_TRANSFORM, x: placement.x, y: placement.y, opacity: 0, scale: 0.92 }
  const shown = { ...DEFAULT_TRANSFORM, x: placement.x, y: placement.y }
  const keyframes: Keyframe[] = revealFrame <= 0
    ? [{ frame: 0, easing: 'ease-out', props: shown }]
    : [
      { frame: 0, easing: 'linear', props: hidden },
      { frame: revealFrame, easing: 'ease-out', props: hidden },
      { frame: revealFrame + NODE_FADE_FRAMES, easing: 'ease-out', props: shown },
    ]
  // Emphasis: a slight scale bump here and a glow on the body (below) for the rest of a scene.
  const ranges = emphasis
    .map((range) => ({ start: Math.max(range.start, revealFrame + NODE_FADE_FRAMES), end: Math.min(range.end, hideFrame ?? Infinity) }))
    .filter((range) => range.end - range.start > 2 * EMPHASIS_RAMP_FRAMES)
  for (const range of ranges) {
    keyframes.push(
      { frame: range.start, easing: 'ease-out', props: shown },
      { frame: range.start + EMPHASIS_RAMP_FRAMES, easing: 'linear', props: { ...shown, scale: EMPHASIS_SCALE } },
      { frame: range.end - EMPHASIS_RAMP_FRAMES, easing: 'ease-in', props: { ...shown, scale: EMPHASIS_SCALE } },
      { frame: range.end, easing: 'linear', props: shown },
    )
  }
  if (hideFrame !== undefined) {
    keyframes.push(
      { frame: hideFrame, easing: 'ease-in', props: shown },
      { frame: hideFrame + NODE_FADE_FRAMES, easing: 'ease-in', props: hidden },
    )
  }
  const timing = { startFrame: 0, endFrame: totalFrames }
  const group = baseLayer('group', {
    id: groupId,
    name: node.label,
    width: NODE_WIDTH,
    height: NODE_HEIGHT,
    technicalComponent: { kind: node.kind, version: 1 },
    ...timing,
    keyframes,
  })
  const body = baseLayer('rectangle', {
    id: `${groupId}__body`,
    name: `${node.label} body`,
    parentId: groupId,
    width: 220,
    height: 120,
    fillColor: palette.fill,
    strokeEnabled: true,
    strokeColor: palette.stroke,
    strokeWidth: 2,
    borderRadius: 16,
    ...(ranges.length ? {
      shadowEnabled: true,
      shadowColor: palette.stroke,
      propertyKeyframes: {
        shadowBlur: glowKeyframes(`${groupId}_blur`, ranges, EMPHASIS_GLOW_BLUR),
        shadowSpread: glowKeyframes(`${groupId}_spread`, ranges, EMPHASIS_GLOW_SPREAD),
      },
    } : {}),
    ...timing,
    keyframes: [{ frame: 0, easing: 'ease-out', props: { ...DEFAULT_TRANSFORM, shadowBlur: 0, shadowY: 0, shadowSpread: 0 } }],
  })
  const art = baseLayer('image', {
    id: `${groupId}__artwork`,
    name: `${node.label} artwork`,
    parentId: groupId,
    src: svgDataUrl(artwork[node.kind]),
    imageKind: 'svg',
    imageFit: 'contain',
    imageNaturalWidth: 240,
    imageNaturalHeight: 150,
    width: 150,
    height: 70,
    svgStrokeColor: palette.stroke,
    svgFillColor: palette.stroke,
    svgFillEnabled: false,
    svgStrokeWidth: 3,
    ...timing,
    keyframes: staticKeyframe(0, 0, -14),
  })
  const label = baseLayer('text', {
    id: `${groupId}__label`,
    name: `${node.label} label`,
    parentId: groupId,
    text: node.label,
    width: 216,
    height: 36,
    fontSize: 22,
    fontWeight: '700',
    ...timing,
    keyframes: staticKeyframe(0, 0, 38),
  })
  return [group, body, art, label]
}

/** Compiles a validated lesson spec into a complete, normal, editable MotionProject. */
export function compileLessonSpec(input: unknown, options: CompileOptions): MotionProject {
  const issues = validateLessonSpec(input)
  if (issues.length) throw new LessonSpecError(issues)
  const spec = input as LessonSpec

  const width = spec.canvas?.width ?? SPEC_DEFAULTS.width
  const height = spec.canvas?.height ?? SPEC_DEFAULTS.height
  const fps = spec.canvas?.fps ?? SPEC_DEFAULTS.fps
  const placements = layoutNodes(spec, { width, height })

  // Timeline: scenes are consecutive ranges; every reveal lands inside its scene.
  const scenes: Scene[] = []
  const segments: ScriptSegment[] = []
  const revealFrame = new Map<string, number>()
  const hideFrame = new Map<string, number>()
  const framings: CameraKeyframe[] = []
  const narrationLayers: Layer[] = []
  const cardLayerSets: Layer[] = []
  const comparisonLayerSets: Layer[] = []
  const bulletLayerSets: Layer[] = []
  const sequenceLayerSets: Layer[] = []
  const titleLayerSets: Layer[] = []
  const emphasis = new Map<string, { start: number; end: number }[]>()
  const flowRange = new Map<string, { start: number; end: number }>()
  let visibleNodes: string[] = []
  let cursor = 0

  if (spec.intro) {
    const introFrames = Math.round((spec.intro.seconds ?? DEFAULT_TITLE_SECONDS) * fps)
    const framing = cameraFor([], placements, 0, width, height)
    framings.push(framing)
    scenes.push({ id: 'scene_intro', title: spec.title, startFrame: 0, endFrame: introFrames, scriptSegmentIds: [], transitionIn: 0, transitionOut: 0 })
    titleLayerSets.push(...titleCardLayers('intro', spec.title, spec.intro.subtitle, framing, { width, height }, 0, introFrames, 'intro'))
    cursor = introFrames
  }

  for (const specScene of spec.scenes) {
    const parsed = parseNarration(specScene.narration)
    const audio = options.narration?.scenes[specScene.id]
    if (options.narration && !audio) {
      throw new LessonSpecError([{ path: `scenes.${specScene.id}`, message: 'No narration audio for this scene; run `lesson narrate`.' }])
    }
    if (audio && audio.source !== specScene.narration) {
      throw new LessonSpecError([{ path: `scenes.${specScene.id}.narration`, message: 'Narration text changed since its audio was made; run `lesson narrate`.' }])
    }
    const leadFrames = Math.round(NARRATION_LEAD_SECONDS * fps)
    const length = audio
      ? Math.round((NARRATION_LEAD_SECONDS + audio.durationSeconds + NARRATION_TAIL_SECONDS) * fps)
      : sceneFrames(specScene, fps)
    const start = cursor
    const end = start + length
    const audioStart = start + leadFrames
    const reveals = specScene.reveal ?? []
    const usable = Math.max(0, Math.floor(length * 0.75) - REVEAL_LEAD_FRAMES)
    // A cue pins an element to the moment its words begin; otherwise reveals are spread evenly.
    const cueFrame = (id: string) => (audio?.cues[id] === undefined ? undefined : audioStart + Math.round(audio.cues[id] * fps))
    reveals.forEach((id, index) => {
      revealFrame.set(id, cueFrame(id) ?? start + REVEAL_LEAD_FRAMES + Math.floor((index * usable) / Math.max(1, reveals.length)))
      if (placements.has(id)) visibleNodes.push(id)
    })
    for (const id of specScene.hide ?? []) {
      hideFrame.set(id, cueFrame(id) ?? start + REVEAL_LEAD_FRAMES)
      visibleNodes = visibleNodes.filter((candidate) => candidate !== id)
    }

    for (const id of specScene.emphasize ?? []) {
      emphasis.set(id, [...(emphasis.get(id) ?? []), { start: cueFrame(`emphasize:${id}`) ?? audioStart, end }])
    }
    for (const id of specScene.flow ?? []) {
      const ready = (revealFrame.get(id) ?? 0) + EDGE_DRAW_FRAMES
      flowRange.set(id, { start: cueFrame(`flow:${id}`) ?? Math.max(start + REVEAL_LEAD_FRAMES, ready), end })
    }

    const framing = cameraFor(specScene.focus ?? visibleNodes, placements, start, width, height)
    framings.push(framing)

    if (specScene.card) {
      const card = specScene.card
      const cardStart = start + CAMERA_MOVE_FRAMES
      const spread = Math.max(0, Math.floor((end - cardStart) * 0.7) - 8)
      const lineFrames = card.lines.map((_, i) => cueFrame(`${card.id}.${i + 1}`)
        ?? cardStart + 8 + Math.floor((i * spread) / Math.max(1, card.lines.length)))
      cardLayerSets.push(...cardLayers(card, framing, { width, height }, start, end, cardStart, lineFrames))
    }
    if (specScene.comparison) {
      const comparison = specScene.comparison
      const comparisonStart = start + CAMERA_MOVE_FRAMES
      const lineCount = Math.max(comparison.left.lines.length, comparison.right.lines.length)
      const spread = Math.max(0, Math.floor((end - comparisonStart) * 0.7) - 8)
      const lineFrames = (side: 'left' | 'right') => comparison[side].lines.map((_, index) =>
        cueFrame(`${comparison.id}.${side}.${index + 1}`) ?? comparisonStart + 8 + Math.floor((index * spread) / Math.max(1, lineCount)),
      )
      comparisonLayerSets.push(...comparisonLayers(comparison, framing, { width, height }, start, end, comparisonStart, lineFrames('left'), lineFrames('right')))
    }
    if (specScene.bullets) {
      const bullets = specScene.bullets
      const bulletStart = start + CAMERA_MOVE_FRAMES
      const spread = Math.max(0, Math.floor((end - bulletStart) * 0.7) - 8)
      const lineFrames = bullets.items.map((_, index) => cueFrame(`${bullets.id}.${index + 1}`) ?? bulletStart + 8 + Math.floor((index * spread) / Math.max(1, bullets.items.length)))
      bulletLayerSets.push(...bulletLayers(bullets, framing, { width, height }, start, end, bulletStart, lineFrames))
    }
    if (specScene.sequence) {
      const sequence = specScene.sequence
      const sequenceStart = start + CAMERA_MOVE_FRAMES
      const spread = Math.max(0, Math.floor((end - sequenceStart) * 0.72) - 8)
      const messageFrames = sequence.messages.map((message, index) => cueFrame(`${sequence.id}.${message.id}`) ?? sequenceStart + 8 + Math.floor((index * spread) / Math.max(1, sequence.messages.length)))
      sequenceLayerSets.push(...sequenceLayers(sequence, framing, { width, height }, start, end, sequenceStart, messageFrames))
    }

    const sceneId = `scene_${specScene.id}`
    const segmentId = `segment_${specScene.id}`
    scenes.push({
      id: sceneId,
      title: specScene.title,
      startFrame: start,
      endFrame: end,
      scriptSegmentIds: [segmentId],
      transitionIn: 0,
      transitionOut: 0,
    })
    segments.push({ id: segmentId, text: parsed.plain, sceneId, startFrame: start, endFrame: end })
    if (audio && options.narration) {
      const sourceFrames = Math.max(1, Math.round(audio.durationSeconds * fps))
      narrationLayers.push(baseLayer('audio', {
        id: `narration_${specScene.id}`,
        name: `Narration: ${specScene.title}`,
        src: `/api/assets/${audio.assetId}/file`,
        audioRole: 'narration',
        scriptSegmentId: segmentId,
        audioVolume: 1,
        audioMuted: false,
        width: 1,
        height: 1,
        fillType: 'none',
        videoDuration: audio.durationSeconds,
        sourceDurationFrames: sourceFrames,
        startFrame: audioStart,
        endFrame: audioStart + sourceFrames,
        videoSegments: [{
          id: `narration_segment_${specScene.id}`,
          timelineStartFrame: audioStart,
          timelineEndFrame: audioStart + sourceFrames,
          sourceStartFrame: 0,
          sourceEndFrame: sourceFrames,
        }],
        narrationGeneration: {
          provider: 'local-chatterbox',
          voiceId: options.narration.voiceId,
          sourceText: parsed.plain,
          exaggeration: options.narration.exaggeration,
          cfgWeight: options.narration.cfgWeight,
        },
        keyframes: staticKeyframe(audioStart, 0, 0),
      }))
    }
    cursor = end
  }

  if (spec.outro) {
    const outroFrames = Math.round((spec.outro.seconds ?? DEFAULT_TITLE_SECONDS) * fps)
    const framing = { ...framings[framings.length - 1], frame: cursor }
    framings.push(framing)
    scenes.push({ id: 'scene_outro', title: 'Outro', startFrame: cursor, endFrame: cursor + outroFrames, scriptSegmentIds: [], transitionIn: 0, transitionOut: 0 })
    titleLayerSets.push(...titleCardLayers('outro', spec.outro.text, undefined, framing, { width, height }, cursor, cursor + outroFrames, 'outro'))
    cursor += outroFrames
  }
  const totalFrames = cursor

  const layers: Layer[] = []
  for (const node of spec.nodes) {
    layers.push(...nodeLayers(node, placements.get(node.id)!, revealFrame.get(node.id) ?? 0, hideFrame.get(node.id), emphasis.get(node.id) ?? [], totalFrames, options.artwork))
  }
  // Top-level layers stack first-on-top (a group's children stack last-on-top), so cards go first.
  layers.unshift(...titleLayerSets, ...cardLayerSets, ...comparisonLayerSets, ...bulletLayerSets, ...sequenceLayerSets)
  layers.push(...narrationLayers)

  const connectors: Connector[] = spec.edges.map((edge) => {
    const from = spec.nodes.find((node) => node.id === edge.from)!
    const start = revealFrame.get(edge.id) ?? 0
    return {
      id: `edge_${edge.id}`,
      sourceLayerId: `node_${edge.from}`,
      targetLayerId: `node_${edge.to}`,
      sourcePort: height > width ? 'bottom' : 'right',
      targetPort: height > width ? 'top' : 'left',
      routing: 'bezier',
      lineStyle: edge.style ?? 'solid',
      arrowStart: false,
      arrowEnd: true,
      label: edge.label,
      color: PALETTE[from.kind].stroke,
      strokeWidth: 4,
      drawStartFrame: start,
      drawEndFrame: start + EDGE_DRAW_FRAMES,
      ...(hideFrame.has(edge.id) ? { hideFrame: hideFrame.get(edge.id) } : {}),
      ...(flowRange.has(edge.id) ? { pulseStartFrame: flowRange.get(edge.id)!.start, pulseEndFrame: flowRange.get(edge.id)!.end } : {}),
      sketchEnabled: SKETCH.enabled,
      sketchRoughness: SKETCH.roughness,
    }
  })

  return {
    schemaVersion: CURRENT_PROJECT_SCHEMA_VERSION,
    id: `lesson_${spec.id}`,
    name: spec.title,
    thumbnail: titleThumbnail(spec.title, width, height),
    createdAt: options.now,
    updatedAt: options.now,
    canvas: { width, height, fps, durationFrames: totalFrames, backgroundColor: COLORS.background, presetName: 'YouTube' },
    layers,
    guides: [],
    timeline: { zoom: 1, scrollX: 0 },
    editor: { zoom: 1, panX: 0, panY: 0, selectedLayerIds: [], playheadFrame: 0, showOutsideCanvas: false },
    script: { rawText: segments.map((segment) => segment.text).join('\n\n'), segments },
    scenes,
    connectors,
    camera: { keyframes: cameraTrack(framings, scenes) },
    captions: { enabled: true, style: 'readable' },
    localVoice: {
      baseVoiceId: options.narration?.voiceId ?? '',
      exaggeration: options.narration?.exaggeration ?? 0.5,
      cfgWeight: options.narration?.cfgWeight ?? 0.5,
      pauseFrames: 6,
    },
  }
}

/** Camera world coordinates are canvas pixels: the canvas centre is (width/2, height/2). */
function cameraFor(
  focusIds: string[],
  placements: Map<string, NodePlacement>,
  frame: number,
  width: number,
  height: number,
): CameraKeyframe {
  const boxes = focusIds.flatMap((id) => {
    const placement = placements.get(id)
    return placement ? [placement] : []
  })
  if (!boxes.length) return { frame, x: width / 2, y: height / 2 + CAPTION_RESERVE / 2, zoom: 1, easing: 'ease-in-out' }
  const left = Math.min(...boxes.map((box) => box.x - NODE_WIDTH / 2))
  const right = Math.max(...boxes.map((box) => box.x + NODE_WIDTH / 2))
  const top = Math.min(...boxes.map((box) => box.y - NODE_HEIGHT / 2))
  const bottom = Math.max(...boxes.map((box) => box.y + NODE_HEIGHT / 2))
  const fit = Math.min(
    (width - 2 * CAMERA_MARGIN_X) / (right - left),
    (height - CAPTION_RESERVE - 2 * CAMERA_MARGIN_Y) / (bottom - top),
  )
  const zoom = Math.round(Math.min(MAX_CAMERA_ZOOM, Math.max(1, fit)) * 1000) / 1000
  // The content is centred in the caption-free upper area, so the camera looks
  // lower than the content by half the reserved strip (in world units).
  return {
    frame,
    x: width / 2 + (left + right) / 2,
    y: height / 2 + (top + bottom) / 2 + CAPTION_RESERVE / (2 * zoom),
    zoom,
    easing: 'ease-in-out',
  }
}

/** Hold each framing until its scene starts, then move to the next one and hold again. */
function cameraTrack(framings: CameraKeyframe[], scenes: Scene[]): CameraKeyframe[] {
  const track: CameraKeyframe[] = [{ ...framings[0], frame: 0 }]
  for (let index = 1; index < framings.length; index += 1) {
    const previous = framings[index - 1]
    const next = framings[index]
    if (previous.x === next.x && previous.y === next.y && previous.zoom === next.zoom) continue
    const start = scenes[index].startFrame
    const moveEnd = Math.min(start + CAMERA_MOVE_FRAMES, scenes[index].endFrame - 1)
    track.push({ ...previous, frame: start }, { ...next, frame: moveEnd })
  }
  return track
}

/**
 * A code/request panel for one scene. It is placed in world coordinates at the
 * centre of the scene's (caption-free) camera framing and scaled by 1/zoom, so
 * it appears at a fixed on-screen size over a backdrop that dims the diagram.
 */
function cardLayers(
  card: SpecCard,
  framing: CameraKeyframe,
  canvas: { width: number; height: number },
  start: number,
  end: number,
  cardStart: number,
  lineFrames: number[],
): Layer[] {
  const x = framing.x - canvas.width / 2
  const y = framing.y - canvas.height / 2 - CAPTION_RESERVE / (2 * framing.zoom)
  const scale = 1 / framing.zoom
  const titleHeight = card.title ? CARD_TITLE_HEIGHT : 0
  const bodyHeight = CARD_PADDING * 2 + titleHeight + card.lines.length * CARD_LINE_HEIGHT
  const top = -bodyHeight / 2
  const groupId = `card_${card.id}`
  const timing = { startFrame: start, endFrame: end }

  const at = (props: Partial<Keyframe['props']>) => ({ ...DEFAULT_TRANSFORM, x, y, scale, ...props })
  const group = baseLayer('group', {
    id: groupId,
    name: card.title ?? 'Card',
    width: CARD_WIDTH,
    height: bodyHeight,
    ...timing,
    keyframes: [
      { frame: start, easing: 'linear', props: at({ opacity: 0 }) },
      { frame: cardStart, easing: 'ease-out', props: at({ opacity: 0 }) },
      { frame: cardStart + CARD_FADE_FRAMES, easing: 'linear', props: at({ opacity: 1 }) },
      { frame: end - CARD_FADE_FRAMES, easing: 'ease-in', props: at({ opacity: 1 }) },
      { frame: end, easing: 'linear', props: at({ opacity: 0 }) },
    ],
  })
  const child = (id: string, type: LayerType, offsetY: number, overrides: Partial<Layer>, keyframes?: Keyframe[]) => baseLayer(type, {
    id: `${groupId}__${id}`,
    parentId: groupId,
    ...timing,
    keyframes: keyframes ?? staticKeyframe(start, 0, offsetY),
    ...overrides,
  } as Parameters<typeof baseLayer>[1])
  const layers: Layer[] = [
    group,
    child('backdrop', 'rectangle', 0, { name: 'Backdrop', width: 8000, height: 6000, fillColor: COLORS.cardBackdrop }),
    child('panel', 'rectangle', 0, {
      name: 'Panel', width: CARD_WIDTH, height: bodyHeight, fillColor: COLORS.panel,
      strokeEnabled: true, strokeColor: COLORS.accent, strokeWidth: 2, borderRadius: 20,
    }),
  ]
  if (card.title) {
    layers.push(child('title', 'text', top + CARD_PADDING + CARD_TITLE_HEIGHT / 2, {
      name: 'Title', text: card.title, width: CARD_WIDTH - 2 * CARD_PADDING, height: CARD_TITLE_HEIGHT,
      fontSize: 32, fontWeight: '700', textColor: COLORS.mutedText, textAlign: 'left', htmlText: true, htmlWhiteSpace: 'pre',
    }))
  }
  card.lines.forEach((line, index) => {
    const offsetY = top + CARD_PADDING + titleHeight + index * CARD_LINE_HEIGHT + CARD_LINE_HEIGHT / 2
    const frame = lineFrames[index]
    const shown = { ...DEFAULT_TRANSFORM, x: 0, y: offsetY }
    layers.push(child(`line${index + 1}`, 'text', offsetY, {
      name: `Line ${index + 1}`, text: line, width: CARD_WIDTH - 2 * CARD_PADDING, height: CARD_LINE_HEIGHT,
      fontFamily: TYPE.mono, fontSize: 28, fontWeight: '500', textColor: COLORS.cardText, textAlign: 'left',
      htmlText: true, htmlWhiteSpace: 'pre',
    }, [
      { frame: start, easing: 'linear', props: { ...shown, opacity: 0 } },
      { frame, easing: 'ease-out', props: { ...shown, opacity: 0 } },
      { frame: frame + CARD_FADE_FRAMES, easing: 'ease-out', props: shown },
    ]))
  })
  return layers
}

/** Bullet/explanation cards deliberately reuse the normal overlay geometry and animation. */
function bulletLayers(
  bullets: SpecBullets,
  framing: CameraKeyframe,
  canvas: { width: number; height: number },
  start: number,
  end: number,
  bulletStart: number,
  lineFrames: number[],
): Layer[] {
  const accent = bullets.tone === 'positive' ? '#4ade80' : bullets.tone === 'negative' ? '#fda4af' : COLORS.accent
  const layers = cardLayers(
    { id: `bullets_${bullets.id}`, title: bullets.title, lines: bullets.items.map((item) => `• ${item}`) },
    framing, canvas, start, end, bulletStart, lineFrames,
  )
  const groupId = `card_bullets_${bullets.id}`
  for (const layer of layers) {
    if (layer.id === `${groupId}__panel`) {
      layer.strokeColor = accent
    } else if (layer.id === `${groupId}__title`) {
      layer.textColor = accent
    }
  }
  return layers
}

/** A conventional, source-order sequence diagram assembled from normal layers. */
function sequenceLayers(
  sequence: SpecSequence,
  framing: CameraKeyframe,
  canvas: { width: number; height: number },
  start: number,
  end: number,
  sequenceStart: number,
  messageFrames: number[],
): Layer[] {
  const x = framing.x - canvas.width / 2
  const y = framing.y - canvas.height / 2 - CAPTION_RESERVE / (2 * framing.zoom)
  const scale = 1 / framing.zoom
  const width = 1180
  const headerHeight = 86
  const rowHeight = 58
  const height = 80 + headerHeight + sequence.messages.length * rowHeight + 48
  const top = -height / 2
  const groupId = `sequence_${sequence.id}`
  const timing = { startFrame: start, endFrame: end }
  const at = (opacity: number) => ({ ...DEFAULT_TRANSFORM, x, y, scale, opacity })
  const group = baseLayer('group', {
    id: groupId, name: 'Sequence diagram', width, height, ...timing,
    keyframes: [
      { frame: start, easing: 'linear', props: at(0) },
      { frame: sequenceStart, easing: 'ease-out', props: at(0) },
      { frame: sequenceStart + CARD_FADE_FRAMES, easing: 'linear', props: at(1) },
      { frame: end - CARD_FADE_FRAMES, easing: 'ease-in', props: at(1) },
      { frame: end, easing: 'linear', props: at(0) },
    ],
  })
  const child = (id: string, type: LayerType, offsetX: number, offsetY: number, overrides: Partial<Layer>, keyframes?: Keyframe[]) => baseLayer(type, {
    id: `${groupId}__${id}`, parentId: groupId, ...timing,
    keyframes: keyframes ?? staticKeyframe(start, offsetX, offsetY), ...overrides,
  } as Parameters<typeof baseLayer>[1])
  const layers: Layer[] = [
    group,
    child('backdrop', 'rectangle', 0, 0, { name: 'Backdrop', width: 8000, height: 6000, fillColor: COLORS.cardBackdrop }),
    child('panel', 'rectangle', 0, 0, { name: 'Sequence panel', width, height, fillColor: COLORS.panel, strokeEnabled: true, strokeColor: COLORS.accent, strokeWidth: 2, borderRadius: 20 }),
  ]
  const participantStep = sequence.participants.length === 1 ? 0 : (width - 180) / (sequence.participants.length - 1)
  const participantX = new Map(sequence.participants.map((participant, index) => [participant.id, -width / 2 + 90 + index * participantStep]))
  sequence.participants.forEach((participant, index) => {
    const px = participantX.get(participant.id)!
    layers.push(
      child(`participant-${participant.id}`, 'rectangle', px, top + 58, { name: `${participant.label} participant`, width: 160, height: 52, fillColor: PALETTE[Object.keys(PALETTE)[index % Object.keys(PALETTE).length] as keyof typeof PALETTE].fill, strokeEnabled: true, strokeColor: COLORS.accent, strokeWidth: 2, borderRadius: 12 }),
      child(`participant-${participant.id}-label`, 'text', px, top + 58, { name: `${participant.label} label`, text: participant.label, width: 146, height: 40, fontSize: 22, fontWeight: '700' }),
      child(`lifeline-${participant.id}`, 'rectangle', px, top + 58 + headerHeight / 2 + (height - headerHeight) / 2, { name: `${participant.label} lifeline`, width: 2, height: height - headerHeight - 44, fillColor: COLORS.mutedText, strokeEnabled: false }),
    )
  })
  sequence.messages.forEach((message, index) => {
    const frame = messageFrames[index]
    const source = participantX.get(message.from) ?? 0
    const target = participantX.get(message.to) ?? 0
    const direction = target >= source ? (message.kind === 'async' ? '⇢' : '→') : (message.kind === 'async' ? '⇠' : '←')
    const marker = message.kind === 'response' ? '↩' : direction
    const rowY = top + 80 + headerHeight + index * rowHeight + rowHeight / 2
    const shown = { ...DEFAULT_TRANSFORM, x: 0, y: rowY }
    layers.push(child(`message-${message.id}`, 'text', 0, rowY, {
      name: `${message.from} ${marker} ${message.to}`, text: `${message.from} ${marker} ${message.to}  ·  ${message.label}`,
      width: width - 120, height: rowHeight, fontFamily: TYPE.mono, fontSize: 23, fontWeight: '600', textColor: message.kind === 'response' ? COLORS.mutedText : COLORS.cardText,
    }, [
      { frame: start, easing: 'linear', props: { ...shown, opacity: 0 } },
      { frame, easing: 'ease-out', props: { ...shown, opacity: 0 } },
      { frame: frame + CARD_FADE_FRAMES, easing: 'ease-out', props: shown },
    ]))
  })
  return layers
}

/** A two-column teaching card, centred over a dimmed diagram like a code card. */
function comparisonLayers(
  comparison: SpecComparison,
  framing: CameraKeyframe,
  canvas: { width: number; height: number },
  start: number,
  end: number,
  comparisonStart: number,
  leftLineFrames: number[],
  rightLineFrames: number[],
): Layer[] {
  const x = framing.x - canvas.width / 2
  const y = framing.y - canvas.height / 2 - CAPTION_RESERVE / (2 * framing.zoom)
  const scale = 1 / framing.zoom
  const panelWidth = SPACE.comparisonPanelWidth
  const panelGap = SPACE.comparisonGap
  const panelHeight = CARD_PADDING * 2 + CARD_TITLE_HEIGHT + Math.max(comparison.left.lines.length, comparison.right.lines.length) * CARD_LINE_HEIGHT
  const top = -panelHeight / 2
  const leftX = -(panelWidth + panelGap) / 2
  const rightX = (panelWidth + panelGap) / 2
  const groupId = `comparison_${comparison.id}`
  const timing = { startFrame: start, endFrame: end }
  const at = (opacity: number) => ({ ...DEFAULT_TRANSFORM, x, y, scale, opacity })
  const group = baseLayer('group', {
    id: groupId,
    name: 'Comparison',
    width: panelWidth * 2 + panelGap,
    height: panelHeight,
    ...timing,
    keyframes: [
      { frame: start, easing: 'linear', props: at(0) },
      { frame: comparisonStart, easing: 'ease-out', props: at(0) },
      { frame: comparisonStart + CARD_FADE_FRAMES, easing: 'linear', props: at(1) },
      { frame: end - CARD_FADE_FRAMES, easing: 'ease-in', props: at(1) },
      { frame: end, easing: 'linear', props: at(0) },
    ],
  })
  const child = (id: string, type: LayerType, offsetX: number, offsetY: number, overrides: Partial<Layer>, keyframes?: Keyframe[]) => baseLayer(type, {
    id: `${groupId}__${id}`,
    parentId: groupId,
    ...timing,
    keyframes: keyframes ?? staticKeyframe(start, offsetX, offsetY),
    ...overrides,
  } as Parameters<typeof baseLayer>[1])
  const sideLayers = (side: 'left' | 'right', offsetX: number, panelColor: string, accentColor: string, lineFrames: number[]): Layer[] => {
    const data = comparison[side]
    const sideLayers: Layer[] = [
      child(`${side}-panel`, 'rectangle', offsetX, 0, {
        name: `${data.title} panel`, width: panelWidth, height: panelHeight, fillColor: panelColor,
        strokeEnabled: true, strokeColor: accentColor, strokeWidth: 2, borderRadius: 20,
      }),
      child(`${side}-title`, 'text', offsetX, top + CARD_PADDING + CARD_TITLE_HEIGHT / 2, {
        name: `${data.title} title`, text: data.title, width: panelWidth - CARD_PADDING * 2, height: CARD_TITLE_HEIGHT,
        fontSize: 32, fontWeight: '700', textColor: accentColor, textAlign: 'left',
      }),
    ]
    data.lines.forEach((line, index) => {
      const offsetY = top + CARD_PADDING + CARD_TITLE_HEIGHT + index * CARD_LINE_HEIGHT + CARD_LINE_HEIGHT / 2
      const frame = lineFrames[index]
      const shown = { ...DEFAULT_TRANSFORM, x: offsetX, y: offsetY }
      sideLayers.push(child(`${side}-line${index + 1}`, 'text', offsetX, offsetY, {
        name: `${data.title} line ${index + 1}`, text: `• ${line}`, width: panelWidth - CARD_PADDING * 2, height: CARD_LINE_HEIGHT,
        fontSize: 28, fontWeight: '500', textColor: COLORS.cardText, textAlign: 'left',
      }, [
        { frame: start, easing: 'linear', props: { ...shown, opacity: 0 } },
        { frame, easing: 'ease-out', props: { ...shown, opacity: 0 } },
        { frame: frame + CARD_FADE_FRAMES, easing: 'ease-out', props: shown },
      ]))
    })
    return sideLayers
  }
  return [
    group,
    child('backdrop', 'rectangle', 0, 0, { name: 'Backdrop', width: 8000, height: 6000, fillColor: COLORS.cardBackdrop }),
    ...sideLayers('left', leftX, COLORS.comparisonLeftPanel, COLORS.comparisonLeftAccent, leftLineFrames),
    ...sideLayers('right', rightX, COLORS.comparisonRightPanel, COLORS.comparisonRightAccent, rightLineFrames),
  ]
}

/** A plain title card so lessons are recognisable on the home screen before any frame is rendered. */
function titleThumbnail(title: string, width: number, height: number) {
  const escaped = title.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}"><rect width="${width}" height="${height}" fill="${COLORS.background}"/>`
    + `<text x="${width / 2}" y="${height / 2}" fill="${COLORS.cardText}" font-family="${TYPE.sans}, sans-serif" font-size="${Math.round(height / 11)}" font-weight="700" text-anchor="middle">${escaped}</text></svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

/** Glow strength over time: 0, ramping to `peak` for each range, back to 0. */
function glowKeyframes(idPrefix: string, ranges: { start: number; end: number }[], peak: number): PropertyKeyframe[] {
  const points: [number, number][] = [[0, 0]]
  for (const range of ranges) {
    points.push([range.start, 0], [range.start + EMPHASIS_RAMP_FRAMES, peak], [range.end - EMPHASIS_RAMP_FRAMES, peak], [range.end, 0])
  }
  return points.map(([frame, value], index) => ({ id: `${idPrefix}_${index}`, frame, value, easing: 'linear' }))
}

/**
 * A silent title or closing card, centred on the camera framing and scaled by
 * 1/zoom so it keeps a fixed on-screen size. The intro is opaque and fades out;
 * the outro dims the diagram behind it and holds to the end of the video.
 */
function titleCardLayers(
  id: string,
  title: string,
  subtitle: string | undefined,
  framing: CameraKeyframe,
  canvas: { width: number; height: number },
  start: number,
  end: number,
  mode: 'intro' | 'outro',
): Layer[] {
  const x = framing.x - canvas.width / 2
  const y = framing.y - canvas.height / 2
  const scale = 1 / framing.zoom
  const groupId = `title_${id}`
  const timing = { startFrame: start, endFrame: end }
  const at = (opacity: number) => ({ ...DEFAULT_TRANSFORM, x, y, scale, opacity })
  const keyframes: Keyframe[] = [
    { frame: start, easing: 'ease-out', props: at(0) },
    { frame: start + CARD_FADE_FRAMES, easing: 'linear', props: at(1) },
  ]
  if (mode === 'intro') {
    keyframes.push({ frame: end - CARD_FADE_FRAMES, easing: 'ease-in', props: at(1) }, { frame: end, easing: 'linear', props: at(0) })
  }
  const child = (name: string, type: LayerType, offsetY: number, overrides: Partial<Layer>) => baseLayer(type, {
    id: `${groupId}__${name}`,
    parentId: groupId,
    name,
    ...timing,
    keyframes: staticKeyframe(start, 0, offsetY),
    ...overrides,
  } as Parameters<typeof baseLayer>[1])
  const layers: Layer[] = [
    baseLayer('group', { id: groupId, name: mode === 'intro' ? 'Title card' : 'Outro card', width: 1600, height: 400, ...timing, keyframes }),
    child('backdrop', 'rectangle', 0, { width: 8000, height: 6000, fillColor: mode === 'intro' ? COLORS.introBackdrop : COLORS.outroBackdrop }),
    child('title', 'text', subtitle ? -36 : 0, {
      text: title, width: 1600, height: 120, fontSize: mode === 'intro' ? 84 : 64, fontWeight: '800', textColor: COLORS.text,
    }),
  ]
  if (subtitle) {
    layers.push(child('subtitle', 'text', 76, { text: subtitle, width: 1600, height: 64, fontSize: 40, fontWeight: '500', textColor: COLORS.mutedText }))
  }
  return layers
}
