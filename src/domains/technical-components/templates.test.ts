import { describe, expect, it } from 'vitest'
import type { Layer, LayerType, TechnicalComponentKind } from '../../types'
import { makeTechnicalComponentLayers, technicalComponentLabel } from './templates'

const messagingKinds: TechnicalComponentKind[] = [
  'queue',
  'dead-letter-queue',
  'event-message',
  'worker',
]

function layerFactory() {
  let index = 0
  return (type: LayerType = 'rectangle', overrides: Partial<Layer> = {}) => ({
    id: `layer-${index += 1}`,
    name: type,
    type,
    parentId: null,
    visible: true,
    locked: false,
    width: 100,
    height: 100,
    fillType: 'none',
    fillColor: 'transparent',
    gradientStops: [],
    gradientAngle: 0,
    strokeEnabled: false,
    strokeColor: '#ffffff',
    strokeWidth: 0,
    borderRadius: 0,
    shadowEnabled: false,
    shadowColor: 'transparent',
    text: '',
    fontFamily: 'Inter',
    fontSize: 16,
    fontWeight: '400',
    textAlign: 'center',
    letterSpacing: 0,
    lineHeight: 1.2,
    textColor: '#ffffff',
    startFrame: 0,
    endFrame: 1,
    keyframes: [],
    ...overrides,
  } as Layer)
}

describe('technical component templates', () => {
  it.each(messagingKinds)('creates an editable %s group around SVG artwork', (kind) => {
    const layers = makeTechnicalComponentLayers({
      makeLayer: layerFactory(),
      kind,
      x: 120,
      y: -80,
      startFrame: 15,
      endFrame: 180,
    })

    const [parent, artwork, label] = layers
    expect(parent.type).toBe('group')
    expect(parent.technicalComponent).toEqual({ kind, version: 1 })
    expect(parent.keyframes[0].props).toMatchObject({ x: 120, y: -80 })
    expect(artwork).toMatchObject({
      type: 'image',
      parentId: parent.id,
      imageKind: 'svg',
      startFrame: 15,
      endFrame: 180,
    })
    expect(artwork.src).toMatch(/^data:image\/svg\+xml;charset=utf-8,/)
    expect(decodeURIComponent(artwork.src!.split(',')[1])).toContain('<svg')
    expect(label).toMatchObject({
      type: 'text',
      parentId: parent.id,
      text: technicalComponentLabel(kind),
      startFrame: 15,
      endFrame: 180,
    })
  })

  it('keeps the label editable and accepts a lesson-specific title', () => {
    const layers = makeTechnicalComponentLayers({
      makeLayer: layerFactory(),
      kind: 'event-message',
      title: 'OrderCreated',
      x: 0,
      y: 0,
      startFrame: 0,
      endFrame: 90,
    })

    expect(layers[0].name).toBe('OrderCreated')
    expect(layers[2]).toMatchObject({ type: 'text', text: 'OrderCreated' })
  })

  it('preserves the existing editable server template', () => {
    const layers = makeTechnicalComponentLayers({
      makeLayer: layerFactory(),
      kind: 'server',
      x: 0,
      y: 0,
      startFrame: 0,
      endFrame: 90,
    })

    expect(layers).toHaveLength(4)
    expect(layers[0]).toMatchObject({
      type: 'group',
      name: 'Server',
      technicalComponent: { kind: 'server', version: 1 },
    })
    expect(layers[1]).toMatchObject({ type: 'rectangle', name: 'Server body' })
    expect(layers[2]).toMatchObject({
      type: 'image',
      name: 'Server artwork',
      imageKind: 'svg',
    })
    expect(layers[layers.length - 1]).toMatchObject({ type: 'text', text: 'Server' })
  })
})
