import type { ViteDevServer } from 'vite'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { readBody, sendError, sendJson } from './http'

type AiConfig = {
  apiKey?: string
  model?: string
  chatkitWorkflowId?: string
}

async function readAiConfig(root: string) {
  let config: AiConfig = {}
  try {
    const raw = await readFile(resolve(root, 'ai.config.local.json'), 'utf-8')
    config = JSON.parse(raw) as AiConfig
  } catch (error) {
    if ((error as { code?: unknown }).code !== 'ENOENT') throw error
  }
  const apiKey = (config.apiKey || process.env.OPENAI_API_KEY || '').trim()
  const model = config.model || process.env.OPENAI_MODEL || 'gpt-5.4-mini'
  const chatkitWorkflowId = (config.chatkitWorkflowId || process.env.OPENAI_CHATKIT_WORKFLOW_ID || '').trim()
  if (!apiKey) throw new Error('Missing apiKey in ai.config.local.json or OPENAI_API_KEY.')
  return { apiKey, model, chatkitWorkflowId }
}

async function readAiPrompt(root: string, mode: unknown) {
  const fileName = mode === 'graphic'
    ? 'ai-graphic-prompt.md'
    : 'ai-animation-prompt.md'
  return readFile(resolve(root, 'public', fileName), 'utf-8')
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

function extractChatkitClientSecret(data: unknown) {
  const value = (data as { client_secret?: unknown }).client_secret
  if (typeof value === 'string') return value
  if (value && typeof value === 'object') {
    const nested = (value as { value?: unknown; secret?: unknown }).value ?? (value as { secret?: unknown }).secret
    if (typeof nested === 'string') return nested
  }
  return ''
}

export function aiAssistPlugin() {
  return {
    name: 'local-ai-assist',
    configureServer(server: ViteDevServer) {
      server.middlewares.use('/api/chatkit/session', async (req, res, next) => {
        if (req.method !== 'POST') return next()
        try {
          const { apiKey, chatkitWorkflowId } = await readAiConfig(server.config.root)
          if (!chatkitWorkflowId) {
            sendError(res, 400, 'Missing chatkitWorkflowId in ai.config.local.json or OPENAI_CHATKIT_WORKFLOW_ID.')
            return
          }
          if (!chatkitWorkflowId.startsWith('wf_')) {
            sendError(res, 400, 'Invalid chatkitWorkflowId. Use the workflow ID from Agent Builder; it should start with "wf_", not the workflow name.')
            return
          }
          const body = JSON.parse(await readBody(req) || '{}') as {
            user?: string
            projectId?: string
            projectName?: string
            selectedLayerIds?: string[]
            currentFrame?: number
            fps?: number
            mode?: string
          }
          const response = await fetch('https://api.openai.com/v1/chatkit/sessions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'OpenAI-Beta': 'chatkit_beta=v1',
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
              user: body.user || 'local-editor-user',
              workflow: {
                id: chatkitWorkflowId,
                state_variables: {
                  project_id: body.projectId || '',
                  project_name: body.projectName || '',
                  mode: body.mode === 'animation' ? 'animation' : 'graphic',
                  selected_layer_ids: Array.isArray(body.selectedLayerIds) ? body.selectedLayerIds.join(',') : '',
                  current_frame: Number.isFinite(body.currentFrame) ? body.currentFrame : 0,
                  fps: Number.isFinite(body.fps) ? body.fps : 30,
                },
              },
            }),
          })
          const data = await response.json()
          if (!response.ok) {
            sendError(res, response.status, data?.error?.message || 'ChatKit session request failed.')
            return
          }
          const clientSecret = extractChatkitClientSecret(data)
          if (!clientSecret) {
            sendError(res, 502, 'ChatKit session response did not include a usable client secret.')
            return
          }
          sendJson(res, 200, { client_secret: clientSecret })
        } catch (error) {
          sendError(res, 500, error instanceof Error ? error.message : 'ChatKit session failed.')
        }
      })

      server.middlewares.use('/api/ai-assist', async (req, res, next) => {
        if (req.method !== 'POST') return next()
        try {
          const { apiKey, model } = await readAiConfig(server.config.root)
          const body = JSON.parse(await readBody(req)) as unknown
          const instructions = await readAiPrompt(server.config.root, (body as { mode?: unknown }).mode)
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
