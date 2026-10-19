import { spawn } from 'node:child_process'
import { access, mkdir, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { captionMetrics } from '../../src/domains/lesson-spec/frame'
import type { MotionProject } from '../../src/types'
import { stillsDir } from './stills'

/**
 * Checks on the decoded video itself, which project-level lint cannot see: a
 * scene that renders blank, or a caption that never appears. They sample a few
 * frames and measure brightness only. They do not judge composition, so the
 * contact sheet they write still needs a human or agent to look at it.
 */

export interface Region { x: number; y: number; width: number; height: number }
export interface FrameProbe {
  /** Seconds into the video. */
  time: number
  label: string
  kind: 'scene' | 'caption'
  /** Part of the frame to measure; the whole frame when absent. */
  region?: Region
}
export interface FrameStats { ymin: number; ymax: number; yavg: number }

/** A frame whose brightest and darkest pixels differ by less than this is effectively flat (nothing drawn). */
const FLAT_RANGE = 25
/** White caption text on its dark box: something in the caption region must be at least this bright. */
const CAPTION_TEXT_MIN_LUMA = 190

/** Which frames to sample: the middle of every scene, and the middle of the first, a middle and the last caption phrase of each. */
export function planProbes(project: MotionProject): FrameProbe[] {
  const { width, height, fps } = project.canvas
  const probes: FrameProbe[] = []
  const metrics = captionMetrics(width, height, project.captions?.style === 'technical' ? 'technical' : 'readable')
  // Generous: three lines of caption text above the caption's bottom offset.
  const boxHeight = 3 * metrics.fontSize * metrics.lineHeight + 2 * metrics.paddingY
  const region: Region = { x: Math.round(width * 0.06), y: Math.round(height - metrics.bottom - boxHeight), width: Math.round(width * 0.88), height: Math.round(boxHeight) }
  for (const scene of project.scenes ?? []) {
    probes.push({ time: (scene.startFrame + scene.endFrame) / 2 / fps, label: `scene ${scene.id.replace(/^scene_/, '')}`, kind: 'scene' })
    const phrases = (project.script?.segments ?? []).filter((segment) => segment.sceneId === scene.id && segment.startFrame !== undefined)
    const picks = [...new Set([0, Math.floor(phrases.length / 2), phrases.length - 1])].filter((index) => index >= 0 && index < phrases.length)
    for (const index of picks) {
      const phrase = phrases[index]
      probes.push({ time: (phrase.startFrame! + phrase.endFrame!) / 2 / fps, label: `caption "${phrase.text.slice(0, 28)}"`, kind: 'caption', region })
    }
  }
  return probes
}

/** A problem with a sampled frame, or undefined when it looks as expected. */
export function judgeFrame(probe: FrameProbe, stats: FrameStats): string | undefined {
  if (probe.kind === 'scene' && stats.ymax - stats.ymin < FLAT_RANGE) return `${probe.label} at ${probe.time.toFixed(1)}s is blank (nothing drawn).`
  if (probe.kind === 'caption' && stats.ymax < CAPTION_TEXT_MIN_LUMA) return `${probe.label} should be on screen at ${probe.time.toFixed(1)}s but no caption text is visible.`
  return undefined
}

function run(args: string[]) {
  return new Promise<string>((done, fail) => {
    const child = spawn('ffmpeg', ['-v', 'error', '-nostats', ...args], { stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    let err = ''
    child.stdout.on('data', (chunk: Buffer) => { out += chunk.toString() })
    child.stderr.on('data', (chunk: Buffer) => { err += chunk.toString() })
    child.on('error', (error) => fail(new Error(`Could not start ffmpeg: ${error.message}`)))
    child.on('close', (code) => (code === 0 ? done(out) : fail(new Error(`ffmpeg failed: ${err.trim().split('\n').slice(-3).join(' ')}`))))
  })
}

/** `scale` is the video's size relative to the project canvas (0.5 for a draft render). */
export async function measureFrame(video: string, probe: FrameProbe, scale = 1): Promise<FrameStats> {
  const r = probe.region
  const crop = r ? `crop=${Math.round(r.width * scale)}:${Math.round(r.height * scale)}:${Math.round(r.x * scale)}:${Math.round(r.y * scale)},` : ''
  const out = await run(['-ss', probe.time.toFixed(3), '-i', video, '-frames:v', '1', '-vf', `${crop}signalstats,metadata=print:file=-`, '-f', 'null', '-'])
  const read = (key: string) => Number(out.match(new RegExp(`lavfi\\.signalstats\\.${key}=([-+]?\\d*\\.?\\d+(?:[eE][-+]?\\d+)?)`))?.[1])
  const stats = { ymin: read('YMIN'), ymax: read('YMAX'), yavg: read('YAVG') }
  if (Object.values(stats).some((value) => !Number.isFinite(value))) throw new Error(`Could not measure the frame at ${probe.time}s.`)
  return stats
}

/** Samples the video and returns the problems found. */
export async function inspectVideo(video: string, project: MotionProject, scale = 1): Promise<string[]> {
  const problems: string[] = []
  for (const probe of planProbes(project)) {
    const problem = judgeFrame(probe, await measureFrame(video, probe, scale))
    if (problem) problems.push(problem)
  }
  return problems
}

/**
 * One image tiling every scene's still, so a whole lesson can be read at a
 * glance. Written for a person or agent to look at: it is not analysed.
 */
export async function contactSheet(root: string, project: MotionProject): Promise<string | undefined> {
  const dir = stillsDir(root, project.id)
  try { await access(dir) } catch { return undefined }
  const files = (await readdir(dir)).filter((name) => name.endsWith('.png') && !name.startsWith('contact')).sort()
  if (!files.length) return undefined
  const portrait = project.canvas.height > project.canvas.width
  const columns = portrait ? Math.min(6, files.length) : Math.min(4, files.length)
  const rows = Math.ceil(files.length / columns)
  const out = resolve(dir, 'contact-sheet.png')
  await mkdir(dir, { recursive: true })
  await run(['-y', '-framerate', '1', '-pattern_type', 'glob', '-i', resolve(dir, '[0-9]*.png'), '-vf', `scale=${portrait ? 360 : 640}:-1,tile=${columns}x${rows}:padding=6:color=0x333333`, '-frames:v', '1', out])
  return out
}
