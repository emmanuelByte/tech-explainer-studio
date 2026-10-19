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
import { SPEC_DEFAULTS, type LessonSpec, type SpecNode, type SpecScene } from './types'
import { computeRanks, validateLessonSpec } from './validate'

/** Raw SVG source per component kind; injected so this module stays free of Vite/Node imports. */
export type ComponentArtwork = Record<TechnicalComponentKind, string>

export interface CompileOptions {
  artwork: ComponentArtwork
  /** ISO timestamp; injected so compilation is deterministic. */
  now: string
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
const WORDS_PER_SECOND = 2.5

const PALETTE: Record<TechnicalComponentKind, { fill: string; stroke: string }> = {
  'load-balancer': { fill: '#1d4ed8', stroke: '#60a5fa' },
  server: { fill: '#166534', stroke: '#4ade80' },
  client: { fill: '#7c3aed', stroke: '#c4b5fd' },
}

const BACKGROUND = '#0b1020'

function svgDataUrl(svg: string) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

/** Mirrors the editor's makeLayer defaults, minus its randomness, so output is deterministic. */
function baseLayer(type: LayerType, overrides: Partial<Layer> & Pick<Layer, 'id' | 'name' | 'startFrame' | 'endFrame' | 'keyframes'>): Layer {
  return {
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
}

function staticKeyframe(frame: number, x: number, y: number): Keyframe[] {
  return [{ frame, easing: 'ease-out', props: { ...DEFAULT_TRANSFORM, x, y } }]
}

function sceneFrames(scene: SpecScene, fps: number) {
  const words = scene.narration.trim().split(/\s+/).length
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
  let visibleNodes: string[] = []
  let cursor = 0

  for (const specScene of spec.scenes) {
    const length = sceneFrames(specScene, fps)
    const start = cursor
    const end = start + length
    const reveals = specScene.reveal ?? []
    const usable = Math.max(0, Math.floor(length * 0.75) - REVEAL_LEAD_FRAMES)
    reveals.forEach((id, index) => {
      revealFrame.set(id, start + REVEAL_LEAD_FRAMES + Math.floor((index * usable) / Math.max(1, reveals.length)))
      if (placements.has(id)) visibleNodes.push(id)
    })
    for (const id of specScene.hide ?? []) {
      hideFrame.set(id, start + REVEAL_LEAD_FRAMES)
      visibleNodes = visibleNodes.filter((candidate) => candidate !== id)
    }

    framings.push(cameraFor(specScene.focus ?? visibleNodes, placements, start, width, height))

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
    segments.push({ id: segmentId, text: specScene.narration, sceneId, startFrame: start, endFrame: end })
    cursor = end
  }
  const totalFrames = cursor

  const layers: Layer[] = []
  for (const node of spec.nodes) {
    layers.push(...nodeLayers(node, placements.get(node.id)!, revealFrame.get(node.id) ?? 0, hideFrame.get(node.id), totalFrames, options.artwork))
  }

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
    localVoice: { baseVoiceId: '', exaggeration: 0.5, cfgWeight: 0.5, pauseFrames: 6 },
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
