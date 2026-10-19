import type { ViteDevServer } from 'vite'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { readBody, sendError, sendJson } from './http'

/** Review notes the human leaves while previewing; the AI reads them with `npm run lesson -- notes`. */
export function reviewPlugin() {
  return {
    name: 'local-review-notes',
    configureServer(server: ViteDevServer) {
      server.middlewares.use('/api/reviews', async (req, res, next) => {
        if (!req.url) return next()
        const id = new URL(req.url, 'http://localhost').pathname.split('/').filter(Boolean)[0]
        if (!id) return next()
        if (!/^[a-zA-Z0-9_-]+$/.test(id)) return sendError(res, 400, 'Invalid project id.')
        const path = resolve(server.config.root, 'data', 'reviews', `${id}.json`)
        try {
          if (req.method === 'GET') {
            try {
              return sendJson(res, 200, JSON.parse(await readFile(path, 'utf-8')))
            } catch (error) {
              if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
              return sendJson(res, 200, { notes: [] })
            }
          }
          if (req.method === 'PUT') {
            const body = JSON.parse(await readBody(req) || '{}') as { notes?: unknown }
            if (!Array.isArray(body.notes)) return sendError(res, 400, 'Expected { notes: [] }.')
            await mkdir(resolve(path, '..'), { recursive: true })
            await writeFile(path, `${JSON.stringify({ notes: body.notes }, null, 2)}\n`)
            return sendJson(res, 200, { ok: true })
          }
          return next()
        } catch (error) {
          sendError(res, 500, error instanceof Error ? error.message : 'Review request failed.')
        }
      })
    },
  }
}
