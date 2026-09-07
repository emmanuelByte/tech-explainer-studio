import { type AudioAsset, uploadAudioAsset } from './assetStorage'

export interface LocalTtsVoice {
  id: string
  fileName: string
}

export interface LocalTtsHealth {
  ok: boolean
  device: string
  modelLoaded: boolean
  voices: LocalTtsVoice[]
}

export interface GenerateLocalSpeechRequest {
  text: string
  voice: string
  exaggeration?: number
  cfgWeight?: number
}

async function readError(response: Response) {
  try {
    const data = await response.json() as { error?: string; detail?: string }
    return data.error || data.detail || `Request failed with ${response.status}`
  } catch {
    return `Request failed with ${response.status}`
  }
}

export async function getLocalTtsHealth() {
  const response = await fetch('/api/tts/health')
  if (!response.ok) throw new Error(await readError(response))
  return response.json() as Promise<LocalTtsHealth>
}

export async function generateLocalSpeech(request: GenerateLocalSpeechRequest) {
  const response = await fetch('/api/tts/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: request.text,
      voice: request.voice,
      exaggeration: request.exaggeration,
      cfg_weight: request.cfgWeight,
    }),
  })

  if (!response.ok) throw new Error(await readError(response))
  return response.blob()
}

function safeFileName(value: string) {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return normalized || 'narration'
}

export async function generateAndStoreLocalSpeech(
  request: GenerateLocalSpeechRequest,
  name = 'Narration',
): Promise<AudioAsset> {
  const blob = await generateLocalSpeech(request)
  const file = new File([blob], `${safeFileName(name)}.wav`, {
    type: blob.type || 'audio/wav',
  })
  return uploadAudioAsset(file)
}
