import type { TechnicalComponentKind } from '../../types'

export const THEME_IDS = ['dark-sketch', 'clean-technical'] as const
export type ThemeId = typeof THEME_IDS[number]

type ComponentPalette = Record<TechnicalComponentKind, { fill: string; stroke: string }>

/**
 * The visual language shared by every compiled lesson. Specs describe teaching
 * intent, while this file owns the presentation choices that must stay coherent
 * across lessons.
 */
export interface LessonTheme {
  id: ThemeId
  label: string
  colors: {
    background: string
    text: string
    mutedText: string
    panel: string
    cardText: string
    shadow: string
    accent: string
    accentMuted: string
    accentSecondary: string
    cardBackdrop: string
    comparisonLeftPanel: string
    comparisonRightPanel: string
    comparisonLeftAccent: string
    comparisonRightAccent: string
    introBackdrop: string
    outroBackdrop: string
    lifeline: string
    positive: string
    negative: string
    messageSync: string
    messageAsync: string
    messageResponse: string
  }
  typography: {
    sans: string
    mono: string
  }
  spacing: {
    nodeWidth: number
    nodeHeight: number
    columnStep: number
    rowStep: number
    cameraMarginX: number
    cameraMarginY: number
    captionReserve: number
    cardWidth: number
    cardPadding: number
    cardTitleHeight: number
    cardLineHeight: number
    comparisonPanelWidth: number
    comparisonGap: number
  }
  motion: {
    nodeFadeFrames: number
    edgeDrawFrames: number
    revealLeadFrames: number
    cameraMoveFrames: number
    cardFadeFrames: number
    emphasisRampFrames: number
    emphasisScale: number
    emphasisGlowBlur: number
    emphasisGlowSpread: number
    titleSeconds: number
    /** Frames over which a sketched component outline draws itself in; 0 = it simply fades in. */
    nodeDrawFrames: number
  }
  /**
   * Hand-drawn distortion is opted into per element kind. Text, panels, backdrops
   * and arrows stay crisp so readability never depends on the preset.
   */
  sketch: {
    components: boolean
    connectors: boolean
    roughness: number
    /** Outline weight of component bodies. */
    strokeWidth: number
  }
  components: ComponentPalette
}

const CLEAN_TECHNICAL: LessonTheme = {
  id: 'clean-technical',
  label: 'Clean Technical',
  colors: {
    background: '#0b1020',
    text: '#ffffff',
    mutedText: '#93c5fd',
    panel: '#16213f',
    cardText: '#e2e8f0',
    shadow: 'rgba(0,0,0,0.5)',
    accent: '#60a5fa',
    accentMuted: '#6366f1',
    accentSecondary: '#a855f7',
    cardBackdrop: 'rgba(11,16,32,0.92)',
    comparisonLeftPanel: '#172554',
    comparisonRightPanel: '#134e4a',
    comparisonLeftAccent: '#60a5fa',
    comparisonRightAccent: '#5eead4',
    introBackdrop: '#0b1020',
    outroBackdrop: 'rgba(11,16,32,0.95)',
    lifeline: '#64748b',
    positive: '#4ade80',
    negative: '#fda4af',
    messageSync: '#60a5fa',
    messageAsync: '#fbbf24',
    messageResponse: '#4ade80',
  },
  typography: {
    sans: 'Inter',
    mono: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
  },
  spacing: {
    nodeWidth: 240,
    nodeHeight: 150,
    columnStep: 400,
    rowStep: 200,
    cameraMarginX: 160,
    cameraMarginY: 80,
    captionReserve: 360,
    cardWidth: 1200,
    cardPadding: 40,
    cardTitleHeight: 56,
    cardLineHeight: 44,
    comparisonPanelWidth: 540,
    comparisonGap: 40,
  },
  motion: {
    nodeFadeFrames: 12,
    edgeDrawFrames: 24,
    revealLeadFrames: 15,
    cameraMoveFrames: 24,
    cardFadeFrames: 12,
    emphasisRampFrames: 10,
    emphasisScale: 1.06,
    emphasisGlowBlur: 30,
    emphasisGlowSpread: 6,
    titleSeconds: 3,
    nodeDrawFrames: 0,
  },
  sketch: { components: false, connectors: false, roughness: 1, strokeWidth: 2 },
  components: {
    'load-balancer': { fill: '#1d4ed8', stroke: '#60a5fa' },
    database: { fill: '#9a3412', stroke: '#fdba74' },
    cache: { fill: '#b91c1c', stroke: '#fca5a5' },
    queue: { fill: '#a16207', stroke: '#fde047' },
    cdn: { fill: '#0e7490', stroke: '#67e8f9' },
    'api-gateway': { fill: '#4338ca', stroke: '#a5b4fc' },
    'object-storage': { fill: '#475569', stroke: '#cbd5e1' },
    worker: { fill: '#0f766e', stroke: '#5eead4' },
    server: { fill: '#166534', stroke: '#4ade80' },
    client: { fill: '#7c3aed', stroke: '#c4b5fd' },
  },
}

/** Our preferred educational look: near-black, hand-drawn components and connectors that draw themselves in, and few meaningful accents. */
const DARK_SKETCH: LessonTheme = {
  id: 'dark-sketch',
  label: 'Dark Sketch',
  colors: {
    background: '#0d0f14',
    text: '#f5f5f4',
    mutedText: '#a1a1aa',
    panel: '#161a22',
    cardText: '#e7e5e4',
    shadow: 'rgba(0,0,0,0.55)',
    accent: '#7dd3fc',
    accentMuted: '#334155',
    accentSecondary: '#475569',
    cardBackdrop: 'rgba(13,15,20,0.93)',
    comparisonLeftPanel: '#14202b',
    comparisonRightPanel: '#14261d',
    comparisonLeftAccent: '#7dd3fc',
    comparisonRightAccent: '#86efac',
    introBackdrop: '#0d0f14',
    outroBackdrop: 'rgba(13,15,20,0.96)',
    lifeline: '#52525b',
    positive: '#86efac',
    negative: '#fda4af',
    messageSync: '#7dd3fc',
    messageAsync: '#fcd34d',
    messageResponse: '#86efac',
  },
  typography: CLEAN_TECHNICAL.typography,
  spacing: CLEAN_TECHNICAL.spacing,
  motion: {
    nodeFadeFrames: 14,
    edgeDrawFrames: 30,
    revealLeadFrames: 15,
    cameraMoveFrames: 30,
    cardFadeFrames: 14,
    emphasisRampFrames: 12,
    emphasisScale: 1.05,
    emphasisGlowBlur: 24,
    emphasisGlowSpread: 4,
    titleSeconds: 3,
    nodeDrawFrames: 28,
  },
  sketch: { components: true, connectors: true, roughness: 1, strokeWidth: 3 },
  // Four accents with a job each: neutral clients, sky for traffic, green for compute, amber for data, pink for messaging.
  components: {
    client: { fill: '#1c1f2a', stroke: '#e5e7eb' },
    'load-balancer': { fill: '#10222f', stroke: '#7dd3fc' },
    cdn: { fill: '#10222f', stroke: '#7dd3fc' },
    'api-gateway': { fill: '#10222f', stroke: '#7dd3fc' },
    server: { fill: '#112519', stroke: '#86efac' },
    worker: { fill: '#112519', stroke: '#86efac' },
    database: { fill: '#2a2110', stroke: '#fcd34d' },
    cache: { fill: '#2a2110', stroke: '#fcd34d' },
    'object-storage': { fill: '#2a2110', stroke: '#fcd34d' },
    queue: { fill: '#2a1520', stroke: '#f9a8d4' },
  },
}

export const LESSON_THEMES: Record<ThemeId, LessonTheme> = {
  'dark-sketch': DARK_SKETCH,
  'clean-technical': CLEAN_TECHNICAL,
}

export const DEFAULT_THEME_ID: ThemeId = 'dark-sketch'

export function resolveTheme(id: ThemeId | undefined): LessonTheme {
  return LESSON_THEMES[id ?? DEFAULT_THEME_ID]
}
