import { spawn } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { TECHNICAL_COMPONENT_KINDS, type TechnicalComponentKind } from '../../src/types'
import { compileLessonSpec, LessonSpecError, type ComponentArtwork } from '../../src/domains/lesson-spec/compile'
import { lintLesson } from '../../src/domains/lesson-spec/lint'
import { loadNarrationManifest, narrateLesson } from './narrate'
import type { LessonSpec, NarrationManifest } from '../../src/domains/lesson-spec/types'
import { validateLessonSpec } from '../../src/domains/lesson-spec/validate'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const assets = resolve(root, 'src', 'domains', 'technical-components', 'assets')

const ARTWORK_FILES: Record<TechnicalComponentKind, string> = {
  client: 'clients/client-group.svg',
  'load-balancer': 'traffic-edge/load-balancer.svg',
  server: 'compute/application-server.svg',
  database: 'data-stores/database.svg',
  cache: 'data-stores/cache.svg',
  queue: 'messaging/queue.svg',
  cdn: 'traffic-edge/cdn.svg',
  'api-gateway': 'traffic-edge/api-gateway.svg',
  'object-storage': 'data-stores/object-storage.svg',
  worker: 'compute/worker.svg',
}

async function loadArtwork(): Promise<ComponentArtwork> {
  const entries = await Promise.all(
    TECHNICAL_COMPONENT_KINDS.map(async (kind) => [kind, await readFile(resolve(assets, ARTWORK_FILES[kind]), 'utf-8')] as const),
  )
  return Object.fromEntries(entries) as ComponentArtwork
}

async function readSpec(path: string | undefined) {
  if (!path) throw new Error(USAGE)
  return JSON.parse(await readFile(resolve(process.cwd(), path), 'utf-8')) as unknown
}

const USAGE = 'Usage: lesson <validate|narrate|build|lint|stills|notes> <spec.json>  (narrate: --voice <id> --worker <url>)'

function build(spec: unknown, artwork: ComponentArtwork, narration?: NarrationManifest) {
  return compileLessonSpec(spec, { artwork, now: new Date().toISOString(), narration })
}

function flag(name: string, fallback: string) {
  const at = process.argv.indexOf(`--${name}`)
  return at >= 0 && process.argv[at + 1] ? process.argv[at + 1] : fallback
}

async function writeProject(project: ReturnType<typeof build>) {
  const out = resolve(root, 'data', 'projects', `${project.id}.json`)
  await mkdir(dirname(out), { recursive: true })
  await writeFile(out, JSON.stringify(project, null, 2))
  return out
}

function renderStill(projectPath: string, frame: number, outPath: string) {
  const bin = resolve(root, 'node_modules', '.bin', 'remotion')
  return new Promise<void>((done, fail) => {
    const child = spawn(bin, ['still', 'src/remotion/index.tsx', 'EditorComposition', outPath, `--frame=${frame}`, `--props=${projectPath}`, '--public-dir=data'], { cwd: root, stdio: ['ignore', 'ignore', 'pipe'] })
    let stderr = ''
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString() })
    child.on('close', (code) => (code === 0 ? done() : fail(new Error(`remotion still failed at frame ${frame}:\n${stderr.trim()}`))))
  })
}

async function main() {
  const [command, specPath] = process.argv.slice(2)
  const spec = await readSpec(specPath)
  if (command === 'validate') {
    const issues = validateLessonSpec(spec)
    if (issues.length) throw new LessonSpecError(issues)
    console.log('Spec is valid.')
    return
  }
  if (command === 'notes') {
    // Review notes left in the review screen; `--done` marks the open ones as handled.
    const id = `lesson_${(spec as LessonSpec).id}`
    const path = resolve(root, 'data', 'reviews', `${id}.json`)
    let notes: { sceneId: string; frame: number; text: string; done?: boolean }[] = []
    try {
      notes = (JSON.parse(await readFile(path, 'utf-8')) as { notes: typeof notes }).notes
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
    const open = notes.filter((note) => !note.done)
    for (const note of open) console.log(`[${note.sceneId}] ${(note.frame / 30).toFixed(1)}s: ${note.text}`)
    console.log(open.length ? `${open.length} open note(s).` : 'No open notes.')
    if (process.argv.includes('--done') && open.length) {
      await writeFile(path, `${JSON.stringify({ notes: notes.map((note) => ({ ...note, done: true })) }, null, 2)}\n`)
      console.log('Marked as done.')
    }
    return
  }
  const artwork = await loadArtwork()
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
    // One frame per scene, just before it ends, when its reveals and camera move have finished.
    const projectPath = await writeProject(project)
    const dir = resolve(root, 'data', 'exports', 'stills', project.id)
    await mkdir(dir, { recursive: true })
    for (const [index, scene] of (project.scenes ?? []).entries()) {
      const out = resolve(dir, `${String(index + 1).padStart(2, '0')}-${scene.id.replace(/^scene_/, '')}.png`)
      await renderStill(projectPath, scene.endFrame - 8, out)
      console.log(out)
    }
    return
  }
  throw new Error(USAGE)
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
