import { describe, expect, it } from 'vitest'
import { DEFAULT_TRANSFORM, type Connector, type Layer, type TransformProps } from '../../types'
import { resolveComponentPorts, resolveConnector } from './resolve'
import { editConnector } from './edit'

function component(id: string, transform: Partial<TransformProps> = {}, patch: Partial<Layer> = {}): Layer {
  return {
    id, name: id, type: 'group', visible: true, locked: false, width: 100, height: 60,
    fillType: 'none', fillColor: '#000000', gradientStops: [], gradientAngle: 0,
    strokeEnabled: false, strokeColor: '#ffffff', strokeWidth: 0, borderRadius: 0,
    shadowEnabled: false, shadowColor: '#000000', text: '', fontFamily: 'Arial', fontSize: 20,
    fontWeight: '400', textAlign: 'center', letterSpacing: 0, lineHeight: 1.2, textColor: '#ffffff',
    startFrame: 0, endFrame: 100,
    keyframes: [{ frame: 0, easing: 'linear', props: { ...DEFAULT_TRANSFORM, ...transform } }], ...patch,
  }
}
const connector: Connector = { id: 'link', sourceLayerId: 'source', targetLayerId: 'target', sourcePort: 'right', targetPort: 'left', lineStyle: 'solid', arrowStart: false, arrowEnd: true, color: '#60a5fa', strokeWidth: 4 }

function expectPoint(actual: { x: number; y: number }, x: number, y: number) {
  expect(actual.x).toBeCloseTo(x)
  expect(actual.y).toBeCloseTo(y)
}

describe('shared component port resolution', () => {
  it('follows nested translation, rotation and scale at the exact port', () => {
    const layers = [component('parent', { x: 100, y: 20, rotateZ: 90, scale: 2 }), component('source', { x: 50 }, { parentId: 'parent' })]
    const resolved = resolveComponentPorts('source', layers, 0, 1000, 600)!
    expectPoint(resolved.ports.right.point, 600, 520)
    expectPoint(resolved.ports.right.direction, 0, 1)
  })
  it('preserves transform order for nonuniformly scaled ancestors', () => {
    const layers = [component('parent', { scaleX: 2, scaleY: 3 }), component('source', { rotateZ: 90 }, { parentId: 'parent' })]
    expectPoint(resolveComponentPorts('source', layers, 0, 1000, 600)!.ports.right.point, 500, 450)
  })
  it('honors off-center transform origins and reflected components', () => {
    const layers = [component('source', { originX: 0, scaleX: -2 })]
    const resolved = resolveComponentPorts('source', layers, 0, 1000, 600)!
    expectPoint(resolved.ports.right.point, 250, 300)
    expectPoint(resolved.ports.right.direction, -1, 0)
  })
  it('uses animated size and transform values at the requested frame', () => {
    const layer = component('source', {}, {
      keyframes: [{ frame: 0, easing: 'linear', props: DEFAULT_TRANSFORM }, { frame: 10, easing: 'linear', props: { ...DEFAULT_TRANSFORM, x: 100 } }],
      propertyKeyframes: { width: [{ id: 'a', frame: 0, value: 100, easing: 'linear' }, { id: 'b', frame: 10, value: 200, easing: 'linear' }] },
    })
    expectPoint(resolveComponentPorts('source', [layer], 5, 1000, 600)!.ports.right.point, 625, 300)
  })
  it('hides connections when an endpoint or ancestor is outside its range or hidden', () => {
    const layers = [component('parent', {}, { endFrame: 10 }), component('source', {}, { parentId: 'parent' }), component('target')]
    expect(resolveConnector(connector, layers, 10, 1000, 600)).not.toBeNull()
    expect(resolveConnector(connector, layers, 11, 1000, 600)).toBeNull()
    expect(resolveConnector(connector, layers.map((layer) => layer.id === 'parent' ? { ...layer, visible: false } : layer), 0, 1000, 600)).toBeNull()
  })
  it('follows inherited opacity and safely handles missing endpoints or cycles', () => {
    const layers = [component('parent', { opacity: 0.5 }), component('source', { opacity: 0.5 }, { parentId: 'parent' }), component('target')]
    expect(resolveConnector(connector, layers, 0, 1000, 600)?.opacity).toBe(0.25)
    expect(resolveConnector(connector, layers.slice(0, 2), 0, 1000, 600)).toBeNull()
    expect(resolveComponentPorts('source', [component('source', {}, { parentId: 'source' })], 0, 1000, 600)).toBeNull()
  })
  it('preserves routing and geometry through a project JSON round trip', () => {
    const project = { layers: [component('source'), component('target', { x: 300 })], connectors: [{ ...connector, routing: 'bezier' as const }] }
    const restored = JSON.parse(JSON.stringify(project)) as typeof project
    expect(resolveConnector(restored.connectors[0], restored.layers, 0, 1000, 600)).toEqual(resolveConnector(project.connectors[0], project.layers, 0, 1000, 600))
  })
})

describe('connector editing', () => {
  const layers = [component('source'), component('target'), component('replacement')]
  it('rejects missing endpoints and self-connections without changing data', () => {
    expect(editConnector(connector, { targetLayerId: 'source' }, layers)).toBe(connector)
    expect(editConnector(connector, { sourceLayerId: 'missing' }, layers)).toBe(connector)
    expect(editConnector(connector, { targetLayerId: 'replacement', targetPort: 'top' }, layers)).toMatchObject({ targetLayerId: 'replacement', targetPort: 'top' })
  })
  it('allows moving an endpoint to another port on the same component', () => {
    expect(editConnector(connector, { sourceLayerId: 'source', sourcePort: 'bottom' }, layers).sourcePort).toBe('bottom')
  })
  it('keeps draw timing integral and ordered when the start moves past the end', () => {
    const animated = { ...connector, drawStartFrame: 0, drawEndFrame: 24 }
    expect(editConnector(animated, { drawStartFrame: 50.2 }, layers)).toMatchObject({ drawStartFrame: 50, drawEndFrame: 51 })
    expect(editConnector(animated, { drawStartFrame: -2, drawEndFrame: -1 }, layers)).toMatchObject({ drawStartFrame: 0, drawEndFrame: 1 })
    expect(editConnector(animated, { drawEndFrame: NaN }, layers)).toBe(animated)
    expect(animated.drawStartFrame).toBe(0)
  })
  it('removes draw timing cleanly for saving and reloading a static connector', () => {
    const edited = editConnector({ ...connector, drawStartFrame: 0, drawEndFrame: 24 }, { drawStartFrame: undefined, drawEndFrame: undefined }, layers)
    expect(JSON.parse(JSON.stringify(edited))).not.toHaveProperty('drawStartFrame')
    expect(JSON.parse(JSON.stringify(edited))).not.toHaveProperty('drawEndFrame')
  })
})
