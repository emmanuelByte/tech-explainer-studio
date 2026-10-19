import { createHash } from 'node:crypto'
import { copyFile, mkdir, readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { projectIdFor } from '../../src/domains/lesson-spec/compile'
import { applyLessonSpecPatch } from '../../src/domains/lesson-spec/patch'
import type { LessonSpec } from '../../src/domains/lesson-spec/types'
import { markApplied, noteStatus, type ReviewNote } from '../../src/domains/review/notes'
import { atomicWriteFile } from '../../server/atomicFile'
import { ASPECT_CANVAS, statePath, type Aspect } from './pipeline'
import { beforeDir, changedParts, compareDir, findStill, imageDifference, scopeProblems, sideBySide, snapshotStills, VISIBLE_CHANGE_THRESHOLD } from './revise'
import { stillsDir } from './stills'

export const specHash = (spec: unknown) => createHash('sha256').update(JSON.stringify(spec)).digest('hex').slice(0, 16)

export const reviewPath = (root: string, lessonId: string) => resolve(root, 'data', 'reviews', `lesson_${lessonId}.json`)

export async function readNotes(root: string, lessonId: string): Promise<ReviewNote[]> {
  try {
    return (JSON.parse(await readFile(reviewPath(root, lessonId), 'utf-8')) as { notes: ReviewNote[] }).notes
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw error
  }
}

export async function readProductionState(root: string, lessonId: string): Promise<{ stages: Record<string, { finishedAt: string }> }> {
  try {
    return JSON.parse(await readFile(statePath(root, lessonId), 'utf-8')) as { stages: Record<string, { finishedAt: string }> }
  } catch { return { stages: {} } }
}

const list = (argv: string[], name: string) => {
  const at = argv.indexOf(`--${name}`)
  return at >= 0 && argv[at + 1] && !argv[at + 1].startsWith('--') ? argv[at + 1].split(',').map((value) => value.trim()).filter(Boolean) : []
}
const value = (argv: string[], name: string) => list(argv, name).join(',')

/**
 * Applies a semantic patch for specific review notes.
 * The patch must validate, and may only change the scenes those notes are
 * about; the previous spec and stills are kept so the change can be compared
 * and undone. The notes become `applied`, not `verified`.
 */
export async function reviseCommand(root: string, specPath: string, spec: LessonSpec, argv: string[]) {
  const patchPath = value(argv, 'patch')
  const noteIds = list(argv, 'notes')
  if (!patchPath || !noteIds.length) throw new Error('Usage: lesson revise <spec> --patch <patch.json> --notes <id,id> --summary "<what changed>" [--allow-scenes a,b] [--allow-global]')
  const notes = await readNotes(root, spec.id)
  const chosen = noteIds.map((id) => notes.find((note) => note.id === id))
  const missing = noteIds.filter((_, index) => !chosen[index])
  if (missing.length) throw new Error(`Unknown note id(s): ${missing.join(', ')}. List them with: lesson notes <spec>`)
  const already = chosen.filter((note) => note && noteStatus(note) === 'verified')
  if (already.length) throw new Error(`Note(s) already verified: ${already.map((note) => note!.id).join(', ')}.`)

  const patch = JSON.parse(await readFile(resolve(process.cwd(), patchPath), 'utf-8')) as unknown
  const next = applyLessonSpecPatch(spec, patch) // validates the result too
  const allowed = [...new Set([...chosen.map((note) => note!.sceneId), ...list(argv, 'allow-scenes')])]
  const problems = scopeProblems(changedParts(spec, next), allowed, argv.includes('--allow-global'))
  if (problems.length) throw new Error(`Not applied:\n${problems.map((problem) => `  ${problem}`).join('\n')}`)

  // Keep what is being replaced: the spec, and the stills it produced.
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const history = resolve(root, 'data', 'production', 'history', `${spec.id}-${stamp}.lesson.json`)
  await mkdir(dirname(history), { recursive: true })
  await copyFile(specPath, history)
  const snapshots = await snapshotStills(root, spec.id)

  const now = new Date().toISOString()
  const updated = markApplied(notes, noteIds, { summary: value(argv, 'summary'), specHash: specHash(next), now })
  await atomicWriteFile(specPath, `${JSON.stringify(next, null, 2)}\n`)
  await atomicWriteFile(reviewPath(root, spec.id), `${JSON.stringify({ notes: updated }, null, 2)}\n`)
  console.log(`Applied to ${specPath} (previous version: ${history}).`)
  console.log(`Notes ${noteIds.join(', ')} are now "applied" (not yet verified).${snapshots.length ? ` Previous stills kept for: ${snapshots.join(', ')}.` : ' No earlier stills to compare against.'}`)
  console.log(`Next: npm run produce -- ${specPath} --quality draft   (re-runs only what changed)\n      npm run lesson -- compare ${specPath} --scene <id>   then look at the image\n      npm run lesson -- notes ${specPath} --verify ${noteIds.join(',')} --evidence "<what you saw>"`)
}

/** Writes a before/after image for a scene and says whether it visibly changed. */
export async function compareCommand(root: string, spec: LessonSpec, argv: string[]) {
  const scene = value(argv, 'scene')
  if (!scene) throw new Error('Usage: lesson compare <spec> --scene <scene id> [--aspect 16:9|9:16]')
  if (!spec.scenes.some((candidate) => candidate.id === scene)) throw new Error(`Unknown scene "${scene}". Scenes: ${spec.scenes.map((candidate) => candidate.id).join(', ')}.`)
  const wanted = value(argv, 'aspect')
  const aspects = (wanted ? [wanted] : Object.keys(ASPECT_CANVAS)) as Aspect[]
  let compared = 0
  for (const aspect of aspects) {
    const projectId = projectIdFor(spec.id, ASPECT_CANVAS[aspect])
    const before = await findStill(beforeDir(root, spec.id, projectId), scene)
    const after = await findStill(stillsDir(root, projectId), scene)
    if (!before || !after) { console.log(`${aspect}: nothing to compare (before: ${before ? 'yes' : 'no'}, after: ${after ? 'yes' : 'no'}).`); continue }
    const difference = await imageDifference(before, after)
    const out = resolve(compareDir(root, spec.id), `${projectId}-${scene}.png`)
    await sideBySide(before, after, out)
    compared += 1
    console.log(`${aspect}: ${difference < VISIBLE_CHANGE_THRESHOLD ? 'NO visible change' : 'visibly changed'} (mean difference ${difference.toFixed(3)}). Before | after: ${out}`)
  }
  if (!compared) throw new Error('No before/after pair found. Run `lesson revise` first (it keeps the earlier stills), then `npm run produce` to build the new ones.')
}
