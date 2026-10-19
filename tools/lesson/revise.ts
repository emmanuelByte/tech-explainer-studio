import { spawn } from 'node:child_process'
import { cp, mkdir, readdir, rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { canonical } from './fingerprint'
import { projectIdFor } from '../../src/domains/lesson-spec/compile'
import type { LessonSpec } from '../../src/domains/lesson-spec/types'
import { ASPECT_CANVAS, type Aspect } from './pipeline'
import { stillsDir } from './stills'

export interface RevisionScope {
  /** Scene ids whose content differs. */
  scenes: string[]
  /** Lesson-wide changes (title, intro, outro, a component or connection) that reach beyond one scene. */
  global: string[]
}

/** What a revision actually changed, so it can be held to the scenes the review notes were about. */
export function changedParts(before: LessonSpec, after: LessonSpec): RevisionScope {
  const differs = (a: unknown, b: unknown) => canonical(a) !== canonical(b)
  const scenes = after.scenes.filter((scene) => differs(scene, before.scenes.find((candidate) => candidate.id === scene.id))).map((scene) => scene.id)
  const global: string[] = []
  if (differs([before.title, before.intro, before.outro], [after.title, after.intro, after.outro])) global.push('title/intro/outro')
  for (const node of after.nodes) if (differs(node, before.nodes.find((candidate) => candidate.id === node.id))) global.push(`node ${node.id}`)
  for (const edge of after.edges) if (differs(edge, before.edges.find((candidate) => candidate.id === edge.id))) global.push(`edge ${edge.id}`)
  return { scenes, global }
}

/** Problems with a revision's reach; empty when it stays within the allowed scenes. */
export function scopeProblems(scope: RevisionScope, allowedScenes: string[], allowGlobal: boolean): string[] {
  const problems: string[] = []
  const stray = scope.scenes.filter((id) => !allowedScenes.includes(id))
  if (stray.length) problems.push(`The patch changes scene(s) the notes are not about: ${stray.join(', ')}. Notes cover: ${allowedScenes.join(', ') || '(none)'}. Narrow the patch, or name them with --allow-scenes.`)
  if (scope.global.length && !allowGlobal) problems.push(`The patch changes lesson-wide parts (${scope.global.join(', ')}) that appear in other scenes too. Pass --allow-global if that is intended.`)
  if (!scope.scenes.length && !scope.global.length) problems.push('The patch changes nothing.')
  return problems
}

export interface ProductionStateLike { stages: Record<string, { finishedAt: string }> }

/** True when something was rendered (stills or video) at or after `since`, i.e. the correction has been built and can be looked at. */
export function renderedSince(state: ProductionStateLike, since: string) {
  return Object.entries(state.stages).some(([name, stage]) => /^(stills|render):/.test(name) && stage.finishedAt >= since)
}

export const beforeDir = (root: string, lessonId: string, projectId: string) => resolve(root, 'data', 'reviews', lessonId, 'before', projectId)
export const compareDir = (root: string, lessonId: string) => resolve(root, 'data', 'reviews', lessonId, 'compare')

/** Keeps the stills as they were before a revision, so the result can be compared with them. */
export async function snapshotStills(root: string, lessonId: string) {
  const saved: string[] = []
  for (const aspect of Object.keys(ASPECT_CANVAS) as Aspect[]) {
    const projectId = projectIdFor(lessonId, ASPECT_CANVAS[aspect])
    const source = stillsDir(root, projectId)
    const target = beforeDir(root, lessonId, projectId)
    let names: string[]
    try { names = await readdir(source) } catch { continue }
    await rm(target, { recursive: true, force: true })
    await mkdir(target, { recursive: true })
    for (const name of names.filter((file) => file.endsWith('.png'))) await cp(resolve(source, name), resolve(target, name))
    saved.push(projectId)
  }
  return saved
}

export async function findStill(dir: string, sceneId: string) {
  try {
    const name = (await readdir(dir)).find((file) => file.endsWith(`-${sceneId}.png`))
    return name ? resolve(dir, name) : undefined
  } catch { return undefined }
}

function ffmpeg(args: string[]) {
  return new Promise<string>((done, fail) => {
    const child = spawn('ffmpeg', ['-v', 'error', '-nostats', ...args], { stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    let err = ''
    child.stdout.on('data', (chunk: Buffer) => { out += chunk.toString() })
    child.stderr.on('data', (chunk: Buffer) => { err += chunk.toString() })
    child.on('error', (error) => fail(new Error(`Could not start ffmpeg: ${error.message}`)))
    child.on('close', (code) => (code === 0 ? done(out) : fail(new Error(`ffmpeg failed: ${err.trim().split('\n').slice(-4).join(' ')}`))))
  })
}

/** Mean absolute pixel difference between two same-size images, 0 (identical) to 255. */
export async function imageDifference(a: string, b: string): Promise<number> {
  const out = await ffmpeg(['-i', a, '-i', b, '-filter_complex', '[0:v][1:v]blend=all_mode=difference,format=gray,signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=-', '-f', 'null', '-'])
  const match = out.match(/lavfi\.signalstats\.YAVG=([\d.]+)/)
  if (!match) throw new Error('Could not measure the difference between the images.')
  return Number(match[1])
}

export async function sideBySide(before: string, after: string, out: string) {
  await mkdir(resolve(out, '..'), { recursive: true })
  await ffmpeg(['-y', '-i', before, '-i', after, '-filter_complex', 'hstack', '-frames:v', '1', out])
}

/** Below this mean difference a scene is treated as visually unchanged. */
export const VISIBLE_CHANGE_THRESHOLD = 0.02
