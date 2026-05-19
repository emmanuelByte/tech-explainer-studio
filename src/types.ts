export type LayerType = 'rectangle' | 'ellipse' | 'line' | 'triangle' | 'text' | 'image' | 'group'
export type EasingType = 'linear' | 'ease' | 'ease-in' | 'ease-out' | 'ease-in-out' | 'spring' | 'bounce'
export type PairEasingType = EasingType | 'custom'
export type FillType = 'solid' | 'linear-gradient' | 'radial-gradient' | 'none'
export type SizeMode = 'fixed' | 'fit-content' | 'fill-canvas'
export type Tool = 'select' | 'hand' | 'rectangle' | 'ellipse' | 'text' | 'line' | 'triangle'

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
  | 'x' | 'y' | 'width' | 'height' | 'scale' | 'scaleX' | 'scaleY'
  | 'rotateX' | 'rotateY' | 'rotateZ' | 'skewX' | 'skewY'
  | 'perspective' | 'originX' | 'originY' | 'opacity'
  | 'fillColor' | 'strokeColor' | 'strokeWidth' | 'borderRadius'
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
  x: 0, y: 0,
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

export interface Layer {
  id: string
  name: string
  type: LayerType
  parentId?: string | null
  collapsed?: boolean
  isGroup?: boolean
  visible: boolean
  locked: boolean
  width: number
  height: number
  sizeMode?: SizeMode
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
  // Shadow static props (color; position/size are keyframeable)
  shadowEnabled: boolean
  shadowColor: string
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
  // Image
  src?: string
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
  text: '#f59e0b',
  image: '#a855f7',
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
  editingTextLayerId: string | null
  textSelection: { layerId: string; start: number; end: number } | null
  activeInteractionCount: number
  markers: TimelineMarker[]
  loopIn: number | null
  loopOut: number | null
  loopEnabled: boolean
  autoKeyframe: boolean
}
