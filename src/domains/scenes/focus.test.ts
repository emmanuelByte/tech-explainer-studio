import { describe, expect, it } from 'vitest'
import type { Layer, Scene } from '../../types'
import { adjacentScene, layerOverlapsScene, layersForScene, sceneHasNarration, visibleSceneLayerIds } from './focus'

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

  it('matches a scope: scene layer purely by sceneId, ignoring its (scene-local) frame range', () => {
    // Local frames 0-1000 would "overlap" almost anything by raw range, but
    // a scene-owned layer belongs to exactly the scene it's assigned to.
    const owned = { ...layer('owned', 0, 1000), scope: 'scene' as const, sceneId: 'scene-2' }
    const ownedByOther = { ...layer('other', 0, 1000), scope: 'scene' as const, sceneId: 'scene-3' }
    expect(layerOverlapsScene(owned, scene)).toBe(true)
    expect(layerOverlapsScene(ownedByOther, scene)).toBe(false)
  })

  it('keeps parent groups needed by matching children', () => {
    const layers = [
      layer('root', 0, 20),
      layer('child', 35, 45, 'root'),
      layer('other', 60, 90),
    ]
    expect(layersForScene(layers, scene).map((item) => item.id)).toEqual(['root', 'child'])
  })

  it('shows only top-level scene layers by default', () => {
    const layers = [
      layer('group', 30, 60),
      layer('child', 30, 60, 'group'),
      layer('topLevel', 30, 60),
    ]
    expect(visibleSceneLayerIds(layers, scene, [])).toEqual(new Set(['group', 'topLevel']))
  })

  it('reveals only a group\'s direct children once expanded', () => {
    const layers = [
      layer('group', 30, 60),
      layer('child', 30, 60, 'group'),
      layer('grandchild', 30, 60, 'child'),
    ]
    expect(visibleSceneLayerIds(layers, scene, ['group'])).toEqual(new Set(['group', 'child']))
    expect(visibleSceneLayerIds(layers, scene, ['group', 'child'])).toEqual(new Set(['group', 'child', 'grandchild']))
  })

  it('treats an empty expansion set as fully collapsed for a fresh scene visit', () => {
    const layers = [
      layer('group', 30, 60),
      layer('child', 30, 60, 'group'),
    ]
    // Simulates switching scenes: no group is expanded until the creator opens one.
    expect(visibleSceneLayerIds(layers, scene, [])).toEqual(new Set(['group']))
  })

  it('detects narration audio overlapping a scene', () => {
    const narrationLayer = { ...layer('voice', 30, 60), type: 'audio' as const, audioRole: 'narration' as const }
    const musicLayer = { ...layer('music', 30, 60), type: 'audio' as const, audioRole: 'music' as const }
    expect(sceneHasNarration([narrationLayer], scene)).toBe(true)
    expect(sceneHasNarration([musicLayer], scene)).toBe(false)
    expect(sceneHasNarration([{ ...narrationLayer, startFrame: 0, endFrame: 20 }], scene)).toBe(false)
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
