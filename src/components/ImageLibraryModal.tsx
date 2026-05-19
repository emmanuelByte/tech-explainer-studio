import { useEffect, useRef, useState } from 'react'
import { ImagePlus, RefreshCw, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { ImageAsset, listImageAssets, uploadImageAsset } from '../assetStorage'

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function ImageLibraryModal({
  onClose,
  onPick,
}: {
  onClose: () => void
  onPick: (asset: ImageAsset) => void
}) {
  const { t } = useTranslation()
  const fileRef = useRef<HTMLInputElement>(null)
  const [assets, setAssets] = useState<ImageAsset[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

  async function refresh() {
    setLoading(true)
    setError('')
    try {
      setAssets(await listImageAssets())
    } catch (err) {
      setError(err instanceof Error ? err.message : t('layers.imageLibraryLoadError'))
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
      const asset = await uploadImageAsset(file)
      setAssets((current) => [asset, ...current.filter((item) => item.id !== asset.id)])
      onPick(asset)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('layers.imageImportError'))
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
          width: 'min(760px, calc(100vw - 32px))',
          maxHeight: 'min(620px, calc(100vh - 32px))',
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
            <div className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{t('layers.imageLibraryTitle')}</div>
            <div className="text-xs mt-0.5" style={{ color: 'var(--text3)' }}>{t('layers.imageLibraryHelp')}</div>
          </div>
          <button type="button" className="icon-btn" onClick={refresh} disabled={loading || uploading} title={t('common.refresh', { defaultValue: 'Refresh' })}>
            <RefreshCw size={15} />
          </button>
          <button type="button" className="icon-btn" onClick={onClose} title={t('common.close', { defaultValue: 'Close' })}>
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
              gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
              gap: 10,
            }}
          >
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="flex flex-col items-center justify-center gap-2"
              style={{
                minHeight: 146,
                border: '1px dashed var(--border)',
                borderRadius: 8,
                background: 'var(--input)',
                color: 'var(--text2)',
              }}
            >
              <ImagePlus size={24} />
              <span className="text-xs font-medium">{uploading ? t('layers.importingImage') : t('layers.importNewImage')}</span>
            </button>

            {assets.map((asset) => (
              <button
                key={asset.id}
                type="button"
                onClick={() => onPick(asset)}
                className="text-left"
                style={{
                  minHeight: 146,
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  background: 'var(--input)',
                  overflow: 'hidden',
                }}
              >
                <div className="flex items-center justify-center" style={{ height: 98, background: 'rgba(0,0,0,0.18)' }}>
                  <img src={asset.url} alt={asset.name} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                </div>
                <div className="px-2 py-2">
                  <div className="truncate text-xs font-medium" style={{ color: 'var(--text)' }}>{asset.name}</div>
                  <div className="truncate text-[10px] mt-0.5" style={{ color: 'var(--text3)' }}>
                    {asset.naturalWidth && asset.naturalHeight ? `${asset.naturalWidth}x${asset.naturalHeight} · ` : ''}{formatBytes(asset.bytes)}
                  </div>
                </div>
              </button>
            ))}
          </div>

          {!loading && assets.length === 0 && (
            <div className="text-xs text-center mt-5" style={{ color: 'var(--text3)' }}>
              {t('layers.noImportedImages')}
            </div>
          )}
          {loading && (
            <div className="text-xs text-center mt-5" style={{ color: 'var(--text3)' }}>
              {t('common.loading', { defaultValue: 'Loading...' })}
            </div>
          )}
        </div>

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
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
