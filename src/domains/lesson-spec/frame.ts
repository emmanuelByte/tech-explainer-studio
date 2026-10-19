/**
 * Everything that depends on the output format: caption style, the area the
 * diagram may use, and the largest an overlay may be. A lesson is authored once
 * and compiled against a frame, so 16:9 and 9:16 differ here and nowhere else.
 *
 * Values are authored for the two native formats (1920x1080 and 1080x1920) and
 * scaled by `unit` for any other size of the same orientation.
 */
export type Orientation = 'landscape' | 'portrait'
export type CaptionStyle = 'readable' | 'technical'

export interface CaptionMetrics {
  fontSize: number
  maxWidth: number
  /** Distance from the frame bottom to the caption box. */
  bottom: number
  paddingX: number
  paddingY: number
  radius: number
  lineHeight: number
}

export interface FrameSpec {
  width: number
  height: number
  orientation: Orientation
  /** Scale of on-screen sizes relative to the native format of this orientation. */
  unit: number
  /** Strip at the bottom held clear of the diagram and overlays so captions never cover them. */
  captionReserve: number
  /** Strip at the top held clear (platform UI in portrait). */
  safeTop: number
  cameraMarginX: number
  cameraMarginY: number
  /** Widest an overlay panel may be, on screen. */
  overlayMaxWidth: number
}

export function frameFor(width: number, height: number): FrameSpec {
  const portrait = height > width
  const unit = portrait ? Math.min(width / 1080, height / 1920) : Math.min(width / 1920, height / 1080)
  return portrait
    ? {
      width, height, orientation: 'portrait', unit,
      // Short-video apps overlay their own controls on the bottom fifth and the top edge.
      captionReserve: Math.round(height * 0.37),
      safeTop: Math.round(height * 0.07),
      cameraMarginX: Math.round(60 * unit),
      cameraMarginY: Math.round(60 * unit),
      overlayMaxWidth: width - Math.round(80 * unit),
    }
    : {
      width, height, orientation: 'landscape', unit,
      captionReserve: Math.round(360 * unit),
      safeTop: 0,
      cameraMarginX: Math.round(160 * unit),
      cameraMarginY: Math.round(80 * unit),
      overlayMaxWidth: Math.round(1200 * unit),
    }
}

/** Height of the area left for the diagram and overlays between the top safe strip and the caption reserve. */
export const contentHeight = (frame: FrameSpec) => frame.height - frame.captionReserve - frame.safeTop

/** Vertical offset of the content area's centre from the frame's centre (negative = above). */
export const contentCentreOffset = (frame: FrameSpec) => (frame.safeTop - frame.captionReserve) / 2

export function captionMetrics(width: number, height: number, style: CaptionStyle): CaptionMetrics {
  const technical = style === 'technical'
  if (height > width) {
    return {
      fontSize: width * (technical ? 0.04 : 0.045),
      maxWidth: width * 0.88,
      bottom: height * (technical ? 0.14 : 0.15),
      paddingX: width * 0.03,
      paddingY: width * 0.022,
      radius: technical ? 6 : 18,
      lineHeight: 1.28,
    }
  }
  return {
    fontSize: height * (technical ? 0.034 : 0.042),
    maxWidth: width * 0.82,
    bottom: height * (technical ? 0.1 : 0.13),
    paddingX: width * (technical ? 0.018 : 0.025),
    paddingY: height * (technical ? 0.012 : 0.017),
    radius: technical ? 5 : 14,
    lineHeight: 1.28,
  }
}

/** Where the caption for `text` begins, from the top of the frame; used to keep content clear of it. */
export function captionTop(text: string, width: number, height: number, style: CaptionStyle = 'readable') {
  const metrics = captionMetrics(width, height, style)
  const innerWidth = metrics.maxWidth - 2 * metrics.paddingX
  const charsPerLine = Math.max(1, Math.floor(innerWidth / (metrics.fontSize * 0.52)))
  const lines = Math.max(1, Math.ceil(text.length / charsPerLine))
  return height - metrics.bottom - (lines * metrics.fontSize * metrics.lineHeight + 2 * metrics.paddingY)
}
