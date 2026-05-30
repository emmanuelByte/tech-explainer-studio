import type { ViteDevServer } from 'vite'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { mkdir, readFile, stat } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { readBody, sendError, sendJson } from './http'

type ExportStatus = 'queued' | 'running' | 'done' | 'failed' | 'cancelled'
type ExportFormat = 'mp4' | 'webm'
type ExportQuality = 'standard' | 'high' | 'ultra'
type ExportPhase = 'queued' | 'bundling' | 'preparing' | 'rendering' | 'encoding' | 'done'

interface ExportJob {
  id: string
  status: ExportStatus
  phase: ExportPhase
  progress: number
  projectId: string
  fileName: string
  format: ExportFormat
  quality: ExportQuality
  outputPath: string
  startFrame: number
  endFrame: number
  startedAt: string
  finishedAt?: string
  error?: string
  renderedFrames: number
  totalRenderFrames: number
  encodedFrames: number
  totalEncodeFrames: number
  logs: string[]
  child?: ChildProcessWithoutNullStreams
}

const jobs = new Map<string, ExportJob>()
const MAX_LOG_LINES = 80
const FORMAT_CODEC: Record<ExportFormat, 'h264' | 'vp9'> = {
  mp4: 'h264',
  webm: 'vp9',
}

const QUALITY_PROFILES: Record<ExportQuality, { scale: number; crf: Record<ExportFormat, number> }> = {
  standard: { scale: 1, crf: { mp4: 18, webm: 28 } },
  high: { scale: 2, crf: { mp4: 16, webm: 24 } },
  ultra: { scale: 3, crf: { mp4: 14, webm: 20 } },
}

function exportsDir(root: string) {
  return resolve(root, 'data', 'exports')
}

function assertProjectId(id: string) {
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw new Error('Invalid project id.')
}

function projectPath(root: string, id: string) {
  assertProjectId(id)
  return resolve(root, 'data', 'projects', `${id}.json`)
}

function remotionBin(root: string) {
  return resolve(root, 'node_modules', '.bin', process.platform === 'win32' ? 'remotion.cmd' : 'remotion')
}

function sanitizeBaseName(value: unknown, fallback: string) {
  const base = String(value || fallback)
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120)
  return base || fallback
}

function normalizeFormat(value: unknown): ExportFormat {
  return value === 'webm' ? 'webm' : 'mp4'
}

function normalizeQuality(value: unknown): ExportQuality {
  return value === 'high' || value === 'ultra' ? value : 'standard'
}

function clampFrame(value: unknown, min: number, max: number) {
  const num = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(num)) return min
  return Math.max(min, Math.min(max, Math.round(num)))
}

function publicJob(job: ExportJob) {
  return {
    id: job.id,
    status: job.status,
    phase: job.phase,
    progress: job.progress,
    projectId: job.projectId,
    fileName: job.fileName,
    format: job.format,
    quality: job.quality,
    outputPath: job.outputPath,
    startFrame: job.startFrame,
    endFrame: job.endFrame,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    error: job.error,
    renderedFrames: job.renderedFrames,
    totalRenderFrames: job.totalRenderFrames,
    encodedFrames: job.encodedFrames,
    totalEncodeFrames: job.totalEncodeFrames,
    logs: job.logs,
  }
}

function setProgress(job: ExportJob, value: number) {
  job.progress = Math.max(job.progress, Math.min(99, Math.round(value)))
}

function updateProgressFromLine(job: ExportJob, line: string) {
  const bundling = line.match(/^Bundling\s+(\d+(?:\.\d+)?)%/i)
  if (bundling) {
    job.phase = 'bundling'
    setProgress(job, 1 + (Number(bundling[1]) / 100) * 7)
    return
  }

  if (/Getting composition/i.test(line)) {
    job.phase = 'preparing'
    setProgress(job, 9)
    return
  }

  const rendered = line.match(/^Rendered\s+(\d+)\/(\d+)/i)
  if (rendered) {
    const done = Number(rendered[1])
    const total = Math.max(1, Number(rendered[2]))
    job.phase = 'rendering'
    job.renderedFrames = done
    job.totalRenderFrames = total
    setProgress(job, 10 + (done / total) * 65)
    return
  }

  const encoded = line.match(/^Encoded\s+(\d+)\/(\d+)/i)
  if (encoded) {
    const done = Number(encoded[1])
    const total = Math.max(1, Number(encoded[2]))
    job.phase = 'encoding'
    job.encodedFrames = done
    job.totalEncodeFrames = total
    setProgress(job, 75 + (done / total) * 24)
  }
}

function appendLog(job: ExportJob, chunk: Buffer | string) {
  chunk
    .toString()
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => line.replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '').trim())
    .filter(Boolean)
    .forEach((line) => {
      updateProgressFromLine(job, line)
      job.logs.push(line)
      if (job.logs.length > MAX_LOG_LINES) job.logs.shift()
    })
}

async function readProjectFrameCount(root: string, projectId: string) {
  const project = JSON.parse(await readFile(projectPath(root, projectId), 'utf-8')) as {
    canvas?: { durationFrames?: number }
  }
  return Math.max(1, Math.round(project.canvas?.durationFrames ?? 1))
}

async function createExportJob(root: string, body: Record<string, unknown>) {
  const projectId = String(body.projectId || '').trim()
  assertProjectId(projectId)
  await stat(projectPath(root, projectId))

  const durationFrames = await readProjectFrameCount(root, projectId)
  const startFrame = clampFrame(body.startFrame, 0, durationFrames - 1)
  const endFrame = clampFrame(body.endFrame, startFrame, durationFrames - 1)
  const format = normalizeFormat(body.format)
  const quality = normalizeQuality(body.quality)
  const profile = QUALITY_PROFILES[quality]
  const baseName = sanitizeBaseName(body.fileName, projectId)
  const fileName = `${baseName}.${format}`
  const outputPath = resolve(exportsDir(root), fileName)

  await mkdir(dirname(outputPath), { recursive: true })

  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  const job: ExportJob = {
    id,
    status: 'queued',
    phase: 'queued',
    progress: 0,
    projectId,
    fileName,
    format,
    quality,
    outputPath,
    startFrame,
    endFrame,
    startedAt: new Date().toISOString(),
    renderedFrames: 0,
    totalRenderFrames: endFrame - startFrame + 1,
    encodedFrames: 0,
    totalEncodeFrames: endFrame - startFrame + 1,
    logs: [],
  }
  jobs.set(id, job)

  const args = [
    'render',
    'src/remotion/index.tsx',
    'EditorComposition',
    outputPath,
    `--props=${projectPath(root, projectId)}`,
    '--public-dir=data',
    `--frames=${startFrame}-${endFrame}`,
    `--codec=${FORMAT_CODEC[format]}`,
    `--scale=${profile.scale}`,
    `--crf=${profile.crf[format]}`,
  ]

  job.status = 'running'
  job.phase = 'bundling'
  job.progress = 1
  job.logs.push(`remotion ${args.join(' ')}`)
  const child = spawn(remotionBin(root), args, {
    cwd: root,
    env: process.env,
  })
  job.child = child

  child.stdout.on('data', (chunk) => appendLog(job, chunk))
  child.stderr.on('data', (chunk) => appendLog(job, chunk))
  child.on('error', (error) => {
    job.status = 'failed'
    job.error = error.message
    job.finishedAt = new Date().toISOString()
    job.progress = 0
    job.child = undefined
  })
  child.on('close', (code, signal) => {
    if (job.status === 'cancelled') return
    job.finishedAt = new Date().toISOString()
    job.child = undefined
    if (code === 0) {
      job.status = 'done'
      job.phase = 'done'
      job.progress = 100
      job.logs.push(`Export finished: ${job.outputPath}`)
    } else {
      job.status = 'failed'
      job.error = signal ? `Export stopped by ${signal}.` : `Remotion exited with code ${code}.`
      job.progress = Math.max(0, job.progress)
    }
  })

  return job
}

function revealPath(filePath: string) {
  if (process.platform === 'darwin') return spawn('open', ['-R', filePath], { detached: true, stdio: 'ignore' })
  if (process.platform === 'win32') return spawn('explorer.exe', [`/select,${filePath}`], { detached: true, stdio: 'ignore' })
  return spawn('xdg-open', [dirname(filePath)], { detached: true, stdio: 'ignore' })
}

export function exportPlugin() {
  return {
    name: 'local-export-renderer',
    configureServer(server: ViteDevServer) {
      server.middlewares.use('/api/exports', async (req, res, next) => {
        if (!req.url) return next()

        const url = new URL(req.url, 'http://localhost')
        const parts = url.pathname.split('/').filter(Boolean)
        const id = parts[0]
        const subresource = parts[1]
        const root = server.config.root

        try {
          if (!id && req.method === 'POST') {
            const job = await createExportJob(root, JSON.parse(await readBody(req) || '{}') as Record<string, unknown>)
            sendJson(res, 200, publicJob(job))
            return
          }

          if (!id) return next()
          const job = jobs.get(id)
          if (!job) {
            sendError(res, 404, 'Export job not found.')
            return
          }

          if (!subresource && req.method === 'GET') {
            sendJson(res, 200, publicJob(job))
            return
          }

          if (subresource === 'reveal' && req.method === 'POST') {
            if (job.status !== 'done') {
              sendError(res, 409, 'Export is not finished yet.')
              return
            }
            revealPath(job.outputPath).unref()
            sendJson(res, 200, { ok: true })
            return
          }

          if (subresource === 'cancel' && req.method === 'POST') {
            if (job.status === 'running' && job.child) {
              job.status = 'cancelled'
              job.finishedAt = new Date().toISOString()
              job.child.kill()
            }
            sendJson(res, 200, publicJob(job))
            return
          }

          return next()
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Export request failed.'
          sendError(res, 500, message)
        }
      })
    },
  }
}
