import { describe, expect, it } from 'vitest'
import { TECHNICAL_COMPONENT_KINDS } from '../../types'
import { compileLessonSpec, type ComponentArtwork } from './compile'
import { lintLesson } from './lint'
import type { LessonSpec } from './types'

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
})
