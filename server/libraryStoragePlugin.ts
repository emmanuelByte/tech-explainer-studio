import type { ViteDevServer } from 'vite'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { readBody, sendError, sendJson } from './http'

type LibraryItemKind = 'design' | 'animation'

interface StoredLibraryItem {
  id: string
  name: string
  kind: LibraryItemKind
  layers: unknown[]
  rootLayerIds: string[]
  frameStart?: number
  frameEnd?: number
  durationFrames?: number
  createdAt: string
  updatedAt: string
}

interface SaveLibraryItemPayload {
  name?: string
  kind?: LibraryItemKind
  layers?: unknown[]
  rootLayerIds?: string[]
  frameStart?: number
  frameEnd?: number
  durationFrames?: number
}

function libraryDir(root: string) {
  return resolve(root, 'data', 'library')
}

function indexPath(root: string) {
  return resolve(libraryDir(root), 'index.json')
}

function assertLibraryId(id: string) {
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw new Error('Invalid library item id.')
}

async function ensureLibraryDir(root: string) {
  await mkdir(libraryDir(root), { recursive: true })
}

async function readIndex(root: string): Promise<StoredLibraryItem[]> {
  try {
    return JSON.parse(await readFile(indexPath(root), 'utf-8')) as StoredLibraryItem[]
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw error
  }
}

async function writeIndex(root: string, items: StoredLibraryItem[]) {
  await ensureLibraryDir(root)
  await writeFile(indexPath(root), `${JSON.stringify(items, null, 2)}\n`, 'utf-8')
}

function saveLibraryItem(payload: SaveLibraryItemPayload, existing?: StoredLibraryItem): StoredLibraryItem {
  if (payload.kind !== 'design' && payload.kind !== 'animation') throw new Error('Invalid library item type.')
  if (!Array.isArray(payload.layers) || payload.layers.length === 0) throw new Error('Library item must contain at least one layer.')
  if (!Array.isArray(payload.rootLayerIds) || payload.rootLayerIds.length === 0) throw new Error('Library item must contain at least one root layer.')

  const now = new Date().toISOString()
  return {
    id: existing?.id ?? `lib_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    name: (payload.name || existing?.name || (payload.kind === 'design' ? 'Design element' : 'Reusable animation')).trim(),
    kind: payload.kind,
    layers: payload.layers,
    rootLayerIds: payload.rootLayerIds,
    frameStart: payload.frameStart,
    frameEnd: payload.frameEnd,
    durationFrames: payload.durationFrames,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  }
}

export function libraryStoragePlugin() {
  return {
    name: 'local-library-storage',
    configureServer(server: ViteDevServer) {
      server.middlewares.use('/api/library', async (req, res, next) => {
        if (!req.url) return next()

        const url = new URL(req.url, 'http://localhost')
        const parts = url.pathname.split('/').filter(Boolean)
        const id = parts[0]
        const root = server.config.root

        try {
          if (!id && req.method === 'GET') {
            sendJson(res, 200, await readIndex(root))
            return
          }

          if (!id && req.method === 'POST') {
            const payload = JSON.parse(await readBody(req)) as SaveLibraryItemPayload
            const item = saveLibraryItem(payload)
            const items = await readIndex(root)
            await writeIndex(root, [item, ...items])
            sendJson(res, 200, item)
            return
          }

          if (!id) return next()
          assertLibraryId(id)

          const items = await readIndex(root)
          const item = items.find((entry) => entry.id === id)
          if (!item) {
            sendError(res, 404, 'Library item not found.')
            return
          }

          if (!parts[1] && req.method === 'DELETE') {
            await writeIndex(root, items.filter((entry) => entry.id !== id))
            sendJson(res, 200, { ok: true })
            return
          }

          return next()
        } catch (error) {
          sendError(res, 500, error instanceof Error ? error.message : 'Library storage failed.')
        }
      })
    },
  }
}
