import type { ViteDevServer } from 'vite'
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { readBody, sendError, sendJson } from './http'
import { migrateProject } from '../src/domains/project/migrations'

interface MotionProjectLike {
  id: string
  name: string
  thumbnail?: string
  createdAt: string
  updatedAt: string
  canvas: {
    width: number
    height: number
    fps: number
    durationFrames: number
    presetName: string
  }
  layers: Array<{ type?: string }>
}

interface ProjectHistorySnapshotLike {
  id: string
  timestamp: string
  label: string
  project: MotionProjectLike
}

const MAX_REASONABLE_TRANSFORM_VALUE = 1_000_000
const DEFAULT_TRANSFORM = {
  x: 0,
  y: 0,
  scale: 1,
  scaleX: 1,
  scaleY: 1,
  opacity: 1,
  rotateX: 0,
  rotateY: 0,
  rotateZ: 0,
  skewX: 0,
  skewY: 0,
  perspective: 800,
  originX: 50,
  originY: 50,
  blur: 0,
  brightness: 100,
  contrast: 100,
  grayscale: 0,
  backdropBlur: 0,
  shadowX: 0,
  shadowY: 4,
  shadowBlur: 12,
  shadowSpread: 0,
  charProgress: 1,
}

function projectsDir(root: string) {
  return resolve(root, 'data', 'projects')
}

function assertProjectId(id: string) {
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw new Error('Invalid project id.')
}

function projectPath(root: string, id: string) {
  assertProjectId(id)
  return resolve(projectsDir(root), `${id}.json`)
}

function historyPath(root: string, id: string) {
  assertProjectId(id)
  return resolve(projectsDir(root), `${id}.history.json`)
}

async function ensureProjectDir(root: string) {
  await mkdir(projectsDir(root), { recursive: true })
}

async function readJsonFile<T>(path: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(path, 'utf-8')) as T
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return fallback
    throw error
  }
}

function indexItemFromProject(project: MotionProjectLike) {
  return {
    id: project.id,
    name: project.name,
    thumbnail: project.thumbnail || '',
    updatedAt: project.updatedAt,
    createdAt: project.createdAt,
    canvasWidth: project.canvas.width,
    canvasHeight: project.canvas.height,
    presetName: project.canvas.presetName,
    fps: project.canvas.fps,
    duration: project.canvas.durationFrames,
    layerCount: project.layers.filter((layer) => layer.type !== 'group').length,
  }
}

function isReasonableNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= MAX_REASONABLE_TRANSFORM_VALUE
}

function nearestReasonableTransformValue(layer: any, frameIndex: number, key: string) {
  for (let index = frameIndex - 1; index >= 0; index -= 1) {
    const value = layer.keyframes?.[index]?.props?.[key]
    if (isReasonableNumber(value)) return value
  }
  for (let index = frameIndex + 1; index < (layer.keyframes?.length ?? 0); index += 1) {
    const value = layer.keyframes?.[index]?.props?.[key]
    if (isReasonableNumber(value)) return value
  }
  return DEFAULT_TRANSFORM[key as keyof typeof DEFAULT_TRANSFORM]
}

function sanitizeProject(project: MotionProjectLike) {
  return {
    ...project,
    layers: (project.layers ?? []).map((layer: any) => ({
      ...layer,
      keyframes: (layer.keyframes ?? []).map((kf: any, frameIndex: number) => {
        const props = { ...DEFAULT_TRANSFORM, ...(kf.props ?? {}) }
        Object.keys(DEFAULT_TRANSFORM).forEach((key) => {
          if (!isReasonableNumber(props[key])) props[key] = nearestReasonableTransformValue(layer, frameIndex, key)
        })
        return { ...kf, props }
      }),
      propertyKeyframes: layer.propertyKeyframes
        ? Object.fromEntries(Object.entries(layer.propertyKeyframes).map(([key, frames]) => [
          key,
          (frames as any[] ?? []).map((kf) => ({
            ...kf,
            value: typeof kf.value === 'number' && !isReasonableNumber(kf.value)
              ? DEFAULT_TRANSFORM[key as keyof typeof DEFAULT_TRANSFORM] ?? 0
              : kf.value,
          })),
        ]))
        : layer.propertyKeyframes,
    })),
  }
}

async function listProjects(root: string) {
  await ensureProjectDir(root)
  const names = await readdir(projectsDir(root))
  const projects = await Promise.all(
    names
      .filter((name) => name.endsWith('.json') && !name.endsWith('.history.json'))
      .map((name) => readJsonFile<MotionProjectLike | null>(resolve(projectsDir(root), name), null))
  )
  return projects
    .filter((project): project is MotionProjectLike => Boolean(project?.id))
    .map(indexItemFromProject)
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
}

async function storageStats(root: string) {
  await ensureProjectDir(root)
  const names = await readdir(projectsDir(root))
  const files = await Promise.all(
    names
      .filter((name) => name.endsWith('.json'))
      .map(async (name) => {
        const file = resolve(projectsDir(root), name)
        const info = await stat(file)
        return { name, bytes: info.size }
      })
  )
  const projects = await Promise.all(
    files
      .filter((file) => file.name.endsWith('.json') && !file.name.endsWith('.history.json'))
      .map(async (file) => {
        const id = file.name.replace(/\.json$/, '')
        const project = await readJsonFile<MotionProjectLike | null>(projectPath(root, id), null)
        return { id, name: project?.name || id, bytes: file.bytes }
      })
  )
  return {
    totalBytes: files.reduce((sum, file) => sum + file.bytes, 0),
    projects,
  }
}

async function saveProject(root: string, project: MotionProjectLike) {
  if (!project?.id) throw new Error('Missing project id.')
  await ensureProjectDir(root)
  project = sanitizeProject(migrateProject(project))
  await writeFile(projectPath(root, project.id), `${JSON.stringify(project, null, 2)}\n`, 'utf-8')
  return project
}

async function deleteProject(root: string, id: string) {
  await rm(projectPath(root, id), { force: true })
  await rm(historyPath(root, id), { force: true })
}

async function readHistory(root: string, id: string) {
  return readJsonFile<ProjectHistorySnapshotLike[]>(historyPath(root, id), [])
}

async function saveHistorySnapshot(root: string, id: string, snapshot: ProjectHistorySnapshotLike) {
  await ensureProjectDir(root)
  const snapshots = await readHistory(root, id)
  const migratedSnapshot = { ...snapshot, project: migrateProject(snapshot.project) }
  await writeFile(historyPath(root, id), `${JSON.stringify([migratedSnapshot, ...snapshots].slice(0, 20), null, 2)}\n`, 'utf-8')
}

export function projectStoragePlugin() {
  return {
    name: 'local-project-storage',
    configureServer(server: ViteDevServer) {
      server.middlewares.use('/api/projects', async (req, res, next) => {
        if (!req.url) return next()

        const url = new URL(req.url, 'http://localhost')
        const parts = url.pathname.split('/').filter(Boolean)
        const id = parts[0]
        const subresource = parts[1]
        const root = server.config.root

        try {
          if (!id && req.method === 'GET') {
            sendJson(res, 200, await listProjects(root))
            return
          }

          if (id === 'storage' && req.method === 'GET') {
            sendJson(res, 200, await storageStats(root))
            return
          }

          if (!id) return next()

          if (subresource === 'history') {
            if (req.method === 'GET') {
              sendJson(res, 200, await readHistory(root, id))
              return
            }
            if (req.method === 'POST') {
              const snapshot = JSON.parse(await readBody(req)) as ProjectHistorySnapshotLike
              await saveHistorySnapshot(root, id, snapshot)
              sendJson(res, 200, { ok: true })
              return
            }
            if (req.method === 'DELETE') {
              await rm(historyPath(root, id), { force: true })
              sendJson(res, 200, { ok: true })
              return
            }
          }

          if (req.method === 'GET') {
            const project = await readJsonFile<MotionProjectLike | null>(projectPath(root, id), null)
            if (!project) {
              sendError(res, 404, 'Project not found.')
              return
            }
            sendJson(res, 200, project)
            return
          }

          if (req.method === 'PUT' || req.method === 'POST') {
            const project = JSON.parse(await readBody(req)) as MotionProjectLike
            if (project.id !== id) {
              sendError(res, 400, 'Project id mismatch.')
              return
            }
            sendJson(res, 200, await saveProject(root, project))
            return
          }

          if (req.method === 'DELETE') {
            await deleteProject(root, id)
            sendJson(res, 200, { ok: true })
            return
          }

          return next()
        } catch (error) {
          sendError(res, 500, error instanceof Error ? error.message : 'Project storage failed.')
        }
      })
    },
  }
}
