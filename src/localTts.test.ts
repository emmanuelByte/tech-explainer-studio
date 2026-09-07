import { afterEach, describe, expect, it, vi } from 'vitest'
import { generateLocalSpeech, getLocalTtsHealth } from './localTts'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('local TTS client', () => {
  it('reads service health and available base voices', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      ok: true,
      device: 'mps',
      modelLoaded: false,
      voices: [{ id: 'baseVoice', fileName: 'baseVoice.wav' }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(getLocalTtsHealth()).resolves.toMatchObject({
      ok: true,
      voices: [{ id: 'baseVoice' }],
    })
    expect(fetchMock).toHaveBeenCalledWith('/api/tts/health')
  })

  it('sends voice settings and returns generated WAV data', async () => {
    const wav = new Blob(['voice'], { type: 'audio/wav' })
    const fetchMock = vi.fn().mockResolvedValue(new Response(wav, {
      status: 200,
      headers: { 'Content-Type': 'audio/wav' },
    }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await generateLocalSpeech({
      text: 'A client sends a request.',
      voice: 'baseVoice',
      exaggeration: 0.7,
      cfgWeight: 0.4,
    })
    expect(result.type).toBe('audio/wav')
    const request = fetchMock.mock.calls[0]
    expect(request[0]).toBe('/api/tts/generate')
    expect(JSON.parse(request[1].body)).toEqual({
      text: 'A client sends a request.',
      voice: 'baseVoice',
      exaggeration: 0.7,
      cfg_weight: 0.4,
    })
  })

  it('surfaces the proxy error when the local service is offline', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: 'Local TTS service is unavailable.',
    }), { status: 503, headers: { 'Content-Type': 'application/json' } })))

    await expect(getLocalTtsHealth()).rejects.toThrow('Local TTS service is unavailable.')
  })
})
