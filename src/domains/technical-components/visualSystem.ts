import type { TechnicalComponentKind } from '../../types'

export type TechnicalComponentVisualState = 'normal' | 'active' | 'healthy' | 'warning' | 'failed'

export const TECHNICAL_VISUAL_SYSTEM = {
  color: {
    canvas: '#0B1020',
    surface: '#151C2F',
    surfaceMuted: '#1E293B',
    textPrimary: '#F8FAFC',
    textMuted: '#94A3B8',
    line: '#CBD5E1',
    healthy: '#34D399',
    warning: '#FBBF24',
    failure: '#FB7185',
    focus: '#60A5FA',
    selected: '#38BDF8',
  },
  typography: {
    family: 'Inter',
    heading: { fontSize: 72, fontWeight: '800', lineHeight: 1.1 },
    body: { fontSize: 42, fontWeight: '500', lineHeight: 1.3 },
    componentLabel: { fontSize: 36, fontWeight: '700', lineHeight: 1.1 },
    connectorLabel: { fontSize: 28, fontWeight: '600', lineHeight: 1.15 },
    caption: { fontSize: 52, fontWeight: '700', lineHeight: 1.15 },
  },
  spacing: {
    grid: 8,
    componentGapX: 96,
    componentGapY: 64,
  },
  component: {
    width: 280,
    height: 200,
    bodyWidth: 264,
    bodyHeight: 144,
    bodyY: -20,
    artworkWidth: 220,
    artworkHeight: 120,
    artworkY: -20,
    labelWidth: 264,
    labelHeight: 44,
    labelY: 78,
    internalPadding: 16,
    cornerRadius: 20,
    strokeWidth: 4,
  },
  connector: {
    color: '#CBD5E1',
    retryColor: '#FBBF24',
    failureColor: '#FB7185',
    strokeWidth: 4,
    routing: 'straight' as const,
    sourcePort: 'right' as const,
    targetPort: 'left' as const,
    labelOffset: 16,
    arrowhead: {
      viewBoxSize: 10,
      refX: 9,
      refY: 5,
      markerWidth: 7,
      markerHeight: 7,
    },
  },
  selection: {
    outline: '#38BDF8',
    outlineWidth: 3,
    portHandleSize: 14,
    portHandleFill: '#0B1020',
    portHandleStroke: '#38BDF8',
  },
  verticalVideo: {
    width: 1080,
    height: 1920,
    safeArea: { top: 160, right: 180, bottom: 300, left: 72 },
    caption: {
      maxCharactersPerLine: 32,
      maxLines: 2,
      bottom: 340,
      horizontalPadding: 36,
      verticalPadding: 24,
      cornerRadius: 20,
      background: 'rgba(11,16,32,0.88)',
    },
  },
  landscape: {
    safeArea: { top: 64, right: 64, bottom: 64, left: 64 },
  },
  sketch: {
    enabledByDefault: false,
    seedSource: 'layer-id',
    roughness: 0.75,
    bowing: 0.35,
    strokePasses: 1,
  },
} as const

const COMPONENT_STATE_STYLES = {
  normal: {
    surface: TECHNICAL_VISUAL_SYSTEM.color.surface,
    stroke: TECHNICAL_VISUAL_SYSTEM.color.line,
    label: TECHNICAL_VISUAL_SYSTEM.color.textPrimary,
    indicator: 'none',
  },
  active: {
    surface: '#172554',
    stroke: TECHNICAL_VISUAL_SYSTEM.color.focus,
    label: TECHNICAL_VISUAL_SYSTEM.color.textPrimary,
    indicator: 'pulse-ring',
  },
  healthy: {
    surface: '#052E2B',
    stroke: TECHNICAL_VISUAL_SYSTEM.color.healthy,
    label: TECHNICAL_VISUAL_SYSTEM.color.textPrimary,
    indicator: 'check',
  },
  warning: {
    surface: '#422006',
    stroke: TECHNICAL_VISUAL_SYSTEM.color.warning,
    label: TECHNICAL_VISUAL_SYSTEM.color.warning,
    indicator: 'warning-triangle',
  },
  failed: {
    surface: '#3F121B',
    stroke: TECHNICAL_VISUAL_SYSTEM.color.failure,
    label: TECHNICAL_VISUAL_SYSTEM.color.failure,
    indicator: 'failure-x',
  },
} as const satisfies Record<TechnicalComponentVisualState, {
  surface: string
  stroke: string
  label: string
  indicator: 'none' | 'pulse-ring' | 'check' | 'warning-triangle' | 'failure-x'
}>

export function defaultTechnicalComponentVisualState(kind: TechnicalComponentKind): TechnicalComponentVisualState {
  return kind === 'dead-letter-queue' ? 'warning' : 'normal'
}

export function technicalComponentVisualStyle(
  kind: TechnicalComponentKind,
  state: TechnicalComponentVisualState = defaultTechnicalComponentVisualState(kind),
) {
  return { state, ...COMPONENT_STATE_STYLES[state] }
}

export function technicalComponentPlacementBounds(canvasWidth: number, canvasHeight: number) {
  const safeArea = canvasHeight > canvasWidth
    ? TECHNICAL_VISUAL_SYSTEM.verticalVideo.safeArea
    : TECHNICAL_VISUAL_SYSTEM.landscape.safeArea
  const component = TECHNICAL_VISUAL_SYSTEM.component

  return {
    left: -canvasWidth / 2 + safeArea.left + component.width / 2,
    right: canvasWidth / 2 - safeArea.right - component.width / 2,
    top: -canvasHeight / 2 + safeArea.top + component.height / 2,
    bottom: canvasHeight / 2 - safeArea.bottom - component.height / 2,
  }
}
