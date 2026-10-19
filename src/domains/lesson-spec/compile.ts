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
import { narrationWords, parseNarration } from './narration'
import { buildCaptions, estimateWordTimes } from './captions'
import { captionPhraseChars, contentCentreOffset, contentHeight, frameFor, type FrameSpec } from './frame'
import { baseLayer, staticKeyframe, svgDataUrl, type BuildContext } from './layerKit'
import { bulletLayers, cardLayers, comparisonLayers, sequenceLayers, titleCardLayers } from './overlays'
import { LESSON_THEMES, resolveTheme, type LessonTheme, type ThemeId } from './theme'
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
  /** Output size, overriding the spec's own canvas; lets one lesson render in 16:9 and 9:16. */
  canvas?: { width: number; height: number }
  /** Visual preset; overrides the spec's own `theme`. */
  theme?: ThemeId
}

export class LessonSpecError extends Error {
  constructor(public readonly issues: { path: string; message: string }[]) {
    super(`Invalid lesson spec:\n${issues.map((issue) => `  ${issue.path || '(root)'}: ${issue.message}`).join('\n')}`)
    this.name = 'LessonSpecError'
  }
}

/** Component geometry is shared by every theme: layout, camera and lint all rely on it. */
const { nodeWidth: NODE_WIDTH, nodeHeight: NODE_HEIGHT, columnStep: COLUMN_STEP, rowStep: ROW_STEP } = LESSON_THEMES['clean-technical'].spacing
const MAX_CAMERA_ZOOM = 2
/** Zooming out is allowed so a tall or wide scene fits, but never so far that component labels become unreadable. */
const MIN_CAMERA_ZOOM = 0.6
const WORDS_PER_SECOND = 2.5
/** Silence before the voice starts and after it ends, per scene. */
const NARRATION_LEAD_SECONDS = 0.5
const NARRATION_TAIL_SECONDS = 0.7

function sceneFrames(scene: SpecScene, fps: number) {
  const words = parseNarration(scene.narration).plain.split(/\s+/).length
  const seconds = scene.durationSeconds ?? Math.max(4, Math.ceil(words / WORDS_PER_SECOND) + 1)
  return Math.round(seconds * fps)
}

export interface NodePlacement {
  x: number
  y: number
}

/** Portrait layout: at most this many components side by side, with room for their connector labels. */
const PORTRAIT_PER_ROW = 3
const PORTRAIT_COLUMN_STEP = NODE_WIDTH + 50
const PORTRAIT_ROW_STEP = NODE_HEIGHT + 60
const PORTRAIT_RANK_GAP = 140

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
  if (canvas.height > canvas.width) {
    // Portrait is composed top-to-bottom. Components keep their full size and
    // the camera moves between ranks instead of shrinking text; a rank wider
    // than the frame wraps into further rows.
    let top = 0
    const rankOrder = [...byRank.keys()].sort((a, b) => a - b)
    for (const rank of rankOrder) {
      const members = byRank.get(rank)!
      const rows = Math.ceil(members.length / PORTRAIT_PER_ROW)
      members.forEach((node, index) => {
        const row = Math.floor(index / PORTRAIT_PER_ROW)
        const inRow = Math.min(PORTRAIT_PER_ROW, members.length - row * PORTRAIT_PER_ROW)
        const column = index % PORTRAIT_PER_ROW
        placements.set(node.id, {
          x: (column - (inRow - 1) / 2) * PORTRAIT_COLUMN_STEP,
          y: top + NODE_HEIGHT / 2 + row * PORTRAIT_ROW_STEP,
        })
      })
      top += NODE_HEIGHT + (rows - 1) * PORTRAIT_ROW_STEP + PORTRAIT_RANK_GAP
    }
    // Centre the whole stack on the origin, like the landscape layout.
    const shift = (top - PORTRAIT_RANK_GAP) / 2
    for (const placement of placements.values()) placement.y -= shift
    return placements
  }
  for (const [rank, members] of byRank) {
    members.forEach((node, index) => {
      placements.set(node.id, {
        x: (rank - (columns - 1) / 2) * COLUMN_STEP,
        y: (index - (members.length - 1) / 2) * ROW_STEP,
      })
    })
  }
  return placements
}

function nodeLayers(
  ctx: BuildContext,
  node: SpecNode,
  placement: NodePlacement,
  revealFrame: number,
  hideFrame: number | undefined,
  emphasis: { start: number; end: number }[],
  totalFrames: number,
  artwork: ComponentArtwork,
): Layer[] {
  const { theme } = ctx
  const { nodeFadeFrames: NODE_FADE_FRAMES, emphasisRampFrames: EMPHASIS_RAMP_FRAMES, emphasisScale: EMPHASIS_SCALE, emphasisGlowBlur: EMPHASIS_GLOW_BLUR, emphasisGlowSpread: EMPHASIS_GLOW_SPREAD } = theme.motion
  const palette = theme.components[node.kind]
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
  const group = baseLayer(theme, 'group', {
    id: groupId,
    name: node.label,
    width: NODE_WIDTH,
    height: NODE_HEIGHT,
    technicalComponent: { kind: node.kind, version: 1 },
    ...timing,
    keyframes,
  })
  const body = baseLayer(theme, 'rectangle', {
    id: `${groupId}__body`,
    name: `${node.label} body`,
    parentId: groupId,
    width: 220,
    height: 120,
    fillColor: palette.fill,
    strokeEnabled: true,
    strokeColor: palette.stroke,
    strokeWidth: theme.sketch.strokeWidth,
    borderRadius: 16,
    sketchEnabled: theme.sketch.components,
    sketchRoughness: theme.sketch.roughness,
    ...(ranges.length ? { shadowEnabled: true, shadowColor: palette.stroke } : {}),
    propertyKeyframes: {
      ...(ranges.length ? {
        shadowBlur: glowKeyframes(`${groupId}_blur`, ranges, EMPHASIS_GLOW_BLUR, EMPHASIS_RAMP_FRAMES),
        shadowSpread: glowKeyframes(`${groupId}_spread`, ranges, EMPHASIS_GLOW_SPREAD, EMPHASIS_RAMP_FRAMES),
      } : {}),
      // The outline draws itself in as the component appears.
      ...(theme.sketch.components && theme.motion.nodeDrawFrames > 0 && revealFrame > 0 ? {
        drawProgress: [
          { id: `${groupId}_draw0`, frame: 0, value: 0, easing: 'linear' as const },
          { id: `${groupId}_draw1`, frame: revealFrame, value: 0, easing: 'ease-out' as const },
          { id: `${groupId}_draw2`, frame: revealFrame + theme.motion.nodeDrawFrames, value: 1, easing: 'linear' as const },
        ],
      } : {}),
    },
    ...timing,
    keyframes: [{ frame: 0, easing: 'ease-out', props: { ...DEFAULT_TRANSFORM, shadowBlur: 0, shadowY: 0, shadowSpread: 0 } }],
  })
  const art = baseLayer(theme, 'image', {
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
  const label = baseLayer(theme, 'text', {
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

/** Project id: portrait output gets its own id so both formats of a lesson can exist, be reviewed and be exported side by side. */
export function projectIdFor(specId: string, canvas: { width: number; height: number }) {
  return canvas.height > canvas.width ? `lesson_${specId}-9x16` : `lesson_${specId}`
}

/** Compiles a validated lesson spec into a complete, normal, editable MotionProject. */
export function compileLessonSpec(input: unknown, options: CompileOptions): MotionProject {
  const issues = validateLessonSpec(input)
  if (issues.length) throw new LessonSpecError(issues)
  const spec = input as LessonSpec

  const width = options.canvas?.width ?? spec.canvas?.width ?? SPEC_DEFAULTS.width
  const height = options.canvas?.height ?? spec.canvas?.height ?? SPEC_DEFAULTS.height
  const theme = resolveTheme(options.theme ?? spec.theme)
  const { edgeDrawFrames: EDGE_DRAW_FRAMES, revealLeadFrames: REVEAL_LEAD_FRAMES, cameraMoveFrames: CAMERA_MOVE_FRAMES, titleSeconds: DEFAULT_TITLE_SECONDS } = theme.motion
  const frame = frameFor(width, height)
  const ctx: BuildContext = { theme, frame }
  const COLORS = theme.colors
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
    const framing = cameraFor(frame, [], placements, 0)
    framings.push(framing)
    scenes.push({ id: 'scene_intro', title: spec.title, startFrame: 0, endFrame: introFrames, scriptSegmentIds: [], transitionIn: 0, transitionOut: 0 })
    titleLayerSets.push(...titleCardLayers(ctx, 'intro', spec.title, spec.intro.subtitle, framing, 0, introFrames, 'intro'))
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

    const framing = cameraFor(frame, specScene.focus ?? visibleNodes, placements, start)
    framings.push(framing)

    if (specScene.card) {
      const card = specScene.card
      const cardStart = start + CAMERA_MOVE_FRAMES
      const spread = Math.max(0, Math.floor((end - cardStart) * 0.7) - 8)
      const lineFrames = card.lines.map((_, i) => cueFrame(`${card.id}.${i + 1}`)
        ?? cardStart + 8 + Math.floor((i * spread) / Math.max(1, card.lines.length)))
      cardLayerSets.push(...cardLayers(ctx, card, framing, start, end, cardStart, lineFrames))
    }
    if (specScene.comparison) {
      const comparison = specScene.comparison
      const comparisonStart = start + CAMERA_MOVE_FRAMES
      const lineCount = Math.max(comparison.left.lines.length, comparison.right.lines.length)
      const spread = Math.max(0, Math.floor((end - comparisonStart) * 0.7) - 8)
      const lineFrames = (side: 'left' | 'right') => comparison[side].lines.map((_, index) =>
        cueFrame(`${comparison.id}.${side}.${index + 1}`) ?? comparisonStart + 8 + Math.floor((index * spread) / Math.max(1, lineCount)),
      )
      comparisonLayerSets.push(...comparisonLayers(ctx, comparison, framing, start, end, comparisonStart, lineFrames('left'), lineFrames('right')))
    }
    if (specScene.bullets) {
      const bullets = specScene.bullets
      const bulletStart = start + CAMERA_MOVE_FRAMES
      const spread = Math.max(0, Math.floor((end - bulletStart) * 0.7) - 8)
      const lineFrames = bullets.items.map((_, index) => cueFrame(`${bullets.id}.${index + 1}`) ?? bulletStart + 8 + Math.floor((index * spread) / Math.max(1, bullets.items.length)))
      bulletLayerSets.push(...bulletLayers(ctx, bullets, framing, start, end, bulletStart, lineFrames))
    }
    if (specScene.sequence) {
      const sequence = specScene.sequence
      const sequenceStart = start + CAMERA_MOVE_FRAMES
      const spread = Math.max(0, Math.floor((end - sequenceStart) * 0.72) - 8)
      const messageFrames = sequence.messages.map((message, index) => cueFrame(`${sequence.id}.${message.id}`) ?? sequenceStart + 8 + Math.floor((index * spread) / Math.max(1, sequence.messages.length)))
      sequenceLayerSets.push(...sequenceLayers(ctx, sequence, framing, start, end, sequenceStart, messageFrames))
    }

    const sceneId = `scene_${specScene.id}`
    const segmentId = `segment_${specScene.id}`
    // Captions follow the measured words when narration exists; otherwise the words are spread over the scene and marked estimated.
    const spokenWords = audio?.words ?? estimateWordTimes(narrationWords(specScene.narration).words, 0, Math.max(0.5, (end - audioStart) / fps - NARRATION_TAIL_SECONDS))
    const captionSegments: ScriptSegment[] = buildCaptions(spokenWords, { maxChars: captionPhraseChars(width, height) }).map((phrase, index) => ({
      id: `${segmentId}_c${index + 1}`,
      text: phrase.text,
      sceneId,
      startFrame: Math.min(end - 1, audioStart + Math.round(phrase.start * fps)),
      endFrame: Math.min(end, Math.max(audioStart + Math.round(phrase.end * fps), audioStart + Math.round(phrase.start * fps) + 1)),
    }))
    scenes.push({
      id: sceneId,
      title: specScene.title,
      startFrame: start,
      endFrame: end,
      scriptSegmentIds: [segmentId, ...captionSegments.map((segment) => segment.id)],
      transitionIn: 0,
      transitionOut: 0,
    })
    // The scene's whole script stays as a record; what is shown on screen is its short timed phrases.
    segments.push({ id: segmentId, text: parsed.plain, sceneId }, ...captionSegments)
    if (audio && options.narration) {
      const sourceFrames = Math.max(1, Math.round(audio.durationSeconds * fps))
      narrationLayers.push(baseLayer(theme, 'audio', {
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
    titleLayerSets.push(...titleCardLayers(ctx, 'outro', spec.outro.text, undefined, framing, cursor, cursor + outroFrames, 'outro'))
    cursor += outroFrames
  }
  const totalFrames = cursor

  const layers: Layer[] = []
  for (const node of spec.nodes) {
    layers.push(...nodeLayers(ctx, node, placements.get(node.id)!, revealFrame.get(node.id) ?? 0, hideFrame.get(node.id), emphasis.get(node.id) ?? [], totalFrames, options.artwork))
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
      color: theme.components[from.kind].stroke,
      strokeWidth: 4,
      drawStartFrame: start,
      drawEndFrame: start + EDGE_DRAW_FRAMES,
      ...(hideFrame.has(edge.id) ? { hideFrame: hideFrame.get(edge.id) } : {}),
      ...(flowRange.has(edge.id) ? { pulseStartFrame: flowRange.get(edge.id)!.start, pulseEndFrame: flowRange.get(edge.id)!.end } : {}),
      sketchEnabled: theme.sketch.connectors,
      sketchRoughness: theme.sketch.roughness,
    }
  })

  return {
    schemaVersion: CURRENT_PROJECT_SCHEMA_VERSION,
    id: projectIdFor(spec.id, { width, height }),
    name: spec.title,
    thumbnail: titleThumbnail(theme, spec.title, width, height),
    createdAt: options.now,
    updatedAt: options.now,
    canvas: { width, height, fps, durationFrames: totalFrames, backgroundColor: COLORS.background, presetName: frame.orientation === 'portrait' ? 'Vertical' : 'YouTube' },
    layers,
    guides: [],
    timeline: { zoom: 1, scrollX: 0 },
    editor: { zoom: 1, panX: 0, panY: 0, selectedLayerIds: [], playheadFrame: 0, showOutsideCanvas: false },
    script: { rawText: segments.map((segment) => segment.text).join('\n\n'), segments },
    scenes,
    connectors,
    camera: { keyframes: cameraTrack(framings, scenes, CAMERA_MOVE_FRAMES) },
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
  frame: FrameSpec,
  focusIds: string[],
  placements: Map<string, NodePlacement>,
  at: number,
): CameraKeyframe {
  const { width, height } = frame
  const offset = contentCentreOffset(frame)
  const boxes = focusIds.flatMap((id) => {
    const placement = placements.get(id)
    return placement ? [placement] : []
  })
  if (!boxes.length) return { frame: at, x: width / 2, y: height / 2 - offset, zoom: 1, easing: 'ease-in-out' }
  const left = Math.min(...boxes.map((box) => box.x - NODE_WIDTH / 2))
  const right = Math.max(...boxes.map((box) => box.x + NODE_WIDTH / 2))
  const top = Math.min(...boxes.map((box) => box.y - NODE_HEIGHT / 2))
  const bottom = Math.max(...boxes.map((box) => box.y + NODE_HEIGHT / 2))
  const fit = Math.min(
    (width - 2 * frame.cameraMarginX) / (right - left),
    (contentHeight(frame) - 2 * frame.cameraMarginY) / (bottom - top),
  )
  const zoom = Math.round(Math.min(MAX_CAMERA_ZOOM, Math.max(MIN_CAMERA_ZOOM, fit)) * 1000) / 1000
  // The content is centred in the area between the top safe strip and the
  // captions, so the camera looks away from the content centre by the offset of
  // that area from the frame centre (in world units).
  return {
    frame: at,
    x: width / 2 + (left + right) / 2,
    y: height / 2 + (top + bottom) / 2 - offset / zoom,
    zoom,
    easing: 'ease-in-out',
  }
}

/** Hold each framing until its scene starts, then move to the next one and hold again. */
function cameraTrack(framings: CameraKeyframe[], scenes: Scene[], moveFrames: number): CameraKeyframe[] {
  const track: CameraKeyframe[] = [{ ...framings[0], frame: 0 }]
  for (let index = 1; index < framings.length; index += 1) {
    const previous = framings[index - 1]
    const next = framings[index]
    if (previous.x === next.x && previous.y === next.y && previous.zoom === next.zoom) continue
    const start = scenes[index].startFrame
    const moveEnd = Math.min(start + moveFrames, scenes[index].endFrame - 1)
    track.push({ ...previous, frame: start }, { ...next, frame: moveEnd })
  }
  return track
}

/** A plain title card so lessons are recognisable on the home screen before any frame is rendered. */
function titleThumbnail(theme: LessonTheme, title: string, width: number, height: number) {
  const { colors: COLORS, typography: TYPE } = theme
  const escaped = title.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}"><rect width="${width}" height="${height}" fill="${COLORS.background}"/>`
    + `<text x="${width / 2}" y="${height / 2}" fill="${COLORS.cardText}" font-family="${TYPE.sans}, sans-serif" font-size="${Math.round(Math.min(height / 11, width / 16))}" font-weight="700" text-anchor="middle">${escaped}</text></svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

/** Glow strength over time: 0, ramping to `peak` for each range, back to 0. */
function glowKeyframes(idPrefix: string, ranges: { start: number; end: number }[], peak: number, ramp: number): PropertyKeyframe[] {
  const points: [number, number][] = [[0, 0]]
  for (const range of ranges) {
    points.push([range.start, 0], [range.start + ramp, peak], [range.end - ramp, peak], [range.end, 0])
  }
  return points.map(([frame, value], index) => ({ id: `${idPrefix}_${index}`, frame, value, easing: 'linear' }))
}
