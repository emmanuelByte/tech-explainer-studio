import type { Wav } from './wav'

/**
 * Signal analysis for narration clips. These measure what is actually in the
 * waveform (level, silence, clipping); they cannot judge pronunciation or
 * naturalness, which still needs a human listen.
 */

/** Mono samples in -1..1 (PCM 16-bit or IEEE float 32). */
export function samples(wav: Wav): Float32Array {
  const bytes = wav.bitsPerSample / 8
  const frames = Math.floor(wav.data.length / (bytes * wav.channels))
  const out = new Float32Array(frames)
  for (let i = 0; i < frames; i += 1) {
    let sum = 0
    for (let c = 0; c < wav.channels; c += 1) {
      const at = (i * wav.channels + c) * bytes
      if (wav.format === 3 && wav.bitsPerSample === 32) sum += wav.data.readFloatLE(at)
      else if (wav.format === 1 && wav.bitsPerSample === 16) sum += wav.data.readInt16LE(at) / 32768
      else throw new Error(`Unsupported WAV sample format (${wav.format}, ${wav.bitsPerSample}-bit).`)
    }
    out[i] = sum / wav.channels
  }
  return out
}

/** Writes mono samples back in the format of `template`. */
export function fromSamples(template: Wav, data: Float32Array): Wav {
  const bytes = template.bitsPerSample / 8
  const buffer = Buffer.alloc(data.length * bytes * template.channels)
  for (let i = 0; i < data.length; i += 1) {
    for (let c = 0; c < template.channels; c += 1) {
      const at = (i * template.channels + c) * bytes
      if (template.format === 3) buffer.writeFloatLE(data[i], at)
      else buffer.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(data[i] * 32768))), at)
    }
  }
  return { ...template, data: buffer }
}

const toDb = (value: number) => (value > 1e-9 ? 20 * Math.log10(value) : -120)

/** RMS level (dBFS) of consecutive windows. */
export function envelope(wav: Wav, windowSeconds = 0.01): { db: number[]; window: number } {
  const data = samples(wav)
  const size = Math.max(1, Math.round(wav.sampleRate * windowSeconds))
  const db: number[] = []
  for (let start = 0; start < data.length; start += size) {
    let sum = 0
    const end = Math.min(data.length, start + size)
    for (let i = start; i < end; i += 1) sum += data[i] * data[i]
    db.push(toDb(Math.sqrt(sum / (end - start))))
  }
  return { db, window: size / wav.sampleRate }
}

/** Windows quieter than the loudest by more than this are treated as silence. */
const SILENCE_BELOW_PEAK_DB = 32

function speechThreshold(db: number[]) {
  return Math.max(...db) - SILENCE_BELOW_PEAK_DB
}

/** First and last moments of speech, in seconds. */
export function speechRegion(wav: Wav): { start: number; end: number } {
  const { db, window } = envelope(wav)
  const limit = speechThreshold(db)
  const first = db.findIndex((value) => value > limit)
  let last = db.length - 1
  while (last > 0 && db[last] <= limit) last -= 1
  if (first < 0) return { start: 0, end: 0 }
  return { start: first * window, end: (last + 1) * window }
}

/**
 * Removes silence at both ends, keeping `keepSeconds` of it so words are not
 * clipped. `offset` is how much was removed from the start, so times measured
 * on the original can be moved onto the trimmed clip.
 */
export function trimSilence(wav: Wav, keepSeconds: number): { wav: Wav; offset: number } {
  const { start, end } = speechRegion(wav)
  if (end <= start) return { wav, offset: 0 }
  const data = samples(wav)
  const from = Math.max(0, Math.round((start - keepSeconds) * wav.sampleRate))
  const to = Math.min(data.length, Math.round((end + keepSeconds) * wav.sampleRate))
  return { wav: fromSamples(wav, data.slice(from, to)), offset: from / wav.sampleRate }
}

/** Level of the speech itself (RMS over non-silent windows), dBFS. */
export function activeRmsDb(wav: Wav): number {
  const data = samples(wav)
  const { db, window } = envelope(wav)
  const limit = speechThreshold(db)
  const size = Math.max(1, Math.round(window * wav.sampleRate))
  let sum = 0
  let count = 0
  db.forEach((value, index) => {
    if (value <= limit) return
    for (let i = index * size; i < Math.min(data.length, (index + 1) * size); i += 1) { sum += data[i] * data[i]; count += 1 }
  })
  return count ? toDb(Math.sqrt(sum / count)) : -120
}

export function peakLevel(wav: Wav): number {
  let peak = 0
  for (const value of samples(wav)) peak = Math.max(peak, Math.abs(value))
  return peak
}

/** Fraction of samples at or beyond full scale. */
export function clippedFraction(wav: Wav): number {
  const data = samples(wav)
  if (!data.length) return 0
  let clipped = 0
  for (const value of data) if (Math.abs(value) >= 0.999) clipped += 1
  return clipped / data.length
}

/** Silences inside the speech that last at least `minSeconds`. */
export function internalSilences(wav: Wav, minSeconds: number): { start: number; end: number }[] {
  const { start, end } = speechRegion(wav)
  const { db, window } = envelope(wav)
  const limit = speechThreshold(db)
  const found: { start: number; end: number }[] = []
  let from = -1
  for (let i = Math.floor(start / window); i < Math.ceil(end / window); i += 1) {
    if (db[i] <= limit) { if (from < 0) from = i } else if (from >= 0) {
      if ((i - from) * window >= minSeconds) found.push({ start: from * window, end: i * window })
      from = -1
    }
  }
  return found
}

/**
 * Brings the speech level to `targetDb` so scenes sit at one volume, never
 * pushing the peak past `ceiling` and never moving by more than `maxGainDb`.
 */
export function normalizeLoudness(wav: Wav, targetDb = -20, ceiling = 0.89, maxGainDb = 9): Wav {
  const level = activeRmsDb(wav)
  const peak = peakLevel(wav)
  if (level <= -100 || peak <= 0) return wav
  const wanted = Math.max(-maxGainDb, Math.min(maxGainDb, targetDb - level))
  const limited = Math.min(wanted, toDb(ceiling / peak))
  const gain = 10 ** (limited / 20)
  if (Math.abs(limited) < 0.2) return wav
  return fromSamples(wav, samples(wav).map((value) => value * gain))
}
