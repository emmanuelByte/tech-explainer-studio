export type LayerType = 'rectangle' | 'ellipse' | 'line' | 'triangle' | 'path' | 'text' | 'image' | 'video' | 'audio' | 'group'
export type EasingType = 'linear' | 'ease' | 'ease-in' | 'ease-out' | 'ease-in-out' | 'spring' | 'bounce'
export type PairEasingType = EasingType | 'custom'
export type FillType = 'solid' | 'linear-gradient' | 'radial-gradient' | 'none'
export type SizeMode = 'fixed' | 'fit-content' | 'fill-canvas'
export type ImageFit = 'contain' | 'cover' | 'fill' | 'scale-down'
export type ImageKind = 'raster' | 'svg'
export type AssetKind = 'image' | 'video' | 'audio'
export type LayoutMode = 'none' | 'flex' | 'grid'
export type LayoutDirection = 'row' | 'column'
export type LayoutAlign = 'start' | 'center' | 'end' | 'stretch'
export type LayoutJustify = 'start' | 'center' | 'end' | 'space-between'
export type TextRevealMode = 'plain' | 'char-pop' | 'char-fall' | 'char-rise' | 'char-spin' | 'char-blur' | 'word-rise' | 'wheel-fade'
export type Tool = 'select' | 'hand' | 'rectangle' | 'ellipse' | 'text' | 'line' | 'triangle' | 'pen'

export interface TextRangeStyle {
  id: string
  start: number
  end: number
  fontFamily?: string
  fontSize?: number
  fontWeight?: string
  textColor?: string
  letterSpacing?: number
}

export type AnimatableProperty =
  | 'x' | 'y' | 'z' | 'width' | 'height' | 'scale' | 'scaleX' | 'scaleY'
  | 'rotateX' | 'rotateY' | 'rotateZ' | 'skewX' | 'skewY'
  | 'perspective' | 'originX' | 'originY' | 'opacity'
  | 'fillColor' | 'textColor' | 'strokeColor' | 'strokeWidth' | 'borderRadius'
  | 'borderTopLeftRadius' | 'borderTopRightRadius' | 'borderBottomRightRadius' | 'borderBottomLeftRadius'
  | 'fontSize' | 'letterSpacing' | 'lineHeight'
  | 'blur' | 'brightness' | 'contrast' | 'grayscale'
  | 'shadowX' | 'shadowY' | 'shadowBlur' | 'shadowSpread' | 'backdropBlur'

export interface GradientStop {
  color: string
  position: number
}

export interface TransformProps {
  x: number
  y: number
  z: number
  scale: number
  scaleX: number
  scaleY: number
  opacity: number
  rotateX: number
  rotateY: number
  rotateZ: number
  skewX: number
  skewY: number
  perspective: number
  originX: number
  originY: number
  // Keyframeable effects
  blur: number
  brightness: number
  contrast: number
  grayscale: number
  backdropBlur: number
  shadowX: number
  shadowY: number
  shadowBlur: number
  shadowSpread: number
  // Text animation
  charProgress: number
}

export const DEFAULT_TRANSFORM: TransformProps = {
  x: 0, y: 0, z: 0,
  scale: 1,
  scaleX: 1,
  scaleY: 1,
  opacity: 1,
  rotateX: 0, rotateY: 0, rotateZ: 0,
  skewX: 0, skewY: 0,
  perspective: 800,
  originX: 50, originY: 50,
  blur: 0,
  brightness: 100,
  contrast: 100,
  grayscale: 0,
  backdropBlur: 0,
  shadowX: 0, shadowY: 4, shadowBlur: 12, shadowSpread: 0,
  charProgress: 1,
}

export interface Keyframe {
  frame: number
  easing: PairEasingType
  bezier?: [number, number, number, number]
  props: TransformProps
}

export interface PropertyKeyframe {
  id: string
  frame: number
  value: number | string
  easing: PairEasingType
  bezier?: [number, number, number, number]
}

/**
 * Easing for a speed keyframe. `step` = speed is held constant until the
 * next keyframe (hard freeze / instant change). `linear` = speed ramps
 * linearly to the next keyframe value (smooth slow-down or speed-up).
 */
export type SpeedEasing = 'step' | 'linear'

/**
 * A keyframe of speed playback over the composition timeline.
 * `frame` is the absolute composition frame at which `value` takes effect.
 * `easing` controls how the speed transitions to the NEXT keyframe.
 */
export interface SpeedKeyframe {
  frame: number
  value: number
  easing: SpeedEasing
}

export interface VideoSegment {
  id: string
  timelineStartFrame: number
  timelineEndFrame: number
  sourceStartFrame: number
  sourceEndFrame: number
  /**
   * Optional speed keyframes that override the default 1× playback.
   * If empty / undefined, the segment plays at 1× from sourceStartFrame.
   */
  speedKeyframes?: SpeedKeyframe[]
}

export interface Layer {
  id: string
  name: string
  type: LayerType
  parentId?: string | null
  collapsed?: boolean
  isGroup?: boolean
  autoFit?: boolean
  clipChildren?: boolean
  visible: boolean
  locked: boolean
  width: number
  height: number
  sizeMode?: SizeMode
  // Group layout
  layoutMode?: LayoutMode
  layoutDirection?: LayoutDirection
  layoutGap?: number
  layoutPadding?: number
  layoutAlign?: LayoutAlign
  layoutJustify?: LayoutJustify
  gridColumns?: number
  groupOriginX?: number
  groupOriginY?: number
  // Fill
  fillType: FillType
  fillColor: string
  gradientStops: GradientStop[]
  gradientAngle: number
  // Stroke
  strokeEnabled: boolean
  strokeColor: string
  strokeWidth: number
  // Shape
  borderRadius: number
  borderTopLeftRadius?: number
  borderTopRightRadius?: number
  borderBottomRightRadius?: number
  borderBottomLeftRadius?: number
  borderRadiusLinked?: boolean
  pathData?: string
  pathClosed?: boolean
  // Shadow static props (color; position/size are keyframeable)
  shadowEnabled: boolean
  shadowColor: string
  shadowFollowsPerspective?: boolean
  // Text
  text: string
  fontFamily: string
  fontSize: number
  fontWeight: string
  textAlign: 'left' | 'center' | 'right'
  letterSpacing: number
  lineHeight: number
  textColor: string
  textSpans?: TextRangeStyle[]
  textRevealMode?: TextRevealMode
  // Image
  src?: string
  imageFit?: ImageFit
  imageKind?: ImageKind
  imageNaturalWidth?: number
  imageNaturalHeight?: number
  videoNaturalWidth?: number
  videoNaturalHeight?: number
  videoDuration?: number
  videoSegments?: VideoSegment[]
  sourceDurationFrames?: number
  /** Audio-only: playback gain 0..1 (default 1). Applied as `audio.volume`. */
  audioVolume?: number
  /** Audio-only: mute the layer's playback (transport silent, layer still visible/scheduled). */
  audioMuted?: boolean
  svgStrokeColor?: string
  svgFillColor?: string
  svgFillEnabled?: boolean
  svgStrokeWidth?: number
  // Time range
  startFrame: number
  endFrame: number
  keyframes: Keyframe[]
  propertyKeyframes?: Partial<Record<AnimatableProperty, PropertyKeyframe[]>>
}

export interface CanvasPreset {
  name: string
  width: number
  height: number
}

export interface GuideLine {
  id: string
  axis: 'x' | 'y'
  position: number
}

export interface ProjectIndexItem {
  id: string
  name: string
  thumbnail: string
  updatedAt: string
  createdAt: string
  canvasWidth: number
  canvasHeight: number
  presetName: string
  fps: number
  duration: number
  layerCount: number
}

export interface MotionProject {
  id: string
  name: string
  thumbnail?: string
  createdAt: string
  updatedAt: string
  colorPalettes?: ColorPalette[]
  activeColorPaletteId?: string
  canvas: {
    width: number
    height: number
    fps: number
    durationFrames: number
    backgroundColor: string
    presetName: string
  }
  layers: Layer[]
  guides: GuideLine[]
  timeline: { zoom: number; scrollX: number }
  editor: {
    zoom: number
    panX: number
    panY: number
    selectedLayerIds: string[]
    playheadFrame: number
    showOutsideCanvas?: boolean
  }
}

export interface ProjectHistorySnapshot {
  id: string
  timestamp: string
  label: string
  project: MotionProject
}

export interface KeyframeSelection {
  layerId: string
  frame: number
  propKey?: AnimatableProperty
}

export const CANVAS_PRESETS: CanvasPreset[] = [
  { name: 'YouTube', width: 1920, height: 1080 },
  { name: 'YouTube Shorts', width: 1080, height: 1920 },
  { name: 'Instagram Post', width: 1080, height: 1080 },
  { name: 'Instagram Story', width: 1080, height: 1920 },
  { name: 'TikTok', width: 1080, height: 1920 },
  { name: 'Twitter/X Post', width: 1600, height: 900 },
  { name: 'LinkedIn', width: 1200, height: 627 },
  { name: 'Custom', width: 1280, height: 720 },
]

export const LAYER_TYPE_COLOR: Record<LayerType, string> = {
  rectangle: '#6366f1',
  ellipse: '#22c55e',
  line: '#06b6d4',
  triangle: '#f97316',
  path: '#e879f9',
  text: '#f59e0b',
  image: '#a855f7',
  video: '#ef4444',
  audio: '#10b981',
  group: '#60a5fa',
}

export const GOOGLE_FONTS = [
  'Inter', 'Roboto', 'Open Sans', 'Lato', 'Montserrat',
  'Poppins', 'Raleway', 'Oswald', 'Playfair Display', 'Space Grotesk',
]

export interface TimelineMarker {
  id: string
  frame: number
  label: string
  color: string
}

export interface ColorPalette {
  id: string
  name: string
  colors: string[]
}

export const DEFAULT_COLOR_PALETTES: ColorPalette[] = [
  {
    id: 'default',
    name: 'Default',
    colors: ['#000000', '#ffffff', '#0d99ff', '#6366f1', '#a855f7', '#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4'],
  },
  {
    id: 'custom',
    name: 'Custom',
    colors: [],
  },
]

export interface EditorState {
  projectId: string | null
  projectName: string
  projectCreatedAt: string | null
  projectUpdatedAt: string | null
  layers: Layer[]
  guides: GuideLine[]
  selectedLayerIds: string[]
  selectedKeyframes: KeyframeSelection[]
  currentFrame: number
  totalFrames: number
  fps: number
  isPlaying: boolean
  playbackRate: number
  canvasPreset: CanvasPreset
  customWidth: number
  customHeight: number
  canvasBackgroundColor: string
  theme: 'dark' | 'light'
  currentTool: Tool
  timelineZoom: number
  timelineScrollX: number
  timelinePanelHeight: number
  showAllSubtracks: boolean
  showValueGraph: boolean
  editorZoom: number
  editorPanX: number
  editorPanY: number
  showOutsideCanvas: boolean
  colorPalettes: ColorPalette[]
  activeColorPaletteId: string
  editingTextLayerId: string | null
  textSelection: { layerId: string; start: number; end: number } | null
  activeInteractionCount: number
  markers: TimelineMarker[]
  loopIn: number | null
  loopOut: number | null
  loopEnabled: boolean
  autoKeyframe: boolean
}
