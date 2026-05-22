import { useEffect, useRef } from 'react'
import { OffthreadVideo, Sequence, getRemotionEnvironment, useCurrentFrame, useVideoConfig } from 'remotion'
import { Layer, GradientStop, FillType, VideoSegment } from '../types'
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

function layerBorderRadius(layer: Layer): number | string {
  const tl = layer.borderTopLeftRadius ?? layer.borderRadius
  const tr = layer.borderTopRightRadius ?? layer.borderRadius
  const br = layer.borderBottomRightRadius ?? layer.borderRadius
  const bl = layer.borderBottomLeftRadius ?? layer.borderRadius
  if (tl === tr && tr === br && br === bl) return tl
  return `${tl}px ${tr}px ${br}px ${bl}px`
}

function layerShapeClipStyle(layer: Layer): React.CSSProperties {
  if (layer.type === 'ellipse') return { borderRadius: '50%' }
  if (layer.type === 'triangle') return { clipPath: 'polygon(50% 0%, 0% 100%, 100% 100%)' }
  if (layer.type === 'path' && layer.pathClosed && layer.pathData) {
    return { clipPath: `path('${layer.pathData.replace(/'/g, "\\'")}')` }
  }
  return { borderRadius: layerBorderRadius(layer) }
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

function activeSegmentAt(layer: Layer, frame: number) {
  return layer.videoSegments?.find((segment) =>
    frame >= segment.timelineStartFrame && frame < segment.timelineEndFrame
  ) ?? null
}

// Delegate to the shared integrator so segments with speed keyframes
// (including freeze / speed-ramp / 2× etc.) play back identically here
// as the panel UI displays them.
import { sourceTimeAt as integratedSourceTimeAt } from './videoSegments'
function sourceTimeAt(segment: VideoSegment, frame: number, fps: number) {
  if (fps <= 0) return 0
  return integratedSourceTimeAt(segment, frame, fps)
}

function TimelineSyncedVideo({ layerId, src, frame, segment, style }: {
  layerId: string
  src: string
  frame: number
  segment: VideoSegment
  style: React.CSSProperties
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const { fps } = useVideoConfig()
  // Keep latest target in a ref so async metadata-ready listeners seek to
  // the CURRENT scrub position, not a stale one captured at mount.
  const pendingTargetRef = useRef(0)
  const reportedSourceDurationRef = useRef<number | null>(null)

  useEffect(() => {
    const video = videoRef.current
    if (!video || fps <= 0) return

    const targetTime = Math.max(0, sourceTimeAt(segment, frame, fps))
    pendingTargetRef.current = targetTime

    // duration === NaN means metadata isn't loaded yet; browsers silently
    // reject `currentTime = X` in that state. Wait for it via multiple
    // events because different containers fire different ones.
    const isReady = () =>
      Number.isFinite(video.duration) && video.duration > 0 && video.readyState >= 2;

    const updateSourceDuration = () => {
      if (!Number.isFinite(video.duration) || video.duration <= 0) return
      const sourceDurationFrames = Math.max(0, Math.round(video.duration * fps))
      if (reportedSourceDurationRef.current === sourceDurationFrames) return
      reportedSourceDurationRef.current = sourceDurationFrames
      useStore.getState().setLayerSourceDuration(layerId, sourceDurationFrames)
    }

    const seek = () => {
      updateSourceDuration()
      const target = pendingTargetRef.current
      if (!Number.isFinite(target)) return
      if (Number.isFinite(video.duration) && target > video.duration) return
      const tolerance = Math.min(0.005, 1 / (fps * 4))

      if (Math.abs(video.currentTime - target) <= tolerance) return
      try {
        video.currentTime = target
      } catch(e) {console.log(e);
        // Will be retried by the listeners below as buffer grows.
      }
    }

    if (isReady()) {
      seek()
      return
    }

    const onReady = () => { if (isReady()) seek() }
    video.addEventListener('loadedmetadata', onReady)
    video.addEventListener('durationchange', onReady)
    video.addEventListener('loadeddata', onReady)
    video.addEventListener('canplay', onReady)
    video.addEventListener('progress', onReady)

    // Some browsers wait for explicit play() before fetching metadata.
    // Force a load and ensure preload allows metadata fetching.
    if (video.preload === 'none') video.preload = 'metadata'
    if (video.readyState === 0) {
      try { video.load() } catch { /* ignore */ }
    }

    return () => {
      video.removeEventListener('loadedmetadata', onReady)
      video.removeEventListener('durationchange', onReady)
      video.removeEventListener('loadeddata', onReady)
      video.removeEventListener('canplay', onReady)
      video.removeEventListener('progress', onReady)
    }
  }, [fps, frame, layerId, src, segment.sourceStartFrame, segment.sourceEndFrame, segment.timelineStartFrame, segment.timelineEndFrame, segment.speedKeyframes])

  // Use a native <video> element instead of Remotion's <Video> because
  // Remotion auto-appends `#t=start,end` media fragment to the URL when
  // placed inside a <Sequence>, which makes the media non-seekable and
  // forces video.duration to NaN. We manage the seek ourselves via the
  // effect above, so Remotion's frame-sync isn't needed here.
  return (
    <video
      ref={videoRef}
      src={src}
      style={style}
      preload="auto"
      muted
      playsInline
      // disable native controls + native autoplay — we drive currentTime
      // manually from the composition frame.
    />
  )
}

/**
 * Audio counterpart of TimelineSyncedVideo. Same seek/sync logic, but
 * renders an HTMLAudioElement and respects `volume` + `muted` props.
 * Audio layers don't render visually — the parent LayerElement gives
 * this component zero-size container styles.
 */
function TimelineSyncedAudio({ layerId, src, frame, segment, volume, muted }: {
  layerId: string
  src: string
  frame: number
  segment: VideoSegment
  volume: number
  muted: boolean
}) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const { fps } = useVideoConfig()
  const pendingTargetRef = useRef(0)
  const reportedSourceDurationRef = useRef<number | null>(null)

  // Apply volume + muted whenever they change.
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    audio.volume = Math.max(0, Math.min(1, volume))
    audio.muted = muted
  }, [volume, muted])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio || fps <= 0) return

    const targetTime = Math.max(0, sourceTimeAt(segment, frame, fps))
    pendingTargetRef.current = targetTime

    const isReady = () =>
      Number.isFinite(audio.duration) && audio.duration > 0 && audio.readyState >= 2

    const updateSourceDuration = () => {
      if (!Number.isFinite(audio.duration) || audio.duration <= 0) return
      const sourceDurationFrames = Math.max(0, Math.round(audio.duration * fps))
      if (reportedSourceDurationRef.current === sourceDurationFrames) return
      reportedSourceDurationRef.current = sourceDurationFrames
      useStore.getState().setLayerSourceDuration(layerId, sourceDurationFrames)
    }

    const seek = () => {
      updateSourceDuration()
      const target = pendingTargetRef.current
      if (!Number.isFinite(target)) return
      if (Number.isFinite(audio.duration) && target > audio.duration) return
      const tolerance = Math.min(0.005, 1 / (fps * 4))
      if (Math.abs(audio.currentTime - target) <= tolerance) return
      try { audio.currentTime = target } catch { /* retry later */ }
    }

    if (isReady()) { seek(); return }

    const onReady = () => { if (isReady()) seek() }
    audio.addEventListener('loadedmetadata', onReady)
    audio.addEventListener('durationchange', onReady)
    audio.addEventListener('loadeddata', onReady)
    audio.addEventListener('canplay', onReady)
    audio.addEventListener('progress', onReady)

    if (audio.preload === 'none') audio.preload = 'metadata'
    if (audio.readyState === 0) { try { audio.load() } catch { /* ignore */ } }

    return () => {
      audio.removeEventListener('loadedmetadata', onReady)
      audio.removeEventListener('durationchange', onReady)
      audio.removeEventListener('loadeddata', onReady)
      audio.removeEventListener('canplay', onReady)
      audio.removeEventListener('progress', onReady)
    }
  }, [fps, frame, layerId, src, segment.sourceStartFrame, segment.sourceEndFrame, segment.timelineStartFrame, segment.timelineEndFrame, segment.speedKeyframes])

  return <audio ref={audioRef} src={src} preload="auto" />
}

function LayerElement({ layer, frame, canvasWidth, canvasHeight, isSelected, onSelect, stackIndex }: {
  layer: Layer
  frame: number
  canvasWidth: number
  canvasHeight: number
  isSelected: boolean
  onSelect: (multi: boolean) => void
  stackIndex: number
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
    filter: buildFilter(p),
    backdropFilter: p.backdropBlur > 0 ? `blur(${p.backdropBlur}px)` : undefined,
    cursor: 'pointer',
    outline: isSelected ? '2px solid #6366f1' : 'none',
    outlineOffset: '2px',
    pointerEvents: 'auto',
    zIndex: stackIndex,
  }

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    onSelect(e.shiftKey || e.metaKey || e.ctrlKey)
  }

  if (animatedLayer.type === 'image' && animatedLayer.src) {
    const radius = layerBorderRadius(animatedLayer)
    const imageSrc = animatedLayer.imageKind === 'svg'
      ? styledSvgDataUrl(animatedLayer.src, animatedLayer)
      : animatedLayer.src
    return (
      <div
        data-layer-id={animatedLayer.id}
        style={{
          ...wrapperStyle,
          borderRadius: radius,
          overflow: 'hidden',
          boxShadow: buildLayerSurfaceShadow(animatedLayer, p),
        }}
        onClick={handleClick}
      >
        <img
          src={imageSrc}
          style={{ width: '100%', height: '100%', objectFit: animatedLayer.imageFit ?? 'contain', display: 'block', borderRadius: radius }}
          alt={animatedLayer.name}
        />
      </div>
    )
  }

  if (animatedLayer.type === 'audio' && animatedLayer.src) {
    const activeSegment = activeSegmentAt(animatedLayer, frame)
    if (!activeSegment) return null
    const durationInFrames = Math.max(1, (animatedLayer.endFrame ?? frame + 1) - (animatedLayer.startFrame ?? 0) + 1)
    return (
      // Audio has no visible footprint, but we still need the wrapper so
      // selection / clicks work. Use absolute 0×0 box positioned off-canvas
      // — the HTMLAudioElement plays via the parent Player's pause/play state.
      <div data-layer-id={animatedLayer.id} style={{ position: 'absolute', width: 0, height: 0, pointerEvents: 'none' }}>
        <Sequence from={animatedLayer.startFrame ?? 0} durationInFrames={durationInFrames} layout="none">
          <TimelineSyncedAudio
            layerId={animatedLayer.id}
            src={animatedLayer.src}
            frame={frame}
            segment={activeSegment}
            volume={animatedLayer.audioVolume ?? 1}
            muted={!!animatedLayer.audioMuted}
          />
        </Sequence>
      </div>
    )
  }

  if (animatedLayer.type === 'video' && animatedLayer.src) {
    const activeSegment = activeSegmentAt(animatedLayer, frame)
    if (!activeSegment) return null
    const radius = layerBorderRadius(animatedLayer)
    const durationInFrames = Math.max(1, (animatedLayer.endFrame ?? frame + 1) - (animatedLayer.startFrame ?? 0) + 1)
    const isRendering = getRemotionEnvironment().isRendering
    const activeSegmentDuration = Math.max(1, activeSegment.timelineEndFrame - activeSegment.timelineStartFrame)
    return (
      <div
        data-layer-id={animatedLayer.id}
        style={{
          ...wrapperStyle,
          borderRadius: radius,
          overflow: 'hidden',
          boxShadow: buildLayerSurfaceShadow(animatedLayer, p),
        }}
        onClick={handleClick}
      >
        <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', borderRadius: 'inherit', zIndex: 0 }}>
          {isRendering ? (
            <Sequence from={activeSegment.timelineStartFrame} durationInFrames={activeSegmentDuration} layout="none">
              <OffthreadVideo
                src={animatedLayer.src}
                startFrom={Math.max(0, Math.round(activeSegment.sourceStartFrame))}
                endAt={Math.max(1, Math.round(activeSegment.sourceEndFrame))}
                muted
                style={{
                  position: 'absolute',
                  inset: 0,
                  width: '100%',
                  height: '100%',
                  objectFit: animatedLayer.imageFit ?? 'contain',
                  display: 'block',
                  borderRadius: 'inherit',
                  pointerEvents: 'none',
                }}
              />
            </Sequence>
          ) : (
            <Sequence from={animatedLayer.startFrame ?? 0} durationInFrames={durationInFrames} layout="none">
              <TimelineSyncedVideo
                layerId={animatedLayer.id}
                src={animatedLayer.src}
                frame={frame}
                segment={activeSegment}
                style={{
                  position: 'absolute',
                  inset: 0,
                  width: '100%',
                  height: '100%',
                  objectFit: animatedLayer.imageFit ?? 'contain',
                  display: 'block',
                  borderRadius: 'inherit',
                  pointerEvents: 'none',
                }}
              />
            </Sequence>
          )}
        </div>
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
          borderRadius: layerBorderRadius(animatedLayer),
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
        borderRadius: layerBorderRadius(animatedLayer),
        border: animatedLayer.strokeEnabled ? `${animatedLayer.strokeWidth}px solid ${animatedLayer.strokeColor}` : undefined,
        boxShadow: buildLayerSurfaceShadow(animatedLayer, p),
      }}
      onClick={handleClick}
    />
  )
}

function GroupNode({ layer, childrenByParent, frame, canvasWidth, canvasHeight, selectedLayerIds, selectLayer, ancestors, stackIndex }: {
  layer: Layer
  childrenByParent: Map<string | null, Layer[]>
  frame: number
  canvasWidth: number
  canvasHeight: number
  selectedLayerIds: string[]
  selectLayer: (id: string | null, multi?: boolean) => void
  ancestors: Set<string>
  stackIndex: number
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
  const shapeStyle = layerShapeClipStyle(animatedLayer)
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
    filter: buildFilter(p),
    pointerEvents: 'none',
    zIndex: stackIndex,
  }

  const surfaceStyle: React.CSSProperties = {
    position: 'absolute',
    inset: 0,
    background: animatedLayer.fillType !== 'none' ? bg : 'transparent',
    ...shapeStyle,
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
    pointerEvents: 'none',
    zIndex: 1,
    ...(animatedLayer.clipChildren ? { overflow: 'hidden', ...shapeStyle } : {}),
  }

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    selectLayer(layer.id, e.shiftKey || e.metaKey || e.ctrlKey)
  }

  return (
    <div data-layer-id={animatedLayer.id} style={outerStyle}>
      <div style={surfaceStyle} onClick={handleClick} />
      <div style={childPlaneStyle}>
        {children.map((child, index) => (
          <div
            key={child.id}
            style={{
              position: 'absolute',
              inset: 0,
              zIndex: children.length - index,
              pointerEvents: 'none',
            }}
          >
            <RenderLayerNode
              layer={child}
              childrenByParent={childrenByParent}
              frame={frame}
              canvasWidth={canvasWidth}
              canvasHeight={canvasHeight}
              selectedLayerIds={selectedLayerIds}
              selectLayer={selectLayer}
              ancestors={nextAncestors}
              stackIndex={0}
            />
          </div>
        ))}
      </div>
    </div>
  )
}

function RenderLayerNode({ layer, childrenByParent, frame, canvasWidth, canvasHeight, selectedLayerIds, selectLayer, ancestors = new Set<string>(), stackIndex = 0 }: {
  layer: Layer
  childrenByParent: Map<string | null, Layer[]>
  frame: number
  canvasWidth: number
  canvasHeight: number
  selectedLayerIds: string[]
  selectLayer: (id: string | null, multi?: boolean) => void
  ancestors?: Set<string>
  stackIndex?: number
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
        stackIndex={stackIndex}
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
      stackIndex={stackIndex}
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
  layers.forEach((layer) => {
    const parentId = layer.parentId && layerIds.has(layer.parentId) ? layer.parentId : null
    childrenByParent.set(parentId, [...(childrenByParent.get(parentId) ?? []), layer])
  })
  const rootLayers = childrenByParent.get(null) ?? []

  return (
    <div
      style={{ width: canvasWidth, height: canvasHeight, background: backgroundColor, position: 'relative', overflow: showOutsideCanvas ? 'visible' : 'hidden' }}
      onClick={() => selectLayer(null)}
    >
      {rootLayers.map((layer, index) => (
        <RenderLayerNode
          key={layer.id}
          layer={layer}
          childrenByParent={childrenByParent}
          frame={frame}
          canvasWidth={canvasWidth}
          canvasHeight={canvasHeight}
          selectedLayerIds={selectedLayerIds}
          selectLayer={selectLayer}
          stackIndex={rootLayers.length - index}
        />
      ))}
    </div>
  )
}
