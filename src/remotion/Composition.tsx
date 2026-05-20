import { Sequence, useCurrentFrame, Video } from 'remotion'
import { Layer, GradientStop, FillType } from '../types'
import { buildTransform, buildFilter, buildBoxShadow } from './interpolateProps'
import { useStore } from '../store'
import { resolveLayerAnimation } from '../animationProperties'
import { styledSvgDataUrl } from '../svgImage'

function getBackground(fillType: FillType, fillColor: string, stops: GradientStop[], angle: number): string {
  if (fillType === 'none') return 'transparent'
  if (fillType === 'solid') return fillColor
  const stopsStr = stops.map((s) => `${s.color} ${s.position}%`).join(', ')
  if (fillType === 'linear-gradient') return `linear-gradient(${angle}deg, ${stopsStr})`
  if (fillType === 'radial-gradient') return `radial-gradient(circle, ${stopsStr})`
  return fillColor
}

function textStyleForIndex(layer: Layer, index: number) {
  return [...(layer.textSpans ?? [])].reverse().find((span) => index >= span.start && index < span.end)
}

function charRevealStyle(mode: Layer['textRevealMode'], progress: number): React.CSSProperties {
  const t = Math.max(0, Math.min(1, progress))
  if (mode === 'char-pop') {
    return {
      opacity: t,
      transform: `scale(${0.25 + t * 0.75}) translateY(${(1 - t) * 4}px)`,
      transformOrigin: '50% 80%',
    }
  }
  if (mode === 'char-fall') {
    return {
      opacity: t,
      transform: `translateY(${(1 - t) * -28}px) rotate(${(1 - t) * -10}deg)`,
      filter: t < 1 ? `blur(${(1 - t) * 2}px)` : undefined,
    }
  }
  if (mode === 'char-rise') {
    return {
      opacity: t,
      transform: `translateY(${(1 - t) * 20}px) scale(${0.92 + t * 0.08})`,
      filter: t < 1 ? `blur(${(1 - t) * 3}px)` : undefined,
    }
  }
  if (mode === 'char-spin') {
    return {
      opacity: t,
      transform: `rotateX(${(1 - t) * 90}deg) rotateZ(${(1 - t) * -18}deg) scale(${0.85 + t * 0.15})`,
      transformOrigin: '50% 60%',
    }
  }
  if (mode === 'char-blur') {
    return {
      opacity: t,
      transform: `translateY(${(1 - t) * 8}px)`,
      filter: t < 1 ? `blur(${(1 - t) * 8}px)` : undefined,
    }
  }
  return {}
}

function wordRevealStyle(progress: number): React.CSSProperties {
  const t = Math.max(0, Math.min(1, progress))
  return {
    display: 'inline-block',
    opacity: t,
    transform: `translateY(${(1 - t) * 24}px)`,
    filter: t < 1 ? `blur(${(1 - t) * 6}px)` : undefined,
    willChange: t < 1 ? 'transform, opacity, filter' : undefined,
  }
}

function styledTextRuns(layer: Layer, start: number, end: number) {
  const spans = (layer.textSpans ?? [])
    .filter((span) => span.end > start && span.start < end)
    .sort((a, b) => a.start - b.start)
  const runs: { text: string; style?: typeof spans[number] }[] = []
  let cursor = start
  spans.forEach((span) => {
    const runStart = Math.max(start, Math.min(end, span.start))
    const runEnd = Math.max(runStart, Math.min(end, span.end))
    if (runStart > cursor) runs.push({ text: layer.text.slice(cursor, runStart) })
    if (runEnd > runStart) runs.push({ text: layer.text.slice(runStart, runEnd), style: span })
    cursor = Math.max(cursor, runEnd)
  })
  if (cursor < end) runs.push({ text: layer.text.slice(cursor, end) })
  return runs.length ? runs : [{ text: layer.text.slice(start, end) }]
}

function renderStyledTextRange(layer: Layer, start: number, end: number) {
  return styledTextRuns(layer, start, end).map((run, idx) => (
    <span
      key={idx}
      style={{
        fontFamily: run.style?.fontFamily,
        fontSize: run.style?.fontSize,
        fontWeight: run.style?.fontWeight,
        color: run.style?.textColor,
        letterSpacing: run.style?.letterSpacing,
      }}
    >
      {run.text}
    </span>
  ))
}

function renderAnimatedText(layer: Layer, charProgress: number) {
  const progress = Math.max(0, Math.min(1, charProgress))
  const mode = layer.textRevealMode ?? 'plain'
  if (mode === 'plain') {
    const visible = Math.floor(layer.text.length * progress)
    const displayText = layer.text.slice(0, visible)
    return renderStyledTextRange({ ...layer, text: displayText }, 0, displayText.length)
  }

  if (mode === 'word-rise') {
    const tokens = Array.from(layer.text.matchAll(/\s+|\S+/g))
    const wordCount = tokens.filter((token) => /\S/.test(token[0])).length
    const reveal = progress * Math.max(1, wordCount)
    let wordIndex = 0

    return tokens.map((token, index) => {
      const text = token[0]
      const start = token.index ?? 0
      const end = start + text.length
      if (!/\S/.test(text)) return <span key={index} style={{ whiteSpace: 'pre-wrap' }}>{text}</span>

      const wordT = Math.max(0, Math.min(1, reveal - wordIndex))
      wordIndex += 1
      return (
        <span key={index} style={wordRevealStyle(wordT)}>
          {renderStyledTextRange(layer, start, end)}
        </span>
      )
    })
  }

  const chars = Array.from(layer.text)
  const reveal = progress * chars.length
  return chars.map((char, index) => {
    if (char === '\n') return <br key={index} />
    const style = textStyleForIndex(layer, index)
    const charT = Math.max(0, Math.min(1, reveal - index))
    return (
      <span
        key={index}
        style={{
          display: 'inline-block',
          whiteSpace: char === ' ' ? 'pre' : undefined,
          fontFamily: style?.fontFamily,
          fontSize: style?.fontSize,
          fontWeight: style?.fontWeight,
          color: style?.textColor,
          letterSpacing: style?.letterSpacing,
          willChange: charT < 1 ? 'transform, opacity, filter' : undefined,
          ...charRevealStyle(mode, charT),
        }}
      >
        {char === ' ' ? '\u00a0' : char}
      </span>
    )
  })
}

function renderWheelText(layer: Layer) {
  const mask = (value: string): React.CSSProperties => ({
    WebkitMaskImage: value,
    maskImage: value,
    WebkitMaskSize: '100% 100%',
    maskSize: '100% 100%',
  })
  const textBlock: React.CSSProperties = {
    width: '100%',
    textAlign: layer.textAlign,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  }

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <div
        style={{
          ...textBlock,
          ...mask('linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.15) 24%, rgba(0,0,0,0.85) 52%, #000 100%)'),
        }}
      >
        {renderStyledTextRange(layer, 0, layer.text.length)}
      </div>
      <div
        aria-hidden
        style={{
          ...textBlock,
          ...mask('linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.85) 18%, rgba(0,0,0,0.65) 42%, transparent 74%, transparent 100%)'),
          position: 'absolute',
          inset: 0,
          filter: 'blur(8px)',
          opacity: 0.68,
          pointerEvents: 'none',
        }}
      >
        {renderStyledTextRange(layer, 0, layer.text.length)}
      </div>
    </div>
  )
}

function isGroupLayer(layer: Layer) {
  return layer.type === 'group' || layer.isGroup
}

function isLayerActive(layer: Layer, frame: number) {
  return layer.visible && frame >= (layer.startFrame ?? 0) && frame <= (layer.endFrame ?? Infinity)
}

function layerSize(layer: Layer, canvasWidth: number, canvasHeight: number) {
  return {
    width: layer.sizeMode === 'fill-canvas' ? canvasWidth : layer.width,
    height: layer.sizeMode === 'fill-canvas'
      ? canvasHeight
      : layer.type === 'line' ? layer.strokeWidth || 2 : layer.height,
  }
}

function layerCanCastSurfaceShadow(layer: Layer) {
  if (layer.type === 'image' || layer.type === 'video' || layer.type === 'line') return true
  return layer.fillType !== 'none' || !!layer.strokeEnabled
}

function buildLayerSurfaceShadow(layer: Layer, p: ReturnType<typeof resolveLayerAnimation>['transform']) {
  if (!layerCanCastSurfaceShadow(layer)) return 'none'
  return buildBoxShadow(p, layer.shadowColor, layer.shadowEnabled, !!layer.shadowFollowsPerspective)
}

function buildLayerDropShadow(layer: Layer, p: ReturnType<typeof resolveLayerAnimation>['transform']) {
  if (!layerCanCastSurfaceShadow(layer)) return undefined
  const shadow = buildBoxShadow(p, layer.shadowColor, layer.shadowEnabled, !!layer.shadowFollowsPerspective)
  if (shadow === 'none') return undefined
  const [x, y, blur] = shadow.split(' ')
  return `drop-shadow(${x} ${y} ${blur} ${layer.shadowColor})`
}

function LayerElement({ layer, frame, canvasWidth, canvasHeight, isSelected, onSelect }: {
  layer: Layer
  frame: number
  canvasWidth: number
  canvasHeight: number
  isSelected: boolean
  onSelect: (multi: boolean) => void
}) {
  if (isGroupLayer(layer)) {
    return null
  }
  if (!isLayerActive(layer, frame)) return null

  const resolved = resolveLayerAnimation(layer, frame)
  const animatedLayer = resolved.layer
  const p = resolved.transform
  const bg = getBackground(animatedLayer.fillType, animatedLayer.fillColor, animatedLayer.gradientStops, animatedLayer.gradientAngle)
  const { width: layerWidth, height: layerHeight } = layerSize(animatedLayer, canvasWidth, canvasHeight)

  const wrapperStyle: React.CSSProperties = {
    position: 'absolute',
    left: '50%',
    top: '50%',
    width: layerWidth,
    height: layerHeight,
    marginLeft: -layerWidth / 2,
    marginTop: -layerHeight / 2,
    opacity: p.opacity,
    transform: buildTransform(p),
    transformOrigin: `${p.originX}% ${p.originY}%`,
    transformStyle: 'preserve-3d',
    filter: buildFilter(p),
    backdropFilter: p.backdropBlur > 0 ? `blur(${p.backdropBlur}px)` : undefined,
    cursor: 'pointer',
    outline: isSelected ? '2px solid #6366f1' : 'none',
    outlineOffset: '2px',
    pointerEvents: 'auto',
  }

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    onSelect(e.shiftKey || e.metaKey || e.ctrlKey)
  }

  if (animatedLayer.type === 'image' && animatedLayer.src) {
    const imageSrc = animatedLayer.imageKind === 'svg'
      ? styledSvgDataUrl(animatedLayer.src, animatedLayer)
      : animatedLayer.src
    return (
      <div
        data-layer-id={animatedLayer.id}
        style={{
          ...wrapperStyle,
          borderRadius: animatedLayer.borderRadius,
          boxShadow: buildLayerSurfaceShadow(animatedLayer, p),
        }}
        onClick={handleClick}
      >
        <img
          src={imageSrc}
          style={{ width: '100%', height: '100%', objectFit: animatedLayer.imageFit ?? 'contain', display: 'block', borderRadius: animatedLayer.borderRadius }}
          alt={animatedLayer.name}
        />
      </div>
    )
  }

  if (animatedLayer.type === 'video' && animatedLayer.src) {
    const durationInFrames = Math.max(1, (animatedLayer.endFrame ?? frame + 1) - (animatedLayer.startFrame ?? 0) + 1)
    return (
      <div
        data-layer-id={animatedLayer.id}
        style={{
          ...wrapperStyle,
          borderRadius: animatedLayer.borderRadius,
          boxShadow: buildLayerSurfaceShadow(animatedLayer, p),
        }}
        onClick={handleClick}
      >
        <Sequence from={animatedLayer.startFrame ?? 0} durationInFrames={durationInFrames} layout="none">
          <Video
            src={animatedLayer.src}
            style={{
              width: '100%',
              height: '100%',
              objectFit: animatedLayer.imageFit ?? 'contain',
              display: 'block',
              borderRadius: animatedLayer.borderRadius,
            }}
          />
        </Sequence>
      </div>
    )
  }

  if (animatedLayer.type === 'text') {
    const wheelFade = animatedLayer.textRevealMode === 'wheel-fade'
    return (
          <div
          data-layer-id={animatedLayer.id}
          style={{
          ...wrapperStyle,
          boxShadow: buildLayerSurfaceShadow(animatedLayer, p),
          background: animatedLayer.fillType !== 'none' ? bg : 'transparent',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'stretch',
          fontFamily: animatedLayer.fontFamily,
          fontSize: animatedLayer.fontSize,
          fontWeight: animatedLayer.fontWeight,
          color: animatedLayer.textColor,
          letterSpacing: animatedLayer.letterSpacing,
          lineHeight: animatedLayer.lineHeight,
          padding: '4px 8px',
          borderRadius: animatedLayer.borderRadius,
          boxSizing: 'border-box',
        }}
        onClick={handleClick}
        onDoubleClick={(e) => {
          e.stopPropagation()
          onSelect(e.shiftKey || e.metaKey || e.ctrlKey)
          useStore.getState().setEditingTextLayerId(animatedLayer.id)
        }}
      >
        <div
          style={{
            width: '100%',
            textAlign: animatedLayer.textAlign,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          {wheelFade ? renderWheelText(animatedLayer) : renderAnimatedText(animatedLayer, p.charProgress)}
        </div>
      </div>
    )
  }

  if (animatedLayer.type === 'ellipse') {
    return (
      <div
        data-layer-id={animatedLayer.id}
        style={{
          ...wrapperStyle,
          background: bg,
          borderRadius: '50%',
          border: animatedLayer.strokeEnabled ? `${animatedLayer.strokeWidth}px solid ${animatedLayer.strokeColor}` : undefined,
          boxShadow: buildLayerSurfaceShadow(animatedLayer, p),
        }}
        onClick={handleClick}
      />
    )
  }

  if (animatedLayer.type === 'triangle') {
    return (
      <div
        data-layer-id={animatedLayer.id}
        style={{
          ...wrapperStyle,
          background: bg,
          clipPath: 'polygon(50% 0%, 0% 100%, 100% 100%)',
          filter: [buildFilter(p), buildLayerDropShadow(animatedLayer, p)].filter(Boolean).join(' '),
        }}
        onClick={handleClick}
      />
    )
  }

  if (animatedLayer.type === 'line') {
    return (
      <div
        data-layer-id={animatedLayer.id}
        style={{
          ...wrapperStyle,
          background: animatedLayer.strokeColor,
          borderRadius: animatedLayer.strokeWidth,
          boxShadow: buildLayerSurfaceShadow(animatedLayer, p),
        }}
        onClick={handleClick}
      />
    )
  }

  if (animatedLayer.type === 'path') {
    return (
      <div data-layer-id={animatedLayer.id} style={wrapperStyle} onClick={handleClick}>
        <svg
          width="100%"
          height="100%"
          viewBox={`0 0 ${layerWidth} ${layerHeight}`}
          preserveAspectRatio="none"
          style={{
            display: 'block',
            overflow: 'visible',
            filter: buildLayerDropShadow(animatedLayer, p),
          }}
        >
          <path
            d={animatedLayer.pathData || ''}
            fill={animatedLayer.fillType !== 'none' ? bg : 'none'}
            stroke={animatedLayer.strokeEnabled ? animatedLayer.strokeColor : 'none'}
            strokeWidth={animatedLayer.strokeEnabled ? animatedLayer.strokeWidth : 0}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    )
  }

  // Rectangle (default)
  return (
    <div
      data-layer-id={animatedLayer.id}
      style={{
        ...wrapperStyle,
        background: bg,
        borderRadius: animatedLayer.borderRadius,
        border: animatedLayer.strokeEnabled ? `${animatedLayer.strokeWidth}px solid ${animatedLayer.strokeColor}` : undefined,
        boxShadow: buildLayerSurfaceShadow(animatedLayer, p),
      }}
      onClick={handleClick}
    />
  )
}

function GroupNode({ layer, childrenByParent, frame, canvasWidth, canvasHeight, selectedLayerIds, selectLayer, ancestors }: {
  layer: Layer
  childrenByParent: Map<string | null, Layer[]>
  frame: number
  canvasWidth: number
  canvasHeight: number
  selectedLayerIds: string[]
  selectLayer: (id: string | null, multi?: boolean) => void
  ancestors: Set<string>
}) {
  if (!isLayerActive(layer, frame)) return null

  const resolved = resolveLayerAnimation(layer, frame)
  const animatedLayer = resolved.layer
  const p = resolved.transform
  const bg = getBackground(animatedLayer.fillType, animatedLayer.fillColor, animatedLayer.gradientStops, animatedLayer.gradientAngle)
  const { width: layerWidth, height: layerHeight } = layerSize(animatedLayer, canvasWidth, canvasHeight)
  const children = (childrenByParent.get(layer.id) ?? []).filter((child) => !ancestors.has(child.id))
  const nextAncestors = children.length ? new Set([...ancestors, layer.id]) : ancestors
  const isSelected = selectedLayerIds.includes(layer.id)
  const outerStyle: React.CSSProperties = {
    position: 'absolute',
    left: '50%',
    top: '50%',
    width: layerWidth,
    height: layerHeight,
    marginLeft: -layerWidth / 2,
    marginTop: -layerHeight / 2,
    opacity: p.opacity,
    transform: buildTransform(p),
    transformOrigin: `${p.originX}% ${p.originY}%`,
    transformStyle: 'preserve-3d',
    filter: buildFilter(p),
    pointerEvents: 'none',
  }

  const surfaceStyle: React.CSSProperties = {
    position: 'absolute',
    inset: 0,
    background: animatedLayer.fillType !== 'none' ? bg : 'transparent',
    borderRadius: animatedLayer.borderRadius,
    border: animatedLayer.strokeEnabled ? `${animatedLayer.strokeWidth}px solid ${animatedLayer.strokeColor}` : undefined,
    boxSizing: 'border-box',
    boxShadow: buildLayerSurfaceShadow(animatedLayer, p),
    backdropFilter: p.backdropBlur > 0 ? `blur(${p.backdropBlur}px)` : undefined,
    cursor: 'pointer',
    outline: isSelected ? '2px solid #6366f1' : 'none',
    outlineOffset: '2px',
    pointerEvents: 'auto',
    zIndex: 0,
  }

  const childPlaneStyle: React.CSSProperties = {
    position: 'absolute',
    left: 0,
    top: 0,
    width: layerWidth,
    height: layerHeight,
    transformStyle: 'preserve-3d',
    pointerEvents: 'none',
    zIndex: 1,
  }

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    selectLayer(layer.id, e.shiftKey || e.metaKey || e.ctrlKey)
  }

  return (
    <div data-layer-id={animatedLayer.id} style={outerStyle}>
      <div style={surfaceStyle} onClick={handleClick} />
      <div style={childPlaneStyle}>
        {children.map((child) => (
          <RenderLayerNode
            key={child.id}
            layer={child}
            childrenByParent={childrenByParent}
            frame={frame}
            canvasWidth={canvasWidth}
            canvasHeight={canvasHeight}
            selectedLayerIds={selectedLayerIds}
            selectLayer={selectLayer}
            ancestors={nextAncestors}
          />
        ))}
      </div>
    </div>
  )
}

function RenderLayerNode({ layer, childrenByParent, frame, canvasWidth, canvasHeight, selectedLayerIds, selectLayer, ancestors = new Set<string>() }: {
  layer: Layer
  childrenByParent: Map<string | null, Layer[]>
  frame: number
  canvasWidth: number
  canvasHeight: number
  selectedLayerIds: string[]
  selectLayer: (id: string | null, multi?: boolean) => void
  ancestors?: Set<string>
}) {
  const isGroup = isGroupLayer(layer)

  if (isGroup) {
    return (
      <GroupNode
        layer={layer}
        childrenByParent={childrenByParent}
        frame={frame}
        canvasWidth={canvasWidth}
        canvasHeight={canvasHeight}
        selectedLayerIds={selectedLayerIds}
        selectLayer={selectLayer}
        ancestors={ancestors}
      />
    )
  }

  return (
    <LayerElement
      layer={layer}
      frame={frame}
      canvasWidth={canvasWidth}
      canvasHeight={canvasHeight}
      isSelected={selectedLayerIds.includes(layer.id)}
      onSelect={(multi) => selectLayer(layer.id, multi)}
    />
  )
}

interface CompositionProps {
  layers: Layer[]
  canvasWidth: number
  canvasHeight: number
  backgroundColor?: string
  showOutsideCanvas?: boolean
}

export function EditorComposition({ layers, canvasWidth, canvasHeight, backgroundColor = '#1a1a2e', showOutsideCanvas = false }: CompositionProps) {
  const frame = useCurrentFrame()
  const { selectedLayerIds, selectLayer } = useStore()
  const layerIds = new Set(layers.map((layer) => layer.id))
  const childrenByParent = new Map<string | null, Layer[]>()
  ;[...layers].reverse().forEach((layer) => {
    const parentId = layer.parentId && layerIds.has(layer.parentId) ? layer.parentId : null
    childrenByParent.set(parentId, [...(childrenByParent.get(parentId) ?? []), layer])
  })
  const rootLayers = childrenByParent.get(null) ?? []

  return (
    <div
      style={{ width: canvasWidth, height: canvasHeight, background: backgroundColor, position: 'relative', overflow: showOutsideCanvas ? 'visible' : 'hidden' }}
      onClick={() => selectLayer(null)}
    >
      {rootLayers.map((layer) => (
        <RenderLayerNode
          key={layer.id}
          layer={layer}
          childrenByParent={childrenByParent}
          frame={frame}
          canvasWidth={canvasWidth}
          canvasHeight={canvasHeight}
          selectedLayerIds={selectedLayerIds}
          selectLayer={selectLayer}
        />
      ))}
    </div>
  )
}
