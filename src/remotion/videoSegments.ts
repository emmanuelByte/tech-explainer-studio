/**
 * Pure helpers for video segment time mapping.
 *
 * Speed is a keyframable property on a video segment. Source time at any
 * composition frame is the integral of speed over time from the segment's
 * start. Without keyframes the segment plays at constant 1× speed.
 *
 * The integration is exact for the supported easing types:
 *  - `step`   → speed is constant between consecutive keyframes (rect rule)
 *  - `linear` → speed varies linearly between consecutive keyframes (trapezoid rule)
 *
 * The active speed at a single frame is always well-defined and is what
 * the UI surfaces (e.g. the slider value at the playhead).
 */

import type { SpeedKeyframe, VideoSegment } from '../types'

const DEFAULT_SPEED = 1

/** Returns the active speed at the given composition frame within the segment. */
export function speedAtFrame(segment: VideoSegment, frame: number): number {
  const kfs = sortedKeyframes(segment)
  if (kfs.length === 0) return DEFAULT_SPEED

  // Before first keyframe: held at first keyframe's value (so freezes "take effect" from the start).
  if (frame <= kfs[0].frame) return kfs[0].value
  // After last keyframe: held at the last value.
  if (frame >= kfs[kfs.length - 1].frame) return kfs[kfs.length - 1].value

  // Find the pair surrounding `frame`.
  for (let i = 0; i < kfs.length - 1; i++) {
    const a = kfs[i]
    const b = kfs[i + 1]
    if (frame >= a.frame && frame < b.frame) {
      if (a.easing === 'step') return a.value
      // linear
      const t = (frame - a.frame) / Math.max(1, b.frame - a.frame)
      return a.value + (b.value - a.value) * t
    }
  }
  return kfs[kfs.length - 1].value
}

/**
 * Returns the source playback time (in seconds) at the given composition frame.
 *
 * Integration math:
 *   sourceFrames(F) = ∫_{timelineStart}^{F} speed(t) dt
 *   sourceTime(F)   = (segment.sourceStartFrame + sourceFrames(F)) / fps
 *
 * The result is clamped to the segment's source window [sourceStartFrame, sourceEndFrame].
 */
export function sourceTimeAt(segment: VideoSegment, frame: number, fps: number): number {
  const safeFps = Math.max(1, fps)
  const offsetFrame = Math.max(0, Math.min(frame, segment.timelineEndFrame) - segment.timelineStartFrame)
  const sourceFramesConsumed = integrateSpeed(segment, offsetFrame)
  const rawSourceFrame = segment.sourceStartFrame + sourceFramesConsumed
  const clampedSourceFrame = Math.max(
    segment.sourceStartFrame,
    Math.min(segment.sourceEndFrame, rawSourceFrame),
  )
  return clampedSourceFrame / safeFps
}

/**
 * Returns how many SOURCE frames are consumed when the timeline advances
 * `offsetFrames` frames from the segment start. Public so callers can use
 * the same math for trimming / cap detection.
 */
export function integrateSpeed(segment: VideoSegment, offsetFrames: number): number {
  if (offsetFrames <= 0) return 0
  const kfs = sortedKeyframes(segment)
  if (kfs.length === 0) return offsetFrames * DEFAULT_SPEED

  // Convert keyframe frames (absolute) to segment-relative offsets.
  const relativeKfs = kfs.map((kf) => ({
    offset: kf.frame - segment.timelineStartFrame,
    value: kf.value,
    easing: kf.easing,
  }))

  let sourceFrames = 0
  // Region before the first keyframe — held at first keyframe's value.
  if (relativeKfs[0].offset > 0) {
    const span = Math.min(relativeKfs[0].offset, offsetFrames)
    sourceFrames += span * relativeKfs[0].value
    if (offsetFrames <= relativeKfs[0].offset) return sourceFrames
  }

  for (let i = 0; i < relativeKfs.length; i++) {
    const a = relativeKfs[i]
    const next = relativeKfs[i + 1]
    const segmentStart = Math.max(a.offset, 0)
    if (offsetFrames <= segmentStart) break
    const segmentEnd = next ? next.offset : offsetFrames
    const span = Math.min(offsetFrames, segmentEnd) - segmentStart
    if (span <= 0) continue
    if (!next || a.easing === 'step') {
      sourceFrames += span * a.value
    } else {
      // Linear ramp from a.value to next.value over [a.offset, next.offset];
      // we may only need a sub-range [segmentStart, segmentStart + span].
      const fullSpan = Math.max(1, next.offset - a.offset)
      const tStart = (segmentStart - a.offset) / fullSpan
      const tEnd = (segmentStart + span - a.offset) / fullSpan
      const speedAtStart = a.value + (next.value - a.value) * tStart
      const speedAtEnd = a.value + (next.value - a.value) * tEnd
      sourceFrames += span * (speedAtStart + speedAtEnd) / 2
    }
  }

  return sourceFrames
}

/**
 * Upsert a speed keyframe at `frame` inside the segment. If a keyframe
 * already exists at the same frame, its value/easing are replaced.
 * Returns a new array (keyframes sorted by frame); does NOT mutate.
 */
export function upsertSpeedKeyframe(
  segment: VideoSegment,
  kf: SpeedKeyframe,
): SpeedKeyframe[] {
  const next = (segment.speedKeyframes ?? []).filter((existing) => existing.frame !== kf.frame)
  next.push({ ...kf })
  next.sort((a, b) => a.frame - b.frame)
  return next
}

/** Remove the speed keyframe at the given frame, if any. */
export function removeSpeedKeyframe(
  segment: VideoSegment,
  frame: number,
): SpeedKeyframe[] {
  return (segment.speedKeyframes ?? []).filter((kf) => kf.frame !== frame)
}

/** Move a speed keyframe from one frame to another (preserves value + easing). */
export function moveSpeedKeyframe(
  segment: VideoSegment,
  fromFrame: number,
  toFrame: number,
): SpeedKeyframe[] {
  const target = (segment.speedKeyframes ?? []).find((kf) => kf.frame === fromFrame)
  if (!target) return segment.speedKeyframes ?? []
  const filtered = (segment.speedKeyframes ?? []).filter((kf) => kf.frame !== fromFrame && kf.frame !== toFrame)
  filtered.push({ ...target, frame: toFrame })
  filtered.sort((a, b) => a.frame - b.frame)
  return filtered
}

/** Set the easing for a specific keyframe. */
export function setSpeedKeyframeEasing(
  segment: VideoSegment,
  frame: number,
  easing: SpeedKeyframe['easing'],
): SpeedKeyframe[] {
  return (segment.speedKeyframes ?? []).map((kf) =>
    kf.frame === frame ? { ...kf, easing } : kf
  )
}

function sortedKeyframes(segment: VideoSegment): SpeedKeyframe[] {
  const kfs = segment.speedKeyframes ?? []
  if (kfs.length <= 1) return kfs
  return [...kfs].sort((a, b) => a.frame - b.frame)
}
