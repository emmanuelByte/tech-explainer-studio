import { useState } from 'react'
import { useStore } from '../store'

export function ExportModal({ onClose }: { onClose: () => void }) {
  const { canvasPreset, customWidth, customHeight, totalFrames, fps } = useStore()
  const [copied, setCopied] = useState(false)
  const isCustom = canvasPreset.name === 'Custom'
  const w = isCustom ? customWidth : canvasPreset.width
  const h = isCustom ? customHeight : canvasPreset.height
  const cmd = `npx remotion render src/remotion/index.ts EditorComposition out/video.mp4 --width=${w} --height=${h} --frames=0-${totalFrames - 1}`

  function copyCmd() {
    navigator.clipboard.writeText(cmd)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: 'rgba(0,0,0,0.7)' }} onClick={onClose}>
      <div className="rounded-xl p-6 max-w-xl w-full mx-4" onClick={(e) => e.stopPropagation()}
        style={{ background: 'var(--panel)', border: '1px solid var(--border)', boxShadow: '0 20px 60px rgba(0,0,0,0.4)' }}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Export MP4</h2>
          <button onClick={onClose} className="text-lg leading-none" style={{ color: 'var(--text3)' }}>×</button>
        </div>
        <p className="text-xs mb-3" style={{ color: 'var(--text2)' }}>
          Run this command in your terminal to render via Remotion CLI:
        </p>
        <div className="rounded-lg p-3 mb-4 font-mono text-xs break-all" style={{ background: 'var(--bg2)', color: '#a5f3fc', border: '1px solid var(--border)' }}>
          {cmd}
        </div>
        <div className="flex gap-2 mb-4">
          {[`${w}×${h}`, `${fps} fps`, `${(totalFrames / fps).toFixed(1)}s`].map((t) => (
            <span key={t} className="text-xs rounded px-2 py-0.5" style={{ background: 'var(--input)', color: 'var(--text2)' }}>{t}</span>
          ))}
        </div>
        <div className="flex gap-2">
          <button onClick={copyCmd} className="flex-1 text-xs rounded px-4 py-2 font-semibold transition-colors"
            style={{ background: copied ? '#22c55e' : '#6366f1', color: '#fff' }}
          >
            {copied ? '✓ Copied!' : 'Copy command'}
          </button>
          <button onClick={onClose} className="text-xs rounded px-4 py-2 transition-colors"
            style={{ background: 'var(--input)', color: 'var(--text2)', border: '1px solid var(--border)' }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
