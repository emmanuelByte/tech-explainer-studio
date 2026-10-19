import { spawn } from 'node:child_process'
import { mkdir, rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { MotionProject } from '../../src/types'
import { ensureAssetIndex } from './render'

/** Overlays fade out over the last 12 frames of a scene; stay clear of that. */
export const STILL_OFFSET_FRAMES = 16

export function stillsDir(root: string, projectId: string) {
  return resolve(root, 'data', 'exports', 'stills', projectId)
}

export function stillFileName(index: number, sceneId: string) {
  return `${String(index + 1).padStart(2, '0')}-${sceneId.replace(/^scene_/, '')}.png`
}

function renderStill(root: string, projectPath: string, frame: number, outPath: string) {
  const bin = resolve(root, 'node_modules', '.bin', 'remotion')
  return new Promise<void>((done, fail) => {
    const child = spawn(bin, ['still', 'src/remotion/index.tsx', 'EditorComposition', outPath, `--frame=${frame}`, `--props=${projectPath}`, '--public-dir=data'], { cwd: root, stdio: ['ignore', 'ignore', 'pipe'] })
    let stderr = ''
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString() })
    child.on('close', (code) => (code === 0 ? done() : fail(new Error(`remotion still failed at frame ${frame}:\n${stderr.trim()}`))))
  })
}

/** One frame per scene, late enough that reveals and the camera move have finished but before overlays start fading out. */
export async function renderStills(root: string, projectPath: string, project: MotionProject, log: (line: string) => void = () => undefined) {
  await ensureAssetIndex(root)
  const dir = stillsDir(root, project.id)
  await rm(dir, { recursive: true, force: true }) // stale stills from an older scene order would mislead
  await mkdir(dir, { recursive: true })
  const files: string[] = []
  for (const [index, scene] of (project.scenes ?? []).entries()) {
    const out = resolve(dir, stillFileName(index, scene.id))
    await renderStill(root, projectPath, Math.max(scene.startFrame, scene.endFrame - STILL_OFFSET_FRAMES), out)
    log(out)
    files.push(out)
  }
  return files
}
