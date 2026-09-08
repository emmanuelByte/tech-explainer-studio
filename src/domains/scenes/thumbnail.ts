import type { Layer, Scene } from '../../types'
import { escapeXml, thumbnailLayerSvg } from '../../projectStorage'
import { layersForScene } from './focus'

/**
 * Renders a scene's layers (at the scene's first frame) as an inline SVG
 * data URI for its Story-mode clip. Reuses the same per-layer SVG renderer
 * as the whole-project thumbnail (projectStorage.ts's `thumbnailFor`)
 * instead of a second implementation.
 *
 * Deterministic: the same project state at the same scene always produces
 * the same markup — no per-frame randomness (AGENTS.md principle #4), so
 * it's safe to memoize by (scene id, scene startFrame, layers reference).
 */
export function sceneThumbnailSvg(
  layers: Layer[],
  scene: Scene,
  canvasWidth: number,
  canvasHeight: number,
  backgroundColor = '#1a1a2e',
): string {
  const sceneLayers = layersForScene(layers, scene)
  const childrenByParent = new Map<string | null, Layer[]>()
  sceneLayers.forEach((layer) => {
    const parentId = layer.parentId ?? null
    childrenByParent.set(parentId, [...(childrenByParent.get(parentId) ?? []), layer])
  })
  const content = [...(childrenByParent.get(null) ?? [])]
    .reverse()
    .map((layer) => thumbnailLayerSvg(layer, scene.startFrame, canvasWidth, canvasHeight, childrenByParent))
    .join('')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${canvasWidth} ${canvasHeight}"><rect width="${canvasWidth}" height="${canvasHeight}" fill="${escapeXml(backgroundColor)}"/>${content}</svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}
