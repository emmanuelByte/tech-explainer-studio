import type { TechnicalComponentKind } from '../../types'

/**
 * The lesson spec is the AI-authored source of truth for a video
 * (docs/2026-10-19-AI-AUTHORED-PIVOT.md). It describes *what* the lesson shows;
 * the compiler decides positions, layers, keyframes, connectors and camera.
 * The AI never writes pixel coordinates or layer data.
 */
export interface LessonSpec {
  version: 1
  /** Stable slug; becomes part of the project id (`lesson_<id>`). */
  id: string
  title: string
  canvas?: { width?: number; height?: number; fps?: number }
  nodes: SpecNode[]
  edges: SpecEdge[]
  scenes: SpecScene[]
}

export interface SpecNode {
  /** Unique across nodes AND edges. */
  id: string
  kind: TechnicalComponentKind
  label: string
}

export interface SpecEdge {
  /** Unique across nodes AND edges. */
  id: string
  from: string
  to: string
  label?: string
  style?: 'solid' | 'dashed'
}

export interface SpecCard {
  /** Unique across cards and must not clash with node/edge ids; cue ids are `<id>.<line number>`. */
  id: string
  title?: string
  /** Up to 8 lines of at most 60 characters, revealed one after another. */
  lines: string[]
}

export const CARD_LIMITS = { lines: 8, lineLength: 60, titleLength: 40 } as const

export interface SpecScene {
  /** Unique slug; stable so later spec patches can address the scene. */
  id: string
  title: string
  narration: string
  /** Placeholder until real narration audio supplies the duration. */
  durationSeconds?: number
  /** Node/edge ids revealed in this scene, in order, spread across its duration. */
  reveal?: string[]
  /** Node/edge ids removed in this scene, once its first reveal begins. Must already be revealed. */
  hide?: string[]
  /** A code/request panel shown over the dimmed diagram for this scene only. */
  card?: SpecCard
  /** Node ids the camera frames. Defaults to everything revealed so far. */
  focus?: string[]
}

/** Measured narration audio for a lesson (produced by `lesson narrate`, consumed by the compiler). */
export interface NarrationManifest {
  voiceId: string
  exaggeration: number
  cfgWeight: number
  scenes: Record<string, SceneNarration>
}

export interface SceneNarration {
  /** Registered asset id of the scene's joined narration WAV. */
  assetId: string
  durationSeconds: number
  /** Cue id -> seconds from the start of this scene's audio. */
  cues: Record<string, number>
  /** The exact `narration` text this audio was made from, cues included; detects stale audio. */
  source: string
}

export const SPEC_DEFAULTS = {
  width: 1920,
  height: 1080,
  fps: 30,
} as const

export interface SpecIssue {
  path: string
  message: string
}
