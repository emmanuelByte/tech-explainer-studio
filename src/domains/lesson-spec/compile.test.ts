import { describe, expect, it } from 'vitest'
import { TECHNICAL_COMPONENT_KINDS } from '../../types'
import { migrateProject } from '../project/migrations'
import { compileLessonSpec, layoutNodes, type ComponentArtwork } from './compile'
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

  it('writes one script segment and camera keyframe per scene, with captions on', () => {
    const project = compileLessonSpec(spec(), options)
    expect(project.script?.segments).toHaveLength(3)
    expect(project.script?.segments.map((segment) => segment.sceneId)).toEqual(project.scenes!.map((scene) => scene.id))
    // Hold each framing, then move to the next over 24 frames at the start of its scene.
    expect(project.camera?.keyframes.map((keyframe) => keyframe.frame)).toEqual([0, 150, 174, 330, 354])
    expect(project.captions).toEqual({ enabled: true, style: 'readable' })
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
})

describe('narration', () => {
  function cued(): LessonSpec {
    const value = spec()
    value.scenes[1].narration = '[[lb]]A load balancer receives it, [[c-lb]]before anything else.'
    return value
  }

  function manifest(value: LessonSpec) {
    return {
      voiceId: 'baseVoice',
      exaggeration: 0.5,
      cfgWeight: 0.5,
      scenes: {
        one: { assetId: 'asset_one', durationSeconds: 3, cues: {}, source: value.scenes[0].narration },
        two: { assetId: 'asset_two', durationSeconds: 4, cues: { lb: 0, 'c-lb': 2.5 }, source: value.scenes[1].narration },
        three: { assetId: 'asset_three', durationSeconds: 5, cues: {}, source: value.scenes[2].narration },
      },
    }
  }

  it('sizes scenes from real audio and pins reveals to their cues', () => {
    const value = cued()
    const project = compileLessonSpec(value, { ...options, narration: manifest(value) })
    // lead 0.5s + audio + tail 0.7s at 30 fps
    expect(project.scenes!.map((scene) => scene.endFrame - scene.startFrame)).toEqual([126, 156, 186])
    const sceneTwo = project.scenes![1]
    const audioStart = sceneTwo.startFrame + 15
    const lb = project.layers.find((layer) => layer.id === 'node_lb')!
    expect(lb.keyframes[1].frame).toBe(audioStart)
    expect(project.connectors!.find((connector) => connector.id === 'edge_c-lb')!.drawStartFrame).toBe(audioStart + 75)
  })

  it('refuses stale or missing audio', () => {
    const value = cued()
    const stale = manifest(value)
    stale.scenes.two.source = 'something older'
    expect(() => compileLessonSpec(value, { ...options, narration: stale })).toThrow('changed since its audio was made')
    const full = manifest(value)
    const missing = { ...full, scenes: Object.fromEntries(Object.entries(full.scenes).filter(([id]) => id !== 'three')) }
    expect(() => compileLessonSpec(value, { ...options, narration: missing })).toThrow('No narration audio')
  })
})
