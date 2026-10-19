import { spawn } from 'node:child_process'
import { mkdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { MotionProject } from '../../src/types'

/**
 * Representative frames pulled from a finished MP4 (what a viewer sees, not a
 * separate render): the opening, the end of each scene's build-up, a caption
 * mid-phrase and the closing card. Written for review; not analysed.
 */
export interface NamedFrame { name: string; time: number }

/** Picks frames by scene: the middle of the intro and outro, and a point 85% through every other scene, when its reveals have landed. */
export function pickReviewFrames(project: MotionProject): NamedFrame[] {
  const fps = project.canvas.fps
  return (project.scenes ?? []).map((scene) => {
    const id = scene.id.replace(/^scene_/, '')
    const length = scene.endFrame - scene.startFrame
    const at = id === 'intro' || id === 'outro' ? scene.startFrame + length * 0.5 : scene.startFrame + length * 0.85
    return { name: id, time: Math.min(at, scene.endFrame - 2) / fps }
  })
}

export async function extractReviewFrames(video: string, project: MotionProject, outDir: string, prefix: string, width: number) {
  await mkdir(outDir, { recursive: true })
  const files: string[] = []
  for (const [index, frame] of pickReviewFrames(project).entries()) {
    const out = resolve(outDir, `${prefix}-${String(index + 1).padStart(2, '0')}-${frame.name}.png`)
    await new Promise<void>((done, fail) => {
      const child = spawn('ffmpeg', ['-v', 'error', '-y', '-ss', frame.time.toFixed(3), '-i', video, '-frames:v', '1', '-vf', `scale=${width}:-1`, out], { stdio: 'ignore' })
      child.on('error', fail)
      child.on('close', (code) => (code === 0 ? done() : fail(new Error(`ffmpeg failed extracting ${frame.name}`))))
    })
    files.push(out)
  }
  return files
}

export async function loadProject(path: string) {
  return JSON.parse(await readFile(path, 'utf-8')) as MotionProject
}
