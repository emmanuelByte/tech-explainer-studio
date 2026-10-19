import { spawn } from 'node:child_process'
import { access } from 'node:fs/promises'
import { resolve } from 'node:path'

export interface AlignItem { wav: string; text: string }
export interface AlignedWord { text: string; start: number | null; end: number | null; score: number }
export interface AlignResult { words: AlignedWord[]; error: string | null }
export type AlignFn = (items: AlignItem[]) => Promise<AlignResult[] | undefined>

/**
 * Forced alignment of narration text to audio with tools/local-tts/align.py
 * (torchaudio's wav2vec2, local and free). Returns undefined when it cannot run
 * (no Python environment, model not downloadable, crash); callers then fall back
 * to estimated timing and say so.
 */
export function localAligner(root: string, log: (line: string) => void): AlignFn {
  const python = resolve(root, 'tools', 'local-tts', '.venv', 'bin', 'python')
  const script = resolve(root, 'tools', 'local-tts', 'align.py')
  return async (items) => {
    if (!items.length) return []
    try { await access(python) } catch {
      log(`  (aligner skipped: ${python} not found - see docs/LOCAL_TTS.md; captions will use estimated timing)`)
      return undefined
    }
    const cache = resolve(root, 'tools', 'local-tts', '.cache')
    return new Promise((done) => {
      const child = spawn(python, [script], { cwd: root, env: { ...process.env, HF_HOME: cache, TORCH_HOME: resolve(cache, 'torch') }, stdio: ['pipe', 'pipe', 'pipe'] })
      let out = ''
      let err = ''
      child.stdout.on('data', (chunk: Buffer) => { out += chunk.toString() })
      child.stderr.on('data', (chunk: Buffer) => { err += chunk.toString() })
      child.on('error', (error) => { log(`  (aligner failed to start: ${error.message}; captions will use estimated timing)`); done(undefined) })
      child.on('close', (code) => {
        if (code !== 0) { log(`  (aligner exited ${code}: ${err.trim().split('\n').slice(-2).join(' ')}; captions will use estimated timing)`); return done(undefined) }
        try { done((JSON.parse(out) as { results: AlignResult[] }).results) } catch { log('  (aligner output was not valid JSON; captions will use estimated timing)'); done(undefined) }
      })
      child.stdin.end(JSON.stringify({ items }))
    })
  }
}
