import { useCurrentFrame } from 'remotion'
import { Layer } from '../types'
import { interpolateProps, buildTransform } from './interpolateProps'

interface CompositionProps {
  layers: Layer[]
  canvasWidth: number
  canvasHeight: number
}

function LayerElement({ layer, frame }: { layer: Layer; frame: number }) {
  if (!layer.visible) return null

  const p = interpolateProps(frame, layer.keyframes)

  const wrapperStyle: React.CSSProperties = {
    position: 'absolute',
    left: '50%',
    top: '50%',
    width: layer.width,
    height: layer.height,
    marginLeft: -layer.width / 2,
    marginTop: -layer.height / 2,
    opacity: p.opacity,
    perspective: p.perspective,
    transform: buildTransform(p),
    transformStyle: 'preserve-3d',
  }

  if (layer.type === 'image' && layer.src) {
    return (
      <div style={wrapperStyle}>
        <img
          src={layer.src}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          alt={layer.name}
        />
      </div>
    )
  }

  return (
    <div style={{ ...wrapperStyle, background: layer.color, borderRadius: 4 }} />
  )
}

export function EditorComposition({ layers, canvasWidth, canvasHeight }: CompositionProps) {
  const frame = useCurrentFrame()

  return (
    <div
      style={{
        width: canvasWidth,
        height: canvasHeight,
        background: '#1a1a2e',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {[...layers].reverse().map((layer) => (
        <LayerElement key={layer.id} layer={layer} frame={frame} />
      ))}
    </div>
  )
}
