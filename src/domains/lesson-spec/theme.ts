import type { TechnicalComponentKind } from '../../types'

type ComponentPalette = Record<TechnicalComponentKind, { fill: string; stroke: string }>

/**
 * The visual language shared by every compiled lesson. Specs describe teaching
 * intent, while this file owns the presentation choices that must stay coherent
 * across lessons.
 */
export const LESSON_THEME: {
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
  }
  sketch: {
    enabled: boolean
    roughness: number
  }
  components: ComponentPalette
} = {
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
    outroBackdrop: 'rgba(11,16,32,0.88)',
    lifeline: '#64748b',
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
  },
  sketch: { enabled: false, roughness: 1 },
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
