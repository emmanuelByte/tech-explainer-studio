import { Layer } from './types'

export interface LayerRowModel {
  layer: Layer
  depth: number
  hiddenByCollapse: boolean
}

export function descendantsOf(layers: Layer[], parentId: string): Layer[] {
  const out: Layer[] = []
  const visit = (id: string) => {
    layers.filter((l) => l.parentId === id).forEach((child) => {
      out.push(child)
      visit(child.id)
    })
  }
  visit(parentId)
  return out
}

export function isGroupLayer(layer: Layer) {
  return layer.type === 'group' || layer.isGroup || layersHasChildrenPlaceholder(layer)
}

function layersHasChildrenPlaceholder(layer: Layer) {
  return Boolean(layer.isGroup)
}

export function buildLayerRows(layers: Layer[], topFirst = true): LayerRowModel[] {
  const order = topFirst ? [...layers].reverse() : [...layers]
  const byParent = new Map<string | null, Layer[]>()
  order.forEach((layer) => {
    const key = layer.parentId ?? null
    byParent.set(key, [...(byParent.get(key) ?? []), layer])
  })

  const rows: LayerRowModel[] = []
  const visit = (parentId: string | null, depth: number, hiddenByCollapse: boolean) => {
    ;(byParent.get(parentId) ?? []).forEach((layer) => {
      rows.push({ layer, depth, hiddenByCollapse })
      visit(layer.id, depth + 1, hiddenByCollapse || Boolean(layer.collapsed))
    })
  }
  visit(null, 0, false)
  return rows
}

export function visibleLayerRows(layers: Layer[], topFirst = true) {
  return buildLayerRows(layers, topFirst).filter((row) => !row.hiddenByCollapse)
}

export function siblingIds(layers: Layer[], layerId: string) {
  const layer = layers.find((l) => l.id === layerId)
  if (!layer) return []
  return layers.filter((l) => (l.parentId ?? null) === (layer.parentId ?? null)).map((l) => l.id)
}
