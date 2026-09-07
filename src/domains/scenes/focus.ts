import type { Layer, Scene } from '../../types'

export function layerOverlapsScene(layer: Layer, scene: Scene) {
  const startFrame = layer.startFrame ?? 0
  const endFrame = layer.endFrame ?? Number.POSITIVE_INFINITY
  return startFrame < scene.endFrame && endFrame > scene.startFrame
}

/**
 * Returns layers active during a scene, plus their parent groups so the layer
 * tree remains navigable. The original layer order is preserved.
 */
export function layersForScene(layers: Layer[], scene: Scene | null | undefined) {
  if (!scene) return layers

  const byId = new Map(layers.map((layer) => [layer.id, layer]))
  const included = new Set(
    layers.filter((layer) => layerOverlapsScene(layer, scene)).map((layer) => layer.id),
  )

  for (const layerId of [...included]) {
    let parentId = byId.get(layerId)?.parentId
    const visited = new Set<string>()
    while (parentId && !visited.has(parentId)) {
      visited.add(parentId)
      included.add(parentId)
      parentId = byId.get(parentId)?.parentId
    }
  }

  return layers.filter((layer) => included.has(layer.id))
}

export function adjacentScene(scenes: Scene[], activeSceneId: string | null, direction: -1 | 1) {
  const index = scenes.findIndex((scene) => scene.id === activeSceneId)
  if (index < 0) return null
  return scenes[index + direction] ?? null
}
