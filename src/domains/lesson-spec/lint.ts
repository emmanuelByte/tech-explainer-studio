import type { CameraKeyframe, MotionProject } from '../../types'
import { captionTop, frameFor } from './frame'
import { GLYPH_WIDTH } from './textFit'
import { parseNarration } from './narration'
import type { LessonSpec } from './types'

export interface LintIssue {
  severity: 'error' | 'warning'
  /** Scene id, or '' for lesson-wide findings. */
  scene: string
  rule: 'off-canvas' | 'caption-collision' | 'node-overlap' | 'fast-narration' | 'long-narration' | 'static-scene' | 'dense-scene' | 'overlay-collision' | 'text-overflow' | 'late-reveal' | 'camera-zoom' | 'caption-timing' | 'blank-start'
  message: string
}

const NODE_WIDTH = 240
const NODE_HEIGHT = 150
const EDGE_MARGIN = 24
const CAPTION_GAP = 16
/** Words per second above which spoken narration is hard to follow. */
const MAX_WORDS_PER_SECOND = 3
const MAX_NARRATION_WORDS = 45
const MAX_VISIBLE_NODES = 7
/** A reveal later than this before its scene ends is on screen too briefly to register. */
const MIN_VISIBLE_FRAMES = 20
/** From this zoom on, components pushed off screen mean the viewer loses sight of what was already explained. */
const CONTEXT_LOSS_ZOOM = 1.5
/** A narrated scene should not show an empty screen for longer than this before something appears. */
const MAX_EMPTY_SECONDS = 0.8
const OVERLAY_GROUP = /^(card|comparison|sequence)_/

function cameraAt(keyframes: CameraKeyframe[], frame: number): CameraKeyframe {
  let current = keyframes[0]
  for (const keyframe of keyframes) {
    if (keyframe.frame <= frame) current = keyframe
  }
  return current
}

/**
 * Checks a compiled lesson the way a reviewer would look at it: is everything
 * still on screen and clear of the captions at the end of each scene, is the
 * narration speakable in the time given, does each scene change anything.
 */
export function lintLesson(spec: LessonSpec, project: MotionProject): LintIssue[] {
  const issues: LintIssue[] = []
  const { width, height, fps } = project.canvas
  const frame = frameFor(width, height)
  const scenes = project.scenes ?? []
  const camera = project.camera?.keyframes ?? []
  const visible = new Set<string>()
  let previousFraming = ''

  spec.scenes.forEach((specScene, index) => {
    const scene = scenes.find((candidate) => candidate.id === `scene_${specScene.id}`)!
    const add = (severity: LintIssue['severity'], rule: LintIssue['rule'], message: string) =>
      issues.push({ severity, scene: specScene.id, rule, message })

    // Nothing on screen yet, and the first reveal is late: the viewer stares at an empty frame.
    const firstReveal = (specScene.reveal ?? []).map((id) => revealStartsAt(project, id)).filter((frame): frame is number => frame !== undefined).sort((a, b) => a - b)[0]
    if (!visible.size && !specScene.card && !specScene.comparison && !specScene.bullets && !specScene.sequence && firstReveal !== undefined && (firstReveal - scene.startFrame) / fps > MAX_EMPTY_SECONDS) {
      add('warning', 'blank-start', `The screen is empty for ${((firstReveal - scene.startFrame) / fps).toFixed(1)}s at the start of this scene; put the first reveal cue at the start of the narration.`)
    }
    for (const id of specScene.reveal ?? []) if (spec.nodes.some((node) => node.id === id)) visible.add(id)
    for (const id of specScene.hide ?? []) visible.delete(id)

    const seconds = (scene.endFrame - scene.startFrame) / fps
    const spoken = parseNarration(specScene.narration).plain
    const words = spoken.split(/\s+/).length
    if (words / seconds > MAX_WORDS_PER_SECOND) {
      add('warning', 'fast-narration', `${words} words in ${seconds.toFixed(1)}s is ${(words / seconds).toFixed(1)} words/s; aim for at most ${MAX_WORDS_PER_SECOND}. Lengthen the scene or trim the narration.`)
    }
    if (words > MAX_NARRATION_WORDS) {
      add('warning', 'long-narration', `${words} words will wrap into many caption lines; split the scene (aim for at most ${MAX_NARRATION_WORDS} words).`)
    }
    if (visible.size > MAX_VISIBLE_NODES) {
      add('warning', 'dense-scene', `${visible.size} components on screen at once; consider hiding earlier ones.`)
    }

    const cam = cameraAt(camera, scene.endFrame - 1)
    const framing = `${cam.x}|${cam.y}|${cam.zoom}`
    const changes = (specScene.reveal?.length ?? 0) + (specScene.hide?.length ?? 0) > 0 || Boolean(specScene.card) || Boolean(specScene.comparison) || Boolean(specScene.bullets) || Boolean(specScene.sequence) || framing !== previousFraming
    if (!changes && index > 0) add('warning', 'static-scene', 'Nothing is revealed, hidden or reframed; the screen will not change while this is narrated.')
    previousFraming = framing

    // Reveals must be on screen long enough to be seen, and inside this scene.
    for (const id of specScene.reveal ?? []) {
      const shownAt = revealedAt(project, id)
      if (shownAt !== undefined && shownAt > scene.endFrame - MIN_VISIBLE_FRAMES) add('warning', 'late-reveal', `"${id}" appears ${((scene.endFrame - shownAt) / fps).toFixed(1)}s before the scene ends; move its cue earlier or lengthen the narration.`)
    }

    // Caption phrases: inside the scene, in order, never overlapping.
    const shown = (project.script?.segments ?? []).filter((segment) => segment.sceneId === scene.id && segment.startFrame !== undefined)
    shown.forEach((segment, i) => {
      if (segment.startFrame! < scene.startFrame || segment.endFrame! > scene.endFrame) add('error', 'caption-timing', `Caption "${segment.text.slice(0, 30)}" runs outside its scene.`)
      if (i > 0 && segment.startFrame! < shown[i - 1].endFrame!) add('error', 'caption-timing', `Captions "${shown[i - 1].text.slice(0, 24)}" and "${segment.text.slice(0, 24)}" overlap.`)
    })

    // Captions are short timed phrases; the tallest one this scene shows is what the diagram must stay clear of.
    const phrases = (project.script?.segments ?? []).filter((segment) => segment.sceneId === scene.id && segment.startFrame !== undefined)
    const limit = Math.min(...(phrases.length ? phrases : [{ text: spoken }]).map((phrase) => captionTop(phrase.text, width, height))) - CAPTION_GAP
    for (const group of project.layers.filter((layer) => layer.type === 'group' && OVERLAY_GROUP.test(layer.id) && layer.startFrame === scene.startFrame)) {
      const settled = group.keyframes[group.keyframes.length - 2].props
      const fit = (settled.scale ?? 1) * cam.zoom // 1 = authored size on screen
      const cx = (width / 2 + settled.x - cam.x) * cam.zoom + width / 2
      const cy = (height / 2 + settled.y - cam.y) * cam.zoom + height / 2
      const box = { left: cx - (group.width * fit) / 2, right: cx + (group.width * fit) / 2, top: cy - (group.height * fit) / 2, bottom: cy + (group.height * fit) / 2 }
      if (box.left < 0 || box.right > width) add('error', 'off-canvas', `The ${group.id.split('_')[0]} overlay is wider than the frame.`)
      else if (box.bottom > limit) add('error', 'overlay-collision', `The ${group.id.split('_')[0]} overlay reaches y=${Math.round(box.bottom)}, into the caption that starts at y=${Math.round(limit + CAPTION_GAP)}.`)
      else if (box.top < frame.safeTop) add('warning', 'overlay-collision', `The ${group.id.split('_')[0]} overlay starts at y=${Math.round(box.top)}, inside the top safe margin (${frame.safeTop}px).`)
    }
    const offScreen: string[] = []
    const boxes: { id: string; left: number; top: number; right: number; bottom: number }[] = []
    for (const id of visible) {
      const layer = project.layers.find((candidate) => candidate.id === `node_${id}`)
      if (!layer) continue
      const props = layer.keyframes[0].props
      const cx = (width / 2 + props.x - cam.x) * cam.zoom + width / 2
      const cy = (height / 2 + props.y - cam.y) * cam.zoom + height / 2
      const box = {
        id,
        left: cx - (NODE_WIDTH * cam.zoom) / 2,
        right: cx + (NODE_WIDTH * cam.zoom) / 2,
        top: cy - (NODE_HEIGHT * cam.zoom) / 2,
        bottom: cy + (NODE_HEIGHT * cam.zoom) / 2,
      }
      boxes.push(box)
      const fullyOutside = box.right <= 0 || box.left >= width || box.bottom <= 0 || box.top >= height
      if (fullyOutside) { offScreen.push(id); continue } // a deliberate camera move; only half-visible components look wrong
      if (box.left < EDGE_MARGIN || box.right > width - EDGE_MARGIN || box.top < EDGE_MARGIN || box.bottom > height - EDGE_MARGIN) {
        add('error', 'off-canvas', `"${id}" is cut off or too close to the edge at the end of the scene.`)
      } else if (box.bottom > limit) {
        add('error', 'caption-collision', `"${id}" reaches y=${Math.round(box.bottom)}, into the caption that starts at y=${Math.round(limit + CAPTION_GAP)}.`)
      }
    }
    if (offScreen.length && cam.zoom >= CONTEXT_LOSS_ZOOM) add('warning', 'camera-zoom', `The camera is zoomed to ${cam.zoom.toFixed(2)}x and ${offScreen.map((id) => `"${id}"`).join(', ')} ${offScreen.length === 1 ? 'is' : 'are'} off screen, so the viewer loses sight of what was just shown; add them to \`focus\`.`)
    for (let a = 0; a < boxes.length; a += 1) {
      for (let b = a + 1; b < boxes.length; b += 1) {
        const first = boxes[a]
        const second = boxes[b]
        if (first.left < second.right && second.left < first.right && first.top < second.bottom && second.top < first.bottom) {
          add('error', 'node-overlap', `"${first.id}" and "${second.id}" overlap.`)
        }
      }
    }
  })

  // Text that would run past its box (estimated from glyph widths; deliberately conservative).
  for (const layer of project.layers) {
    if (layer.type !== 'text' || !layer.text) continue
    const glyph = /mono|Menlo|Consolas/i.test(layer.fontFamily) ? GLYPH_WIDTH.mono : GLYPH_WIDTH.sans
    const widest = Math.max(...layer.text.split('\n').map((line) => line.length))
    if (widest * layer.fontSize * glyph > layer.width * 1.12) {
      issues.push({ severity: 'warning', scene: layer.id.split('__')[0], rule: 'text-overflow', message: `Text in "${layer.name}" (${widest} characters at ${Math.round(layer.fontSize)}px) is wider than its ${Math.round(layer.width)}px box.` })
    }
  }

  return issues
}

/** Frame at which a node or connection starts to appear (its fade or draw begins). */
function revealStartsAt(project: MotionProject, id: string): number | undefined {
  const connector = project.connectors?.find((candidate) => candidate.id === `edge_${id}`)
  if (connector) return connector.drawStartFrame
  const layer = project.layers.find((candidate) => candidate.id === `node_${id}`)
  const shown = layer?.keyframes.findIndex((keyframe) => (keyframe.props.opacity ?? 1) >= 0.99) ?? -1
  return shown < 0 ? undefined : layer!.keyframes[Math.max(0, shown - 1)].frame
}

/** Frame at which a node or connection is fully visible, from the compiled project. */
function revealedAt(project: MotionProject, id: string): number | undefined {
  const connector = project.connectors?.find((candidate) => candidate.id === `edge_${id}`)
  if (connector) return connector.drawEndFrame
  const layer = project.layers.find((candidate) => candidate.id === `node_${id}`)
  return layer?.keyframes.find((keyframe) => (keyframe.props.opacity ?? 1) >= 0.99)?.frame
}
