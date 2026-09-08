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

/**
 * Which of a scene's layers (from `layersForScene`) should render as a row
 * right now, given which groups the creator has expanded so far in this
 * scene-viewing session. Top-level layers (no parent, or a parent outside
 * the scene's layer set) are always visible; a deeper layer is visible only
 * if every group between it and the top of the tree is in `expandedGroupIds`.
 *
 * This intentionally does not read/write `Layer.collapsed` (the persisted,
 * Story-workspace collapse state) — Scene workspace's "top-level by
 * default" behavior is a separate, ephemeral concept that resets whenever a
 * different scene is opened, so switching scenes never leaves group state
 * from a previous scene applied to this one.
 */
export function visibleSceneLayerIds(layers: Layer[], scene: Scene | null | undefined, expandedGroupIds: string[]): Set<string> {
  const sceneLayers = layersForScene(layers, scene)
  const sceneIds = new Set(sceneLayers.map((layer) => layer.id))
  const byId = new Map(layers.map((layer) => [layer.id, layer]))
  const expanded = new Set(expandedGroupIds)
  const visible = new Set<string>()

  for (const layer of sceneLayers) {
    let parentId = layer.parentId
    let hiddenByCollapsedAncestor = false
    const visited = new Set<string>()
    while (parentId && sceneIds.has(parentId) && !visited.has(parentId)) {
      if (!expanded.has(parentId)) { hiddenByCollapsedAncestor = true; break }
      visited.add(parentId)
      parentId = byId.get(parentId)?.parentId
    }
    if (!hiddenByCollapsedAncestor) visible.add(layer.id)
  }

  return visible
}

export function adjacentScene(scenes: Scene[], activeSceneId: string | null, direction: -1 | 1) {
  const index = scenes.findIndex((scene) => scene.id === activeSceneId)
  if (index < 0) return null
  return scenes[index + direction] ?? null
}
