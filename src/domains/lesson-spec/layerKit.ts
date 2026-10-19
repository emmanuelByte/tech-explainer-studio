import { DEFAULT_TRANSFORM, type Keyframe, type Layer, type LayerType } from '../../types'
import type { FrameSpec } from './frame'
import type { LessonTheme } from './theme'

/** What every layer builder needs: the look (theme), the output format (frame) and the layer factory. */
export interface BuildContext {
  theme: LessonTheme
  frame: FrameSpec
}

export function svgDataUrl(svg: string) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

/** Mirrors the editor's makeLayer defaults, minus its randomness, so output is deterministic. */
export function baseLayer(theme: LessonTheme, type: LayerType, overrides: Partial<Layer> & Pick<Layer, 'id' | 'name' | 'startFrame' | 'endFrame' | 'keyframes'>): Layer {
  const { colors: COLORS, sketch: SKETCH, typography: TYPE } = theme
  const layer: Layer = {
    type,
    visible: true,
    locked: false,
    parentId: null,
    collapsed: false,
    isGroup: type === 'group',
    autoFit: false,
    clipChildren: false,
    width: 200,
    height: 140,
    sizeMode: 'fixed',
    layoutMode: 'none',
    layoutDirection: 'row',
    layoutGap: 12,
    layoutPadding: 16,
    layoutAlign: 'center',
    layoutJustify: 'start',
    gridColumns: 2,
    fillType: type === 'text' || type === 'group' ? 'none' : 'solid',
    fillColor: type === 'text' || type === 'group' ? 'transparent' : COLORS.accentMuted,
    gradientStops: [{ color: COLORS.accentMuted, position: 0 }, { color: COLORS.accentSecondary, position: 100 }],
    gradientAngle: 135,
    strokeEnabled: false,
    strokeColor: COLORS.text,
    strokeWidth: 0,
    strokeTopWidth: 0,
    strokeRightWidth: 0,
    strokeBottomWidth: 0,
    strokeLeftWidth: 0,
    strokeWidthLinked: true,
    borderRadius: 0,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    borderBottomRightRadius: 0,
    borderBottomLeftRadius: 0,
    borderRadiusLinked: true,
    pathClosed: false,
    sketchEnabled: SKETCH.enabled,
    sketchRoughness: SKETCH.roughness,
    shadowEnabled: false,
    shadowColor: COLORS.shadow,
    shadowFollowsPerspective: false,
    text: '',
    fontFamily: TYPE.sans,
    fontSize: 48,
    fontWeight: '600',
    textAlign: 'center',
    letterSpacing: 0,
    lineHeight: 1.2,
    textColor: COLORS.text,
    textSpans: [],
    textRevealMode: 'plain',
    imageFit: 'contain',
    svgStrokeColor: COLORS.text,
    svgFillColor: COLORS.text,
    svgFillEnabled: false,
    svgStrokeWidth: 2,
    scope: 'global',
    ...overrides,
  }
  // The editor draws per-side borders and per-corner radii, so a plain width/radius must set all of them.
  if (overrides.strokeWidth !== undefined && overrides.strokeTopWidth === undefined) {
    layer.strokeTopWidth = layer.strokeRightWidth = layer.strokeBottomWidth = layer.strokeLeftWidth = overrides.strokeWidth
  }
  if (overrides.borderRadius !== undefined && overrides.borderTopLeftRadius === undefined) {
    layer.borderTopLeftRadius = layer.borderTopRightRadius = layer.borderBottomRightRadius = layer.borderBottomLeftRadius = overrides.borderRadius
  }
  return layer
}

export function staticKeyframe(frame: number, x: number, y: number): Keyframe[] {
  return [{ frame, easing: 'ease-out', props: { ...DEFAULT_TRANSFORM, x, y } }]
}

