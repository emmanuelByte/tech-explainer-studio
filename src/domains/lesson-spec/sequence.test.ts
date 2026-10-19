import { describe, expect, it } from 'vitest'
import { arrowPath, layoutSequence, wrapLabel } from './sequence'
import type { SpecSequence } from './types'

const labels = ['POST /jobs', 'enqueue(job)', '202 Accepted + job id', 'deliver the job to a background worker for processing', 'ok']

function sequence(participants: number, messages = 8): SpecSequence {
  return {
    id: 'seq',
    participants: Array.from({ length: participants }, (_, i) => ({ id: `p${i}`, label: i % 2 ? 'Background Worker' : `Part ${i}` })),
    messages: Array.from({ length: messages }, (_, i) => ({
      id: `m${i}`, from: `p${i % participants}`, to: `p${(i + 1) % participants}`, label: labels[i % labels.length], kind: (['sync', 'async', 'response'] as const)[i % 3],
    })),
  }
}

const canvases = { landscape: { width: 1920, height: 1080 }, portrait: { width: 1080, height: 1920 } }

describe.each(Object.entries(canvases))('layoutSequence in %s', (_name, canvas) => {
  it.each([2, 3, 4, 5])('keeps %i participants, arrows and labels inside the panel without collisions', (count) => {
    const g = layoutSequence(sequence(count), canvas, 360)
    const half = g.width / 2
    expect(g.width).toBeLessThanOrEqual(canvas.width - 80)

    const xs = g.participants.map((p) => p.x)
    expect(xs).toEqual([...xs].sort((a, b) => a - b))
    for (const p of g.participants) {
      expect(p.x - p.headerWidth / 2).toBeGreaterThanOrEqual(-half)
      expect(p.x + p.headerWidth / 2).toBeLessThanOrEqual(half)
    }
    for (let i = 1; i < g.participants.length; i += 1) {
      expect(g.participants[i].x - g.participants[i - 1].x).toBeGreaterThanOrEqual(g.participants[i].headerWidth)
    }

    const top = -g.height / 2
    const bottom = g.height / 2
    let previousBottom = g.participants[0].headerY + g.participants[0].headerHeight / 2
    for (const m of g.messages) {
      // Label block, then arrow, in order from the top, never overlapping the previous message.
      expect(m.labelY - m.labelHeight / 2).toBeGreaterThanOrEqual(previousBottom)
      expect(m.labelY + m.labelHeight / 2).toBeLessThan(m.y)
      expect(m.labelX - m.labelWidth / 2).toBeGreaterThanOrEqual(-half)
      expect(m.labelX + m.labelWidth / 2).toBeLessThanOrEqual(half)
      expect(m.y).toBeLessThan(bottom)
      expect(Math.min(m.fromX, m.toX)).toBeGreaterThan(-half)
      expect(Math.max(m.fromX, m.toX)).toBeLessThan(half)
      previousBottom = m.y
    }
    expect(g.messages[0].labelY - g.messages[0].labelHeight / 2).toBeGreaterThan(top)
  })

  it('scales the panel to fit above the caption strip', () => {
    const g = layoutSequence(sequence(3, 8), canvas, 360)
    expect(g.fit).toBeLessThanOrEqual(1)
    expect(g.height * g.fit).toBeLessThanOrEqual(canvas.height - 360)
    expect(g.width * g.fit).toBeLessThanOrEqual(canvas.width)
  })
})

describe('message positions', () => {
  it('follow the source order, top to bottom', () => {
    const g = layoutSequence(sequence(3, 5), canvases.landscape, 360)
    const ys = g.messages.map((m) => m.y)
    expect(ys).toEqual([...ys].sort((a, b) => a - b))
  })

  it('points each arrow from its sender to its receiver', () => {
    const g = layoutSequence(sequence(3, 3), canvases.landscape, 360)
    for (const m of g.messages) expect(m.fromX).not.toBe(m.toX)
    expect(g.messages[2].toX).toBeLessThan(g.messages[2].fromX) // p2 -> p0 goes back left
  })
})

describe('arrowPath', () => {
  it('draws a filled closed head for sync, an open head for async, and a dashed shaft for responses', () => {
    expect(arrowPath('sync', 0, 400).d).toMatch(/Z$/)
    expect(arrowPath('async', 0, 400).d).not.toMatch(/Z/)
    const response = arrowPath('response', 0, 400).d
    expect((response.match(/M /g) ?? []).length).toBeGreaterThan(5)
  })

  it('keeps the whole outline inside its layer for both directions', () => {
    for (const [from, to] of [[0, 300], [300, 0]]) {
      for (const kind of ['sync', 'async', 'response'] as const) {
        const { d, width, height } = arrowPath(kind, from, to)
        const numbers = (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number)
        const px = numbers.filter((_, i) => i % 2 === 0)
        const py = numbers.filter((_, i) => i % 2 === 1)
        expect(Math.min(...px)).toBeGreaterThanOrEqual(0)
        expect(Math.max(...px)).toBeLessThanOrEqual(width)
        expect(Math.min(...py)).toBeGreaterThanOrEqual(0)
        expect(Math.max(...py)).toBeLessThanOrEqual(height)
      }
    }
  })
})

describe('wrapLabel', () => {
  it('wraps on word boundaries and never splits a word', () => {
    expect(wrapLabel('result saved, notify the client', 14)).toEqual(['result saved,', 'notify the', 'client'])
    expect(wrapLabel('supercalifragilistic', 5)).toEqual(['supercalifragilistic'])
  })
})
