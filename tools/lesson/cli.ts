import { spawn } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { compileLessonSpec, LessonSpecError, type ComponentArtwork } from '../../src/domains/lesson-spec/compile'
import { lintLesson } from '../../src/domains/lesson-spec/lint'
import type { LessonSpec } from '../../src/domains/lesson-spec/types'
import { validateLessonSpec } from '../../src/domains/lesson-spec/validate'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const assets = resolve(root, 'src', 'domains', 'technical-components', 'assets')

async function loadArtwork(): Promise<ComponentArtwork> {
  const read = (path: string) => readFile(resolve(assets, path), 'utf-8')
  return {
    client: await read('clients/client-group.svg'),
    'load-balancer': await read('traffic-edge/load-balancer.svg'),
    server: await read('compute/application-server.svg'),
  }
}

async function readSpec(path: string | undefined) {
  if (!path) throw new Error(USAGE)
  return JSON.parse(await readFile(resolve(process.cwd(), path), 'utf-8')) as unknown
}

const USAGE = 'Usage: lesson <validate|build|lint|stills> <spec.json>'

function build(spec: unknown, artwork: ComponentArtwork) {
  return compileLessonSpec(spec, { artwork, now: new Date().toISOString() })
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
    const child = spawn(bin, ['still', 'src/remotion/index.tsx', 'EditorComposition', outPath, `--frame=${frame}`, `--props=${projectPath}`], { cwd: root, stdio: ['ignore', 'ignore', 'pipe'] })
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
  const artwork = await loadArtwork()
  const project = build(spec, artwork)
  if (command === 'build') {
    const out = await writeProject(project)
    const seconds = (project.canvas.durationFrames / project.canvas.fps).toFixed(1)
    console.log(`Built ${project.id}: ${project.scenes?.length} scenes, ${project.layers.length} layers, ${seconds}s -> ${out}`)
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
