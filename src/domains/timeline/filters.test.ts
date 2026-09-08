import { describe, expect, it } from 'vitest'
import { filterLayerRows, hasStaleNarration, isLayerAnimated, matchesSearchQuery, matchesTrackFilter } from './filters'
import type { Layer, ScriptSegment } from '../../types'

function makeLayer(overrides: Partial<Layer> = {}): Layer {
  return {
    id: 'l1', name: 'Rectangle 1', type: 'rectangle',
    startFrame: 0, endFrame: 30, visible: true, locked: false,
    keyframes: [], parentId: undefined,
    ...overrides,
  } as Layer
}

describe('matchesSearchQuery', () => {
  it('matches case-insensitively on layer name', () => {
    expect(matchesSearchQuery({ name: 'Load Balancer' }, 'balancer')).toBe(true)
    expect(matchesSearchQuery({ name: 'Load Balancer' }, 'server')).toBe(false)
  })

  it('treats an empty/whitespace query as matching everything', () => {
    expect(matchesSearchQuery({ name: 'Anything' }, '  ')).toBe(true)
  })
})

describe('isLayerAnimated', () => {
  it('is false with no keyframes at all', () => {
    expect(isLayerAnimated({ keyframes: [] })).toBe(false)
  })

  it('is true when the main transform track has keyframes', () => {
    expect(isLayerAnimated({ keyframes: [{ frame: 0, easing: 'linear', props: {} as never }] })).toBe(true)
  })

  it('is true when only a property track has keyframes', () => {
    expect(isLayerAnimated({
      keyframes: [],
      propertyKeyframes: { opacity: [{ id: 'k1', frame: 0, value: 1, easing: 'linear' }] },
    })).toBe(true)
  })
})

describe('hasStaleNarration', () => {
  const segments: ScriptSegment[] = [{ id: 'seg1', text: 'Updated line' }]

  it('is false for non-audio layers', () => {
    expect(hasStaleNarration({ type: 'rectangle', scriptSegmentId: 'seg1', narrationGeneration: { sourceText: 'Old line' } as never }, segments)).toBe(false)
  })

  it('is false when the narration text still matches the segment', () => {
    expect(hasStaleNarration({ type: 'audio', scriptSegmentId: 'seg1', narrationGeneration: { sourceText: 'Updated line' } as never }, segments)).toBe(false)
  })

  it('is true when the segment text changed after generation', () => {
    expect(hasStaleNarration({ type: 'audio', scriptSegmentId: 'seg1', narrationGeneration: { sourceText: 'Old line' } as never }, segments)).toBe(true)
  })
})

describe('matchesTrackFilter + filterLayerRows', () => {
  const selected = makeLayer({ id: 'a', name: 'Selected shape' })
  const audio = makeLayer({ id: 'b', name: 'Voice over', type: 'audio' })
  const hidden = makeLayer({ id: 'c', name: 'Hidden shape', visible: false })
  const animated = makeLayer({ id: 'd', name: 'Animated shape', keyframes: [{ frame: 0, easing: 'linear', props: {} as never }] })
  const rows = [selected, audio, hidden, animated].map((layer) => ({ layer }))
  const context = { selectedLayerIds: ['a'], scriptSegments: [] }

  it('filters by the selected chip', () => {
    expect(matchesTrackFilter('selected', selected, context)).toBe(true)
    expect(matchesTrackFilter('selected', audio, context)).toBe(false)
  })

  it('filters by the visible chip', () => {
    expect(matchesTrackFilter('visible', hidden, context)).toBe(false)
    expect(matchesTrackFilter('visible', selected, context)).toBe(true)
  })

  it('combines search and multiple filter chips in filterLayerRows', () => {
    const result = filterLayerRows(rows, 'shape', ['visible'], context)
    expect(result.map((r) => r.layer.id)).toEqual(['a', 'd'])
  })

  it('returns every row when there is no search text and no active filters', () => {
    expect(filterLayerRows(rows, '', [], context)).toHaveLength(rows.length)
  })
})
