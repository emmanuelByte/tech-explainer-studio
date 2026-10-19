import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { LessonSpec, NarrationManifest } from '../../src/domains/lesson-spec/types'
import { checkNarrationAudio } from './audioChecks'
import { activeRmsDb, clippedFraction, internalSilences, normalizeLoudness, peakLevel, speechRegion, trimSilence } from './audio'
import { encodeWav, wavSeconds, type Wav } from './wav'

let root: string
beforeEach(async () => { root = await mkdtemp(resolve(tmpdir(), 'audio-')); await mkdir(resolve(root, 'data', 'assets', 'files'), { recursive: true }) })
afterEach(async () => { await rm(root, { recursive: true, force: true }) })

const RATE = 16000
/** Tone bursts: [seconds, amplitude] segments; amplitude 0 is silence. */
function wav(parts: [number, number][]): Wav {
  const total = parts.reduce((sum, [s]) => sum + Math.round(s * RATE), 0)
  const data = Buffer.alloc(total * 2)
  let at = 0
  for (const [seconds, amp] of parts) for (let i = 0; i < Math.round(seconds * RATE); i += 1, at += 1) data.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(Math.sin(at / 7) * amp * 32767))), at * 2)
  return { format: 1, channels: 1, sampleRate: RATE, bitsPerSample: 16, data }
}

describe('audio analysis', () => {
  it('finds speech between silences and trims to it, reporting what it removed', () => {
    const clip = wav([[0.5, 0], [1, 0.3], [0.7, 0]])
    const region = speechRegion(clip)
    expect(region.start).toBeCloseTo(0.5, 1)
    expect(region.end).toBeCloseTo(1.5, 1)
    const { wav: trimmed, offset } = trimSilence(clip, 0.05)
    expect(offset).toBeCloseTo(0.45, 1)
    expect(wavSeconds(trimmed)).toBeCloseTo(1.1, 1)
  })

  it('measures level, peak, clipping and long internal silences', () => {
    const quiet = wav([[1, 0.05]])
    const loud = wav([[1, 0.5]])
    expect(activeRmsDb(loud)).toBeGreaterThan(activeRmsDb(quiet) + 15)
    expect(peakLevel(loud)).toBeCloseTo(0.5, 1)
    expect(clippedFraction(wav([[1, 1.2]]))).toBeGreaterThan(0.1)
    expect(clippedFraction(loud)).toBe(0)
    expect(internalSilences(wav([[1, 0.3], [1.2, 0], [1, 0.3]]), 0.9)).toHaveLength(1)
    expect(internalSilences(wav([[1, 0.3], [0.3, 0], [1, 0.3]]), 0.9)).toHaveLength(0)
  })

  it('brings speech to one level without clipping, and leaves matching levels alone', () => {
    const target = -20
    for (const amp of [0.1, 0.3]) {
      const out = normalizeLoudness(wav([[1, amp]]), target)
      expect(peakLevel(out)).toBeLessThanOrEqual(0.9)
      expect(Math.abs(activeRmsDb(out) - target)).toBeLessThan(1.5)
    }
    expect(peakLevel(normalizeLoudness(wav([[1, 0.9]]), -10))).toBeLessThanOrEqual(0.9) // never past the peak ceiling
    const already = wav([[1, 0.14]])
    expect(normalizeLoudness(already, activeRmsDb(already))).toBe(already)
  })

  it('does not boost very quiet audio by more than the gain cap, so noise is not amplified', () => {
    const quiet = wav([[1, 0.01]])
    expect(activeRmsDb(normalizeLoudness(quiet, -20)) - activeRmsDb(quiet)).toBeLessThanOrEqual(9.1)
  })
})

describe('checkNarrationAudio', () => {
  const spec = (): LessonSpec => ({ version: 1, id: 'x', title: 'X', nodes: [{ id: 'a', kind: 'client', label: 'A' }], edges: [], scenes: [{ id: 'one', title: 'One', narration: 'a b c d e f g h', reveal: ['a'] }] })
  const manifest = (assetId: string, seconds: number, words = 8): NarrationManifest => ({
    voiceId: 'v', exaggeration: 0.5, cfgWeight: 0.5,
    scenes: { one: { assetId, durationSeconds: seconds, cues: {}, source: 'a b c d e f g h', words: Array.from({ length: words }, (_, i) => ({ text: 'w', start: (i * seconds) / words, end: ((i + 0.8) * seconds) / words, timing: 'aligned' as const })) } },
  })
  const save = (name: string, clip: Wav) => writeFile(resolve(root, 'data', 'assets', 'files', `${name}.wav`), encodeWav(clip))
  const rules = async (m: NarrationManifest) => (await checkNarrationAudio(root, spec(), m)).map((f) => `${f.severity}:${f.rule}`)

  it('accepts healthy audio', async () => {
    await save('ok', wav([[3, 0.3]]))
    expect(await rules(manifest('ok', 3))).toEqual([])
  })

  it('reports missing, corrupt and silent audio as errors', async () => {
    expect(await rules(manifest('absent', 3))).toEqual(['error:missing'])
    await writeFile(resolve(root, 'data', 'assets', 'files', 'bad.wav'), 'not a wav')
    expect(await rules(manifest('bad', 3))).toEqual(['error:corrupt'])
    await save('quiet', wav([[3, 0]]))
    expect(await rules(manifest('quiet', 3))).toEqual(['error:silent'])
  })

  it('reports clipping, a manifest that disagrees with the file, and a stalled take', async () => {
    await save('clip', wav([[3, 1.4]]))
    expect(await rules(manifest('clip', 3))).toContain('error:clipping')
    await save('len', wav([[3, 0.3]]))
    expect(await rules(manifest('len', 4))).toContain('error:timeline')
    await save('stall', wav([[1, 0.3], [1.5, 0], [1, 0.3]]))
    expect(await rules(manifest('stall', 3.5))).toContain('warning:stalled')
  })

  it('flags stretched or rushed pace and missing word timing', async () => {
    await save('pace', wav([[3, 0.3]]))
    expect(await rules(manifest('pace', 3, 3))).toContain('warning:pace')
    expect(await rules(manifest('pace', 3, 20))).toContain('warning:pace')
    const noWords = manifest('pace', 3)
    delete noWords.scenes.one.words
    expect(await rules(noWords)).toContain('warning:timing')
  })
})
