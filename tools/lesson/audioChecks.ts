import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { LessonSpec, NarrationManifest } from '../../src/domains/lesson-spec/types'
import type { MotionProject } from '../../src/types'
import { activeRmsDb, clippedFraction, envelope, internalSilences, peakLevel } from './audio'
import { parseWav, wavSeconds } from './wav'

export interface AudioFinding {
  severity: 'error' | 'warning' | 'note'
  scene: string
  rule: 'missing' | 'corrupt' | 'silent' | 'clipping' | 'timeline' | 'stalled' | 'pace' | 'loudness' | 'timing'
  message: string
}

/** Speech outside this range (words per second over the spoken part) is stretched or rushed. */
const WORDS_PER_SECOND = { min: 1.4, max: 4.2 }
/** A pause inside narration longer than this is more likely a stalled model than a pause for effect. */
const STALL_SECONDS = 0.9
const CLIPPED_ERROR = 0.001
const LOUDNESS_TOLERANCE_DB = 3
const DURATION_TOLERANCE_SECONDS = 0.05

/**
 * Signal-level checks of a lesson's narration audio against its manifest.
 * They find missing, corrupt, silent, clipped or stalled audio and a manifest
 * that disagrees with the files; they cannot hear mispronunciation or judge
 * naturalness, so a human listen is still part of approval.
 */
export async function checkNarrationAudio(root: string, spec: LessonSpec, manifest: NarrationManifest): Promise<AudioFinding[]> {
  const findings: AudioFinding[] = []
  const add = (severity: AudioFinding['severity'], scene: string, rule: AudioFinding['rule'], message: string) => findings.push({ severity, scene, rule, message })
  const levels: { scene: string; db: number }[] = []
  for (const scene of spec.scenes) {
    const entry = manifest.scenes[scene.id]
    if (!entry) { add('error', scene.id, 'missing', 'No narration audio for this scene.'); continue }
    let wav
    try {
      wav = parseWav(await readFile(resolve(root, 'data', 'assets', 'files', `${entry.assetId}.wav`)))
    } catch (error) {
      const missing = (error as NodeJS.ErrnoException).code === 'ENOENT'
      add('error', scene.id, missing ? 'missing' : 'corrupt', missing ? `Audio file ${entry.assetId}.wav is missing.` : `Audio file is not a readable WAV (${(error as Error).message}).`)
      continue
    }
    const seconds = wavSeconds(wav)
    if (Math.abs(seconds - entry.durationSeconds) > DURATION_TOLERANCE_SECONDS) {
      add('error', scene.id, 'timeline', `The manifest says ${entry.durationSeconds}s but the file is ${seconds.toFixed(2)}s; every cue after the first would drift.`)
    }
    if (peakLevel(wav) < 0.01) { add('error', scene.id, 'silent', 'The audio is silent.'); continue }
    const { db } = envelope(wav)
    const voiced = db.filter((value) => value > Math.max(...db) - 32).length / db.length
    if (voiced < 0.35) add('warning', scene.id, 'silent', `Only ${(voiced * 100).toFixed(0)}% of the audio contains speech; most of it is silence.`)
    const clipped = clippedFraction(wav)
    if (clipped > CLIPPED_ERROR) add('error', scene.id, 'clipping', `${(clipped * 100).toFixed(2)}% of samples are clipped.`)
    for (const gap of internalSilences(wav, STALL_SECONDS)) add('warning', scene.id, 'stalled', `A ${(gap.end - gap.start).toFixed(1)}s silence at ${gap.start.toFixed(1)}s inside the narration (a stalled take?).`)
    levels.push({ scene: scene.id, db: activeRmsDb(wav) })

    const words = entry.words ?? []
    if (!words.length) { add('warning', scene.id, 'timing', 'No word timing recorded; captions cannot follow the speech. Re-run narrate.'); continue }
    const spoken = words[words.length - 1].end - words[0].start
    const rate = words.length / Math.max(0.1, spoken)
    if (rate < WORDS_PER_SECOND.min || rate > WORDS_PER_SECOND.max) add('warning', scene.id, 'pace', `${rate.toFixed(1)} words per second is ${rate < WORDS_PER_SECOND.min ? 'slow or stretched' : 'rushed'} (expected ${WORDS_PER_SECOND.min} to ${WORDS_PER_SECOND.max}).`)
    const estimated = words.filter((word) => word.timing === 'estimated').length
    if (estimated) add('note', scene.id, 'timing', `${estimated} of ${words.length} words have estimated, not measured, timing.`)
    for (let i = 1; i < words.length; i += 1) {
      if (words[i].start < words[i - 1].start || words[i].end > seconds + DURATION_TOLERANCE_SECONDS) { add('error', scene.id, 'timing', `Word timing is out of order or past the end of the audio near "${words[i].text}".`); break }
    }
    for (const [id, time] of Object.entries(entry.cues)) {
      if (time < 0 || time > seconds + DURATION_TOLERANCE_SECONDS) add('error', scene.id, 'timeline', `Cue "${id}" is at ${time}s, outside the ${seconds.toFixed(1)}s of audio.`)
    }
  }
  if (levels.length > 1) {
    const sorted = [...levels].sort((a, b) => a.db - b.db)
    const median = sorted[Math.floor(sorted.length / 2)].db
    for (const level of levels) {
      if (Math.abs(level.db - median) > LOUDNESS_TOLERANCE_DB) add('warning', level.scene, 'loudness', `Speech level ${level.db.toFixed(1)} dBFS is ${Math.abs(level.db - median).toFixed(1)} dB from the lesson median (${median.toFixed(1)}).`)
    }
  }
  return findings
}

/** Checks the compiled project places each narration clip inside its scene at the manifest's length. */
export function checkProjectAudio(project: MotionProject, manifest: NarrationManifest): AudioFinding[] {
  const findings: AudioFinding[] = []
  const fps = project.canvas.fps
  for (const scene of project.scenes ?? []) {
    const id = scene.id.replace(/^scene_/, '')
    const entry = manifest.scenes[id]
    if (!entry) continue
    const layer = project.layers.find((candidate) => candidate.type === 'audio' && candidate.id === `narration_${id}`)
    if (!layer) { findings.push({ severity: 'error', scene: id, rule: 'missing', message: 'The built project has no narration layer for this scene.' }); continue }
    const expected = Math.round(entry.durationSeconds * fps)
    if (Math.abs((layer.endFrame - layer.startFrame) - expected) > 1) findings.push({ severity: 'error', scene: id, rule: 'timeline', message: `The narration layer spans ${layer.endFrame - layer.startFrame} frames but the audio is ${expected}.` })
    if (layer.startFrame < scene.startFrame || layer.endFrame > scene.endFrame) findings.push({ severity: 'error', scene: id, rule: 'timeline', message: 'The narration runs outside its scene, so it would be cut off or overlap the next scene.' })
  }
  return findings
}
