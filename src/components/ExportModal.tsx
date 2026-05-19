import { useStore } from '../store'

interface Props {
  onClose: () => void
}

export function ExportModal({ onClose }: Props) {
  const { canvasPreset, customWidth, customHeight, totalFrames, fps } = useStore()
  const isCustom = canvasPreset.name === 'Custom'
  const w = isCustom ? customWidth : canvasPreset.width
  const h = isCustom ? customHeight : canvasPreset.height

  const cmd = `npx remotion render src/remotion/index.ts EditorComposition out/video.mp4 --width=${w} --height=${h} --frames=0-${totalFrames - 1}`

  function copyCmd() {
    navigator.clipboard.writeText(cmd)
  }

  return (
    <div
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-[#1a1a1a] border border-[#333] rounded-lg p-6 max-w-xl w-full mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-white">Export MP4</h2>
          <button onClick={onClose} className="text-[#666] hover:text-white text-lg leading-none">×</button>
        </div>

        <p className="text-xs text-[#888] mb-3">
          Browser-side MP4 encoding isn't supported yet. Run this command in your terminal to render via Remotion CLI:
        </p>

        <div className="bg-[#0d0d0d] border border-[#2a2a2a] rounded p-3 font-mono text-[11px] text-[#a5f3fc] break-all mb-4">
          {cmd}
        </div>

        <div className="flex gap-2 text-xs text-[#666] mb-4">
          <span className="bg-[#222] rounded px-2 py-0.5">{w}×{h}</span>
          <span className="bg-[#222] rounded px-2 py-0.5">{fps} fps</span>
          <span className="bg-[#222] rounded px-2 py-0.5">{(totalFrames / fps).toFixed(1)}s</span>
        </div>

        <div className="flex gap-2">
          <button
            onClick={copyCmd}
            className="flex-1 text-xs bg-[#6366f1] hover:bg-[#4f52c8] text-white rounded px-4 py-2 transition-colors"
          >
            Copy command
          </button>
          <button
            onClick={onClose}
            className="text-xs bg-[#2a2a2a] hover:bg-[#333] text-[#ccc] rounded px-4 py-2 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
