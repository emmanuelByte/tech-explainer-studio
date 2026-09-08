import { describe, expect, it } from 'vitest'
import { sceneThumbnailSvg } from './thumbnail'
import type { Layer, Scene } from '../../types'

const scene: Scene = { id: 'scene-1', title: 'Scene 1', startFrame: 0, endFrame: 30, scriptSegmentIds: [] }

function rectangle(id: string): Layer {
  return {
    id, name: id, type: 'rectangle', startFrame: 0, endFrame: 30,
    visible: true, locked: false, keyframes: [],
    width: 100, height: 60, fillType: 'solid', fillColor: '#ff00ff',
    borderRadius: 0, strokeEnabled: false, strokeColor: '#000', strokeWidth: 0,
  } as unknown as Layer
}

describe('sceneThumbnailSvg', () => {
  it('produces a data: URI wrapping an SVG document', () => {
    const uri = sceneThumbnailSvg([rectangle('a')], scene, 200, 100)
    expect(uri.startsWith('data:image/svg+xml,')).toBe(true)
    const svg = decodeURIComponent(uri.slice('data:image/svg+xml,'.length))
    expect(svg).toContain('<svg')
    expect(svg).toContain('viewBox="0 0 200 100"')
  })

  it('is deterministic: the same input always produces the same output', () => {
    const layers = [rectangle('a'), rectangle('b')]
    const first = sceneThumbnailSvg(layers, scene, 200, 100)
    const second = sceneThumbnailSvg(layers, scene, 200, 100)
    expect(first).toBe(second)
  })

  it('excludes layers outside the scene range', () => {
    const inScene = rectangle('inScene')
    const outOfScene = { ...rectangle('outOfScene'), startFrame: 60, endFrame: 90 }
    const withOnlyInScene = sceneThumbnailSvg([inScene], scene, 200, 100)
    const withBoth = sceneThumbnailSvg([inScene, outOfScene], scene, 200, 100)
    expect(withBoth).toBe(withOnlyInScene)
  })
})
