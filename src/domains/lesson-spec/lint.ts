import type { CameraKeyframe, MotionProject } from '../../types'
import { captionTop } from './frame'
import { parseNarration } from './narration'
import type { LessonSpec } from './types'

export interface LintIssue {
  severity: 'error' | 'warning'
  /** Scene id, or '' for lesson-wide findings. */
  scene: string
  rule: 'off-canvas' | 'caption-collision' | 'node-overlap' | 'fast-narration' | 'long-narration' | 'static-scene' | 'dense-scene'
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
  const scenes = project.scenes ?? []
  const camera = project.camera?.keyframes ?? []
  const visible = new Set<string>()
  let previousFraming = ''

  spec.scenes.forEach((specScene, index) => {
    const scene = scenes.find((candidate) => candidate.id === `scene_${specScene.id}`)!
    const add = (severity: LintIssue['severity'], rule: LintIssue['rule'], message: string) =>
      issues.push({ severity, scene: specScene.id, rule, message })

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

    // Captions are short timed phrases; the tallest one this scene shows is what the diagram must stay clear of.
    const phrases = (project.script?.segments ?? []).filter((segment) => segment.sceneId === scene.id && segment.startFrame !== undefined)
    const limit = Math.min(...(phrases.length ? phrases : [{ text: spoken }]).map((phrase) => captionTop(phrase.text, width, height))) - CAPTION_GAP
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
      if (fullyOutside) continue // a deliberate camera move; only half-visible components look wrong
      if (box.left < EDGE_MARGIN || box.right > width - EDGE_MARGIN || box.top < EDGE_MARGIN || box.bottom > height - EDGE_MARGIN) {
        add('error', 'off-canvas', `"${id}" is cut off or too close to the edge at the end of the scene.`)
      } else if (box.bottom > limit) {
        add('error', 'caption-collision', `"${id}" reaches y=${Math.round(box.bottom)}, into the caption that starts at y=${Math.round(limit + CAPTION_GAP)}.`)
      }
    }
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

  return issues
}
