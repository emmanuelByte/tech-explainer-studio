import { createHash } from 'node:crypto'
import { access, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chunkLooksWrong, parseNarration, resolveCueTimes } from '../../src/domains/lesson-spec/narration'
import type { LessonSpec, NarrationManifest } from '../../src/domains/lesson-spec/types'
import { encodeWav, joinWavs, parseWav, wavSeconds } from './wav'

const GAP_SECONDS = 0.18
const REQUEST_TIMEOUT_MS = 15 * 60 * 1000

export interface NarrateOptions {
  root: string
  workerUrl: string
  voice: string
  exaggeration: number
  cfgWeight: number
  log: (line: string) => void
}

const sha = (value: string | Buffer, length: number) => createHash('sha256').update(value).digest('hex').slice(0, length)

export function narrationManifestPath(root: string, specId: string) {
  return resolve(root, 'data', 'narration', `${specId}.json`)
}

export async function loadNarrationManifest(root: string, specId: string): Promise<NarrationManifest | undefined> {
  try {
    return JSON.parse(await readFile(narrationManifestPath(root, specId), 'utf-8')) as NarrationManifest
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw error
  }
}

/** Fail before compile/render when a manifest points at local audio that was cleaned up or never copied. */
export async function assertNarrationAssets(root: string, manifest: NarrationManifest) {
  const missing: string[] = []
  for (const [sceneId, scene] of Object.entries(manifest.scenes)) {
    const file = resolve(root, 'data', 'assets', 'files', `${scene.assetId}.wav`)
    try { await access(file) } catch { missing.push(`${sceneId} (${scene.assetId})`) }
  }
  if (missing.length) {
    throw new Error(`Narration audio is missing for ${missing.join(', ')}. Run \`lesson narrate <spec>\` to regenerate it.`)
  }
}

const MAX_ATTEMPTS = 3

async function generate(options: NarrateOptions, text: string) {
  const response = await fetch(`${options.workerUrl}/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, voice: options.voice, exaggeration: options.exaggeration, cfg_weight: options.cfgWeight }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
  if (!response.ok) throw new Error(`Chatterbox failed (${response.status}): ${(await response.text()).slice(0, 300)}`)
  return Buffer.from(await response.arrayBuffer())
}

/** Cached by text + voice + settings. A take that looks stretched or garbled is re-rolled (best of three). */
async function synthesise(options: NarrateOptions, text: string) {
  const key = sha(JSON.stringify([text, options.voice, options.exaggeration, options.cfgWeight]), 16)
  const cached = resolve(options.root, 'data', 'narration', 'cache', `${key}.wav`)
  try {
    const bytes = await readFile(cached)
    if (!chunkLooksWrong(text, wavSeconds(parseWav(bytes)))) return { bytes, note: 'cached' }
    options.log(`  (cached take of "${text.slice(0, 30)}" looks wrong; re-rolling)`)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
  let best: Buffer | null = null
  let bestSeconds = Infinity
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const bytes = await generate(options, text)
    const seconds = wavSeconds(parseWav(bytes))
    if (seconds < bestSeconds) { best = bytes; bestSeconds = seconds }
    if (!chunkLooksWrong(text, seconds)) break
    options.log(`  attempt ${attempt}: ${seconds.toFixed(1)}s for ${text.length} characters looks wrong`)
  }
  if (chunkLooksWrong(text, bestSeconds)) options.log(`  WARNING: "${text}" still looks wrong; merge it into a longer phrase`)
  await mkdir(resolve(cached, '..'), { recursive: true })
  await writeFile(cached, best!)
  return { bytes: best!, note: '' }
}

interface StoredAsset { id: string; name: string; fileName: string; [key: string]: unknown }

/** Registers a scene's joined narration in the editor's asset store so projects and renders can reference it. */
async function registerAsset(root: string, name: string, bytes: Buffer, durationSeconds: number) {
  const id = `asset_nar_${sha(bytes, 12)}`
  const indexPath = resolve(root, 'data', 'assets', 'index.json')
  const filesDir = resolve(root, 'data', 'assets', 'files')
  await mkdir(filesDir, { recursive: true })
  let index: StoredAsset[] = []
  try {
    index = JSON.parse(await readFile(indexPath, 'utf-8')) as StoredAsset[]
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
  // Drop superseded audio for the same scene so old takes do not pile up.
  for (const old of index.filter((asset) => asset.name === name && asset.id !== id)) {
    await rm(resolve(filesDir, old.fileName), { force: true })
  }
  const now = new Date().toISOString()
  const existing = index.find((asset) => asset.id === id)
  const entry = {
    id,
    name,
    fileName: `${id}.wav`,
    mimeType: 'audio/wav',
    kind: 'audio',
    imageKind: 'raster',
    duration: Math.round(durationSeconds * 100) / 100,
    bytes: bytes.length,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    url: `/api/assets/${id}/file`,
  }
  await writeFile(resolve(filesDir, entry.fileName), bytes)
  const next = [...index.filter((asset) => asset.name !== name), entry]
  await writeFile(indexPath, `${JSON.stringify(next, null, 2)}\n`)
  return id
}

/** Synthesises every scene (chunk by chunk, cached), joins it, registers it, and writes the manifest. */
export async function narrateLesson(spec: LessonSpec, options: NarrateOptions): Promise<NarrationManifest> {
  const manifest: NarrationManifest = { voiceId: options.voice, exaggeration: options.exaggeration, cfgWeight: options.cfgWeight, scenes: {} }
  for (const scene of spec.scenes) {
    const parsed = parseNarration(scene.narration)
    const clips = []
    for (const [index, chunk] of parsed.chunks.entries()) {
      const started = Date.now()
      const { bytes, note } = await synthesise(options, chunk)
      clips.push(parseWav(bytes))
      options.log(`  ${scene.id} ${index + 1}/${parsed.chunks.length} ${note || `${((Date.now() - started) / 1000).toFixed(1)}s`}: ${chunk.slice(0, 48)}`)
    }
    const joined = joinWavs(clips, GAP_SECONDS)
    const seconds = wavSeconds(joined)
    const assetId = await registerAsset(options.root, `lesson:${spec.id}:${scene.id}`, encodeWav(joined), seconds)
    manifest.scenes[scene.id] = {
      assetId,
      durationSeconds: Math.round(seconds * 1000) / 1000,
      cues: resolveCueTimes(parsed, clips.map(wavSeconds), GAP_SECONDS),
      source: scene.narration,
    }
  }
  const path = narrationManifestPath(options.root, spec.id)
  await mkdir(resolve(path, '..'), { recursive: true })
  await writeFile(path, `${JSON.stringify(manifest, null, 2)}\n`)
  return manifest
}
