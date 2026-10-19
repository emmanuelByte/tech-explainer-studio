import { access, mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, extname, resolve } from 'node:path'
import { compileLessonSpec, LessonSpecError, type ComponentArtwork } from '../../src/domains/lesson-spec/compile'
import { lintLesson } from '../../src/domains/lesson-spec/lint'
import { resolveTheme, type ThemeId } from '../../src/domains/lesson-spec/theme'
import type { LessonSpec, NarrationManifest } from '../../src/domains/lesson-spec/types'
import { validateLessonSpec } from '../../src/domains/lesson-spec/validate'
import type { MotionProject } from '../../src/types'
import { atomicWriteFile } from '../../server/atomicFile'
import { loadArtwork } from './artwork'
import { fingerprint, sourceFingerprint } from './fingerprint'
import { assertNarrationAssets, loadNarrationManifest, narrateLesson, narrationInputs, narrationIsCurrent, type NarrateOptions } from './narrate'
import { checkNarrationAudio, checkProjectAudio, type AudioFinding } from './audioChecks'
import { checkProbe, expectedVideo, probeVideo, QUALITY_PRESETS, renderVideo, type Probe, type Quality } from './render'
import { contactSheet, inspectVideo } from './outputChecks'
import { renderStills, stillsDir } from './stills'

export type Aspect = '16:9' | '9:16'
export const ASPECT_CANVAS: Record<Aspect, { width: number; height: number }> = {
  '16:9': { width: 1920, height: 1080 },
  '9:16': { width: 1080, height: 1920 },
}

export interface ProduceOptions {
  root: string
  /** Absolute path of the lesson spec. */
  specPath: string
  aspects: Aspect[]
  theme?: ThemeId
  voice: string
  exaggeration: number
  cfgWeight: number
  /** Words per second above which a sentence is slowed (default 3.0). */
  pace?: number
  workerUrl: string
  /** `none` makes a silent video with placeholder timing; it needs no voice worker. */
  narration: 'local' | 'none'
  quality: Quality
  /** A file (one aspect) or a directory (several). Defaults to data/exports/<project id>.mp4. */
  out?: string
  stills: boolean
  /** Redo every stage even when its inputs are unchanged. */
  force: boolean
  /** Continue to render even when lint reports errors. */
  allowLintErrors: boolean
  log: (line: string) => void
}

/** The slow or external steps, replaceable so the orchestration can be tested without a voice worker or a renderer. */
export interface ProduceDeps {
  loadArtwork: (root: string) => Promise<ComponentArtwork>
  workerHealthy: (workerUrl: string) => Promise<boolean>
  narrate: (spec: LessonSpec, options: NarrateOptions) => Promise<NarrationManifest>
  renderStills: typeof renderStills
  renderVideo: typeof renderVideo
  probeVideo: (root: string, file: string) => Promise<Probe>
  inspectVideo: (file: string, project: MotionProject, scale: number) => Promise<string[]>
  contactSheet: (root: string, project: MotionProject) => Promise<string | undefined>
}

export const defaultDeps: ProduceDeps = {
  loadArtwork,
  workerHealthy: async (url) => {
    try { return (await fetch(`${url}/health`, { signal: AbortSignal.timeout(3000) })).ok } catch { return false }
  },
  narrate: narrateLesson,
  renderStills,
  renderVideo,
  probeVideo,
  inspectVideo,
  contactSheet,
}

export class StageError extends Error {
  constructor(public readonly stage: string, message: string, public readonly hint?: string) {
    super(message)
    this.name = 'StageError'
  }
}

interface StageRecord { fingerprint: string; finishedAt: string }
interface ProductionState { version: 1; stages: Record<string, StageRecord> }

export interface ProducedVideo {
  aspect: Aspect
  projectId: string
  videoPath: string
  /** Stages that were still current and not redone. */
  reused: string[]
  /** Stages that ran this time. */
  ran: string[]
  probeProblems: string[]
}

const COMPILER_SOURCES = ['src/domains/lesson-spec', 'src/types.ts', 'src/domains/technical-components/assets', 'tools/lesson/artwork.ts']
const RENDERER_SOURCES = ['src/remotion', 'src/domains/camera', 'src/domains/connectors', 'src/domains/sketch', 'src/domains/narration', 'src/domains/audio', 'src/domains/scenes', 'src/domains/project', 'src/domains/lesson-spec/frame.ts', 'package.json']

const exists = async (path: string) => { try { await access(path); return true } catch { return false } }

export function statePath(root: string, specId: string) {
  return resolve(root, 'data', 'production', `${specId}.json`)
}

async function readState(root: string, specId: string): Promise<ProductionState> {
  try {
    return JSON.parse(await readFile(statePath(root, specId), 'utf-8')) as ProductionState
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { version: 1, stages: {} }
    // A damaged state file only costs a redo; it must never block production.
    if (error instanceof SyntaxError) return { version: 1, stages: {} }
    throw error
  }
}

export function outputPath(root: string, projectId: string, options: Pick<ProduceOptions, 'out' | 'aspects'>) {
  if (!options.out) return resolve(root, 'data', 'exports', `${projectId}.mp4`)
  const target = resolve(process.cwd(), options.out)
  if (options.aspects.length === 1 && extname(target) === '.mp4') return target
  return resolve(target, `${projectId}.mp4`)
}

function seconds(started: number) {
  return `${((Date.now() - started) / 1000).toFixed(1)}s`
}

/**
 * Runs the whole script-to-video chain for a lesson spec:
 * validate -> narrate -> build -> lint -> stills -> render -> verify.
 *
 * Each expensive stage records a fingerprint of its inputs in
 * data/production/<lesson>.json. A re-run skips a stage whose fingerprint and
 * output are unchanged, so after a failure it resumes where it stopped, and
 * changing only the theme or aspect ratio reuses the narration audio.
 */
export async function produce(options: ProduceOptions, deps: ProduceDeps = defaultDeps): Promise<ProducedVideo[]> {
  const { root, log } = options
  const fail = (stage: string, message: string, hint?: string): never => { throw new StageError(stage, message, hint) }

  let spec: LessonSpec
  try {
    spec = JSON.parse(await readFile(options.specPath, 'utf-8')) as LessonSpec
  } catch (error) {
    return fail('validate', `Cannot read ${options.specPath}: ${(error as Error).message}`, 'Check the path to the lesson spec.')
  }
  const issues = validateLessonSpec(spec)
  if (issues.length) {
    return fail('validate', `The spec is not valid:\n${issues.map((issue) => `    ${issue.path || '(root)'}: ${issue.message}`).join('\n')}`, `Fix the spec at ${options.specPath} and run again.`)
  }
  log(`[validate] ${spec.id}: ${spec.scenes.length} scenes, ${spec.nodes.length} components - ok`)

  const state = await readState(root, spec.id)
  const save = () => atomicWriteFile(statePath(root, spec.id), `${JSON.stringify(state, null, 2)}\n`)
  const current = (name: string, print: string) => state.stages[name]?.fingerprint === print
  const record = async (name: string, print: string) => {
    state.stages[name] = { fingerprint: print, finishedAt: new Date().toISOString() }
    await save()
  }
  const specPrint = fingerprint(spec)
  const compilerPrint = await sourceFingerprint(root, COMPILER_SOURCES)
  const rendererPrint = await sourceFingerprint(root, RENDERER_SOURCES)

  // --- narrate: independent of theme and aspect, so those never redo the voice ---
  const voice = { voice: options.voice, exaggeration: options.exaggeration, cfgWeight: options.cfgWeight, pace: options.pace }
  let manifest: NarrationManifest | undefined
  const ranNarration: string[] = []
  const reusedNarration: string[] = []
  if (options.narration === 'none') {
    log('[narrate] skipped (--narration none): silent video with placeholder timing')
  } else {
    manifest = await loadNarrationManifest(root, spec.id)
    let assetsPresent = false
    if (manifest) { try { await assertNarrationAssets(root, manifest); assetsPresent = true } catch { /* regenerated below */ } }
    if (!options.force && assetsPresent && narrationIsCurrent(spec, manifest, voice)) {
      log('[narrate] up to date, reusing existing audio')
      reusedNarration.push('narrate')
    } else {
      if (!(await deps.workerHealthy(options.workerUrl))) {
        fail('narrate', `The voice worker is not reachable at ${options.workerUrl}.`,
          'Start it: cd tools/local-tts && HF_HOME="$PWD/.cache" .venv/bin/python -m uvicorn server:app --host 127.0.0.1 --port 8123  (see docs/LOCAL_TTS.md). Or pass --narration none for a silent video.')
      }
      const started = Date.now()
      log('[narrate] speaking changed phrases (unchanged ones come from the cache)...')
      try {
        manifest = await deps.narrate(spec, { root, workerUrl: options.workerUrl, ...voice, log })
      } catch (error) {
        return fail('narrate', (error as Error).message, 'The previous narration is untouched. Fix the problem and run the same command again.')
      }
      await record('narrate', fingerprint(narrationInputs(spec, voice)))
      log(`[narrate] done (${seconds(started)})`)
      ranNarration.push('narrate')
    }
  }
  const narrationPrint = manifest ? fingerprint(manifest) : 'silent'
  const reportAudio = (findings: AudioFinding[], label: string) => {
    for (const finding of findings) log(`[audio${label}] ${finding.severity.toUpperCase()} [${finding.scene}] ${finding.rule}: ${finding.message}`)
    const errors = findings.filter((finding) => finding.severity === 'error')
    if (errors.length) fail('audio', `${errors.length} problem(s) in the narration audio (listed above).`, 'Run `npm run produce -- <spec> --force` to speak it again; if it repeats, shorten or reword the scene it names. Audio checks cannot hear pronunciation: still listen to the result.')
  }
  if (manifest) {
    const findings = await checkNarrationAudio(root, spec, manifest)
    reportAudio(findings, '')
    if (!findings.some((finding) => finding.severity !== 'note')) log('[audio] narration files check out (levels, silence, clipping, pace, timing)')
  }

  const results: ProducedVideo[] = []
  for (const aspect of options.aspects) {
    const canvas = ASPECT_CANVAS[aspect]
    const theme = resolveTheme(options.theme ?? spec.theme)
    const ran = [...ranNarration]
    const reused = [...reusedNarration]
    const tag = `${aspect}`

    // --- build ---
    const buildPrint = fingerprint(specPrint, narrationPrint, theme.id, canvas, compilerPrint)
    let project: MotionProject
    try {
      const artwork = await deps.loadArtwork(root)
      // The timestamp is fixed: it is not part of the video, and a moving value would make builds differ.
      project = compileLessonSpec(spec, { artwork, now: '2026-01-01T00:00:00.000Z', narration: manifest, canvas, theme: theme.id })
    } catch (error) {
      if (error instanceof LessonSpecError) return fail('build', error.message, 'Fix the spec (or re-run narrate if the narration text changed) and run again.')
      throw error
    }
    const projectPath = resolve(root, 'data', 'projects', `${project.id}.json`)
    if (!options.force && current(`build:${tag}`, buildPrint) && await exists(projectPath)) {
      log(`[build ${tag}] up to date`)
      reused.push('build')
    } else {
      await mkdir(dirname(projectPath), { recursive: true })
      await atomicWriteFile(projectPath, `${JSON.stringify(project, null, 2)}\n`)
      await record(`build:${tag}`, buildPrint)
      log(`[build ${tag}] ${project.id}: ${project.layers.length} layers, ${(project.canvas.durationFrames / project.canvas.fps).toFixed(1)}s, theme ${theme.id}`)
      ran.push('build')
    }

    if (manifest) reportAudio(checkProjectAudio(project, manifest), ` ${tag}`)

    // --- lint: cheap, always shown ---
    const lint = lintLesson(spec, project)
    const errors = lint.filter((issue) => issue.severity === 'error')
    for (const issue of lint) log(`[lint ${tag}] ${issue.severity.toUpperCase()} [${issue.scene}] ${issue.rule}: ${issue.message}`)
    if (errors.length && !options.allowLintErrors) {
      fail('lint', `${errors.length} layout error(s) in the ${aspect} build (listed above).`,
        'Edit the spec to fix them (fewer components on screen, shorter narration, other scene focus) and run again; or pass --allow-lint-errors to render anyway.')
    }
    if (!lint.length) log(`[lint ${tag}] clean`)

    // --- stills: the visual check an author reads ---
    if (options.stills) {
      const dir = stillsDir(root, project.id)
      const present = await exists(dir) ? (await readdir(dir)).filter((name) => name.endsWith('.png')).length : 0
      if (!options.force && current(`stills:${tag}`, buildPrint + rendererPrint) && present === (project.scenes?.length ?? 0)) {
        log(`[stills ${tag}] up to date (${dir})`)
        reused.push('stills')
      } else {
        const started = Date.now()
        try {
          await deps.renderStills(root, projectPath, project)
        } catch (error) {
          return fail('stills', (error as Error).message, 'Check that Remotion can render (npm run remotion:compositions) and run again.')
        }
        await record(`stills:${tag}`, buildPrint + rendererPrint)
        log(`[stills ${tag}] ${project.scenes?.length ?? 0} frames in ${dir} (${seconds(started)}); look at them before approving`)
        ran.push('stills')
      }
    }

    if (options.stills) {
      const sheet = await deps.contactSheet(root, project).catch(() => undefined)
      if (sheet) log(`[review ${tag}] REVIEW ARTIFACT (look at it; it is not analysed): ${sheet}`)
    }

    // --- render ---
    const videoPath = outputPath(root, project.id, options)
    const renderPrint = fingerprint(buildPrint, rendererPrint, options.quality)
    if (!options.force && current(`render:${tag}`, renderPrint) && await exists(videoPath)) {
      log(`[render ${tag}] up to date (${videoPath})`)
      reused.push('render')
    } else {
      await mkdir(dirname(videoPath), { recursive: true })
      const started = Date.now()
      let lastPercent = -10
      log(`[render ${tag}] ${options.quality} quality -> ${videoPath}`)
      try {
        await deps.renderVideo(root, { projectPath, outPath: videoPath, quality: options.quality, durationFrames: project.canvas.durationFrames }, (done, total) => {
          const percent = Math.floor((done / total) * 100)
          if (percent >= lastPercent + 10) { lastPercent = percent; log(`[render ${tag}] ${percent}%`) }
        })
      } catch (error) {
        return fail('render', (error as Error).message, 'Completed stages are saved; run the same command again to resume at the render.')
      }
      await record(`render:${tag}`, renderPrint)
      log(`[render ${tag}] done (${seconds(started)})`)
      ran.push('render')
    }

    // --- verify: always, against what the project says the file should be ---
    let problems: string[]
    try {
      const probe = await deps.probeVideo(root, videoPath)
      problems = checkProbe(expectedVideo(project.canvas, options.quality, Boolean(manifest)), probe)
      const video = probe.streams.find((stream) => stream.codec_type === 'video')
      const sidecar = {
        lesson: spec.id, project: project.id, aspect, theme: theme.id, quality: options.quality, narration: manifest ? { voice: manifest.voiceId, exaggeration: manifest.exaggeration, cfgWeight: manifest.cfgWeight } : 'none',
        fingerprints: { spec: specPrint, narration: narrationPrint, build: buildPrint, render: renderPrint },
        output: { file: basename(videoPath), bytes: (await stat(videoPath)).size, width: video?.width, height: video?.height, duration: probe.format?.duration, streams: probe.streams.map((stream) => stream.codec_name) },
        verified: problems.length === 0,
      }
      await writeFile(`${videoPath}.json`, `${JSON.stringify(sidecar, null, 2)}\n`)
    } catch (error) {
      return fail('verify', (error as Error).message, 'Is ffprobe installed (ffmpeg package)? The video itself was written.')
    }
    if (problems.length) {
      fail('verify', `The exported file does not match the project:\n${problems.map((problem) => `    ${problem}`).join('\n')}`, `Delete ${videoPath} and run again; if it repeats, run with --force.`)
    }
    // Look inside the decoded video: blank scenes and captions that never render.
    let visual: string[]
    try { visual = await deps.inspectVideo(videoPath, project, QUALITY_PRESETS[options.quality].scale) } catch (error) {
      return fail('inspect', (error as Error).message, 'Is ffmpeg installed? The video itself was written.')
    }
    if (visual.length) fail('inspect', `The rendered video has problems:\n${visual.map((problem) => `    ${problem}`).join('\n')}`, 'Look at the stills and contact sheet, fix the spec, and run again (--force re-renders).')
    log(`[inspect ${tag}] sampled frames show content in every scene and captions where expected`)
    log(`[verify ${tag}] ok: ${expectedVideo(project.canvas, options.quality, Boolean(manifest)).width}x${expectedVideo(project.canvas, options.quality, Boolean(manifest)).height}, h264${manifest ? ' + aac' : ', silent'}`)
    results.push({ aspect, projectId: project.id, videoPath, reused, ran, probeProblems: problems })
  }
  return results
}
