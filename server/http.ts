import type { IncomingMessage, ServerResponse } from 'node:http'

export function readBody(req: IncomingMessage) {
  return new Promise<string>((resolveBody, reject) => {
    let body = ''
    req.on('data', (chunk) => { body += chunk })
    req.on('end', () => resolveBody(body))
    req.on('error', reject)
  })
}

export function sendJson(res: ServerResponse, statusCode: number, data: unknown) {
  res.statusCode = statusCode
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(data))
}

export function sendError(res: ServerResponse, statusCode: number, message: string) {
  sendJson(res, statusCode, { error: message })
}
