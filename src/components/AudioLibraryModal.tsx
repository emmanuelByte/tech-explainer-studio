import { useEffect, useRef, useState } from 'react'
import { Music, RefreshCw, Upload, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { AudioAsset, listAudioAssets, uploadAudioAsset } from '../assetStorage'

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function formatDuration(seconds?: number) {
  if (!seconds || !Number.isFinite(seconds)) return ''
  const mins = Math.floor(seconds / 60)
  const secs = Math.round(seconds % 60).toString().padStart(2, '0')
  return `${mins}:${secs}`
}

export function AudioLibraryModal({
  onClose,
  onPick,
}: {
  onClose: () => void
  onPick: (asset: AudioAsset) => void
}) {
  const { t } = useTranslation()
  const fileRef = useRef<HTMLInputElement>(null)
  const [assets, setAssets] = useState<AudioAsset[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

  async function refresh() {
    setLoading(true)
    setError('')
    try {
      setAssets(await listAudioAssets())
    } catch (err) {
      setError(err instanceof Error ? err.message : t('layers.audioLibraryLoadError'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
  }, [])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  async function importFile(file: File) {
    setUploading(true)
    setError('')
    try {
      const asset = await uploadAudioAsset(file)
      setAssets((current) => [asset, ...current.filter((item) => item.id !== asset.id)])
      onPick(asset)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('layers.audioImportError'))
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <div
      className="fixed inset-0 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.5)', zIndex: 2800 }}
      onMouseDown={onClose}
    >
      <div
        className="flex flex-col"
        style={{
          width: 'min(820px, calc(100vw - 32px))',
          maxHeight: 'min(640px, calc(100vh - 32px))',
          background: 'var(--panel)',
          border: '1px solid var(--border)',
          borderRadius: 10,
          boxShadow: '0 18px 60px rgba(0,0,0,0.4)',
          overflow: 'hidden',
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="flex-1">
            <div className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{t('layers.audioLibraryTitle')}</div>
            <div className="text-xs mt-0.5" style={{ color: 'var(--text3)' }}>{t('layers.audioLibraryHelp')}</div>
          </div>
          <button type="button" className="icon-btn" onClick={refresh} disabled={loading || uploading} title={t('common.refresh')}>
            <RefreshCw size={15} />
          </button>
          <button type="button" className="icon-btn" onClick={onClose} title={t('common.close')}>
            <X size={16} />
          </button>
        </div>

        {error && (
          <div className="mx-4 mt-3 px-3 py-2 text-xs" style={{ color: '#fecaca', background: 'rgba(239,68,68,0.14)', border: '1px solid rgba(239,68,68,0.35)', borderRadius: 6 }}>
            {error}
          </div>
        )}

        <div className="p-4 overflow-y-auto">
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(168px, 1fr))',
              gap: 10,
            }}
          >
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="flex flex-col items-center justify-center gap-2"
              style={{
                minHeight: 124,
                border: '1px dashed var(--border)',
                borderRadius: 8,
                background: 'var(--input)',
                color: 'var(--text2)',
              }}
            >
              {uploading ? <Upload size={24} /> : <Music size={24} />}
              <span className="text-xs font-medium">{uploading ? t('layers.importingAudio') : t('layers.importNewAudio')}</span>
            </button>

            {assets.map((asset) => (
              <button
                key={asset.id}
                type="button"
                onClick={() => onPick(asset)}
                className="text-left"
                style={{
                  minHeight: 124,
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  background: 'var(--input)',
                  overflow: 'hidden',
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                <div className="flex items-center justify-center" style={{ flex: 1, minHeight: 72, background: 'rgba(16,185,129,0.15)' }}>
                  <Music size={32} style={{ color: '#10b981' }} />
                </div>
                <div className="px-2 py-2" style={{ borderTop: '1px solid var(--border)' }}>
                  <div className="truncate text-xs font-medium" style={{ color: 'var(--text)' }}>{asset.name}</div>
                  <div className="truncate text-[10px] mt-0.5" style={{ color: 'var(--text3)' }}>
                    {formatDuration(asset.duration) ? `${formatDuration(asset.duration)} · ` : ''}
                    {formatBytes(asset.bytes)}
                  </div>
                </div>
              </button>
            ))}
          </div>

          {!loading && assets.length === 0 && (
            <div className="text-xs text-center mt-5" style={{ color: 'var(--text3)' }}>
              {t('layers.noImportedAudios')}
            </div>
          )}
          {loading && (
            <div className="text-xs text-center mt-5" style={{ color: 'var(--text3)' }}>
              {t('common.loading')}
            </div>
          )}
        </div>

        <input
          ref={fileRef}
          type="file"
          accept="audio/*"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) importFile(file)
          }}
        />
      </div>
    </div>
  )
}
