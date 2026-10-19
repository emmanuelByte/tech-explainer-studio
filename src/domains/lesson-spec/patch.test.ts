import { describe, expect, it } from 'vitest'
import { applyLessonSpecPatch, LessonSpecPatchError } from './patch'
import type { LessonSpec } from './types'

function spec(): LessonSpec {
  return {
    version: 1,
    id: 'demo',
    title: 'Original title',
    nodes: [
      { id: 'client', kind: 'client', label: 'Client' },
      { id: 'server', kind: 'server', label: 'Server' },
    ],
    edges: [{ id: 'request', from: 'client', to: 'server', label: 'request' }],
    scenes: [{ id: 'request', title: 'Request', narration: 'A client makes a request.', reveal: ['client', 'server', 'request'] }],
  }
}

describe('applyLessonSpecPatch', () => {
  it('updates existing semantic ids without mutating the authored spec', () => {
    const source = spec()
    const result = applyLessonSpecPatch(source, {
      version: 1,
      lessonId: 'demo',
      lesson: { title: 'Updated title' },
      nodes: { server: { label: 'API Server' } },
      scenes: { request: { narration: 'A client makes a request to the API server.' } },
    })

    expect(result.title).toBe('Updated title')
    expect(result.nodes[1].label).toBe('API Server')
    expect(result.scenes[0].narration).toContain('API server')
    expect(source.title).toBe('Original title')
    expect(source.nodes[1].label).toBe('Server')
  })

  it('rejects unknown ids and rejects a result that violates lesson rules', () => {
    expect(() => applyLessonSpecPatch(spec(), { version: 1, scenes: { missing: { title: 'Nope' } } }))
      .toThrow(LessonSpecPatchError)
    expect(() => applyLessonSpecPatch(spec(), { version: 1, scenes: { request: { hide: ['client'] } } }))
      .toThrow('must be revealed in an earlier scene')
  })
})
