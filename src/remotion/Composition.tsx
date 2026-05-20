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

function renderAnimatedText(layer: Layer, charProgress: number) {
  const progress = Math.max(0, Math.min(1, charProgress))
  const mode = layer.textRevealMode ?? 'plain'
  if (mode === 'plain') {
    const visible = Math.floor(layer.text.length * progress)
    const displayText = layer.text.slice(0, visible)
    const spans = (layer.textSpans ?? [])
      .filter((span) => span.end > 0 && span.start < displayText.length)
      .sort((a, b) => a.start - b.start)
    const runs: { text: string; style?: typeof spans[number] }[] = []
    let cursor = 0
    spans.forEach((span) => {
      const start = Math.max(0, Math.min(displayText.length, span.start))
      const end = Math.max(start, Math.min(displayText.length, span.end))
      if (start > cursor) runs.push({ text: displayText.slice(cursor, start) })
      if (end > start) runs.push({ text: displayText.slice(start, end), style: span })
      cursor = Math.max(cursor, end)
    })
    if (cursor < displayText.length) runs.push({ text: displayText.slice(cursor) })
    return runs.length ? runs.map((run, idx) => (
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
    )) : displayText
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
    boxShadow: buildBoxShadow(p, animatedLayer.shadowColor, animatedLayer.shadowEnabled),
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
      <div data-layer-id={animatedLayer.id} style={wrapperStyle} onClick={handleClick}>
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
      <div data-layer-id={animatedLayer.id} style={wrapperStyle} onClick={handleClick}>
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
    return (
        <div
          data-layer-id={animatedLayer.id}
          style={{
          ...wrapperStyle,
          background: animatedLayer.fillType !== 'none' ? bg : 'transparent',
          display: 'flex',
          alignItems: 'center',
          justifyContent: animatedLayer.textAlign === 'center' ? 'center' : animatedLayer.textAlign === 'right' ? 'flex-end' : 'flex-start',
          fontFamily: animatedLayer.fontFamily,
          fontSize: animatedLayer.fontSize,
          fontWeight: animatedLayer.fontWeight,
          color: animatedLayer.textColor,
          letterSpacing: animatedLayer.letterSpacing,
          lineHeight: animatedLayer.lineHeight,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          padding: '4px 8px',
          borderRadius: animatedLayer.borderRadius,
        }}
        onClick={handleClick}
        onDoubleClick={(e) => {
          e.stopPropagation()
          onSelect(e.shiftKey || e.metaKey || e.ctrlKey)
          useStore.getState().setEditingTextLayerId(animatedLayer.id)
        }}
      >
        {renderAnimatedText(animatedLayer, p.charProgress)}
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
          style={{ display: 'block', overflow: 'visible' }}
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
    boxShadow: buildBoxShadow(p, animatedLayer.shadowColor, animatedLayer.shadowEnabled),
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
