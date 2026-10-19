import { createHash } from 'node:crypto'
import { access, readdir, readFile, rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { estimateWordTimes } from '../../src/domains/lesson-spec/captions'
import { chunkLooksWrong, narrationWords, splitSentences } from '../../src/domains/lesson-spec/narration'
import type { LessonSpec, NarrationManifest, NarrationWord } from '../../src/domains/lesson-spec/types'
import { atomicWriteFile } from '../../server/atomicFile'
import { localAligner, type AlignFn, type AlignResult } from './align'
import { ffmpegMaster, ffmpegStretch, type MasterFn, type StretchFn } from './stretch'
import { activeRmsDb, normalizeLoudness, speechRegion, trimSilence } from './audio'
import { encodeWav, joinWavsWithGaps, parseWav, wavSeconds, type Wav } from './wav'

/** Silence kept on each side of a trimmed sentence so no word is clipped. */
const EDGE_SECONDS = 0.05
/** Pause between spoken sentences; shorter where a long sentence was split at a comma. */
const SENTENCE_GAP_SECONDS = 0.34
const CLAUSE_GAP_SECONDS = 0.16
/** Sentences are never slowed by more than this, so speech keeps its character. */
export const MIN_TEMPO = 0.8
export const DEFAULT_PACE = 3.0
/**
 * Level of the speech (RMS over spoken parts) the narration is brought to.
 * About -14.5 dBFS lands near -16 LUFS integrated, the usual target for
 * short-form video; the limiter keeps peaks under -1 dBFS.
 */
export const MASTER_SPEECH_DB = -14.5
const MAX_MASTER_GAIN_DB = 14
/** Bump when the finishing changes, so audio made the old way is spoken (from cache) and finished again. */
export const MASTER_VERSION = 3

/** Brings a scene's speech to the publishing level; falls back to plain normalisation if ffmpeg is unavailable. */
async function masterScene(options: NarrateOptions, wav: Wav): Promise<Wav> {
  const level = activeRmsDb(wav)
  if (level <= -100) return wav
  const gain = Math.max(-12, Math.min(MAX_MASTER_GAIN_DB, MASTER_SPEECH_DB - level))
  try {
    return await (options.master ?? ffmpegMaster)(wav, gain)
  } catch (error) {
    options.log(`  (could not limit-master a scene: ${(error as Error).message}; using plain normalisation)`)
    return normalizeLoudness(wav, MASTER_SPEECH_DB)
  }
}
/** Below this mean confidence a clip's alignment is not trusted. */
const MIN_ALIGNMENT_SCORE = 0.35
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
  /** Replaces the forced aligner; used by tests. */
  align?: AlignFn
  /** Words per second above which a sentence is slowed down (the voice has no reliable speed control). Default 3.0 (about 180 words per minute). */
  pace?: number
  /** Replaces the time-stretcher; used by tests. */
  stretch?: StretchFn
  /** Replaces the gain-and-limit step; used by tests. */
  master?: MasterFn
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
export function narrationInputs(spec: LessonSpec, params: { voice: string; exaggeration: number; cfgWeight: number; pace?: number }) {
  return { voice: params.voice, exaggeration: params.exaggeration, cfgWeight: params.cfgWeight, pace: params.pace ?? DEFAULT_PACE, scenes: spec.scenes.map((scene) => [scene.id, scene.narration]) }
}

/** True when a manifest was made from exactly this spec's narration with these voice settings. */
export function narrationIsCurrent(spec: LessonSpec, manifest: NarrationManifest | undefined, params: { voice: string; exaggeration: number; cfgWeight: number; pace?: number }) {
  if (!manifest) return false
  if (manifest.pace !== (params.pace ?? DEFAULT_PACE) || manifest.mastering !== MASTER_VERSION) return false
  if (manifest.voiceId !== params.voice || manifest.exaggeration !== params.exaggeration || manifest.cfgWeight !== params.cfgWeight) return false
  return spec.scenes.every((scene) => manifest.scenes[scene.id]?.source === scene.narration && (manifest.scenes[scene.id]?.words?.length ?? 0) > 0)
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
    if (!chunkLooksWrong(text, wavSeconds(parseWav(bytes)))) return { bytes, note: 'cached', key, path: cached }
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
  return { bytes: best!, note: '', key, path: cached }
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
 * Slows a sentence that is spoken faster than the target pace, without changing
 * pitch. Never speeds speech up and never slows it past MIN_TEMPO. If stretching
 * is unavailable the sentence is used as spoken and the pace check will say so.
 */
async function slowIfRushed(options: NarrateOptions, wav: Wav, wordCount: number): Promise<{ wav: Wav; tempo: number }> {
  const region = speechRegion(wav)
  const spoken = region.end - region.start
  if (spoken <= 0.3 || wordCount < 3) return { wav, tempo: 1 }
  const tempo = Math.max(MIN_TEMPO, Math.min(1, (options.pace ?? DEFAULT_PACE) / (wordCount / spoken)))
  if (tempo > 0.97) return { wav, tempo: 1 }
  try {
    return { wav: await (options.stretch ?? ffmpegStretch)(wav, tempo), tempo }
  } catch (error) {
    options.log(`  (could not slow a rushed sentence: ${(error as Error).message})`)
    return { wav, tempo: 1 }
  }
}

interface SpokenClip {
  /** First and last word of the narration this sentence covers. */
  wordStart: number
  wordEnd: number
  text: string
  /** Trimmed audio. */
  wav: Wav
  /** Seconds removed from the start of the cached take; alignment times are relative to the untrimmed take. */
  trimmed: number
  /** Playback speed applied to this sentence (1 = as spoken, 0.9 = 10% slower). */
  tempo: number
  path: string
  key: string
  endsSentence: boolean
}

const alignmentCachePath = (root: string, key: string) => resolve(root, 'data', 'narration', 'cache', `${key}.align.json`)

async function readAlignment(root: string, key: string): Promise<AlignResult | undefined> {
  try { return JSON.parse(await readFile(alignmentCachePath(root, key), 'utf-8')) as AlignResult } catch { return undefined }
}

/** Aligns every clip that has no cached alignment yet, in one batch so the model loads once. */
async function alignClips(options: NarrateOptions, clips: SpokenClip[]) {
  const results = new Map<string, AlignResult>()
  const missing: SpokenClip[] = []
  for (const clip of clips) {
    const cached = await readAlignment(options.root, clip.key)
    if (cached && !cached.error) results.set(clip.key, cached)
    else if (!missing.some((other) => other.key === clip.key)) missing.push(clip)
  }
  if (missing.length) {
    options.log(`  aligning ${missing.length} sentence(s) to their audio...`)
    const aligner = options.align ?? localAligner(options.root, options.log)
    const aligned = await aligner(missing.map((clip) => ({ wav: clip.path, text: clip.text })))
    missing.forEach((clip, index) => {
      const result = aligned?.[index]
      if (!result || result.error) return
      results.set(clip.key, result)
    })
    for (const clip of missing) {
      const result = results.get(clip.key)
      if (result) await atomicWriteFile(alignmentCachePath(options.root, clip.key), `${JSON.stringify(result)}\n`)
    }
  }
  return results
}

/**
 * Word times for one spoken sentence, relative to the start of its trimmed clip.
 * Words the aligner could not place (pure symbols) take the time between their
 * neighbours; a clip whose alignment is not trusted is estimated and marked so.
 */
function clipWords(clip: SpokenClip, result: AlignResult | undefined): NarrationWord[] {
  const words = clip.text.split(' ')
  const speech = speechRegion(clip.wav)
  const estimated = () => estimateWordTimes(words, speech.start, speech.end)
  if (!result || result.words.length !== words.length) return estimated()
  const placed = result.words.filter((word) => word.start !== null)
  if (!placed.length || placed.reduce((sum, word) => sum + word.score, 0) / placed.length < MIN_ALIGNMENT_SCORE) return estimated()
  const out = result.words.map((word, index) => ({
    text: words[index],
    start: word.start === null ? NaN : (word.start - clip.trimmed) / clip.tempo,
    end: word.end === null ? NaN : (word.end - clip.trimmed) / clip.tempo,
    timing: 'aligned' as const,
  }))
  for (let i = 0; i < out.length; i += 1) {
    if (!Number.isNaN(out[i].start)) continue
    const before = [...out.slice(0, i)].reverse().find((word) => !Number.isNaN(word.end))
    const after = out.slice(i + 1).find((word) => !Number.isNaN(word.start))
    const from = before?.end ?? speech.start
    const to = after?.start ?? speech.end
    out[i] = { ...out[i], start: from, end: Math.max(from, to), timing: 'aligned' }
  }
  // Alignment can place a word's edge a hair outside the clip; keep every time inside it.
  const duration = wavSeconds(clip.wav)
  return out.map((word) => {
    const start = Math.min(Math.max(0, word.start), duration)
    return { ...word, start, end: Math.min(Math.max(start, word.end), duration) }
  })
}

/**
 * Speaks every scene a sentence at a time, joins the sentences with natural
 * pauses at one loudness, aligns each to its audio, and commits the manifest.
 * Cue times and caption times come from the aligned words, so a cue in the
 * middle of a sentence no longer cuts the speech there. The previous manifest
 * and its audio stay valid until the very last step, so a failure at any point
 * leaves the last working narration intact; superseded audio is removed only
 * afterwards.
 */
export async function narrateLesson(spec: LessonSpec, options: NarrateOptions): Promise<NarrationManifest> {
  await pruneNarrationAssets(options.root, spec.id) // recover from an interrupted earlier run
  const manifest: NarrationManifest = { voiceId: options.voice, exaggeration: options.exaggeration, cfgWeight: options.cfgWeight, pace: options.pace ?? DEFAULT_PACE, mastering: MASTER_VERSION, scenes: {} }
  for (const scene of spec.scenes) {
    const { words, cues } = narrationWords(scene.narration)
    const clips: SpokenClip[] = []
    for (const [index, group] of splitSentences(words).entries()) {
      const text = words.slice(group.start, group.end).join(' ')
      const started = Date.now()
      const { bytes, note, key, path } = await synthesise(options, text)
      const raw = parseWav(bytes)
      const trimmedClip = trimSilence(raw, EDGE_SECONDS)
      const { wav, tempo } = await slowIfRushed(options, trimmedClip.wav, group.end - group.start)
      clips.push({ wordStart: group.start, wordEnd: group.end, text, wav, trimmed: trimmedClip.offset, tempo, path, key, endsSentence: /[.!?]["')\]]*$/.test(text) })
      options.log(`  ${scene.id} sentence ${index + 1}: ${note || `${((Date.now() - started) / 1000).toFixed(1)}s`}${tempo < 1 ? ` (slowed to ${(tempo * 100).toFixed(0)}%)` : ''}: ${text.slice(0, 56)}`)
    }
    const alignments = await alignClips(options, clips)
    // Join with a pause that fits each sentence ending, and note where each clip starts.
    const gaps = clips.map((clip) => (clip.endsSentence ? SENTENCE_GAP_SECONDS : CLAUSE_GAP_SECONDS))
    const starts: number[] = []
    let cursor = 0
    clips.forEach((clip, index) => {
      starts.push(cursor)
      cursor += wavSeconds(clip.wav) + (index < clips.length - 1 ? gaps[index] : 0)
    })
    const joined = await masterScene(options, joinWavsWithGaps(clips.map((clip) => clip.wav), gaps))
    const seconds = wavSeconds(joined)
    const spoken: NarrationWord[] = clips.flatMap((clip, index) =>
      clipWords(clip, alignments.get(clip.key)).map((word) => ({ ...word, start: round(starts[index] + word.start), end: round(starts[index] + word.end) })))
    const cueTimes = Object.fromEntries(cues.map((cue) => [cue.id, cue.wordIndex < spoken.length ? spoken[cue.wordIndex].start : round(seconds)]))
    const assetId = await registerAsset(options.root, `${lessonAssetPrefix(spec.id)}${scene.id}`, encodeWav(joined), seconds)
    manifest.scenes[scene.id] = {
      assetId,
      durationSeconds: Math.round(seconds * 1000) / 1000,
      cues: cueTimes,
      source: scene.narration,
      words: spoken,
    }
    const estimatedCount = spoken.filter((word) => word.timing === 'estimated').length
    if (estimatedCount) options.log(`  NOTE ${scene.id}: ${estimatedCount}/${spoken.length} words have estimated (not measured) timing`)
  }
  await assertManifestConsistent(options.root, manifest)
  await atomicWriteFile(narrationManifestPath(options.root, spec.id), `${JSON.stringify(manifest, null, 2)}\n`)
  const removed = await pruneNarrationAssets(options.root, spec.id)
  if (removed) options.log(`  removed ${removed} superseded audio file(s)`)
  return manifest
}

const round = (value: number) => Math.round(value * 1000) / 1000
