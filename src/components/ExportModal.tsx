import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useStore } from '../store'
import { Modal } from './Modal'

export function ExportModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
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

  const footer = (
    <>
      <button
        onClick={onClose}
        style={{
          height: 30, padding: '0 12px', fontSize: 12, borderRadius: 4,
          background: 'var(--input)', color: 'var(--text2)',
          border: '1px solid var(--input-border)',
        }}
      >
        {t('common.close')}
      </button>
      <button
        onClick={copyCmd}
        className="primary-btn"
        style={{
          height: 30, padding: '0 14px', fontSize: 12,
          background: copied ? '#22c55e' : 'var(--accent)',
        }}
      >
        {copied ? `✓ ${t('common.copied')}` : t('common.copyCommand')}
      </button>
    </>
  )

  return (
    <Modal title={t('exportModal.title')} onClose={onClose} width={560} footer={footer} zIndex={2500}>
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <p style={{ fontSize: 11, color: 'var(--text2)', margin: 0, lineHeight: 1.5 }}>
          {t('exportModal.help')}
        </p>
        <div style={{
          padding: 12, fontFamily: 'monospace', fontSize: 11,
          wordBreak: 'break-all', background: 'var(--bg2)',
          color: 'var(--accent)', border: '1px solid var(--border)', borderRadius: 4,
        }}>
          {cmd}
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[`${w}×${h}`, `${fps} fps`, `${(totalFrames / fps).toFixed(1)}s`].map((s) => (
            <span key={s} style={{ fontSize: 10, padding: '2px 8px', borderRadius: 3, background: 'var(--input)', color: 'var(--text2)', border: '1px solid var(--input-border)' }}>{s}</span>
          ))}
        </div>
      </div>
    </Modal>
  )
}
