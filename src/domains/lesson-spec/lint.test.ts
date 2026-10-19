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

  it('flags a component that runs into the captions', () => {
    const issues = lint(spec(), (project) => {
      const group = project.layers.find((layer) => layer.id === 'node_c')!
      group.keyframes.forEach((keyframe) => { keyframe.props.y = 300 })
    })
    expect(issues.some((issue) => issue.rule === 'caption-collision')).toBe(true)
  })
})

describe('lintLesson self-review rules', () => {
  const withOverlay = (): LessonSpec => {
    const value = spec()
    value.scenes[2].reveal = ['s1', 'lb-s1']
    value.scenes.push({ id: 'four', title: 'Four', narration: 'Here is a card.', durationSeconds: 6, card: { id: 'note', title: 'Note', lines: ['One', 'Two'] } })
    return value
  }

  it('flags an overlay that reaches into the captions', () => {
    const issues = lint(withOverlay(), (project) => {
      const group = project.layers.find((layer) => layer.id === 'card_note')!
      group.keyframes.forEach((keyframe) => { keyframe.props.y = 400 })
    })
    expect(issues.some((issue) => issue.rule === 'overlay-collision' && issue.severity === 'error')).toBe(true)
  })

  it('flags an overlay wider than the frame', () => {
    const issues = lint(withOverlay(), (project) => {
      const group = project.layers.find((layer) => layer.id === 'card_note')!
      group.width = 4000
    })
    expect(issues.some((issue) => issue.rule === 'off-canvas')).toBe(true)
  })

  it('flags text that would overflow its box', () => {
    const issues = lint(withOverlay(), (project) => {
      const line = project.layers.find((layer) => layer.id === 'card_note__line1')!
      line.text = 'x'.repeat(200)
    })
    expect(issues.some((issue) => issue.rule === 'text-overflow')).toBe(true)
  })

  it('flags a reveal that lands just before its scene ends', () => {
    const issues = lint(spec(), (project) => {
      const connector = project.connectors!.find((candidate) => candidate.id === 'edge_c-lb')!
      const scene = project.scenes!.find((candidate) => candidate.id === 'scene_two')!
      connector.drawEndFrame = scene.endFrame - 5
    })
    expect(issues.some((issue) => issue.rule === 'late-reveal')).toBe(true)
  })

  it('flags overlapping or out-of-scene captions', () => {
    const issues = lint(spec(), (project) => {
      const segments = project.script!.segments.filter((segment) => segment.sceneId === 'scene_two' && segment.startFrame !== undefined)
      segments[0].endFrame = project.scenes!.find((scene) => scene.id === 'scene_two')!.endFrame + 30
    })
    expect(issues.some((issue) => issue.rule === 'caption-timing')).toBe(true)
  })
})
