import { createHash } from 'node:crypto'
import { access, readdir, readFile, rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chunkLooksWrong, parseNarration, resolveCueTimes } from '../../src/domains/lesson-spec/narration'
import type { LessonSpec, NarrationManifest } from '../../src/domains/lesson-spec/types'
import { atomicWriteFile } from '../../server/atomicFile'
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
  /** Replaces the Chatterbox request; used by tests. */
  generate?: (text: string) => Promise<Buffer>
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

/** The inputs that determine what the voice says; theme and aspect ratio are deliberately absent, so changing them reuses the audio. */
export function narrationInputs(spec: LessonSpec, params: { voice: string; exaggeration: number; cfgWeight: number }) {
  return { voice: params.voice, exaggeration: params.exaggeration, cfgWeight: params.cfgWeight, scenes: spec.scenes.map((scene) => [scene.id, scene.narration]) }
}

/** True when a manifest was made from exactly this spec's narration with these voice settings. */
export function narrationIsCurrent(spec: LessonSpec, manifest: NarrationManifest | undefined, params: { voice: string; exaggeration: number; cfgWeight: number }) {
  if (!manifest) return false
  if (manifest.voiceId !== params.voice || manifest.exaggeration !== params.exaggeration || manifest.cfgWeight !== params.cfgWeight) return false
  return spec.scenes.every((scene) => manifest.scenes[scene.id]?.source === scene.narration)
    && Object.keys(manifest.scenes).length === spec.scenes.length
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
    const bytes = await (options.generate ?? ((value) => generate(options, value)))(text)
    const seconds = wavSeconds(parseWav(bytes))
    if (seconds < bestSeconds) { best = bytes; bestSeconds = seconds }
    if (!chunkLooksWrong(text, seconds)) break
    options.log(`  attempt ${attempt}: ${seconds.toFixed(1)}s for ${text.length} characters looks wrong`)
  }
  if (chunkLooksWrong(text, bestSeconds)) options.log(`  WARNING: "${text}" still looks wrong; merge it into a longer phrase`)
  await atomicWriteFile(cached, best!)
  return { bytes: best!, note: '' }
}

interface StoredAsset { id: string; name: string; fileName: string; [key: string]: unknown }

const assetIndexPath = (root: string) => resolve(root, 'data', 'assets', 'index.json')
const assetFilesDir = (root: string) => resolve(root, 'data', 'assets', 'files')
const lessonAssetPrefix = (specId: string) => `lesson:${specId}:`

async function readAssetIndex(root: string): Promise<StoredAsset[]> {
  try {
    return JSON.parse(await readFile(assetIndexPath(root), 'utf-8')) as StoredAsset[]
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw error
  }
}

/**
 * Writes a scene's joined narration into the asset store. Audio is
 * content-addressed, so a new take never overwrites the previous one, and the
 * previous entry stays in the index until the new manifest is committed.
 */
async function registerAsset(root: string, name: string, bytes: Buffer, durationSeconds: number) {
  const id = `asset_nar_${sha(bytes, 12)}`
  await atomicWriteFile(resolve(assetFilesDir(root), `${id}.wav`), bytes)
  const index = await readAssetIndex(root)
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
    createdAt: (existing?.createdAt as string | undefined) ?? now,
    updatedAt: now,
    url: `/api/assets/${id}/file`,
  }
  await atomicWriteFile(assetIndexPath(root), `${JSON.stringify([...index.filter((asset) => asset.id !== id), entry], null, 2)}\n`)
  return id
}

async function referencedAssetIds(root: string) {
  const dir = resolve(root, 'data', 'narration')
  const ids = new Set<string>()
  let names: string[] = []
  try { names = await readdir(dir) } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
  for (const name of names.filter((file) => file.endsWith('.json'))) {
    const manifest = JSON.parse(await readFile(resolve(dir, name), 'utf-8')) as NarrationManifest
    for (const scene of Object.values(manifest.scenes)) ids.add(scene.assetId)
  }
  return ids
}

/**
 * Removes this lesson's narration assets that no committed manifest uses:
 * superseded takes, and orphans left by a run that was interrupted before it
 * could commit. Also clears leftover temporary files. Safe to run at any time;
 * it never touches audio a manifest references.
 */
export async function pruneNarrationAssets(root: string, specId: string) {
  const keep = await referencedAssetIds(root)
  const index = await readAssetIndex(root)
  const stale = index.filter((asset) => asset.name.startsWith(lessonAssetPrefix(specId)) && !keep.has(asset.id))
  if (stale.length) {
    const drop = new Set(stale.map((asset) => asset.id))
    await atomicWriteFile(assetIndexPath(root), `${JSON.stringify(index.filter((asset) => !drop.has(asset.id)), null, 2)}\n`)
    for (const asset of stale) await rm(resolve(assetFilesDir(root), asset.fileName), { force: true })
  }
  for (const dir of [assetFilesDir(root), resolve(root, 'data', 'narration'), resolve(root, 'data', 'assets')]) {
    const names = await readdir(dir).catch(() => [] as string[])
    for (const name of names.filter((file) => file.endsWith('.tmp'))) await rm(resolve(dir, name), { force: true })
  }
  return stale.length
}

/** Confirms every asset a manifest names is both on disk and in the index before it is committed. */
async function assertManifestConsistent(root: string, manifest: NarrationManifest) {
  const index = new Set((await readAssetIndex(root)).map((asset) => asset.id))
  for (const [sceneId, scene] of Object.entries(manifest.scenes)) {
    if (!index.has(scene.assetId)) throw new Error(`Narration for ${sceneId} (${scene.assetId}) is not in the asset index.`)
  }
  await assertNarrationAssets(root, manifest)
}

/**
 * Synthesises every scene (chunk by chunk, cached), joins it, registers it, and
 * commits the manifest. The previous manifest and its audio stay valid until
 * the very last step, so a failure or interruption at any point leaves the last
 * working narration intact; superseded audio is removed only afterwards.
 */
export async function narrateLesson(spec: LessonSpec, options: NarrateOptions): Promise<NarrationManifest> {
  await pruneNarrationAssets(options.root, spec.id) // recover from an interrupted earlier run
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
    const assetId = await registerAsset(options.root, `${lessonAssetPrefix(spec.id)}${scene.id}`, encodeWav(joined), seconds)
    manifest.scenes[scene.id] = {
      assetId,
      durationSeconds: Math.round(seconds * 1000) / 1000,
      cues: resolveCueTimes(parsed, clips.map(wavSeconds), GAP_SECONDS),
      source: scene.narration,
    }
  }
  await assertManifestConsistent(options.root, manifest)
  await atomicWriteFile(narrationManifestPath(options.root, spec.id), `${JSON.stringify(manifest, null, 2)}\n`)
  const removed = await pruneNarrationAssets(options.root, spec.id)
  if (removed) options.log(`  removed ${removed} superseded audio file(s)`)
  return manifest
}
