import { describe, expect, it } from 'vitest'
import { parseStructuredScript } from './structuredScript'

describe('parseStructuredScript', () => {
  it('creates persisted, timed editable scenes from a structured lesson plan', () => {
    const result = parseStructuredScript(JSON.stringify({
      title: 'Load Balancers',
      scenes: [
        { title: 'Problem', narration: 'One server is overloaded.', durationSeconds: 2, visual: 'Show one server.' },
        { title: 'Solution', narration: 'Add a load balancer.', durationSeconds: 3 },
      ],
    }), 30)
    expect(result).toMatchObject({ title: 'Load Balancers', totalFrames: 150 })
    expect(result.scenes).toMatchObject([
      { title: 'Problem', startFrame: 0, endFrame: 60, visual: 'Show one server.' },
      { title: 'Solution', startFrame: 60, endFrame: 150 },
    ])
    expect(result.script.segments.map((segment) => segment.text)).toEqual(['One server is overloaded.', 'Add a load balancer.'])
  })

  it('reports actionable validation errors', () => {
    expect(() => parseStructuredScript('{', 30)).toThrow('Invalid JSON')
    expect(() => parseStructuredScript(JSON.stringify({ scenes: [{ title: 'Missing narration' }] }), 30)).toThrow('Scene 1: narration is required')
  })
})
