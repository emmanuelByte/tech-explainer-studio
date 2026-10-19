import { describe, expect, it } from 'vitest'
import { TECHNICAL_COMPONENT_KINDS, type Layer } from '../../types'
import { compileLessonSpec, layoutNodes, type ComponentArtwork } from './compile'
import { contentHeight, frameFor } from './frame'
import type { LessonSpec } from './types'

const artwork = Object.fromEntries(TECHNICAL_COMPONENT_KINDS.map((kind) => [kind, '<svg xmlns="http://www.w3.org/2000/svg"/>'])) as ComponentArtwork
const long = (n: number) => `${'word '.repeat(Math.ceil(n / 5))}`.trim().slice(0, n)

/** One scene per overlay kind, each filled to its validator limit. */
function maxed(): LessonSpec {
  return {
    version: 1, id: 'maxed', title: 'A very long lesson title that should wrap onto several lines', 
    intro: { subtitle: long(60) }, outro: { text: long(60) },
    nodes: [{ id: 'a', kind: 'client', label: 'Client' }, { id: 'b', kind: 'server', label: 'Server' }],
    edges: [{ id: 'a-b', from: 'a', to: 'b' }],
    scenes: [
      { id: 'base', title: 'Base', narration: 'Two parts.', durationSeconds: 5, reveal: ['a', 'b', 'a-b'] },
      { id: 'card', title: 'Card', narration: 'A card.', durationSeconds: 6, card: { id: 'card', title: long(40), lines: Array.from({ length: 8 }, () => long(60)) } },
      { id: 'bullets', title: 'Bullets', narration: 'Bullets.', durationSeconds: 6, bullets: { id: 'points', title: long(48), items: Array.from({ length: 6 }, () => long(72)) } },
      { id: 'compare', title: 'Compare', narration: 'Compare.', durationSeconds: 6, comparison: { id: 'cmp', left: { title: long(32), lines: Array.from({ length: 6 }, () => long(60)) }, right: { title: long(32), lines: Array.from({ length: 6 }, () => long(60)) } } },
      {
        id: 'seq', title: 'Sequence', narration: 'Sequence.', durationSeconds: 8,
        sequence: {
          id: 'flow',
          participants: ['one', 'two', 'three', 'four', 'five'].map((id) => ({ id, label: 'Participant label' })),
          messages: Array.from({ length: 8 }, (_, i) => ({ id: `m${i}`, from: ['one', 'two', 'three', 'four', 'five'][i % 5], to: ['one', 'two', 'three', 'four', 'five'][(i + 1) % 5], label: long(56), kind: (['sync', 'async', 'response'] as const)[i % 3] })),
        },
      },
    ],
  }
}

const formats = { landscape: { width: 1920, height: 1080 }, portrait: { width: 1080, height: 1920 } }

describe.each(Object.entries(formats))('overlays at maximum content in %s', (_name, canvas) => {
  const project = compileLessonSpec(maxed(), { artwork, now: '2026-10-19T00:00:00.000Z', canvas })
  const frame = frameFor(canvas.width, canvas.height)
  const groups = project.layers.filter((layer) => layer.type === 'group' && /^(card|comparison|sequence)_/.test(layer.id))

  it('produces every overlay', () => {
    expect(groups.map((group) => group.id.split('_')[0]).sort()).toEqual(['card', 'card', 'comparison', 'sequence'])
  })

  it.each(groups.map((group) => [group.id, group] as const))('%s fits the frame and keeps its content inside its panel', (_id, group) => {
    const shown = group.keyframes[group.keyframes.length - 2].props
    const scale = shown.scale ?? 1
    expect(scale).toBeGreaterThan(0)
    const children = project.layers.filter((layer: Layer) => layer.parentId === group.id && !layer.id.endsWith('__backdrop'))
    expect(children.length).toBeGreaterThan(2)
    for (const child of children) {
      const props = child.keyframes[0].props
      expect(Math.abs(props.x) + child.width / 2).toBeLessThanOrEqual(group.width / 2 + 1)
      expect(Math.abs(props.y) + child.height / 2).toBeLessThanOrEqual(group.height / 2 + 1)
    }
    // Authored size is within the frame's width limit; a panel too tall for the area above the captions is shrunk (scale < 1/zoom), never cropped.
    expect(group.width).toBeLessThanOrEqual(frame.overlayMaxWidth + 1)
    const camera = project.camera!.keyframes.find((keyframe) => keyframe.frame <= group.startFrame + 1) ?? project.camera!.keyframes[0]
    const fit = scale * camera.zoom // 1 = authored size; < 1 = shrunk to fit
    expect(fit).toBeLessThanOrEqual(1.001)
    expect(group.height * fit).toBeLessThanOrEqual(contentHeight(frame))
  })

  it('wraps long intro and outro titles inside the frame', () => {
    for (const id of ['title_intro__title', 'title_outro__title']) {
      const layer = project.layers.find((candidate) => candidate.id === id)!
      expect(layer.width).toBeLessThanOrEqual(canvas.width - 100)
      expect(layer.text.split('\n').length).toBeLessThanOrEqual(3)
    }
  })
})

describe('portrait node layout', () => {
  const spec = (perRank: number) => ({
    nodes: [{ id: 'root', kind: 'client' as const, label: 'Root' }, ...Array.from({ length: perRank }, (_, i) => ({ id: `n${i}`, kind: 'server' as const, label: `N${i}` }))],
    edges: Array.from({ length: perRank }, (_, i) => ({ id: `e${i}`, from: 'root', to: `n${i}` })),
  })

  it.each([1, 2, 3, 4, 5, 7])('never overlaps or leaves the frame with %i components in one rank', (count) => {
    const placements = [...layoutNodes(spec(count), { width: 1080, height: 1920 }).values()]
    for (const a of placements) {
      expect(Math.abs(a.x) + 120).toBeLessThanOrEqual(1080 / 2 - 40)
      for (const b of placements) {
        if (a === b) continue
        const overlapX = Math.abs(a.x - b.x) < 240
        const overlapY = Math.abs(a.y - b.y) < 150
        expect(overlapX && overlapY).toBe(false)
      }
    }
  })

  it('keeps portrait content inside the safe area height budget', () => {
    expect(contentHeight(frameFor(1080, 1920))).toBeGreaterThan(900)
  })
})
