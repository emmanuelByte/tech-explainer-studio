import { describe, expect, it } from 'vitest'
import type { Layer, Scene } from '../../types'
import { adjacentScene, layerOverlapsScene, layersForScene } from './focus'

const scene: Scene = { id: 'scene-2', title: 'Scene 2', startFrame: 30, endFrame: 60, scriptSegmentIds: [] }

function layer(id: string, startFrame: number, endFrame: number, parentId?: string): Layer {
  return { id, name: id, type: 'rectangle', startFrame, endFrame, parentId, visible: true, locked: false, keyframes: [] } as Layer
}

describe('scene focus', () => {
  it('uses half-open scene ranges at boundaries', () => {
    expect(layerOverlapsScene(layer('before', 0, 30), scene)).toBe(false)
    expect(layerOverlapsScene(layer('inside', 30, 60), scene)).toBe(true)
    expect(layerOverlapsScene(layer('after', 60, 90), scene)).toBe(false)
    expect(layerOverlapsScene(layer('spanning', 0, 90), scene)).toBe(true)
  })

  it('keeps parent groups needed by matching children', () => {
    const layers = [
      layer('root', 0, 20),
      layer('child', 35, 45, 'root'),
      layer('other', 60, 90),
    ]
    expect(layersForScene(layers, scene).map((item) => item.id)).toEqual(['root', 'child'])
  })

  it('finds adjacent scenes without wrapping', () => {
    const scenes = [
      { ...scene, id: 'a' },
      { ...scene, id: 'b' },
      { ...scene, id: 'c' },
    ]
    expect(adjacentScene(scenes, 'b', -1)?.id).toBe('a')
    expect(adjacentScene(scenes, 'b', 1)?.id).toBe('c')
    expect(adjacentScene(scenes, 'c', 1)).toBeNull()
  })
})
