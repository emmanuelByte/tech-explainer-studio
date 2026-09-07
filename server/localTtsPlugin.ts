import type { ViteDevServer } from 'vite'
import { readBody, sendError, sendJson } from './http'

const DEFAULT_LOCAL_TTS_URL = 'http://127.0.0.1:8123'

function localTtsBaseUrl() {
  return (process.env.LOCAL_TTS_URL || DEFAULT_LOCAL_TTS_URL).replace(/\/$/, '')
}

async function readError(response: Response) {
  try {
    const data = await response.json() as { detail?: string; error?: string }
    return data.detail || data.error || `Local TTS request failed with ${response.status}.`
  } catch {
    return `Local TTS request failed with ${response.status}.`
  }
}

export function localTtsPlugin() {
  return {
    name: 'local-tts-proxy',
    configureServer(server: ViteDevServer) {
      server.middlewares.use('/api/tts', async (req, res, next) => {
        if (!req.url) return next()

        const url = new URL(req.url, 'http://localhost')
        const route = url.pathname.replace(/^\/+/, '')
        const baseUrl = localTtsBaseUrl()

        try {
          if (route === 'health' && req.method === 'GET') {
            const response = await fetch(`${baseUrl}/health`)
            if (!response.ok) {
              sendError(res, response.status, await readError(response))
              return
            }
            sendJson(res, 200, await response.json())
            return
          }

          if (route === 'generate' && req.method === 'POST') {
            const body = await readBody(req)
            const response = await fetch(`${baseUrl}/generate`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body,
            })

            if (!response.ok) {
              sendError(res, response.status, await readError(response))
              return
            }

            const audio = Buffer.from(await response.arrayBuffer())
            res.statusCode = 200
            res.setHeader('Content-Type', response.headers.get('content-type') || 'audio/wav')
            res.setHeader('Content-Length', String(audio.length))
            res.setHeader('Cache-Control', 'no-store')
            res.end(audio)
            return
          }

          return next()
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Local TTS service is unavailable.'
          sendError(
            res,
            503,
            `Local TTS service is unavailable at ${baseUrl}. Start the local voice service first. ${message}`,
          )
        }
      })
    },
  }
}
