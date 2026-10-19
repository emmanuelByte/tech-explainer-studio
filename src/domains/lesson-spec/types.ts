import type { TechnicalComponentKind } from '../../types'
import type { ThemeId } from './theme'

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
  /** Visual preset (see theme.ts). Overridden by `lesson build --theme`. Defaults to `dark-sketch`. */
  theme?: ThemeId
  /** A silent title card before the first scene (shows `title` and an optional subtitle). */
  intro?: { subtitle?: string; seconds?: number }
  /** A silent closing card over the dimmed final diagram. */
  outro?: { text: string; seconds?: number }
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

export interface SpecComparisonSide {
  /** Short heading above this column. */
  title: string
  /** A concise point revealed one line at a time. */
  lines: string[]
}

export interface SpecComparison {
  /** Unique across cards, comparisons, nodes and edges. Cue ids are `<id>.<side>.<line number>`. */
  id: string
  left: SpecComparisonSide
  right: SpecComparisonSide
}

/** A concise progressive explanation, takeaway, definition or recap. */
export interface SpecBullets {
  /** Unique across overlays; cue ids are `<id>.<line number>`. */
  id: string
  title: string
  /** One to six short points, revealed in narration order. */
  items: string[]
  tone?: 'neutral' | 'positive' | 'negative'
}

export interface SpecSequenceParticipant {
  id: string
  label: string
}

export interface SpecSequenceMessage {
  /** Stable within its sequence; cue id is `<sequence id>.<message id>`. */
  id: string
  from: string
  to: string
  label: string
  kind?: 'sync' | 'async' | 'response'
}

/** Declarative interactions rendered as a conventional participant/lifeline diagram. */
export interface SpecSequence {
  id: string
  participants: SpecSequenceParticipant[]
  messages: SpecSequenceMessage[]
}

export const TITLE_LIMITS = { title: 60, subtitle: 60, seconds: [1, 10] } as const

export const CARD_LIMITS = { lines: 8, lineLength: 60, titleLength: 40 } as const
export const COMPARISON_LIMITS = { lines: 6, lineLength: 60, titleLength: 32 } as const
export const BULLET_LIMITS = { items: 6, itemLength: 72, titleLength: 48 } as const
export const SEQUENCE_LIMITS = { participants: 5, participantLabelLength: 20, messages: 8, messageLabelLength: 56 } as const

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
  /** Node ids that glow and pulse for the rest of this scene. Cue: `[[emphasize:<id>]]`. */
  emphasize?: string[]
  /** Edge ids that show travelling flow dots from here to the end of this scene. Cue: `[[flow:<id>]]`. */
  flow?: string[]
  /** A code/request panel shown over the dimmed diagram for this scene only. */
  card?: SpecCard
  /** Two concise columns shown over the dimmed diagram for this scene only. */
  comparison?: SpecComparison
  /** A progressive bullet/explanation card over the current diagram. */
  bullets?: SpecBullets
  /** A semantic request/response interaction diagram over the current lesson context. */
  sequence?: SpecSequence
  /** Node ids the camera frames. Defaults to everything revealed so far. */
  focus?: string[]
}

/** Measured narration audio for a lesson (produced by `lesson narrate`, consumed by the compiler). */
export interface NarrationManifest {
  voiceId: string
  exaggeration: number
  cfgWeight: number
  /** Words per second above which sentences were slowed when this audio was made. */
  pace?: number
  /** Version of the audio finishing (loudness and limiting) applied; older audio is regenerated. */
  mastering?: number
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
  /** Every spoken word with its time. Absent in manifests made before captions were synchronised. */
  words?: NarrationWord[]
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

/** One spoken word with its time in the scene's audio, for captions and cues. */
export interface NarrationWord {
  text: string
  /** Seconds from the start of the scene's audio. */
  start: number
  end: number
  /** `aligned`: found in the audio by forced alignment. `estimated`: spread over the speech by letter count. */
  timing: 'aligned' | 'estimated'
}
