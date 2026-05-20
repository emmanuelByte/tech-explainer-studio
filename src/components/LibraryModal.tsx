import { useEffect, useMemo, useState } from 'react'
import { Box, Film, RefreshCw, Save, Trash2, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import {
  animationLayerInRange,
  designLayerAtFrame,
  frameRangeFromSelection,
  rootLayerIds,
  selectedWithDescendants,
} from '../libraryItems'
import { deleteLibraryItem, LibraryItem, listLibraryItems, saveLibraryItem } from '../libraryStorage'
import { useStore } from '../store'

export function LibraryModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const {
    layers, selectedLayerIds, selectedKeyframes, currentFrame, totalFrames, fps,
    insertLibraryLayers,
  } = useStore()
  const [items, setItems] = useState<LibraryItem[]>([])
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const selectedLayers = useMemo(() => selectedWithDescendants(layers, selectedLayerIds), [layers, selectedLayerIds])
  const selectedRoots = useMemo(() => rootLayerIds(selectedLayers), [selectedLayers])
  const animationRange = useMemo(() => selectedLayers.length ? frameRangeFromSelection(selectedLayers, selectedKeyframes) : null, [selectedLayers, selectedKeyframes])

  async function refresh() {
    setLoading(true)
    setError('')
    try {
      setItems(await listLibraryItems())
    } catch (err) {
      setError(err instanceof Error ? err.message : t('library.loadError'))
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

  async function saveSelectedDesign() {
    if (!selectedLayers.length) {
      setError(t('library.selectLayerFirst'))
      return
    }
    setSaving(true)
    setError('')
    try {
      const item = await saveLibraryItem({
        name: name.trim() || selectedLayers[0].name || t('library.designFallbackName'),
        kind: 'design',
        layers: selectedLayers.map((layer) => designLayerAtFrame(layer, currentFrame, totalFrames)),
        rootLayerIds: selectedRoots,
      })
      setItems((current) => [item, ...current])
      setName('')
    } catch (err) {
      setError(err instanceof Error ? err.message : t('library.saveDesignError'))
    } finally {
      setSaving(false)
    }
  }

  async function saveSelectedAnimation() {
    if (!selectedLayers.length || !animationRange) {
      setError(t('library.selectLayerFirst'))
      return
    }
    setSaving(true)
    setError('')
    try {
      const item = await saveLibraryItem({
        name: name.trim() || t('library.animationFallbackName', { name: selectedLayers[0].name }),
        kind: 'animation',
        layers: selectedLayers.map((layer) => animationLayerInRange(layer, animationRange.start, animationRange.end)),
        rootLayerIds: selectedRoots,
        frameStart: animationRange.start,
        frameEnd: animationRange.end,
        durationFrames: Math.max(1, animationRange.end - animationRange.start),
      })
      setItems((current) => [item, ...current])
      setName('')
    } catch (err) {
      setError(err instanceof Error ? err.message : t('library.saveAnimationError'))
    } finally {
      setSaving(false)
    }
  }

  async function removeItem(id: string) {
    setError('')
    try {
      await deleteLibraryItem(id)
      setItems((current) => current.filter((item) => item.id !== id))
    } catch (err) {
      setError(err instanceof Error ? err.message : t('library.deleteError'))
    }
  }

  function insertItem(item: LibraryItem) {
    insertLibraryLayers(item.layers, {
      frameOffset: item.kind === 'animation' ? currentFrame : 0,
      fitToTimeline: item.kind === 'design',
      rootLayerIds: item.rootLayerIds,
    })
    onClose()
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
          maxHeight: 'min(680px, calc(100vh - 32px))',
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
            <div className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{t('library.title')}</div>
            <div className="text-xs mt-0.5" style={{ color: 'var(--text3)' }}>
              {t('library.help')}
            </div>
          </div>
          <button type="button" className="icon-btn" onClick={refresh} disabled={loading || saving} title={t('common.refresh')}>
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
          <div className="grid gap-3 mb-4" style={{ gridTemplateColumns: 'minmax(0, 1fr) auto auto' }}>
            <input
              className="input-base"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={selectedLayers[0]?.name ? t('library.namePlaceholderWithExample', { name: selectedLayers[0].name }) : t('library.namePlaceholder')}
            />
            <button type="button" className="pill-btn" onClick={saveSelectedDesign} disabled={saving || !selectedLayers.length}>
              <Save size={14} />
              {t('library.design')}
            </button>
            <button type="button" className="pill-btn active" onClick={saveSelectedAnimation} disabled={saving || !selectedLayers.length}>
              <Film size={14} />
              {t('library.animation')}
            </button>
          </div>

          <div className="text-[11px] mb-3" style={{ color: 'var(--text3)' }}>
            {selectedLayers.length
              ? t('library.selectedSummary', {
                count: selectedLayers.length,
                start: animationRange?.start ?? 0,
                end: animationRange?.end ?? 0,
                source: animationRange?.source ?? t('library.layerRanges'),
                seconds: (Math.max(1, (animationRange?.end ?? 1) - (animationRange?.start ?? 0)) / fps).toFixed(2),
              })
              : t('library.selectLayersHelp')}
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
              gap: 10,
            }}
          >
            {items.map((item) => (
              <div
                key={item.id}
                className="flex flex-col"
                style={{
                  minHeight: 148,
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  background: 'var(--input)',
                  overflow: 'hidden',
                }}
              >
                <button
                  type="button"
                  onClick={() => insertItem(item)}
                  className="flex-1 text-left p-3"
                >
                  <div className="flex items-center gap-2 mb-2" style={{ color: item.kind === 'animation' ? '#f59e0b' : '#60a5fa' }}>
                    {item.kind === 'animation' ? <Film size={16} /> : <Box size={16} />}
                    <span className="text-[10px] uppercase tracking-widest">{item.kind === 'animation' ? t('library.animation') : t('library.design')}</span>
                  </div>
                  <div className="truncate text-xs font-semibold" style={{ color: 'var(--text)' }}>{item.name}</div>
                  <div className="text-[10px] mt-1" style={{ color: 'var(--text3)' }}>
                    {t('library.layerCount', { count: item.layers.length })}
                    {item.kind === 'animation' && item.durationFrames ? ` - ${item.durationFrames}f` : ''}
                  </div>
                </button>
                <div className="flex items-center justify-between px-2 py-2" style={{ borderTop: '1px solid var(--border)' }}>
                  <button type="button" className="pill-btn text-[11px]" onClick={() => insertItem(item)}>{t('library.insert')}</button>
                  <button type="button" className="icon-btn" onClick={() => removeItem(item.id)} title={t('common.delete')}>
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {!loading && items.length === 0 && (
            <div className="text-xs text-center mt-5" style={{ color: 'var(--text3)' }}>
              {t('library.noItems')}
            </div>
          )}
          {loading && (
            <div className="text-xs text-center mt-5" style={{ color: 'var(--text3)' }}>
              {t('common.loading')}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
