import { describe, expect, it } from 'vitest'
import { TECHNICAL_COMPONENT_KINDS } from '../../types'
import { migrateProject } from '../project/migrations'
import { compileLessonSpec, layoutNodes, type ComponentArtwork } from './compile'
import { LESSON_THEMES, THEME_IDS } from './theme'
import type { LessonSpec } from './types'
import { validateLessonSpec } from './validate'

const svg = '<svg xmlns="http://www.w3.org/2000/svg"/>'
const artwork = Object.fromEntries(TECHNICAL_COMPONENT_KINDS.map((kind) => [kind, svg])) as ComponentArtwork
const options = { artwork, now: '2026-10-19T00:00:00.000Z' }

function spec(): LessonSpec {
  return {
    version: 1,
    id: 'demo',
    title: 'Demo',
    nodes: [
      { id: 'c', kind: 'client', label: 'Clients' },
      { id: 'lb', kind: 'load-balancer', label: 'Load Balancer' },
      { id: 's1', kind: 'server', label: 'Server 1' },
      { id: 's2', kind: 'server', label: 'Server 2' },
    ],
    edges: [
      { id: 'c-lb', from: 'c', to: 'lb', label: 'requests' },
      { id: 'lb-s1', from: 'lb', to: 's1' },
      { id: 'lb-s2', from: 'lb', to: 's2' },
    ],
    scenes: [
      { id: 'one', title: 'One', narration: 'A client sends a request.', durationSeconds: 5, reveal: ['c'] },
      { id: 'two', title: 'Two', narration: 'A load balancer receives it.', durationSeconds: 6, reveal: ['lb', 'c-lb'] },
      { id: 'three', title: 'Three', narration: 'It spreads the traffic over servers.', durationSeconds: 8, reveal: ['s1', 's2', 'lb-s1', 'lb-s2'] },
    ],
  }
}

function messages(value: unknown) {
  return validateLessonSpec(value).map((issue) => `${issue.path}: ${issue.message}`)
}

describe('validateLessonSpec', () => {
  it('accepts a well-formed spec', () => {
    expect(validateLessonSpec(spec())).toEqual([])
  })

  it('reports an edge revealed before one of its nodes', () => {
    const bad = spec()
    bad.scenes[1].reveal = ['c-lb', 'lb']
    expect(messages(bad).some((m) => m.includes('revealed before both its nodes'))).toBe(true)
  })
})

describe('graph validity by orientation', () => {
  const canvases = { landscape: { width: 1920, height: 1080 }, portrait: { width: 1080, height: 1920 } }

  for (const [name, canvas] of Object.entries(canvases)) {
    it(`accepts an acyclic graph in ${name}`, () => {
      expect(validateLessonSpec({ ...spec(), canvas })).toEqual([])
    })

    it(`rejects a cyclic graph in ${name}`, () => {
      const cyclic = spec()
      cyclic.edges.push({ id: 's1-c', from: 's1', to: 'c' })
      cyclic.scenes[2].reveal = [...(cyclic.scenes[2].reveal ?? []), 's1-c']
      expect(messages({ ...cyclic, canvas }).some((m) => m.includes('cycle'))).toBe(true)
    })
  }

  it('does not apply the landscape column limit to portrait', () => {
    const chain = spec()
    chain.nodes = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => ({ id, kind: 'server' as const, label: id }))
    chain.edges = chain.nodes.slice(1).map((node, i) => ({ id: `e${i}`, from: chain.nodes[i].id, to: node.id }))
    chain.scenes = [{ id: 'all', title: 'All', narration: 'Six in a chain.', durationSeconds: 6, reveal: [...chain.nodes.map((n) => n.id), ...chain.edges.map((e) => e.id)] }]
    expect(messages({ ...chain, canvas: canvases.landscape }).some((m) => m.includes('columns deep'))).toBe(true)
    expect(messages({ ...chain, canvas: canvases.portrait }).some((m) => m.includes('columns deep'))).toBe(false)
  })
})

describe('layoutNodes', () => {
  it('ranks left to right and centres each column', () => {
    const placements = layoutNodes(spec())
    expect(placements.get('c')).toEqual({ x: -400, y: 0 })
    expect(placements.get('lb')).toEqual({ x: 0, y: 0 })
    expect(placements.get('s1')).toEqual({ x: 400, y: -100 })
    expect(placements.get('s2')).toEqual({ x: 400, y: 100 })
  })

  it('stacks ranks for portrait output without shrinking component geometry', () => {
    const placements = layoutNodes(spec(), { width: 1080, height: 1920 })
    expect(placements.get('c')!.y).toBeLessThan(placements.get('lb')!.y)
    expect(placements.get('lb')!.y).toBeLessThan(placements.get('s1')!.y)
    expect(placements.get('s1')!.x).not.toBe(placements.get('s2')!.x)
  })
})

describe('themes', () => {
  it.each(THEME_IDS)('%s has a component palette entry for every supported component kind', (id) => {
    expect(Object.keys(LESSON_THEMES[id].components).sort()).toEqual([...TECHNICAL_COMPONENT_KINDS].sort())
  })

  it('is selected by the spec or an option, and rejects unknown names', () => {
    expect(messages({ ...spec(), theme: 'neon' }).some((m) => m.startsWith('theme:'))).toBe(true)
    const background = (themeOption?: 'clean-technical' | 'dark-sketch', specTheme?: 'clean-technical' | 'dark-sketch') =>
      compileLessonSpec({ ...spec(), theme: specTheme }, { ...options, theme: themeOption }).canvas.backgroundColor
    expect(background()).toBe(LESSON_THEMES['dark-sketch'].colors.background)
    expect(background(undefined, 'clean-technical')).toBe(LESSON_THEMES['clean-technical'].colors.background)
    expect(background('dark-sketch', 'clean-technical')).toBe(LESSON_THEMES['dark-sketch'].colors.background)
  })

  it('sketches component bodies and connectors but never text, panels or backdrops', () => {
    const value = spec()
    value.scenes[2].card = { id: 'note', title: 'T', lines: ['a line'] }
    const project = compileLessonSpec(value, { ...options, theme: 'dark-sketch' })
    expect(project.layers.find((l) => l.id === 'node_lb__body')?.sketchEnabled).toBe(true)
    expect(project.connectors?.every((c) => c.sketchEnabled)).toBe(true)
    for (const layer of project.layers.filter((l) => l.type === 'text' || l.id.endsWith('__panel') || l.id.endsWith('__backdrop'))) {
      expect(layer.sketchEnabled).toBe(false)
    }
    const clean = compileLessonSpec(value, { ...options, theme: 'clean-technical' })
    expect(clean.layers.some((l) => l.sketchEnabled)).toBe(false)
  })
})
