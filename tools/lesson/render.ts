import { spawn } from 'node:child_process'
import { access, mkdir, rename, rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { atomicWriteFile } from '../../server/atomicFile'

/**
 * The Remotion entry imports data/assets/index.json to find local audio. It is
 * local state (not tracked), so a fresh clone has none: create the empty list
 * the renderer expects rather than failing to bundle.
 */
export async function ensureAssetIndex(root: string) {
  const path = resolve(root, 'data', 'assets', 'index.json')
  try { await access(path) } catch {
    await mkdir(resolve(path, '..'), { recursive: true })
    await atomicWriteFile(path, '[]\n')
  }
}

export type Quality = 'draft' | 'standard' | 'high'

/**
 * `standard` and `high` are native size (1920x1080 or 1080x1920). `draft` is half
 * size and low quality: fast for checking timing, never for publishing.
 */
export const QUALITY_PRESETS: Record<Quality, { scale: number; crf: number; x264Preset: string; native: boolean }> = {
  draft: { scale: 0.5, crf: 28, x264Preset: 'veryfast', native: false },
  standard: { scale: 1, crf: 18, x264Preset: 'medium', native: true },
  high: { scale: 1, crf: 14, x264Preset: 'slow', native: true },
}

export interface RenderInput {
  /** Project JSON passed to Remotion as props. */
  projectPath: string
  outPath: string
  quality: Quality
  /** Total frames in the project; every frame from 0 to this - 1 is rendered. */
  durationFrames: number
}

export function renderArgs(input: RenderInput): string[] {
  const preset = QUALITY_PRESETS[input.quality]
  return [
    'render', 'src/remotion/index.tsx', 'EditorComposition', input.outPath,
    `--props=${input.projectPath}`,
    '--public-dir=data',
    `--frames=0-${Math.max(0, input.durationFrames - 1)}`,
    '--codec=h264',
    `--scale=${preset.scale}`,
    `--crf=${preset.crf}`,
    `--x264-preset=${preset.x264Preset}`,
    '--pixel-format=yuv420p',
    // HD video is bt709 limited-range; Remotion's default (bt601, full range) is flagged yuvj420p and can look washed out or fail in some players.
    '--color-space=bt709',
    '--audio-codec=aac',
    '--log=error',
  ]
}

export interface ExpectedVideo {
  width: number
  height: number
  fps: number
  durationFrames: number
  audio: boolean
}

export function expectedVideo(canvas: { width: number; height: number; fps: number; durationFrames: number }, quality: Quality, audio: boolean): ExpectedVideo {
  const scale = QUALITY_PRESETS[quality].scale
  return { width: Math.round(canvas.width * scale), height: Math.round(canvas.height * scale), fps: canvas.fps, durationFrames: canvas.durationFrames, audio }
}

export interface Probe {
  streams: { codec_type?: string; codec_name?: string; width?: number; height?: number; r_frame_rate?: string; pix_fmt?: string; duration?: string }[]
  format?: { duration?: string }
}

const parseRate = (rate: string | undefined) => {
  const [n, d] = (rate ?? '').split('/').map(Number)
  return d ? n / d : n
}

/** Compares an exported file with what the project says it should be; returns the problems found (empty = good). */
export function checkProbe(expected: ExpectedVideo, probe: Probe): string[] {
  const problems: string[] = []
  const video = probe.streams.find((stream) => stream.codec_type === 'video')
  const audio = probe.streams.find((stream) => stream.codec_type === 'audio')
  if (!video) return ['The file has no video stream.']
  if (video.codec_name !== 'h264') problems.push(`Video codec is ${video.codec_name}, expected h264.`)
  if (video.width !== expected.width || video.height !== expected.height) problems.push(`Size is ${video.width}x${video.height}, expected ${expected.width}x${expected.height}.`)
  if (Math.abs(parseRate(video.r_frame_rate) - expected.fps) > 0.01) problems.push(`Frame rate is ${parseRate(video.r_frame_rate)}, expected ${expected.fps}.`)
  if (video.pix_fmt !== 'yuv420p') problems.push(`Pixel format is ${video.pix_fmt}, expected yuv420p (needed for playback in most players).`)
  const seconds = Number(probe.format?.duration ?? video.duration)
  const wanted = expected.durationFrames / expected.fps
  // One frame of slack for container rounding; audio never extends past the last frame in these projects.
  if (!Number.isFinite(seconds) || Math.abs(seconds - wanted) > 1.5 / expected.fps + 0.05) problems.push(`Duration is ${seconds}s, expected ${wanted.toFixed(2)}s.`)
  if (expected.audio && !audio) problems.push('Narration is expected but the file has no audio stream.')
  if (expected.audio && audio && audio.codec_name !== 'aac') problems.push(`Audio codec is ${audio.codec_name}, expected aac.`)
  // A silent lesson may still carry an empty audio track (Remotion adds one); that plays everywhere, so it is accepted.
  return problems
}

function run(command: string, args: string[], cwd: string, onLine?: (line: string) => void) {
  return new Promise<string>((done, fail) => {
    const child = spawn(command, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    let err = ''
    const feed = (chunk: Buffer, target: 'out' | 'err') => {
      const text = chunk.toString()
      if (target === 'out') out += text
      else err += text
      if (onLine) for (const line of text.split(/[\r\n]+/)) if (line.trim()) onLine(line)
    }
    child.stdout.on('data', (chunk: Buffer) => feed(chunk, 'out'))
    child.stderr.on('data', (chunk: Buffer) => feed(chunk, 'err'))
    child.on('error', (error) => fail(new Error(`Could not start ${command}: ${error.message}`)))
    child.on('close', (code) => (code === 0 ? done(out) : fail(new Error(`${command} exited with code ${code}.\n${(err || out).trim().split('\n').slice(-12).join('\n')}`))))
  })
}

export async function probeVideo(root: string, file: string): Promise<Probe> {
  const output = await run('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file], root)
  return JSON.parse(output) as Probe
}

/** Renders to a temporary name and renames on success, so a crashed render never leaves a half-written MP4 that looks finished. */
export async function renderVideo(root: string, input: RenderInput, onProgress: (done: number, total: number) => void) {
  await ensureAssetIndex(root)
  const partial = input.outPath.replace(/\.mp4$/, '.partial.mp4')
  await rm(partial, { force: true })
  const bin = resolve(root, 'node_modules', '.bin', 'remotion')
  try {
    await run(bin, renderArgs({ ...input, outPath: partial }), root, (line) => {
      const match = line.match(/Rendered (\d+)\/(\d+)/)
      if (match) onProgress(Number(match[1]), Number(match[2]))
    })
    await rename(partial, input.outPath)
  } catch (error) {
    await rm(partial, { force: true })
    throw error
  }
}
