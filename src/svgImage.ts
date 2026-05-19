export type SvgPresentation = {
  svgStrokeColor?: string
  svgFillColor?: string
  svgFillEnabled?: boolean
  svgStrokeWidth?: number
}

function escapeAttr(value: string | number) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function decodeSvgDataUrl(src: string) {
  if (!src.startsWith('data:image/svg+xml')) return null
  const comma = src.indexOf(',')
  if (comma < 0) return null
  const meta = src.slice(0, comma)
  const data = src.slice(comma + 1)
  try {
    if (meta.includes(';base64')) {
      if (typeof atob !== 'function') return null
      return atob(data)
    }
    return decodeURIComponent(data)
  } catch {
    return null
  }
}

function encodeSvgDataUrl(svg: string) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

function setAttr(tag: string, name: string, value: string | number) {
  const closing = tag.endsWith('/>') ? '/>' : '>'
  const body = tag
    .slice(0, -closing.length)
    .replace(new RegExp(`\\s${name}=(["']).*?\\1`, 'gi'), '')
  return `${body} ${name}="${escapeAttr(value)}"${closing}`
}

function stripStylePaintAttrs(tag: string) {
  return tag.replace(/\sstyle=(["'])(.*?)\1/gi, (_match, quote: string, style: string) => {
    const kept = style
      .split(';')
      .map((item) => item.trim())
      .filter((item) => item && !/^(color|fill|stroke|stroke-width)\s*:/i.test(item))
      .join('; ')
    return kept ? ` style=${quote}${kept}${quote}` : ''
  })
}

function applyAttrs(tag: string, presentation: Required<SvgPresentation>) {
  let next = stripStylePaintAttrs(tag)
  next = setAttr(next, 'color', presentation.svgStrokeColor)
  next = setAttr(next, 'stroke', presentation.svgStrokeColor)
  next = setAttr(next, 'stroke-width', presentation.svgStrokeWidth)
  next = setAttr(next, 'fill', presentation.svgFillEnabled ? presentation.svgFillColor : 'none')
  return next
}

export function styledSvgDataUrl(src: string | undefined, presentation: SvgPresentation) {
  if (!src) return src
  const svg = decodeSvgDataUrl(src)
  if (!svg) return src
  const resolved: Required<SvgPresentation> = {
    svgStrokeColor: presentation.svgStrokeColor || '#ffffff',
    svgFillColor: presentation.svgFillColor || presentation.svgStrokeColor || '#ffffff',
    svgFillEnabled: Boolean(presentation.svgFillEnabled),
    svgStrokeWidth: Math.max(0, presentation.svgStrokeWidth ?? 2),
  }

  let next = svg.replace(/<svg\b[^>]*>/i, (tag) => applyAttrs(tag, resolved))
  next = next.replace(/<(path|circle|rect|line|polyline|polygon|ellipse)\b[^>]*>/gi, (tag) => applyAttrs(tag, resolved))
  return encodeSvgDataUrl(next)
}
