import { useCurrentFrame } from 'remotion'
import { Layer, GradientStop, FillType } from '../types'
import { interpolateProps, buildTransform, buildFilter, buildBoxShadow } from './interpolateProps'
import { useStore } from '../store'

function getBackground(fillType: FillType, fillColor: string, stops: GradientStop[], angle: number): string {
  if (fillType === 'none') return 'transparent'
  if (fillType === 'solid') return fillColor
  const stopsStr = stops.map((s) => `${s.color} ${s.position}%`).join(', ')
  if (fillType === 'linear-gradient') return `linear-gradient(${angle}deg, ${stopsStr})`
  if (fillType === 'radial-gradient') return `radial-gradient(circle, ${stopsStr})`
  return fillColor
}

function LayerElement({ layer, frame, isSelected, onSelect }: {
  layer: Layer
  frame: number
  isSelected: boolean
  onSelect: () => void
}) {
  if (!layer.visible) return null

  const p = interpolateProps(frame, layer.keyframes)
  const bg = getBackground(layer.fillType, layer.fillColor, layer.gradientStops, layer.gradientAngle)

  const wrapperStyle: React.CSSProperties = {
    position: 'absolute',
    left: '50%',
    top: '50%',
    width: layer.width,
    height: layer.type === 'line' ? layer.strokeWidth || 2 : layer.height,
    marginLeft: -layer.width / 2,
    marginTop: -(layer.type === 'line' ? layer.strokeWidth || 2 : layer.height) / 2,
    opacity: p.opacity,
    transform: buildTransform(p),
    transformOrigin: `${p.originX}% ${p.originY}%`,
    transformStyle: 'preserve-3d',
    perspective: p.perspective,
    filter: buildFilter(p),
    boxShadow: buildBoxShadow(p, layer.shadowColor, layer.shadowEnabled),
    backdropFilter: p.backdropBlur > 0 ? `blur(${p.backdropBlur}px)` : undefined,
    cursor: 'pointer',
    outline: isSelected ? '2px solid #6366f1' : 'none',
    outlineOffset: '2px',
  }

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    onSelect()
  }

  if (layer.type === 'image' && layer.src) {
    return (
      <div style={wrapperStyle} onClick={handleClick}>
        <img
          src={layer.src}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', borderRadius: layer.borderRadius }}
          alt={layer.name}
        />
      </div>
    )
  }

  if (layer.type === 'text') {
    const visible = Math.floor(layer.text.length * Math.max(0, Math.min(1, p.charProgress)))
    const displayText = layer.text.slice(0, visible)
    return (
      <div
        style={{
          ...wrapperStyle,
          background: layer.fillType !== 'none' ? bg : 'transparent',
          display: 'flex',
          alignItems: 'center',
          justifyContent: layer.textAlign === 'center' ? 'center' : layer.textAlign === 'right' ? 'flex-end' : 'flex-start',
          fontFamily: layer.fontFamily,
          fontSize: layer.fontSize,
          fontWeight: layer.fontWeight,
          color: layer.textColor,
          letterSpacing: layer.letterSpacing,
          lineHeight: layer.lineHeight,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          padding: '4px 8px',
          borderRadius: layer.borderRadius,
        }}
        onClick={handleClick}
      >
        {displayText}
      </div>
    )
  }

  if (layer.type === 'ellipse') {
    return (
      <div
        style={{
          ...wrapperStyle,
          background: bg,
          borderRadius: '50%',
          border: layer.strokeEnabled ? `${layer.strokeWidth}px solid ${layer.strokeColor}` : undefined,
        }}
        onClick={handleClick}
      />
    )
  }

  if (layer.type === 'triangle') {
    return (
      <div
        style={{
          ...wrapperStyle,
          background: bg,
          clipPath: 'polygon(50% 0%, 0% 100%, 100% 100%)',
        }}
        onClick={handleClick}
      />
    )
  }

  if (layer.type === 'line') {
    return (
      <div
        style={{
          ...wrapperStyle,
          background: layer.strokeColor,
          borderRadius: layer.strokeWidth,
        }}
        onClick={handleClick}
      />
    )
  }

  // Rectangle (default)
  return (
    <div
      style={{
        ...wrapperStyle,
        background: bg,
        borderRadius: layer.borderRadius,
        border: layer.strokeEnabled ? `${layer.strokeWidth}px solid ${layer.strokeColor}` : undefined,
      }}
      onClick={handleClick}
    />
  )
}

interface CompositionProps {
  layers: Layer[]
  canvasWidth: number
  canvasHeight: number
}

export function EditorComposition({ layers, canvasWidth, canvasHeight }: CompositionProps) {
  const frame = useCurrentFrame()
  const { selectedLayerIds, selectLayer } = useStore()

  return (
    <div
      style={{ width: canvasWidth, height: canvasHeight, background: '#1a1a2e', position: 'relative', overflow: 'hidden' }}
      onClick={() => selectLayer(null)}
    >
      {[...layers].reverse().map((layer) => (
        <LayerElement
          key={layer.id}
          layer={layer}
          frame={frame}
          isSelected={selectedLayerIds.includes(layer.id)}
          onSelect={() => selectLayer(layer.id)}
        />
      ))}
    </div>
  )
}
