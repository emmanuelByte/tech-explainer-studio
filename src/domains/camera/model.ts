import { easingProgress } from '../../animationProperties'
import type { CameraKeyframe, CameraTrack } from '../../types'

export const CAMERA_MIN_ZOOM = 0.25
export const CAMERA_MAX_ZOOM = 6

export interface CameraView {
  x: number
  y: number
  zoom: number
}

export interface Bounds {
  left: number
  top: number
  right: number
  bottom: number
}

export function clampCameraZoom(value: number) {
  if (!Number.isFinite(value)) return 1
  return Math.max(CAMERA_MIN_ZOOM, Math.min(CAMERA_MAX_ZOOM, value))
}

export function defaultCameraTrack(width: number, height: number): CameraTrack {
  return { keyframes: [{ frame: 0, x: width / 2, y: height / 2, zoom: 1, easing: 'ease-in-out' }] }
}

export function normalizeCameraTrack(track: CameraTrack | undefined, width: number, height: number): CameraTrack {
  const frames = (track?.keyframes ?? [])
    .filter((keyframe) => Number.isFinite(keyframe.frame) && Number.isFinite(keyframe.x) && Number.isFinite(keyframe.y) && Number.isFinite(keyframe.zoom))
    .map((keyframe) => ({
      ...keyframe,
      frame: Math.max(0, Math.round(keyframe.frame)),
      zoom: clampCameraZoom(keyframe.zoom),
      easing: keyframe.easing ?? 'ease-in-out',
    }))
    .sort((a, b) => a.frame - b.frame)
  const unique = frames.filter((keyframe, index) => frames.findIndex((item) => item.frame === keyframe.frame) === index)
  return unique.length ? { keyframes: unique } : defaultCameraTrack(width, height)
}

export function resolveCamera(track: CameraTrack | undefined, frame: number, width: number, height: number): CameraView {
  const { keyframes } = normalizeCameraTrack(track, width, height)
  if (frame <= keyframes[0].frame) return keyframes[0]
  const last = keyframes[keyframes.length - 1]
  if (frame >= last.frame) return last
  const index = keyframes.findIndex((keyframe) => keyframe.frame >= frame)
  const previous = keyframes[index - 1]
  const next = keyframes[index]
  const duration = Math.max(1, next.frame - previous.frame)
  const progress = easingProgress(previous.easing, (frame - previous.frame) / duration)
  const mix = (a: number, b: number) => a + (b - a) * progress
  return { x: mix(previous.x, next.x), y: mix(previous.y, next.y), zoom: mix(previous.zoom, next.zoom) }
}

export function cameraTransform(view: CameraView, width: number, height: number) {
  return {
    x: width / 2 - view.x * view.zoom,
    y: height / 2 - view.y * view.zoom,
    zoom: view.zoom,
    css: `translate(${width / 2 - view.x * view.zoom}px, ${height / 2 - view.y * view.zoom}px) scale(${view.zoom})`,
  }
}

export function worldToCamera(point: { x: number; y: number }, view: CameraView, width: number, height: number) {
  const transform = cameraTransform(view, width, height)
  return { x: point.x * transform.zoom + transform.x, y: point.y * transform.zoom + transform.y }
}

export function cameraToWorld(point: { x: number; y: number }, view: CameraView, width: number, height: number) {
  const transform = cameraTransform(view, width, height)
  return { x: (point.x - transform.x) / transform.zoom, y: (point.y - transform.y) / transform.zoom }
}

export function fitCameraToBounds(bounds: Bounds, width: number, height: number, padding = 120): CameraView {
  const boundsWidth = Math.max(1, bounds.right - bounds.left)
  const boundsHeight = Math.max(1, bounds.bottom - bounds.top)
  return {
    x: (bounds.left + bounds.right) / 2,
    y: (bounds.top + bounds.bottom) / 2,
    zoom: clampCameraZoom(Math.min(width / (boundsWidth + padding * 2), height / (boundsHeight + padding * 2))),
  }
}

export function upsertCameraKeyframe(track: CameraTrack, keyframe: CameraKeyframe): CameraTrack {
  return normalizeCameraTrack({ keyframes: [...track.keyframes.filter((item) => item.frame !== keyframe.frame), keyframe] }, 1, 1)
}
