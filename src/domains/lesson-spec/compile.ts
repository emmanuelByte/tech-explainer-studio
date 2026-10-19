import {
  DEFAULT_TRANSFORM,
  type CameraKeyframe,
  type Connector,
  type Keyframe,
  type Layer,
  type LayerType,
  type MotionProject,
  type Scene,
  type ScriptSegment,
  type TechnicalComponentKind,
} from '../../types'
import { CURRENT_PROJECT_SCHEMA_VERSION } from '../project/migrations'
import { parseNarration } from './narration'
import { SPEC_DEFAULTS, type LessonSpec, type NarrationManifest, type SpecCard, type SpecNode, type SpecScene } from './types'
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

const NODE_WIDTH = 240
const NODE_HEIGHT = 150
const COLUMN_STEP = 400
const ROW_STEP = 200
const CAMERA_MARGIN_X = 160
const CAMERA_MARGIN_Y = 80
/** Bottom strip kept clear for captions (up to three lines at the readable caption size). */
const CAPTION_RESERVE = 360
const MAX_CAMERA_ZOOM = 2
const NODE_FADE_FRAMES = 12
const EDGE_DRAW_FRAMES = 24
const REVEAL_LEAD_FRAMES = 15
const CAMERA_MOVE_FRAMES = 24
const CARD_WIDTH = 1200
const CARD_PADDING = 40
const CARD_TITLE_HEIGHT = 56
const CARD_LINE_HEIGHT = 44
const CARD_FADE_FRAMES = 12
const CARD_MONO = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace'
const WORDS_PER_SECOND = 2.5
/** Silence before the voice starts and after it ends, per scene. */
const NARRATION_LEAD_SECONDS = 0.5
const NARRATION_TAIL_SECONDS = 0.7

const PALETTE: Record<TechnicalComponentKind, { fill: string; stroke: string }> = {
  'load-balancer': { fill: '#1d4ed8', stroke: '#60a5fa' },
  database: { fill: '#9a3412', stroke: '#fdba74' },
  cache: { fill: '#b91c1c', stroke: '#fca5a5' },
  queue: { fill: '#a16207', stroke: '#fde047' },
  cdn: { fill: '#0e7490', stroke: '#67e8f9' },
  'api-gateway': { fill: '#4338ca', stroke: '#a5b4fc' },
  'object-storage': { fill: '#475569', stroke: '#cbd5e1' },
  worker: { fill: '#0f766e', stroke: '#5eead4' },
  server: { fill: '#166534', stroke: '#4ade80' },
  client: { fill: '#7c3aed', stroke: '#c4b5fd' },
}

const BACKGROUND = '#0b1020'

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
    fillColor: type === 'text' || type === 'group' ? 'transparent' : '#6366f1',
    gradientStops: [{ color: '#6366f1', position: 0 }, { color: '#a855f7', position: 100 }],
    gradientAngle: 135,
    strokeEnabled: false,
    strokeColor: '#ffffff',
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
    sketchEnabled: false,
    sketchRoughness: 1,
    shadowEnabled: false,
    shadowColor: 'rgba(0,0,0,0.5)',
    shadowFollowsPerspective: false,
    text: '',
    fontFamily: 'Inter',
    fontSize: 48,
    fontWeight: '600',
    textAlign: 'center',
    letterSpacing: 0,
    lineHeight: 1.2,
    textColor: '#ffffff',
    textSpans: [],
    textRevealMode: 'plain',
    imageFit: 'contain',
    svgStrokeColor: '#ffffff',
    svgFillColor: '#ffffff',
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
export function layoutNodes(spec: Pick<LessonSpec, 'nodes' | 'edges'>): Map<string, NodePlacement> {
  const ranks = computeRanks(spec)
  if (!ranks) throw new LessonSpecError([{ path: 'edges', message: 'Edges form a cycle.' }])
  const columns = Math.max(...ranks.values()) + 1
  const byRank = new Map<number, SpecNode[]>()
  for (const node of spec.nodes) {
    const rank = ranks.get(node.id) ?? 0
    byRank.set(rank, [...(byRank.get(rank) ?? []), node])
  }
  const placements = new Map<string, NodePlacement>()
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
  node: SpecNode,
  placement: NodePlacement,
  revealFrame: number,
  hideFrame: number | undefined,
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
    ...timing,
    keyframes: staticKeyframe(0, 0, 0),
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
  const placements = layoutNodes(spec)

  // Timeline: scenes are consecutive ranges; every reveal lands inside its scene.
  const scenes: Scene[] = []
  const segments: ScriptSegment[] = []
  const revealFrame = new Map<string, number>()
  const hideFrame = new Map<string, number>()
  const framings: CameraKeyframe[] = []
  const narrationLayers: Layer[] = []
  const cardLayerSets: Layer[] = []
  let visibleNodes: string[] = []
  let cursor = 0

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
  const totalFrames = cursor

  const layers: Layer[] = []
  for (const node of spec.nodes) {
    layers.push(...nodeLayers(node, placements.get(node.id)!, revealFrame.get(node.id) ?? 0, hideFrame.get(node.id), totalFrames, options.artwork))
  }
  // Top-level layers stack first-on-top (a group's children stack last-on-top), so cards go first.
  layers.unshift(...cardLayerSets)
  layers.push(...narrationLayers)

  const connectors: Connector[] = spec.edges.map((edge) => {
    const from = spec.nodes.find((node) => node.id === edge.from)!
    const start = revealFrame.get(edge.id) ?? 0
    return {
      id: `edge_${edge.id}`,
      sourceLayerId: `node_${edge.from}`,
      targetLayerId: `node_${edge.to}`,
      sourcePort: 'right',
      targetPort: 'left',
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
      sketchEnabled: false,
      sketchRoughness: 1,
    }
  })

  return {
    schemaVersion: CURRENT_PROJECT_SCHEMA_VERSION,
    id: `lesson_${spec.id}`,
    name: spec.title,
    thumbnail: titleThumbnail(spec.title, width, height),
    createdAt: options.now,
    updatedAt: options.now,
    canvas: { width, height, fps, durationFrames: totalFrames, backgroundColor: BACKGROUND, presetName: 'YouTube' },
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
    child('backdrop', 'rectangle', 0, { name: 'Backdrop', width: 8000, height: 6000, fillColor: 'rgba(11,16,32,0.92)' }),
    child('panel', 'rectangle', 0, {
      name: 'Panel', width: CARD_WIDTH, height: bodyHeight, fillColor: '#16213f',
      strokeEnabled: true, strokeColor: '#60a5fa', strokeWidth: 2, borderRadius: 20,
    }),
  ]
  if (card.title) {
    layers.push(child('title', 'text', top + CARD_PADDING + CARD_TITLE_HEIGHT / 2, {
      name: 'Title', text: card.title, width: CARD_WIDTH - 2 * CARD_PADDING, height: CARD_TITLE_HEIGHT,
      fontSize: 32, fontWeight: '700', textColor: '#93c5fd', textAlign: 'left', htmlText: true, htmlWhiteSpace: 'pre',
    }))
  }
  card.lines.forEach((line, index) => {
    const offsetY = top + CARD_PADDING + titleHeight + index * CARD_LINE_HEIGHT + CARD_LINE_HEIGHT / 2
    const frame = lineFrames[index]
    const shown = { ...DEFAULT_TRANSFORM, x: 0, y: offsetY }
    layers.push(child(`line${index + 1}`, 'text', offsetY, {
      name: `Line ${index + 1}`, text: line, width: CARD_WIDTH - 2 * CARD_PADDING, height: CARD_LINE_HEIGHT,
      fontFamily: CARD_MONO, fontSize: 28, fontWeight: '500', textColor: '#e2e8f0', textAlign: 'left',
      htmlText: true, htmlWhiteSpace: 'pre',
    }, [
      { frame: start, easing: 'linear', props: { ...shown, opacity: 0 } },
      { frame, easing: 'ease-out', props: { ...shown, opacity: 0 } },
      { frame: frame + CARD_FADE_FRAMES, easing: 'ease-out', props: shown },
    ]))
  })
  return layers
}

/** A plain title card so lessons are recognisable on the home screen before any frame is rendered. */
function titleThumbnail(title: string, width: number, height: number) {
  const escaped = title.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}"><rect width="${width}" height="${height}" fill="${BACKGROUND}"/>`
    + `<text x="${width / 2}" y="${height / 2}" fill="#e2e8f0" font-family="Inter, sans-serif" font-size="${Math.round(height / 11)}" font-weight="700" text-anchor="middle">${escaped}</text></svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}
