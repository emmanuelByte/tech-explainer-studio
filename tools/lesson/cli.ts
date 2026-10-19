import { createHash } from 'node:crypto'
import { mkdir, readFile, rm } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { compileLessonSpec, LessonSpecError, type ComponentArtwork } from '../../src/domains/lesson-spec/compile'
import { lintLesson } from '../../src/domains/lesson-spec/lint'
import { applyLessonSpecPatch } from '../../src/domains/lesson-spec/patch'
import { loadArtwork } from './artwork'
import { renderStills } from './stills'
import { produceCommand, reportFailure } from './produceCommand'
import { assertNarrationAssets, loadNarrationManifest, narrateLesson } from './narrate'
import { markApplied, markVerified, noteStatus, openNotes, type ReviewNote } from '../../src/domains/review/notes'
import { atomicWriteFile } from '../../server/atomicFile'
import type { LessonSpec, NarrationManifest } from '../../src/domains/lesson-spec/types'
import { THEME_IDS, type ThemeId } from '../../src/domains/lesson-spec/theme'
import { validateLessonSpec } from '../../src/domains/lesson-spec/validate'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')

async function readSpec(path: string | undefined) {
  if (!path) throw new Error(USAGE)
  return JSON.parse(await readFile(resolve(process.cwd(), path), 'utf-8')) as unknown
}

const USAGE = 'Usage: lesson <produce|validate|narrate|build|lint|stills|notes|patch> <spec.json>  (patch: <patch.json> [--write]; narrate: --voice <id> --worker <url>; notes: --apply <ids> --summary <text> | --verify <ids> --evidence <text>)'

/** `--aspect 16:9|9:16` renders the same lesson at the native size of that format. */
const ASPECTS = { '16:9': { width: 1920, height: 1080 }, '9:16': { width: 1080, height: 1920 } } as const

function requestedCanvas() {
  const at = process.argv.indexOf('--aspect')
  if (at < 0) return undefined
  const value = process.argv[at + 1]
  if (!(value in ASPECTS)) throw new Error(`--aspect must be one of ${Object.keys(ASPECTS).join(', ')}.`)
  return ASPECTS[value as keyof typeof ASPECTS]
}

function requestedTheme(): ThemeId | undefined {
  const at = process.argv.indexOf('--theme')
  if (at < 0) return undefined
  const value = process.argv[at + 1]
  if (!(THEME_IDS as readonly string[]).includes(value)) throw new Error(`--theme must be one of ${THEME_IDS.join(', ')}.`)
  return value as ThemeId
}

function build(spec: unknown, artwork: ComponentArtwork, narration?: NarrationManifest) {
  return compileLessonSpec(spec, { artwork, now: new Date().toISOString(), narration, canvas: requestedCanvas(), theme: requestedTheme() })
}

function flag(name: string, fallback: string) {
  const at = process.argv.indexOf(`--${name}`)
  return at >= 0 && process.argv[at + 1] ? process.argv[at + 1] : fallback
}

async function writeProject(project: ReturnType<typeof build>) {
  const out = resolve(root, 'data', 'projects', `${project.id}.json`)
  await mkdir(dirname(out), { recursive: true })
  await atomicWriteFile(out, `${JSON.stringify(project, null, 2)}\n`)
  return out
}

async function main() {
  if (process.argv[2] === 'produce') return produceCommand(root, process.argv.slice(3))
  const [command, specPath, patchPath] = process.argv.slice(2)
  const spec = await readSpec(specPath)
  if (command === 'validate') {
    const issues = validateLessonSpec(spec)
    if (issues.length) throw new LessonSpecError(issues)
    console.log('Spec is valid.')
    return
  }
  if (command === 'notes') {
    // Notes the human left in the review screen. Each one moves pending -> applied -> verified, by id.
    const id = `lesson_${(spec as LessonSpec).id}`
    const path = resolve(root, 'data', 'reviews', `${id}.json`)
    let notes: ReviewNote[] = []
    try {
      notes = (JSON.parse(await readFile(path, 'utf-8')) as { notes: ReviewNote[] }).notes
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
    const now = new Date().toISOString()
    const specHash = createHash('sha256').update(JSON.stringify(spec)).digest('hex').slice(0, 16)
    const ids = (name: string) => flag(name, '').split(',').map((value) => value.trim()).filter(Boolean)
    if (process.argv.includes('--done')) throw new Error('--done was removed because it closed every note at once. Use --apply <id,...> --summary "<what changed>" after editing the spec, then --verify <id,...> --evidence "<what the render shows>".')
    if (process.argv.includes('--apply')) notes = markApplied(notes, ids('apply'), { summary: flag('summary', ''), specHash, now })
    if (process.argv.includes('--verify')) notes = markVerified(notes, ids('verify'), { evidence: flag('evidence', ''), specHash, now })
    if (process.argv.includes('--apply') || process.argv.includes('--verify')) {
      await atomicWriteFile(path, `${JSON.stringify({ notes }, null, 2)}\n`)
      console.log('Updated.')
    }
    for (const note of notes) {
      const status = noteStatus(note)
      if (status === 'verified') continue
      console.log(`${status.toUpperCase().padEnd(7)} ${note.id} [${note.sceneId}] ${(note.frame / 30).toFixed(1)}s: ${note.text}${note.appliedSummary ? `  (applied: ${note.appliedSummary})` : ''}`)
    }
    const pending = openNotes(notes).length
    console.log(`${pending} pending, ${notes.filter((note) => noteStatus(note) === 'applied').length} applied (unverified), ${notes.filter((note) => noteStatus(note) === 'verified').length} verified.`)
    return
  }
  if (command === 'patch') {
    if (!patchPath) throw new Error(USAGE)
    const issues = validateLessonSpec(spec)
    if (issues.length) throw new LessonSpecError(issues)
    const patch = JSON.parse(await readFile(resolve(process.cwd(), patchPath), 'utf-8')) as unknown
    const next = applyLessonSpecPatch(spec as LessonSpec, patch)
    if (!process.argv.includes('--write')) {
      console.log(JSON.stringify(next, null, 2))
      console.log('\nPatch is valid. Re-run with --write to replace the source spec.')
      return
    }
    const target = resolve(process.cwd(), specPath!)
    await atomicWriteFile(target, `${JSON.stringify(next, null, 2)}\n`)
    console.log(`Patched ${target}. Re-run narrate if narration text changed, then build, lint and stills.`)
    return
  }
  const artwork = await loadArtwork(root)
  if (command === 'narrate') {
    const issues = validateLessonSpec(spec)
    if (issues.length) throw new LessonSpecError(issues)
    const manifest = await narrateLesson(spec as LessonSpec, {
      root,
      workerUrl: flag('worker', 'http://127.0.0.1:8123'),
      voice: flag('voice', 'baseVoice'),
      exaggeration: Number(flag('exaggeration', '0.5')),
      cfgWeight: Number(flag('cfg', '0.5')),
      log: (line) => console.log(line),
    })
    const total = Object.values(manifest.scenes).reduce((sum, scene) => sum + scene.durationSeconds, 0)
    console.log(`Narrated ${Object.keys(manifest.scenes).length} scenes, ${total.toFixed(1)}s of speech.`)
    return
  }
  // Real narration audio, when it exists, sets scene lengths and reveal times.
  const narration = await loadNarrationManifest(root, (spec as LessonSpec).id)
  if (narration) await assertNarrationAssets(root, narration)
  const project = build(spec, artwork, narration)
  if (command === 'build') {
    const out = await writeProject(project)
    const seconds = (project.canvas.durationFrames / project.canvas.fps).toFixed(1)
    console.log(`Built ${project.id}: ${project.scenes?.length} scenes, ${project.layers.length} layers, ${seconds}s${narration ? ' (narrated)' : ' (placeholder timing)'} -> ${out}`)
    return
  }
  if (command === 'lint') {
    const issues = lintLesson(spec as LessonSpec, project)
    for (const issue of issues) console.log(`${issue.severity.toUpperCase().padEnd(7)} [${issue.scene}] ${issue.rule}: ${issue.message}`)
    console.log(issues.length ? `${issues.length} issue(s).` : 'No lint issues.')
    if (issues.some((issue) => issue.severity === 'error')) process.exit(1)
    return
  }
  if (command === 'stills') {
    const projectPath = await writeProject(project)
    await renderStills(root, projectPath, project, (line) => console.log(line))
    return
  }
  throw new Error(USAGE)
}

main().catch((error: unknown) => {
  reportFailure(error)
  process.exit(1)
})
