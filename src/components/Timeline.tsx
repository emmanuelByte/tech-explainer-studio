import { useRef, useCallback } from 'react'
import { useStore } from '../store'

const FRAME_WIDTH = 4  // px per frame
const ROW_HEIGHT = 28
const RULER_HEIGHT = 24
const LABEL_WIDTH = 120

function PlayIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
      <polygon points="5,3 19,12 5,21" />
    </svg>
  )
}

function PauseIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
      <rect x="6" y="4" width="4" height="16" />
      <rect x="14" y="4" width="4" height="16" />
    </svg>
  )
}

function Ruler({ totalFrames, fps }: { totalFrames: number; fps: number }) {
  const marks: React.ReactNode[] = []
  const every = fps  // major mark every second
  for (let f = 0; f <= totalFrames; f += every) {
    const seconds = Math.round(f / fps)
    marks.push(
      <div
        key={f}
        style={{ position: 'absolute', left: f * FRAME_WIDTH, top: 0, height: RULER_HEIGHT }}
        className="flex flex-col items-start"
      >
        <div className="w-px h-2 bg-[#444] mt-auto" />
        <span className="text-[9px] text-[#555] pl-0.5">{seconds}s</span>
      </div>
    )
  }
  // minor marks every 5 frames
  for (let f = 0; f <= totalFrames; f += 5) {
    if (f % every === 0) continue
    marks.push(
      <div
        key={`m${f}`}
        style={{ position: 'absolute', left: f * FRAME_WIDTH, top: RULER_HEIGHT - 6 }}
        className="w-px h-1.5 bg-[#333]"
      />
    )
  }
  return (
    <div
      style={{ position: 'relative', height: RULER_HEIGHT, width: totalFrames * FRAME_WIDTH }}
      className="select-none"
    >
      {marks}
    </div>
  )
}

export function Timeline() {
  const {
    layers, currentFrame, totalFrames, fps, isPlaying,
    setCurrentFrame, setPlaying, setTotalFrames,
    selectedLayerId, selectLayer, removeKeyframe,
  } = useStore()

  const scrollRef = useRef<HTMLDivElement>(null)
  const isDragging = useRef(false)

  const totalWidth = totalFrames * FRAME_WIDTH

  const frameFromX = useCallback((clientX: number) => {
    const el = scrollRef.current
    if (!el) return 0
    const rect = el.getBoundingClientRect()
    const x = clientX - rect.left + el.scrollLeft
    return Math.max(0, Math.min(totalFrames - 1, Math.round(x / FRAME_WIDTH)))
  }, [totalFrames])

  function onMouseDown(e: React.MouseEvent) {
    isDragging.current = true
    setCurrentFrame(frameFromX(e.clientX))
  }

  function onMouseMove(e: React.MouseEvent) {
    if (!isDragging.current) return
    setCurrentFrame(frameFromX(e.clientX))
  }

  function onMouseUp() { isDragging.current = false }

  const durationSec = Math.round(totalFrames / fps)

  return (
    <div
      className="flex flex-col bg-[#141414] border-t border-[#2a2a2a]"
      style={{ height: RULER_HEIGHT + ROW_HEIGHT * Math.max(layers.length, 1) + 40 }}
    >
      {/* Controls bar */}
      <div className="flex items-center gap-3 px-3 py-2 border-b border-[#2a2a2a]">
        <button
          onClick={() => setPlaying(!isPlaying)}
          className="flex items-center justify-center w-7 h-7 rounded bg-[#6366f1] hover:bg-[#4f52c8] text-white transition-colors"
        >
          {isPlaying ? <PauseIcon /> : <PlayIcon />}
        </button>

        <div className="text-xs text-[#555] font-mono w-20">
          {currentFrame} / {totalFrames - 1}
        </div>

        <div className="flex items-center gap-1.5 ml-auto">
          <span className="text-xs text-[#555]">Duration</span>
          <input
            type="number"
            value={durationSec}
            min={1}
            max={300}
            onChange={(e) => setTotalFrames(Math.max(1, Number(e.target.value)) * fps)}
            className="w-12 bg-[#222] text-xs text-[#ccc] border border-[#333] rounded px-2 py-1 outline-none"
          />
          <span className="text-xs text-[#555]">sec</span>
        </div>
      </div>

      {/* Scrollable track area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Layer labels column */}
        <div
          className="flex flex-col flex-shrink-0 border-r border-[#2a2a2a]"
          style={{ width: LABEL_WIDTH }}
        >
          <div style={{ height: RULER_HEIGHT }} className="border-b border-[#2a2a2a]" />
          {layers.map((layer) => (
            <div
              key={layer.id}
              style={{ height: ROW_HEIGHT }}
              onClick={() => selectLayer(layer.id)}
              className={`flex items-center px-2 cursor-pointer border-b border-[#1e1e1e] ${
                selectedLayerId === layer.id ? 'bg-[#1e1e3a]' : 'hover:bg-[#1a1a1a]'
              }`}
            >
              <div
                className="w-2 h-2 rounded-sm mr-2 flex-shrink-0"
                style={{ background: layer.color || '#555' }}
              />
              <span className="text-[10px] text-[#888] truncate">{layer.name}</span>
            </div>
          ))}
        </div>

        {/* Scrollable ruler + tracks */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-x-auto overflow-y-hidden relative select-none"
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseUp}
        >
          <div style={{ width: totalWidth, position: 'relative' }}>
            {/* Ruler */}
            <div className="border-b border-[#2a2a2a]">
              <Ruler totalFrames={totalFrames} fps={fps} />
            </div>

            {/* Tracks */}
            {layers.map((layer) => (
              <div
                key={layer.id}
                style={{ height: ROW_HEIGHT, position: 'relative', width: totalWidth }}
                className="border-b border-[#1e1e1e]"
              >
                {/* track background bar */}
                <div
                  className="absolute inset-y-0"
                  style={{
                    left: 0,
                    right: 0,
                    background: selectedLayerId === layer.id ? 'rgba(99,102,241,0.06)' : undefined,
                  }}
                />
                {/* Keyframe diamonds */}
                {layer.keyframes.map((kf) => (
                  <div
                    key={kf.frame}
                    className={`keyframe-diamond ${kf.frame === currentFrame ? 'selected' : ''}`}
                    style={{ left: kf.frame * FRAME_WIDTH }}
                    title={`Frame ${kf.frame}`}
                    onDoubleClick={(e) => {
                      e.stopPropagation()
                      removeKeyframe(layer.id, kf.frame)
                    }}
                    onClick={(e) => {
                      e.stopPropagation()
                      setCurrentFrame(kf.frame)
                      selectLayer(layer.id)
                    }}
                  />
                ))}
              </div>
            ))}

            {/* Playhead */}
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: currentFrame * FRAME_WIDTH,
                width: 1,
                bottom: 0,
                background: '#ef4444',
                pointerEvents: 'none',
                zIndex: 10,
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  left: -5,
                  width: 10,
                  height: 10,
                  background: '#ef4444',
                  clipPath: 'polygon(50% 100%, 0 0, 100% 0)',
                  transform: 'scaleY(-1)',
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
