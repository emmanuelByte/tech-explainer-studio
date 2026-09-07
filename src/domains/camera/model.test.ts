import { describe, expect, it } from 'vitest'
import { cameraToWorld, cameraTransform, defaultCameraTrack, fitCameraToBounds, resolveCamera, upsertCameraKeyframe, worldToCamera } from './model'

describe('camera model', () => {
  it('interpolates framing with the outgoing keyframe easing', () => {
    const track = { keyframes: [
      { frame: 0, x: 960, y: 540, zoom: 1, easing: 'linear' as const },
      { frame: 30, x: 480, y: 270, zoom: 2, easing: 'linear' as const },
    ] }
    expect(resolveCamera(track, 15, 1920, 1080)).toEqual({ x: 720, y: 405, zoom: 1.5 })
  })

  it('maps world and camera coordinates reversibly', () => {
    const view = { x: 400, y: 300, zoom: 2 }
    const screen = worldToCamera({ x: 460, y: 340 }, view, 1280, 720)
    expect(cameraToWorld(screen, view, 1280, 720)).toEqual({ x: 460, y: 340 })
    expect(cameraTransform(view, 1280, 720)).toMatchObject({ x: -160, y: -240, zoom: 2 })
  })

  it('fits bounds with padding and clamps zoom', () => {
    expect(fitCameraToBounds({ left: 800, top: 400, right: 1000, bottom: 600 }, 1920, 1080, 100))
      .toEqual({ x: 900, y: 500, zoom: 2.7 })
  })

  it('creates and upserts a deterministic first keyframe', () => {
    const track = defaultCameraTrack(1920, 1080)
    const updated = upsertCameraKeyframe(track, { frame: 45, x: 600, y: 300, zoom: 1.5, easing: 'ease-in-out' })
    expect(updated.keyframes.map((item) => item.frame)).toEqual([0, 45])
    expect(track.keyframes).toHaveLength(1)
  })
})
