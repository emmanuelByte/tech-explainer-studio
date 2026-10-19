import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { TECHNICAL_COMPONENT_KINDS } from '../../types'
import { compileLessonSpec, type ComponentArtwork } from './compile'
import { lintLesson } from './lint'
import { THEME_IDS } from './theme'
import type { LessonSpec } from './types'
import { validateLessonSpec } from './validate'

/**
 * Every tracked lesson must validate, compile in both formats and both themes,
 * and lint without errors. This needs no audio, no browser and no voice worker,
 * so it runs on a fresh clone and in CI.
 */
const dir = resolve(__dirname, '..', '..', '..', 'lessons')
const artwork = Object.fromEntries(TECHNICAL_COMPONENT_KINDS.map((kind) => [kind, '<svg xmlns="http://www.w3.org/2000/svg"/>'])) as ComponentArtwork
const formats = { '16:9': { width: 1920, height: 1080 }, '9:16': { width: 1080, height: 1920 } }

describe.each(readdirSync(dir).filter((name) => name.endsWith('.lesson.json')))('%s', (file) => {
  const spec = JSON.parse(readFileSync(resolve(dir, file), 'utf-8')) as LessonSpec

  it('validates', () => {
    expect(validateLessonSpec(spec)).toEqual([])
  })

  it.each(Object.entries(formats))('compiles and lints clean in %s', (_name, canvas) => {
    for (const theme of THEME_IDS) {
      const project = compileLessonSpec(spec, { artwork, now: '2026-10-19T00:00:00.000Z', canvas, theme })
      expect(project.canvas).toMatchObject(canvas)
      expect(project.canvas.durationFrames).toBeGreaterThan(0)
      expect(lintLesson(spec, project).filter((issue) => issue.severity === 'error')).toEqual([])
    }
  })

  it('compiles identically twice (deterministic)', () => {
    const options = { artwork, now: '2026-10-19T00:00:00.000Z' }
    expect(JSON.stringify(compileLessonSpec(spec, options))).toBe(JSON.stringify(compileLessonSpec(spec, options)))
  })
})
