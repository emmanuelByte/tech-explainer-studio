import type { ViteDevServer } from 'vite'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { readBody, sendError, sendJson } from './http'

async function readAiConfig(root: string) {
  const raw = await readFile(resolve(root, 'ai.config.local.json'), 'utf-8')
  const config = JSON.parse(raw) as { apiKey?: string; model?: string }
  const apiKey = config.apiKey || process.env.OPENAI_API_KEY
  const model = config.model || process.env.OPENAI_MODEL || 'gpt-5.4-mini'
  if (!apiKey) throw new Error('Missing apiKey in ai.config.local.json or OPENAI_API_KEY.')
  return { apiKey, model }
}

async function readAiPrompt(root: string) {
  return readFile(resolve(root, 'public', 'ai-assistant-prompt.md'), 'utf-8')
}

function extractOutputText(data: unknown) {
  const direct = (data as { output_text?: unknown }).output_text
  if (typeof direct === 'string') return direct
  const output = (data as { output?: unknown }).output
  if (!Array.isArray(output)) return ''
  return output.flatMap((item) => {
    const content = (item as { content?: unknown }).content
    if (!Array.isArray(content)) return []
    return content.map((part) => {
      const p = part as { text?: unknown; type?: unknown }
      return typeof p.text === 'string' ? p.text : ''
    })
  }).join('')
}

export function aiAssistPlugin() {
  return {
    name: 'local-ai-assist',
    configureServer(server: ViteDevServer) {
      server.middlewares.use('/api/ai-assist', async (req, res, next) => {
        if (req.method !== 'POST') return next()
        try {
          const { apiKey, model } = await readAiConfig(server.config.root)
          const instructions = await readAiPrompt(server.config.root)
          const body = JSON.parse(await readBody(req)) as unknown
          const response = await fetch('https://api.openai.com/v1/responses', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
              model,
              instructions,
              input: JSON.stringify(body),
            }),
          })
          const data = await response.json()
          if (!response.ok) {
            sendError(res, response.status, data?.error?.message || 'OpenAI request failed.')
            return
          }
          sendJson(res, 200, { text: extractOutputText(data), model })
        } catch (error) {
          sendError(res, 500, error instanceof Error ? error.message : 'AI request failed.')
        }
      })
    },
  }
}
