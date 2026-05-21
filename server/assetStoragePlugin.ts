import type { ViteDevServer } from 'vite'
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { createReadStream } from 'node:fs'
import { extname, resolve } from 'node:path'
import { readBody, sendError, sendJson } from './http'

type StoredImageKind = 'raster' | 'svg'
type StoredAssetKind = 'image' | 'video'

interface StoredAsset {
  id: string
  name: string
  fileName: string
  mimeType: string
  kind?: StoredAssetKind
  imageKind: StoredImageKind
  naturalWidth?: number
  naturalHeight?: number
  duration?: number
  bytes: number
  createdAt: string
  updatedAt: string
  url: string
}

interface UploadAssetPayload {
  name?: string
  fileName?: string
  mimeType?: string
  kind?: StoredAssetKind
  imageKind?: StoredImageKind
  naturalWidth?: number
  naturalHeight?: number
  duration?: number
  dataUrl?: string
}

function assetsDir(root: string) {
  return resolve(root, 'data', 'assets')
}

function assetFilesDir(root: string) {
  return resolve(assetsDir(root), 'files')
}

function indexPath(root: string) {
  return resolve(assetsDir(root), 'index.json')
}

function assetUrl(id: string) {
  return `/api/assets/${id}/file`
}

function assertAssetId(id: string) {
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw new Error('Invalid asset id.')
}

function assetFilePath(root: string, asset: StoredAsset) {
  assertAssetId(asset.id)
  return resolve(assetFilesDir(root), asset.fileName)
}

async function ensureAssetDir(root: string) {
  await mkdir(assetFilesDir(root), { recursive: true })
}

async function readIndex(root: string): Promise<StoredAsset[]> {
  try {
    const assets = JSON.parse(await readFile(indexPath(root), 'utf-8')) as StoredAsset[]
    return assets.map((asset) => ({ ...asset, url: assetUrl(asset.id) }))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw error
  }
}

async function writeIndex(root: string, assets: StoredAsset[]) {
  await ensureAssetDir(root)
  await writeFile(indexPath(root), `${JSON.stringify(assets, null, 2)}\n`, 'utf-8')
}

function extensionForAsset(payload: UploadAssetPayload) {
  const fromName = extname(payload.fileName || '').toLowerCase()
  if (/^\.[a-z0-9]+$/.test(fromName)) return fromName
  if (payload.mimeType === 'image/svg+xml' || payload.imageKind === 'svg') return '.svg'
  if (payload.mimeType === 'image/png') return '.png'
  if (payload.mimeType === 'image/webp') return '.webp'
  if (payload.mimeType === 'image/gif') return '.gif'
  if (payload.mimeType === 'video/mp4') return '.mp4'
  if (payload.mimeType === 'video/webm') return '.webm'
  if (payload.mimeType === 'video/quicktime') return '.mov'
  if (payload.mimeType === 'video/x-m4v') return '.m4v'
  if (payload.mimeType?.startsWith('video/')) return '.mp4'
  return '.jpg'
}

function parseDataUrl(dataUrl: string) {
  const match = dataUrl.match(/^data:([^;,]+)?(;base64)?,(.*)$/)
  if (!match) throw new Error('Invalid asset data.')
  const mimeType = match[1] || 'application/octet-stream'
  const isBase64 = Boolean(match[2])
  const raw = match[3] || ''
  return {
    mimeType,
    buffer: isBase64 ? Buffer.from(raw, 'base64') : Buffer.from(decodeURIComponent(raw), 'utf-8'),
  }
}

async function saveAsset(root: string, payload: UploadAssetPayload) {
  if (!payload.dataUrl) throw new Error('Missing asset data.')
  const parsed = parseDataUrl(payload.dataUrl)
  const mimeType = payload.mimeType || parsed.mimeType
  const kind: StoredAssetKind = payload.kind || (mimeType.startsWith('video/') ? 'video' : 'image')
  if (kind === 'image' && !mimeType.startsWith('image/')) throw new Error('Only image files are supported for image assets.')
  if (kind === 'video' && !mimeType.startsWith('video/')) throw new Error('Only video files are supported for video assets.')

  await ensureAssetDir(root)
  const now = new Date().toISOString()
  const id = `asset_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
  const imageKind = kind === 'image' ? payload.imageKind || (mimeType === 'image/svg+xml' ? 'svg' : 'raster') : 'raster'
  const fileName = `${id}${extensionForAsset({ ...payload, mimeType, imageKind })}`
  const file = resolve(assetFilesDir(root), fileName)
  await writeFile(file, parsed.buffer)
  const info = await stat(file)

  const asset: StoredAsset = {
    id,
    name: (payload.name || payload.fileName || (kind === 'video' ? 'Video' : 'Image')).replace(/\.[^.]+$/, ''),
    fileName,
    mimeType,
    kind,
    imageKind,
    naturalWidth: payload.naturalWidth,
    naturalHeight: payload.naturalHeight,
    duration: payload.duration,
    bytes: info.size,
    createdAt: now,
    updatedAt: now,
    url: assetUrl(id),
  }
  const assets = await readIndex(root)
  await writeIndex(root, [asset, ...assets])
  return asset
}

export function assetStoragePlugin() {
  return {
    name: 'local-asset-storage',
    configureServer(server: ViteDevServer) {
      server.middlewares.use('/api/assets', async (req, res, next) => {
        if (!req.url) return next()

        const url = new URL(req.url, 'http://localhost')
        const parts = url.pathname.split('/').filter(Boolean)
        const id = parts[0]
        const subresource = parts[1]
        const root = server.config.root

        try {
          if (!id && req.method === 'GET') {
            sendJson(res, 200, await readIndex(root))
            return
          }

          if (!id && req.method === 'POST') {
            const payload = JSON.parse(await readBody(req)) as UploadAssetPayload
            sendJson(res, 200, await saveAsset(root, payload))
            return
          }

          if (!id) return next()
          assertAssetId(id)

          const assets = await readIndex(root)
          const asset = assets.find((item) => item.id === id)
          if (!asset) {
            sendError(res, 404, 'Asset not found.')
            return
          }

          if (subresource === 'file' && (req.method === 'GET' || req.method === 'HEAD')) {
            const filePath = assetFilePath(root, asset)
            const fileStat = await stat(filePath)
            const total = fileStat.size

            res.setHeader('Content-Type', asset.mimeType)
            res.setHeader('Cache-Control', 'no-cache')
            // Critical for video seeking: signals the client that we support
            // byte-range requests. Without this header the browser falls back
            // to sequential download and video.duration may stay NaN /
            // seeks to un-buffered positions fail silently.
            res.setHeader('Accept-Ranges', 'bytes')
            res.setHeader('Content-Length', String(total))

            // HEAD: just headers, no body
            if (req.method === 'HEAD') {
              res.statusCode = 200
              res.end()
              return
            }

            const rangeHeader = req.headers.range
            if (rangeHeader) {
              // Parse "bytes=START-END" (END optional). Multipart ranges not supported.
              const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim())
              if (!match) {
                res.statusCode = 416 // Range Not Satisfiable
                res.setHeader('Content-Range', `bytes */${total}`)
                res.end()
                return
              }
              const startStr = match[1]
              const endStr = match[2]
              let start = startStr === '' ? NaN : Number(startStr)
              let end = endStr === '' ? NaN : Number(endStr)

              // Suffix range: "bytes=-N" means the last N bytes
              if (Number.isNaN(start) && !Number.isNaN(end)) {
                start = Math.max(0, total - end)
                end = total - 1
              } else {
                if (Number.isNaN(start)) start = 0
                if (Number.isNaN(end)) end = total - 1
              }

              if (start > end || start >= total || end >= total) {
                res.statusCode = 416
                res.setHeader('Content-Range', `bytes */${total}`)
                res.end()
                return
              }

              const chunkSize = end - start + 1
              res.statusCode = 206 // Partial Content
              res.setHeader('Content-Range', `bytes ${start}-${end}/${total}`)
              res.setHeader('Content-Length', String(chunkSize))
              createReadStream(filePath, { start, end }).pipe(res)
              return
            }

            // No Range header: send full body, but keep Accept-Ranges so
            // the browser knows it can issue range requests on subsequent fetches.
            res.statusCode = 200
            createReadStream(filePath).pipe(res)
            return
          }

          if (!subresource && req.method === 'DELETE') {
            await rm(assetFilePath(root, asset), { force: true })
            await writeIndex(root, assets.filter((item) => item.id !== id))
            sendJson(res, 200, { ok: true })
            return
          }

          return next()
        } catch (error) {
          sendError(res, 500, error instanceof Error ? error.message : 'Asset storage failed.')
        }
      })
    },
  }
}
