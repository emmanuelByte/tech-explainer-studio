import { execFileSync } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { LessonSpec } from '../../src/domains/lesson-spec/types'
import { changedParts, imageDifference, parseYavg, renderedSince, scopeProblems, VISIBLE_CHANGE_THRESHOLD } from './revise'

const base = (): LessonSpec => ({
  version: 1, id: 'x', title: 'X',
  nodes: [{ id: 'a', kind: 'client', label: 'A' }, { id: 'b', kind: 'server', label: 'B' }],
  edges: [{ id: 'a-b', from: 'a', to: 'b' }],
  scenes: [
    { id: 'one', title: 'One', narration: 'First.', reveal: ['a'] },
    { id: 'two', title: 'Two', narration: 'Second.', reveal: ['b', 'a-b'] },
    { id: 'three', title: 'Three', narration: 'Third.' },
  ],
})

describe('revision scope', () => {
  it('reports exactly which scenes changed', () => {
    const next = base()
    next.scenes[1].narration = 'Second, reworded.'
    expect(changedParts(base(), next)).toEqual({ scenes: ['two'], global: [] })
  })

  it('treats a relabelled component as lesson-wide', () => {
    const next = base()
    next.nodes[0].label = 'Clients'
    expect(changedParts(base(), next)).toEqual({ scenes: [], global: ['node a'] })
  })

  it('refuses changes outside the scenes the notes cover, without silently allowing them', () => {
    const scope = { scenes: ['two', 'three'], global: [] }
    expect(scopeProblems(scope, ['two'], false)[0]).toContain('three')
    expect(scopeProblems(scope, ['two', 'three'], false)).toEqual([])
    expect(scopeProblems({ scenes: ['two'], global: ['node a'] }, ['two'], false)[0]).toContain('--allow-global')
    expect(scopeProblems({ scenes: ['two'], global: ['node a'] }, ['two'], true)).toEqual([])
  })

  it('rejects a patch that changes nothing', () => {
    expect(scopeProblems({ scenes: [], global: [] }, ['two'], false)[0]).toContain('nothing')
  })
})

describe('renderedSince', () => {
  const state = { stages: { 'narrate': { finishedAt: '2026-10-19T12:00:00Z' }, 'stills:16:9': { finishedAt: '2026-10-19T10:00:00Z' } } }
  it('needs a stills or render stage at or after the time', () => {
    expect(renderedSince(state, '2026-10-19T11:00:00Z')).toBe(false) // only narration is newer
    expect(renderedSince(state, '2026-10-19T09:00:00Z')).toBe(true)
  })
})

const hasFfmpeg = (() => { try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); return true } catch { return false } })()
describe.skipIf(!hasFfmpeg)('imageDifference', () => {
  it('is zero for identical images and visible for a changed region', async () => {
    const dir = await mkdtemp(resolve(tmpdir(), 'diff-'))
    try {
      const make = (name: string, filter: string) => execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', filter, '-frames:v', '1', resolve(dir, name)])
      make('a.png', 'color=c=black:s=320x180')
      make('b.png', 'color=c=black:s=320x180')
      make('c.png', 'color=c=black:s=320x180,drawbox=x=40:y=40:w=120:h=60:color=white:t=fill')
      expect(await imageDifference(resolve(dir, 'a.png'), resolve(dir, 'b.png'))).toBe(0)
      expect(await imageDifference(resolve(dir, 'a.png'), resolve(dir, 'c.png'))).toBeGreaterThan(VISIBLE_CHANGE_THRESHOLD)
    } finally { await rm(dir, { recursive: true, force: true }) }
  })
})

describe('parseYavg', () => {
  it('reads plain and exponent notation (a one-pixel difference prints as 4.8e-07, not 4.8)', () => {
    expect(parseYavg('frame:0 pts:0\nlavfi.signalstats.YAVG=0.135')).toBe(0.135)
    expect(parseYavg('lavfi.signalstats.YAVG=4.82253e-07')).toBeCloseTo(4.82253e-7, 12)
    expect(parseYavg('lavfi.signalstats.YAVG=0')).toBe(0)
    expect(() => parseYavg('nothing')).toThrow('Could not measure')
  })
})
