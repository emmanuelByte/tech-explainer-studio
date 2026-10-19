import { describe, expect, it } from 'vitest'
import { compileLessonSpec, type ComponentArtwork } from './compile'
import { lintLesson } from './lint'
import type { LessonSpec } from './types'

const svg = '<svg xmlns="http://www.w3.org/2000/svg"/>'
const artwork: ComponentArtwork = { client: svg, 'load-balancer': svg, server: svg }
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
    ],
    edges: [
      { id: 'c-lb', from: 'c', to: 'lb' },
      { id: 'lb-s1', from: 'lb', to: 's1' },
    ],
    scenes: [
      { id: 'one', title: 'One', narration: 'A client sends a request.', durationSeconds: 5, reveal: ['c'] },
      { id: 'two', title: 'Two', narration: 'A load balancer receives it.', durationSeconds: 6, reveal: ['lb', 'c-lb'] },
      { id: 'three', title: 'Three', narration: 'It forwards it to a server.', durationSeconds: 6, reveal: ['s1', 'lb-s1'] },
    ],
  }
}

function lint(value: LessonSpec, tweak?: (project: ReturnType<typeof compileLessonSpec>) => void) {
  const project = compileLessonSpec(value, options)
  tweak?.(project)
  return lintLesson(value, project)
}

describe('lintLesson', () => {
  it('reports nothing for a healthy lesson', () => {
    expect(lint(spec())).toEqual([])
  })

  it('flags narration that is too fast for its scene', () => {
    const fast = spec()
    fast.scenes[0].narration = Array.from({ length: 30 }, () => 'word').join(' ')
    fast.scenes[0].durationSeconds = 5
    expect(lint(fast).map((issue) => issue.rule)).toContain('fast-narration')
  })

  it('flags narration long enough to wrap into many caption lines', () => {
    const long = spec()
    long.scenes[0].narration = Array.from({ length: 60 }, () => 'word').join(' ')
    long.scenes[0].durationSeconds = 30
    expect(lint(long).map((issue) => issue.rule)).toContain('long-narration')
  })

  it('flags a scene that changes nothing on screen', () => {
    const still = spec()
    still.scenes[1].reveal = []
    still.scenes[1].focus = ['c']
    still.scenes[0].focus = ['c']
    still.scenes[2].reveal = ['lb', 'c-lb', 's1', 'lb-s1']
    expect(lint(still).some((issue) => issue.rule === 'static-scene' && issue.scene === 'two')).toBe(true)
  })

  it('flags a component pushed off the canvas', () => {
    const issues = lint(spec(), (project) => {
      const group = project.layers.find((layer) => layer.id === 'node_s1')!
      group.keyframes.forEach((keyframe) => { keyframe.props.x = 900 })
    })
    expect(issues.some((issue) => issue.rule === 'off-canvas' && issue.severity === 'error')).toBe(true)
  })

  it('flags a component that runs into the captions', () => {
    const issues = lint(spec(), (project) => {
      const group = project.layers.find((layer) => layer.id === 'node_c')!
      group.keyframes.forEach((keyframe) => { keyframe.props.y = 300 })
    })
    expect(issues.some((issue) => issue.rule === 'caption-collision')).toBe(true)
  })

  it('flags overlapping components', () => {
    const issues = lint(spec(), (project) => {
      const group = project.layers.find((layer) => layer.id === 'node_lb')!
      group.keyframes.forEach((keyframe) => { keyframe.props.x = -400 })
    })
    expect(issues.some((issue) => issue.rule === 'node-overlap')).toBe(true)
  })

  it('flags too many components on screen', () => {
    const dense: LessonSpec = {
      version: 1,
      id: 'dense',
      title: 'Dense',
      nodes: Array.from({ length: 8 }, (_, i) => ({ id: `n${i}`, kind: 'server' as const, label: `Node ${i}` })),
      edges: [],
      scenes: [{ id: 'all', title: 'All', narration: 'Many servers.', durationSeconds: 6, reveal: Array.from({ length: 8 }, (_, i) => `n${i}`) }],
    }
    expect(lint(dense).map((issue) => issue.rule)).toContain('dense-scene')
  })
})
