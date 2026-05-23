import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Modal } from './Modal'
import { useStore } from '../store'
import { htmlPreviewDocument, htmlToLayers } from '../htmlImport'
import { saveLibraryItem } from '../libraryStorage'

export function HtmlImportModal({
  onClose,
  target = 'editor',
  onSavedToLibrary,
}: {
  onClose: () => void
  target?: 'editor' | 'library'
  onSavedToLibrary?: (name: string) => void
}) {
  const { t } = useTranslation()
  const [name, setName] = useState(t('layers.htmlImportDefaultName'))
  const [html, setHtml] = useState('')
  const [error, setError] = useState('')
  const { totalFrames, canvasPreset, customWidth, customHeight, insertLibraryLayers } = useStore()
  const canvasWidth = canvasPreset.name === 'Custom' ? customWidth : canvasPreset.width
  const canvasHeight = canvasPreset.name === 'Custom' ? customHeight : canvasPreset.height
  const preview = useMemo(() => htmlPreviewDocument(html), [html])

  async function importHtml() {
    setError('')
    try {
      const result = htmlToLayers(html, name, totalFrames, canvasWidth, canvasHeight, { fitToCanvas: target === 'editor' })
      if (target === 'library') {
        const item = await saveLibraryItem({
          name: name.trim() || t('layers.htmlImportDefaultName'),
          kind: 'design',
          layers: result.layers,
          rootLayerIds: result.rootLayerIds,
        })
        onSavedToLibrary?.(item.name)
      } else {
        insertLibraryLayers(result.layers, { fitToTimeline: true, rootLayerIds: result.rootLayerIds })
      }
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('layers.htmlImportError'))
    }
  }

  return (
    <Modal
      title={t('layers.importHtml')}
      onClose={onClose}
      width={980}
      footer={(
        <>
          <button className="secondary-btn" style={{ height: 30, padding: '0 12px', fontSize: 12 }} onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button className="primary-btn" style={{ height: 30, padding: '0 14px', fontSize: 12 }} onClick={() => void importHtml()}>
            {target === 'library' ? t('layers.saveHtmlToLibrary') : t('layers.importHtmlConfirm')}
          </button>
        </>
      )}
    >
      <div style={{ padding: 16, display: 'grid', gridTemplateColumns: 'minmax(320px, 1fr) minmax(320px, 1fr)', gap: 14, minHeight: 560 }}>
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, gap: 10 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 11, color: 'var(--text2)' }}>{t('layers.htmlImportName')}</span>
            <input
              className="input-base"
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={{ height: 30, fontSize: 12 }}
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1, minHeight: 0 }}>
            <span style={{ fontSize: 11, color: 'var(--text2)' }}>{t('layers.htmlImportCode')}</span>
            <textarea
              className="input-base"
              value={html}
              onChange={(e) => setHtml(e.target.value)}
              placeholder={t('layers.htmlImportPlaceholder')}
              spellCheck={false}
              style={{
                flex: 1,
                minHeight: 420,
                resize: 'none',
                fontSize: 11,
                lineHeight: 1.45,
                fontFamily: 'Menlo, Monaco, Consolas, monospace',
                padding: 10,
              }}
            />
          </label>
          {error && (
            <div style={{ color: '#ef4444', fontSize: 11, lineHeight: 1.4 }}>
              {error}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, gap: 6 }}>
          <div style={{ fontSize: 11, color: 'var(--text2)' }}>{t('layers.htmlImportPreview')}</div>
          <div style={{ flex: 1, minHeight: 0, border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden', background: '#f3f4f6' }}>
            <iframe
              title={t('layers.htmlImportPreview')}
              sandbox=""
              srcDoc={preview}
              style={{ width: '100%', height: '100%', border: 0, display: 'block', background: '#f3f4f6' }}
            />
          </div>
          <div style={{ fontSize: 11, color: 'var(--text3)', lineHeight: 1.35 }}>
            {t('layers.htmlImportHelp')}
          </div>
        </div>
      </div>
    </Modal>
  )
}
