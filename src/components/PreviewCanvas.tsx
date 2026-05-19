import { useEffect, useRef } from 'react'
import { Player, PlayerRef } from '@remotion/player'
import { useStore } from '../store'
import { EditorComposition } from '../remotion/Composition'
import { Layer, CANVAS_PRESETS } from '../types'

export function PreviewCanvas() {
  const {
    layers, currentFrame, totalFrames, fps,
    canvasPreset, customWidth, customHeight,
    setCanvasPreset, setCustomDimension,
  } = useStore()

  const playerRef = useRef<PlayerRef>(null)
  const isCustom = canvasPreset.name === 'Custom'
  const canvasW = isCustom ? customWidth : canvasPreset.width
  const canvasH = isCustom ? customHeight : canvasPreset.height

  // Drive the Player from store's currentFrame (usePlayback is the source of truth)
  useEffect(() => {
    const player = playerRef.current
    if (!player) return
    if (player.getCurrentFrame() !== currentFrame) {
      player.seekTo(currentFrame)
    }
  }, [currentFrame])

  return (
    <div className="flex flex-col flex-1 min-w-0 items-center bg-[#111]">
      {/* Canvas preset selector */}
      <div className="w-full flex items-center gap-3 px-4 py-2 border-b border-[#2a2a2a] bg-[#161616] flex-wrap">
        <select
          value={canvasPreset.name}
          onChange={(e) => setCanvasPreset(e.target.value)}
          className="bg-[#222] text-xs text-[#ccc] border border-[#333] rounded px-2 py-1 outline-none focus:border-[#6366f1]"
        >
          {CANVAS_PRESETS.map((p) => (
            <option key={p.name} value={p.name}>{p.name}</option>
          ))}
        </select>

        {isCustom ? (
          <div className="flex items-center gap-1">
            <input
              type="number"
              value={customWidth}
              onChange={(e) => setCustomDimension('customWidth', Number(e.target.value))}
              className="w-16 bg-[#222] text-xs text-[#ccc] border border-[#333] rounded px-2 py-1 outline-none"
            />
            <span className="text-[#555] text-xs">×</span>
            <input
              type="number"
              value={customHeight}
              onChange={(e) => setCustomDimension('customHeight', Number(e.target.value))}
              className="w-16 bg-[#222] text-xs text-[#ccc] border border-[#333] rounded px-2 py-1 outline-none"
            />
          </div>
        ) : (
          <span className="text-xs text-[#555]">{canvasW} × {canvasH}</span>
        )}
      </div>

      {/* Preview area */}
      <div className="flex-1 flex items-center justify-center p-4 w-full overflow-hidden">
        <ScaledPlayer
          playerRef={playerRef}
          layers={layers}
          canvasW={canvasW}
          canvasH={canvasH}
          totalFrames={totalFrames}
          fps={fps}
        />
      </div>
    </div>
  )
}

function ScaledPlayer({
  playerRef, layers, canvasW, canvasH, totalFrames, fps,
}: {
  playerRef: React.RefObject<PlayerRef | null>
  layers: Layer[]
  canvasW: number
  canvasH: number
  totalFrames: number
  fps: number
}) {
  return (
    <div className="w-full h-full flex items-center justify-center">
      <div
        style={{
          aspectRatio: `${canvasW} / ${canvasH}`,
          maxWidth: '100%',
          maxHeight: '100%',
          width: canvasW > canvasH ? '100%' : 'auto',
          height: canvasW <= canvasH ? '100%' : 'auto',
          boxShadow: '0 0 0 1px #2a2a2a, 0 8px 32px rgba(0,0,0,0.6)',
          borderRadius: 4,
          overflow: 'hidden',
          flexShrink: 0,
        }}
      >
        <Player
          ref={playerRef}
          component={EditorComposition}
          inputProps={{ layers, canvasWidth: canvasW, canvasHeight: canvasH }}
          durationInFrames={Math.max(totalFrames, 1)}
          fps={fps}
          compositionWidth={canvasW}
          compositionHeight={canvasH}
          style={{ width: '100%', height: '100%' }}
          controls={false}
          loop={false}
        />
      </div>
    </div>
  )
}
