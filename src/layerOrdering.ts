import { Layer } from './types'

export type LayerOrderAction = 'front' | 'forward' | 'backward' | 'back'

export function reorderLayersForStack(layers: Layer[], targetIds: string[], action: LayerOrderAction) {
  const targetSet = new Set(targetIds)
  const targetParents = Array.from(new Set(
    layers.filter((layer) => targetSet.has(layer.id)).map((layer) => layer.parentId ?? null)
  ))
  const byId = new Map(layers.map((layer) => [layer.id, layer]))
  let next = [...layers]

  targetParents.forEach((parentId) => {
    const siblingIds = next
      .filter((layer) => (layer.parentId ?? null) === parentId)
      .map((layer) => layer.id)
    const movingIds = siblingIds.filter((id) => targetSet.has(id))
    if (!movingIds.length) return

    let orderedIds = [...siblingIds]
    if (action === 'front') {
      orderedIds = siblingIds.filter((id) => !targetSet.has(id)).concat(movingIds)
    } else if (action === 'back') {
      orderedIds = movingIds.concat(siblingIds.filter((id) => !targetSet.has(id)))
    } else if (action === 'forward') {
      for (let index = orderedIds.length - 2; index >= 0; index -= 1) {
        if (targetSet.has(orderedIds[index]) && !targetSet.has(orderedIds[index + 1])) {
          const item = orderedIds[index]
          orderedIds[index] = orderedIds[index + 1]
          orderedIds[index + 1] = item
        }
      }
    } else {
      for (let index = 1; index < orderedIds.length; index += 1) {
        if (targetSet.has(orderedIds[index]) && !targetSet.has(orderedIds[index - 1])) {
          const item = orderedIds[index]
          orderedIds[index] = orderedIds[index - 1]
          orderedIds[index - 1] = item
        }
      }
    }

    const orderedLayers = orderedIds.map((id) => byId.get(id)).filter(Boolean) as Layer[]
    let siblingIndex = 0
    next = next.map((layer) => (
      (layer.parentId ?? null) === parentId ? orderedLayers[siblingIndex++] : layer
    ))
  })

  return next.map((layer) => layer.id)
}
