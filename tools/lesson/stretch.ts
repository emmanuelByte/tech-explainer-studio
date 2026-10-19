import { spawn } from 'node:child_process'
import { encodeWav, parseWav, type Wav } from './wav'

export type StretchFn = (wav: Wav, tempo: number) => Promise<Wav>

let rubberband: Promise<boolean> | undefined

/** Whether this ffmpeg has the rubberband filter (much better for speech than atempo). */
function hasRubberband() {
  rubberband ??= new Promise<boolean>((done) => {
    const child = spawn('ffmpeg', ['-hide_banner', '-filters'], { stdio: ['ignore', 'pipe', 'ignore'] })
    let out = ''
    child.stdout.on('data', (chunk: Buffer) => { out += chunk.toString() })
    child.on('error', () => done(false))
    child.on('close', () => done(/\brubberband\b/.test(out)))
  })
  return rubberband
}

/**
 * Changes speaking speed without changing pitch: `tempo` 0.9 = 10% slower.
 * Uses ffmpeg (rubberband when available, else atempo). Throws if ffmpeg is
 * missing or fails; callers fall back to the unstretched clip.
 */
export const ffmpegStretch: StretchFn = async (wav, tempo) => {
  const filter = (await hasRubberband()) ? `rubberband=tempo=${tempo.toFixed(4)}:pitchq=quality` : `atempo=${tempo.toFixed(4)}`
  const codec = wav.format === 3 ? 'pcm_f32le' : 'pcm_s16le'
  return new Promise<Wav>((done, fail) => {
    const child = spawn('ffmpeg', ['-v', 'error', '-f', 'wav', '-i', 'pipe:0', '-af', filter, '-c:a', codec, '-ar', String(wav.sampleRate), '-ac', String(wav.channels), '-f', 'wav', 'pipe:1'], { stdio: ['pipe', 'pipe', 'pipe'] })
    const out: Buffer[] = []
    let err = ''
    child.stdout.on('data', (chunk: Buffer) => out.push(chunk))
    child.stderr.on('data', (chunk: Buffer) => { err += chunk.toString() })
    child.on('error', (error) => fail(new Error(`Could not start ffmpeg: ${error.message}`)))
    child.on('close', (code) => {
      if (code !== 0) return fail(new Error(`ffmpeg stretch failed: ${err.trim().split('\n').slice(-2).join(' ')}`))
      try { done(parseWav(Buffer.concat(out))) } catch (error) { fail(error as Error) }
    })
    child.stdin.on('error', () => undefined)
    child.stdin.end(encodeWav(wav))
  })
}
