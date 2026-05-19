export type LayerType = 'rectangle' | 'ellipse' | 'line' | 'triangle' | 'text' | 'image'
export type EasingType = 'linear' | 'ease' | 'ease-in' | 'ease-out' | 'ease-in-out' | 'spring' | 'bounce'
export type FillType = 'solid' | 'linear-gradient' | 'radial-gradient' | 'none'
export type Tool = 'select' | 'hand' | 'rectangle' | 'ellipse' | 'text' | 'line' | 'triangle'

export interface GradientStop {
  color: string
  position: number
}

export interface TransformProps {
  x: number
  y: number
  scale: number
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
  easing: EasingType
  props: TransformProps
}

export interface Layer {
  id: string
  name: string
  type: LayerType
  visible: boolean
  locked: boolean
  width: number
  height: number
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
  // Image
  src?: string
  keyframes: Keyframe[]
}

export interface CanvasPreset {
  name: string
  width: number
  height: number
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
  layers: Layer[]
  selectedLayerIds: string[]
  currentFrame: number
  totalFrames: number
  fps: number
  isPlaying: boolean
  canvasPreset: CanvasPreset
  customWidth: number
  customHeight: number
  theme: 'dark' | 'light'
  currentTool: Tool
  timelineZoom: number
  markers: TimelineMarker[]
  loopIn: number | null
  loopOut: number | null
  loopEnabled: boolean
}
