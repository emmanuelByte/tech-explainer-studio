import { describe, expect, it } from 'vitest'
import { migrateProject } from '../project/migrations'
import { compileLessonSpec, layoutNodes, LessonSpecError, type ComponentArtwork } from './compile'
import type { LessonSpec } from './types'
import { validateLessonSpec } from './validate'

const artwork: ComponentArtwork = {
  client: '<svg xmlns="http://www.w3.org/2000/svg"/>',
  'load-balancer': '<svg xmlns="http://www.w3.org/2000/svg"/>',
  server: '<svg xmlns="http://www.w3.org/2000/svg"/>',
}
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

  it('rejects non-objects and wrong versions', () => {
    expect(validateLessonSpec(null)).toHaveLength(1)
    expect(messages({ ...spec(), version: 2 })).toContain('version: Must be 1.')
  })

  it('reports duplicate ids across nodes and edges', () => {
    const bad = spec()
    bad.edges[0].id = 'lb'
    expect(messages(bad).some((m) => m.includes('Duplicate id "lb"'))).toBe(true)
  })

  it('reports edges that point at unknown or non-node ids', () => {
    const bad = spec()
    bad.edges[1].to = 'nope'
    bad.edges[2].to = 'c-lb'
    const found = messages(bad)
    expect(found.some((m) => m.includes('"nope" is not a node id'))).toBe(true)
    expect(found.some((m) => m.includes('"c-lb" is not a node id'))).toBe(true)
  })

  it('reports ids that are declared but never revealed', () => {
    const bad = spec()
    bad.scenes[2].reveal = ['s1', 'lb-s1', 'lb-s2']
    expect(messages(bad).some((m) => m.includes('"s2" is declared but never revealed'))).toBe(true)
  })

  it('reports an id revealed twice', () => {
    const bad = spec()
    bad.scenes[1].reveal = ['lb', 'c-lb', 'c']
    expect(messages(bad).some((m) => m.includes('already revealed'))).toBe(true)
  })

  it('reports an edge revealed before one of its nodes', () => {
    const bad = spec()
    bad.scenes[1].reveal = ['c-lb', 'lb']
    expect(messages(bad).some((m) => m.includes('revealed before both its nodes'))).toBe(true)
  })

  it('reports labels that would overflow a component', () => {
    const bad = spec()
    bad.nodes[1].label = 'A very long load balancer'
    expect(messages(bad).some((m) => m.includes('16 characters'))).toBe(true)
  })

  it('reports cycles', () => {
    const bad = spec()
    bad.edges.push({ id: 's1-c', from: 's1', to: 'c' })
    bad.scenes[2].reveal = [...(bad.scenes[2].reveal ?? []), 's1-c']
    expect(messages(bad).some((m) => m.includes('cycle'))).toBe(true)
  })

  it('reports a graph too deep for the canvas', () => {
    const deep: LessonSpec = {
      version: 1,
      id: 'deep',
      title: 'Deep',
      nodes: ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => ({ id, kind: 'server' as const, label: id })),
      edges: [['a', 'b'], ['b', 'c'], ['c', 'd'], ['d', 'e'], ['e', 'f']].map(([from, to]) => ({ id: `${from}-${to}`, from, to })),
      scenes: [{
        id: 'all',
        title: 'All',
        narration: 'Everything at once.',
        reveal: ['a', 'b', 'a-b', 'c', 'b-c', 'd', 'c-d', 'e', 'd-e', 'f', 'e-f'],
      }],
    }
    expect(messages(deep).some((m) => m.includes('will not fit'))).toBe(true)
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
})

describe('compileLessonSpec', () => {
  it('throws every validation issue', () => {
    const bad = spec()
    bad.nodes[0].kind = 'mystery' as never
    expect(() => compileLessonSpec(bad, options)).toThrow(LessonSpecError)
  })

  it('is deterministic', () => {
    expect(compileLessonSpec(spec(), options)).toEqual(compileLessonSpec(spec(), options))
  })

  it('produces a project the migration boundary accepts unchanged', () => {
    const project = compileLessonSpec(spec(), options)
    expect(migrateProject(project)).toEqual(project)
  })

  it('lays scenes out back to back and reveals inside their scene', () => {
    const project = compileLessonSpec(spec(), options)
    const scenes = project.scenes ?? []
    expect(scenes.map((scene) => [scene.startFrame, scene.endFrame])).toEqual([[0, 150], [150, 330], [330, 570]])
    expect(project.canvas.durationFrames).toBe(570)

    const groupStart = (id: string) => project.layers.find((layer) => layer.id === `node_${id}`)!.keyframes[1]?.frame
    expect(groupStart('lb')).toBeGreaterThanOrEqual(150)
    expect(groupStart('lb')).toBeLessThan(330)
    expect(groupStart('s1')).toBeGreaterThanOrEqual(330)
    expect(groupStart('s1')).toBeLessThan(570)
  })

  it('connects edges to the compiled component groups and draws them after their nodes appear', () => {
    const project = compileLessonSpec(spec(), options)
    const layerIds = new Set(project.layers.map((layer) => layer.id))
    for (const connector of project.connectors ?? []) {
      expect(layerIds.has(connector.sourceLayerId)).toBe(true)
      expect(layerIds.has(connector.targetLayerId)).toBe(true)
    }
    const edge = project.connectors!.find((connector) => connector.id === 'edge_c-lb')!
    const lb = project.layers.find((layer) => layer.id === 'node_lb')!
    expect(edge.drawStartFrame!).toBeGreaterThanOrEqual(lb.keyframes[1].frame)
    expect(edge.label).toBe('requests')
  })

  it('keeps every component on the canvas and every layer id unique', () => {
    const project = compileLessonSpec(spec(), options)
    const ids = project.layers.map((layer) => layer.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const layer of project.layers.filter((candidate) => candidate.technicalComponent)) {
      const { x, y } = layer.keyframes[0].props
      expect(Math.abs(x) + layer.width / 2).toBeLessThanOrEqual(project.canvas.width / 2)
      expect(Math.abs(y) + layer.height / 2).toBeLessThanOrEqual(project.canvas.height / 2)
    }
  })

  it('writes one script segment and camera keyframe per scene, with captions on', () => {
    const project = compileLessonSpec(spec(), options)
    expect(project.script?.segments).toHaveLength(3)
    expect(project.script?.segments.map((segment) => segment.sceneId)).toEqual(project.scenes!.map((scene) => scene.id))
    // Hold each framing, then move to the next over 24 frames at the start of its scene.
    expect(project.camera?.keyframes.map((keyframe) => keyframe.frame)).toEqual([0, 150, 174, 330, 354])
    expect(project.captions).toEqual({ enabled: true, style: 'readable' })
  })

  it('keeps the framed content above the caption strip', () => {
    const project = compileLessonSpec(spec(), options)
    const last = project.camera!.keyframes[project.camera!.keyframes.length - 1]
    // All nodes are framed; the camera looks below the content centre so it sits above the captions.
    expect(last.y).toBeGreaterThan(project.canvas.height / 2)
    expect(last.zoom).toBeGreaterThanOrEqual(1)
  })

  it('does not move the camera between scenes that share a framing', () => {
    const same = spec()
    same.scenes[1].focus = ['c']
    same.scenes[0].focus = ['c']
    same.scenes[2].focus = ['c']
    expect(compileLessonSpec(same, options).camera?.keyframes).toHaveLength(1)
  })
})

describe('hide', () => {
  function withTemporaryEdge(): LessonSpec {
    const value = spec()
    value.edges.push({ id: 'c-s1', from: 'c', to: 's1', style: 'dashed' })
    value.scenes[0].reveal = ['c', 's1', 'c-s1']
    value.scenes[1].reveal = ['lb']
    value.scenes[1].hide = ['c-s1']
    value.scenes[2].reveal = ['c-lb', 's2', 'lb-s1', 'lb-s2']
    return value
  }

  it('accepts a temporary edge that is hidden later', () => {
    expect(validateLessonSpec(withTemporaryEdge())).toEqual([])
  })

  it('rejects hiding something not yet revealed, or in the same scene', () => {
    const early = withTemporaryEdge()
    early.scenes[0].hide = ['lb']
    expect(messages(early).some((m) => m.includes('must be revealed in an earlier scene'))).toBe(true)
    const same = withTemporaryEdge()
    same.scenes[0].hide = ['c-s1']
    expect(messages(same).some((m) => m.includes('must be revealed in an earlier scene'))).toBe(true)
  })

  it('rejects hiding twice, focusing a hidden node and revealing an edge after its node is hidden', () => {
    const twice = withTemporaryEdge()
    twice.scenes[2].hide = ['c-s1']
    expect(messages(twice).some((m) => m.includes('already hidden'))).toBe(true)

    const focus = withTemporaryEdge()
    focus.scenes[1].hide = ['c-s1', 's1']
    focus.scenes[2].focus = ['s1']
    expect(messages(focus).some((m) => m.includes('is hidden by'))).toBe(true)

    const late = withTemporaryEdge()
    late.scenes[1].hide = ['c-s1', 'c']
    expect(messages(late).some((m) => m.includes('revealed after one of its nodes was hidden'))).toBe(true)
  })

  it('fades a hidden edge and node out when the hiding scene begins revealing', () => {
    const value = withTemporaryEdge()
    value.scenes[1].hide = ['c-s1', 's1']
    value.scenes[2].reveal = ['c-lb', 's2', 'lb-s2']
    value.edges = value.edges.filter((edge) => edge.id !== 'lb-s1')
    const project = compileLessonSpec(value, options)
    const edge = project.connectors!.find((connector) => connector.id === 'edge_c-s1')!
    expect(edge.hideFrame).toBe(150 + 15)
    const server = project.layers.find((layer) => layer.id === 'node_s1')!
    const last = server.keyframes[server.keyframes.length - 1]
    expect(last.frame).toBe(150 + 15 + 12)
    expect(last.props.opacity).toBe(0)
  })

  it('leaves un-hidden connectors without a hideFrame and frames only what is still visible', () => {
    const project = compileLessonSpec(withTemporaryEdge(), options)
    expect(project.connectors!.find((connector) => connector.id === 'edge_c-lb')!.hideFrame).toBeUndefined()
    expect(migrateProject(project)).toEqual(project)
  })
})
