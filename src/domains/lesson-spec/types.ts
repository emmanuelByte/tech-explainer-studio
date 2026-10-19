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
  /** Node ids the camera frames. Defaults to everything revealed so far. */
  focus?: string[]
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
