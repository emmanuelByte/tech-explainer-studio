import { useEffect, useMemo, useRef, useState } from 'react'
import { Player, PlayerRef } from '@remotion/player'
import { Pause, Play, RotateCcw, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { EditorComposition } from '../remotion/Composition'
import { useStore } from '../store'

function formatTime(frame: number, fps: number) {
  const safeFps = Math.max(fps, 1)
  const seconds = Math.max(frame, 0) / safeFps
  const minutes = Math.floor(seconds / 60)
  const wholeSeconds = Math.floor(seconds % 60)
  const tenth = Math.floor((seconds - Math.floor(seconds)) * 10)
  return `${minutes}:${String(wholeSeconds).padStart(2, '0')}.${tenth}`
}

function useViewportSize() {
  const [size, setSize] = useState(() => ({
    width: typeof window === 'undefined' ? 1280 : window.innerWidth,
    height: typeof window === 'undefined' ? 720 : window.innerHeight,
  }))

  useEffect(() => {
    const update = () => setSize({ width: window.innerWidth, height: window.innerHeight })
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  return size
}

export function PreviewModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const playerRef = useRef<PlayerRef>(null)
  const {
    layers,
    currentFrame,
    totalFrames,
    fps,
    canvasPreset,
    customWidth,
    customHeight,
    canvasBackgroundColor,
    showOutsideCanvas,
  } = useStore()
  const viewport = useViewportSize()
  const isCustom = canvasPreset.name === 'Custom'
  const canvasW = isCustom ? customWidth : canvasPreset.width
  const canvasH = isCustom ? customHeight : canvasPreset.height
  const duration = Math.max(totalFrames, 1)
  const initialFrame = Math.min(Math.max(currentFrame, 0), duration - 1)
  const [frame, setFrame] = useState(initialFrame)
  const [playing, setPlaying] = useState(false)

  const previewSize = useMemo(() => {
    const maxWidth = Math.max(320, viewport.width - 64)
    const maxHeight = Math.max(240, viewport.height - 156)
    const scale = Math.min(maxWidth / canvasW, maxHeight / canvasH)
    return {
      width: Math.max(1, Math.round(canvasW * scale)),
      height: Math.max(1, Math.round(canvasH * scale)),
      scale,
    }
  }, [canvasH, canvasW, viewport.height, viewport.width])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
      if (event.key === ' ' && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault()
        playerRef.current?.toggle()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  useEffect(() => {
    let cleanup = () => {}
    const raf = window.requestAnimationFrame(() => {
      const player = playerRef.current
      if (!player) return

      const onFrameUpdate = ({ detail }: { detail: { frame: number } }) => setFrame(detail.frame)
      const onPlay = () => setPlaying(true)
      const onPause = () => setPlaying(false)
      const onEnded = () => setPlaying(false)

      player.seekTo(initialFrame)
      player.addEventListener('frameupdate', onFrameUpdate)
      player.addEventListener('play', onPlay)
      player.addEventListener('pause', onPause)
      player.addEventListener('ended', onEnded)

      cleanup = () => {
        player.removeEventListener('frameupdate', onFrameUpdate)
        player.removeEventListener('play', onPlay)
        player.removeEventListener('pause', onPause)
        player.removeEventListener('ended', onEnded)
      }
    })

    return () => {
      window.cancelAnimationFrame(raf)
      cleanup()
    }
  }, [initialFrame])

  function seekTo(nextFrame: number) {
    const clamped = Math.min(Math.max(Math.round(nextFrame), 0), duration - 1)
    playerRef.current?.seekTo(clamped)
    setFrame(clamped)
  }

  function togglePlayback() {
    playerRef.current?.toggle()
  }

  function restart() {
    seekTo(0)
    playerRef.current?.pause()
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('topbar.preview')}
      onMouseDown={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 5000,
        background: 'rgba(5, 7, 12, 0.78)',
        backdropFilter: 'blur(12px)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 32,
        color: '#f8fafc',
      }}
    >
      <div
        onMouseDown={(event) => event.stopPropagation()}
        style={{
          width: previewSize.width,
          maxWidth: '100%',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700 }}>{t('topbar.preview')}</div>
            <div style={{ fontSize: 11, color: 'rgba(226, 232, 240, 0.7)', marginTop: 2 }}>
              {canvasW}x{canvasH} · {Math.round(previewSize.scale * 100)}%
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="icon-btn"
            title={t('common.closeEsc')}
            style={{ color: '#f8fafc', background: 'rgba(255,255,255,0.08)' }}
          >
            <X size={16} />
          </button>
        </div>

        <div
          style={{
            width: previewSize.width,
            height: previewSize.height,
            background: '#020617',
            borderRadius: 8,
            overflow: showOutsideCanvas ? 'visible' : 'hidden',
            boxShadow: '0 28px 90px rgba(0, 0, 0, 0.46), 0 0 0 1px rgba(255, 255, 255, 0.12)',
          }}
        >
          <Player
            ref={playerRef}
            component={EditorComposition}
            inputProps={{ layers, canvasWidth: canvasW, canvasHeight: canvasH, backgroundColor: canvasBackgroundColor, showOutsideCanvas }}
            durationInFrames={duration}
            fps={fps}
            compositionWidth={canvasW}
            compositionHeight={canvasH}
            overflowVisible={showOutsideCanvas}
            style={{ width: '100%', height: '100%', overflow: showOutsideCanvas ? 'visible' : 'hidden' }}
            controls={false}
            loop={false}
            acknowledgeRemotionLicense
          />
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'auto auto 1fr auto',
            alignItems: 'center',
            gap: 10,
            minHeight: 44,
            padding: '8px 10px',
            borderRadius: 8,
            background: 'rgba(15, 23, 42, 0.76)',
            boxShadow: '0 10px 34px rgba(0, 0, 0, 0.25), inset 0 0 0 1px rgba(255, 255, 255, 0.1)',
          }}
        >
          <button
            type="button"
            onClick={togglePlayback}
            className="icon-btn"
            title={playing ? t('common.pause') : t('common.play')}
            style={{ color: '#f8fafc', background: 'rgba(255,255,255,0.1)' }}
          >
            {playing ? <Pause size={16} /> : <Play size={16} />}
          </button>
          <button
            type="button"
            onClick={restart}
            className="icon-btn"
            title={t('common.restart')}
            style={{ color: '#cbd5e1', background: 'transparent' }}
          >
            <RotateCcw size={15} />
          </button>
          <input
            type="range"
            min={0}
            max={duration - 1}
            value={Math.min(frame, duration - 1)}
            onChange={(event) => seekTo(Number(event.currentTarget.value))}
            style={{
              width: '100%',
              accentColor: '#38bdf8',
              cursor: 'pointer',
            }}
          />
          <div style={{ fontSize: 11, color: '#cbd5e1', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
            {formatTime(frame, fps)} / {formatTime(duration - 1, fps)}
          </div>
        </div>
      </div>
    </div>
  )
}
