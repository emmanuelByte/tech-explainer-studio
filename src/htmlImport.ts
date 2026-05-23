import { DEFAULT_TRANSFORM, Layer, LayerType, TransformProps } from './types'

type ImportResult = {
  layers: Layer[]
  rootLayerIds: string[]
}

type HtmlImportOptions = {
  fitToCanvas?: boolean
}

let counter = 0

function uid() {
  counter += 1
  return `html-${Date.now().toString(36)}-${counter}`
}

function px(value: string | null | undefined) {
  const parsed = Number.parseFloat(value || '')
  return Number.isFinite(parsed) ? parsed : 0
}

function isTransparent(color: string) {
  return !color || color === 'transparent' || /^rgba?\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0\s*\)$/i.test(color) || /,\s*0\s*\)$/i.test(color)
}

function cssColor(color: string, fallback = 'transparent') {
  return isTransparent(color) ? fallback : color
}

function radius(style: CSSStyleDeclaration) {
  const tl = px(style.borderTopLeftRadius)
  const tr = px(style.borderTopRightRadius)
  const br = px(style.borderBottomRightRadius)
  const bl = px(style.borderBottomLeftRadius)
  return { tl, tr, br, bl, all: Math.max(tl, tr, br, bl) }
}

function maxBorderWidth(style: CSSStyleDeclaration) {
  return Math.max(px(style.borderTopWidth), px(style.borderRightWidth), px(style.borderBottomWidth), px(style.borderLeftWidth))
}

function parseShadow(style: CSSStyleDeclaration): Pick<Layer, 'shadowEnabled' | 'shadowColor'> & Partial<TransformProps> {
  if (!style.boxShadow || style.boxShadow === 'none') return { shadowEnabled: false, shadowColor: 'rgba(0,0,0,0.5)' }
  const shadow = style.boxShadow.split('),')[0].trim()
  const colorMatch = shadow.match(/rgba?\([^)]+\)|#[0-9a-f]{3,8}|hsla?\([^)]+\)/i)
  const color = colorMatch?.[0] ?? 'rgba(0,0,0,0.25)'
  const numbers = shadow
    .replace(color, '')
    .trim()
    .split(/\s+/)
    .map((part) => px(part))
    .filter((value) => Number.isFinite(value))
  return {
    shadowEnabled: true,
    shadowColor: color,
    shadowX: numbers[0] ?? 0,
    shadowY: numbers[1] ?? 4,
    shadowBlur: numbers[2] ?? 12,
    shadowSpread: numbers[3] ?? 0,
  }
}

function transform(x = 0, y = 0, shadow: Partial<TransformProps> = {}): TransformProps {
  return { ...DEFAULT_TRANSFORM, x, y, ...shadow }
}

function directText(el: Element) {
  return Array.from(el.childNodes)
    .filter((node) => node.nodeType === Node.TEXT_NODE)
    .map((node) => node.textContent ?? '')
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function iconText(el: Element) {
  if (el.tagName.toLowerCase() !== 'i') return ''
  const classes = Array.from(el.classList)
  const name = classes.find((item) => item.startsWith('ti-') && item !== 'ti')
  if (!name) return '•'
  const key = name.replace(/^ti-/, '')
  const map: Record<string, string> = {
    'antenna-bars-5': '▮▮▮',
    wifi: '⌁',
    'battery-3': '▰',
    search: '⌕',
    'adjustments-horizontal': '≡',
    'bucket-droplet': '◒',
    tools: '⚒',
    'building-warehouse': '⌂',
    'current-location': '⌖',
    'stack-2': '▣',
    star: '★',
    'map-pin': '⌖',
    'clock-hour-4': '◷',
    category: '▦',
    tag: '%',
    phone: '☎',
    route: '↗',
  }
  return map[key] ?? '•'
}

function sanitizeForMeasure(html: string) {
  const template = document.createElement('template')
  template.innerHTML = html
  template.content.querySelectorAll('script, style, link, meta, iframe, object, embed').forEach((node) => node.remove())
  return template.innerHTML
}

export function htmlPreviewDocument(html: string) {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    html, body { margin: 0; min-height: 100%; background: #f3f4f6; font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    body { display: flex; align-items: flex-start; justify-content: center; padding: 24px; box-sizing: border-box; }
    .ti { display: inline-flex; width: 1em; height: 1em; align-items: center; justify-content: center; font-style: normal; }
    .ti::before { content: "•"; font-size: .8em; line-height: 1; }
  </style>
</head>
<body>${html.replace(/<script\b[\s\S]*?<\/script>/gi, '')}</body>
</html>`
}

function makeLayer(type: LayerType, overrides: Partial<Layer>, totalFrames: number): Layer {
  const keyframes = overrides.keyframes ?? [{ frame: 0, easing: 'ease-out' as const, props: transform() }]
  return {
    id: uid(),
    name: type,
    type,
    visible: true,
    locked: false,
    parentId: null,
    collapsed: false,
    isGroup: type === 'group',
    autoFit: false,
    clipChildren: false,
    width: type === 'text' ? 200 : 100,
    height: type === 'text' ? 40 : 100,
    sizeMode: 'fixed',
    layoutMode: 'none',
    layoutDirection: 'row',
    layoutGap: 12,
    layoutPadding: 16,
    layoutAlign: 'center',
    layoutJustify: 'start',
    gridColumns: 2,
    fillType: type === 'text' || type === 'group' ? 'none' : 'solid',
    fillColor: type === 'text' || type === 'group' ? 'transparent' : '#ffffff',
    gradientStops: [{ color: '#6366f1', position: 0 }, { color: '#a855f7', position: 100 }],
    gradientAngle: 135,
    strokeEnabled: false,
    strokeColor: '#ffffff',
    strokeWidth: 0,
    borderRadius: 0,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    borderBottomRightRadius: 0,
    borderBottomLeftRadius: 0,
    borderRadiusLinked: true,
    pathClosed: false,
    shadowEnabled: false,
    shadowColor: 'rgba(0,0,0,0.5)',
    shadowFollowsPerspective: false,
    text: '',
    fontFamily: 'Inter',
    fontSize: 16,
    fontWeight: '400',
    textAlign: 'left',
    letterSpacing: 0,
    lineHeight: 1.2,
    textColor: '#000000',
    textSpans: [],
    textRevealMode: 'plain',
    imageFit: 'contain',
    svgStrokeColor: '#ffffff',
    svgFillColor: '#ffffff',
    svgFillEnabled: false,
    svgStrokeWidth: 2,
    startFrame: 0,
    endFrame: totalFrames,
    keyframes,
    ...overrides,
  }
}

function boxBase(style: CSSStyleDeclaration) {
  const r = radius(style)
  const borderWidth = maxBorderWidth(style)
  return {
    fillType: isTransparent(style.backgroundColor) ? 'none' as const : 'solid' as const,
    fillColor: cssColor(style.backgroundColor),
    strokeEnabled: borderWidth > 0 && !isTransparent(style.borderTopColor),
    strokeColor: cssColor(style.borderTopColor, '#ffffff'),
    strokeWidth: borderWidth,
    borderRadius: r.all,
    borderTopLeftRadius: r.tl,
    borderTopRightRadius: r.tr,
    borderBottomRightRadius: r.br,
    borderBottomLeftRadius: r.bl,
    borderRadiusLinked: r.tl === r.tr && r.tr === r.br && r.br === r.bl,
  }
}

function textAlign(style: CSSStyleDeclaration): Layer['textAlign'] {
  if (style.textAlign === 'right') return 'right'
  if (style.textAlign === 'center' || style.justifyContent === 'center') return 'center'
  return 'left'
}

function textWhiteSpace(style: CSSStyleDeclaration): Layer['htmlWhiteSpace'] {
  const value = style.whiteSpace
  if (value === 'nowrap' || value === 'pre' || value === 'pre-wrap' || value === 'pre-line' || value === 'break-spaces') return value
  return 'normal'
}

function textLineHeight(style: CSSStyleDeclaration) {
  const fontSize = Math.max(1, px(style.fontSize) || 16)
  const value = style.lineHeight
  if (!value || value === 'normal') return 1.2
  if (value.endsWith('px')) return Math.max(0.1, px(value) / fontSize)
  const numeric = Number.parseFloat(value)
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 1.2
}

function textLayer(name: string, text: string, rect: DOMRect, parentRect: DOMRect, parentId: string, style: CSSStyleDeclaration, totalFrames: number) {
  const shadow = parseShadow(style)
  return makeLayer('text', {
    name,
    parentId,
    width: Math.max(1, rect.width),
    height: Math.max(1, rect.height),
    fillType: 'none',
    fillColor: 'transparent',
    text,
    fontFamily: style.fontFamily || 'Inter',
    fontSize: Math.max(1, px(style.fontSize) || 16),
    fontWeight: style.fontWeight || '400',
    textAlign: textAlign(style),
    letterSpacing: px(style.letterSpacing),
    lineHeight: textLineHeight(style),
    textColor: cssColor(style.color, '#000000'),
    htmlText: true,
    htmlWhiteSpace: textWhiteSpace(style),
    shadowEnabled: shadow.shadowEnabled,
    shadowColor: shadow.shadowColor,
    keyframes: [{ frame: 0, easing: 'ease-out', props: transform(rect.left - parentRect.left + rect.width / 2 - parentRect.width / 2, rect.top - parentRect.top + rect.height / 2 - parentRect.height / 2, shadow) }],
  }, totalFrames)
}

function svgLayer(el: SVGSVGElement, rect: DOMRect, parentRect: DOMRect, parentId: string, totalFrames: number) {
  const clone = el.cloneNode(true) as SVGSVGElement
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  clone.setAttribute('width', String(Math.max(1, rect.width)))
  clone.setAttribute('height', String(Math.max(1, rect.height)))
  clone.removeAttribute('style')
  const source = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(clone))}`
  return makeLayer('image', {
    name: 'SVG',
    parentId,
    width: Math.max(1, rect.width),
    height: Math.max(1, rect.height),
    fillType: 'none',
    fillColor: 'transparent',
    src: source,
    imageFit: 'fill',
    imageKind: 'raster',
    imageNaturalWidth: Math.max(1, rect.width),
    imageNaturalHeight: Math.max(1, rect.height),
    keyframes: [{ frame: 0, easing: 'ease-out', props: transform(rect.left - parentRect.left + rect.width / 2 - parentRect.width / 2, rect.top - parentRect.top + rect.height / 2 - parentRect.height / 2) }],
  }, totalFrames)
}

function hasVisibleBox(style: CSSStyleDeclaration) {
  return !isTransparent(style.backgroundColor) || maxBorderWidth(style) > 0 || (style.boxShadow && style.boxShadow !== 'none')
}

function textBoxAlign(style: CSSStyleDeclaration): Layer['textAlign'] {
  if (style.textAlign === 'left' || style.textAlign === 'right' || style.textAlign === 'center') return textAlign(style)
  return 'center'
}

function hasClipping(style: CSSStyleDeclaration) {
  return style.overflow === 'hidden' || style.overflowX === 'hidden' || style.overflowY === 'hidden'
}

function hasCssTransform(style: CSSStyleDeclaration) {
  return Boolean(style.transform && style.transform !== 'none')
}

function isStructuralContainer(el: HTMLElement, style: CSSStyleDeclaration) {
  if (!el.children.length) return false
  if (style.position && style.position !== 'static') return true
  if (style.display.includes('flex') || style.display.includes('grid')) return true
  if (hasExplicitSize(el)) return true
  return false
}

function elementName(el: HTMLElement) {
  const className = el.className?.toString().split(/\s+/).filter(Boolean).slice(-1)[0]
  return el.id || el.getAttribute('aria-label') || className || el.tagName.toLowerCase()
}

function orderedRenderableChildren(el: Element) {
  return Array.from(el.children)
    .filter((child): child is HTMLElement | SVGSVGElement => child instanceof HTMLElement || child instanceof SVGSVGElement)
    .map((child, index) => {
      const style = child instanceof HTMLElement ? getComputedStyle(child) : null
      const zIndex = style ? Number.parseInt(style.zIndex, 10) : 0
      return { child, index, zIndex: Number.isFinite(zIndex) ? zIndex : 0 }
    })
    .sort((a, b) => {
      if (a.zIndex !== b.zIndex) return b.zIndex - a.zIndex
      return b.index - a.index
    })
    .map((item) => item.child)
}

function hasExplicitSize(el: HTMLElement) {
  return /\bwidth\s*:\s*\d/i.test(el.getAttribute('style') ?? '') && /\bheight\s*:\s*\d/i.test(el.getAttribute('style') ?? '')
}

function chooseRoot(container: HTMLElement) {
  const elements = Array.from(container.querySelectorAll<HTMLElement>('*'))
  const explicit = elements.find((el) => {
    const rect = el.getBoundingClientRect()
    return hasExplicitSize(el) && rect.width > 2 && rect.height > 2
  })
  if (explicit) return explicit
  return elements
    .map((el) => ({ el, rect: el.getBoundingClientRect() }))
    .filter(({ rect }) => rect.width > 2 && rect.height > 2)
    .sort((a, b) => b.rect.width * b.rect.height - a.rect.width * a.rect.height)[0]?.el ?? null
}

export function htmlToLayers(html: string, name: string, totalFrames: number, canvasWidth: number, canvasHeight: number, options: HtmlImportOptions = {}): ImportResult {
  const clean = sanitizeForMeasure(html)
  if (!clean.trim()) throw new Error('Empty HTML')

  const host = document.createElement('div')
  host.style.position = 'fixed'
  host.style.left = '-100000px'
  host.style.top = '0'
  host.style.visibility = 'hidden'
  host.style.pointerEvents = 'none'
  host.style.width = '1200px'
  host.style.minHeight = '1200px'
  host.innerHTML = `<style>
    *, *::before, *::after { box-sizing: border-box; }
    .ti { display: inline-flex; width: 1em; height: 1em; align-items: center; justify-content: center; font-style: normal; }
    .ti::before { content: "•"; font-size: .8em; line-height: 1; }
  </style>${clean}`
  document.body.appendChild(host)

  try {
    const rootEl = chooseRoot(host)
    if (!rootEl) throw new Error('No visible HTML nodes')
    const rootRect = rootEl.getBoundingClientRect()
    const rootStyle = getComputedStyle(rootEl)
    const rootShadow = parseShadow(rootStyle)
    const scale = options.fitToCanvas === false
      ? 1
      : Math.min(1, (canvasWidth * 0.85) / rootRect.width, (canvasHeight * 0.85) / rootRect.height)
    const root = makeLayer('group', {
      name: name.trim() || 'HTML Import',
      width: Math.max(1, rootRect.width),
      height: Math.max(1, rootRect.height),
      groupOriginX: 0,
      groupOriginY: 0,
      clipChildren: rootStyle.overflow === 'hidden',
      ...boxBase(rootStyle),
      shadowEnabled: rootShadow.shadowEnabled,
      shadowColor: rootShadow.shadowColor,
      keyframes: [{ frame: 0, easing: 'ease-out', props: transform(0, 0, { ...rootShadow, scale }) }],
    }, totalFrames)

    const layers: Layer[] = [root]

    function visitElement(el: Element, parentId: string, parentRect: DOMRect) {
      if (!(el instanceof HTMLElement) && !(el instanceof SVGSVGElement)) return
      const rect = el.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) return

      if (el instanceof SVGSVGElement) {
        layers.push(svgLayer(el, rect, parentRect, parentId, totalFrames))
        return
      }

      const style = getComputedStyle(el)
      const text = iconText(el) || directText(el)
      const children = orderedRenderableChildren(el)
      const visibleBox = hasVisibleBox(style)
      const overflowHidden = hasClipping(style)
      const preserveContainer = isStructuralContainer(el, style)
      const needsLayerGroup = children.length > 0 && (visibleBox || overflowHidden || hasCssTransform(style) || preserveContainer)
      const layerName = elementName(el)

      if (!visibleBox && !overflowHidden && !hasCssTransform(style) && !preserveContainer && !text) {
        children.forEach((child) => visitElement(child, parentId, parentRect))
        return
      }

      if (needsLayerGroup) {
        const shadow = parseShadow(style)
        const group = makeLayer('group', {
          name: layerName,
          parentId,
          width: Math.max(1, rect.width),
          height: Math.max(1, rect.height),
          groupOriginX: 0,
          groupOriginY: 0,
          clipChildren: overflowHidden,
          ...boxBase(style),
          shadowEnabled: shadow.shadowEnabled,
          shadowColor: shadow.shadowColor,
          keyframes: [{ frame: 0, easing: 'ease-out', props: transform(rect.left - parentRect.left + rect.width / 2 - parentRect.width / 2, rect.top - parentRect.top + rect.height / 2 - parentRect.height / 2, shadow) }],
        }, totalFrames)
        layers.push(group)
        if (text) {
          layers.push(textLayer(`${layerName} text`, text, rect, rect, group.id, style, totalFrames))
          layers[layers.length - 1].textAlign = textBoxAlign(style)
        }
        children.forEach((child) => visitElement(child, group.id, rect))
        return
      }

      if (visibleBox && text) {
        const shadow = parseShadow(style)
        const group = makeLayer('group', {
          name: layerName,
          parentId,
          width: Math.max(1, rect.width),
          height: Math.max(1, rect.height),
          groupOriginX: 0,
          groupOriginY: 0,
          clipChildren: overflowHidden,
          ...boxBase(style),
          shadowEnabled: shadow.shadowEnabled,
          shadowColor: shadow.shadowColor,
          keyframes: [{ frame: 0, easing: 'ease-out', props: transform(rect.left - parentRect.left + rect.width / 2 - parentRect.width / 2, rect.top - parentRect.top + rect.height / 2 - parentRect.height / 2, shadow) }],
        }, totalFrames)
        layers.push(group)
        const label = textLayer(`${layerName} text`, text, rect, rect, group.id, style, totalFrames)
        label.textAlign = textBoxAlign(style)
        layers.push(label)
        return
      }

      if (text) {
        layers.push(textLayer(layerName, text, rect, parentRect, parentId, style, totalFrames))
        return
      }

      if (visibleBox) {
        const shadow = parseShadow(style)
        layers.push(makeLayer('rectangle', {
          name: layerName,
          parentId,
          width: Math.max(1, rect.width),
          height: Math.max(1, rect.height),
          ...boxBase(style),
          shadowEnabled: shadow.shadowEnabled,
          shadowColor: shadow.shadowColor,
          keyframes: [{ frame: 0, easing: 'ease-out', props: transform(rect.left - parentRect.left + rect.width / 2 - parentRect.width / 2, rect.top - parentRect.top + rect.height / 2 - parentRect.height / 2, shadow) }],
        }, totalFrames))
      }
    }

    orderedRenderableChildren(rootEl).forEach((child) => visitElement(child, root.id, rootRect))
    return { layers, rootLayerIds: [root.id] }
  } finally {
    host.remove()
  }
}
