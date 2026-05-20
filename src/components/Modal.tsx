import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react'

interface ModalProps {
  /** Modal title shown in the header. If empty, the header is hidden entirely. */
  title?: string
  /** Called when the modal should close (ESC pressed, backdrop clicked, X clicked) */
  onClose: () => void
  children: React.ReactNode
  /** Width of the modal (default: 480) */
  width?: number | string
  /** Optional footer (e.g. Cancel/Confirm buttons) */
  footer?: React.ReactNode
  /** Prevents closing on backdrop click (use for forms with unsaved changes) */
  preventBackdropClose?: boolean
  /** z-index override */
  zIndex?: number
  /** Optional additional content in the header (right of title) */
  headerExtra?: React.ReactNode
}

export function Modal({
  title,
  onClose,
  children,
  width = 480,
  footer,
  preventBackdropClose = false,
  zIndex = 2000,
  headerExtra,
}: ModalProps) {
  const { t } = useTranslation()
  const dialogRef = useRef<HTMLDivElement>(null)

  // ESC handler
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])

  // Backdrop click handler
  function onBackdropMouseDown(e: React.MouseEvent) {
    if (preventBackdropClose) return
    if (e.target === e.currentTarget) {
      onClose()
    }
  }

  return createPortal(
    <div
      onMouseDown={onBackdropMouseDown}
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.45)',
        zIndex,
        backdropFilter: 'blur(2px)',
      }}
    >
      <div
        ref={dialogRef}
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        style={{
          width,
          maxWidth: 'calc(100vw - 32px)',
          maxHeight: 'calc(100vh - 32px)',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--panel)',
          border: '1px solid var(--border)',
          borderRadius: 6,
          boxShadow: '0 20px 60px rgba(0,0,0,0.45)',
          overflow: 'hidden',
        }}
      >
        {title && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 14px',
              borderBottom: '1px solid var(--border)',
              flexShrink: 0,
            }}
          >
            <h2 style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{title}</h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {headerExtra}
              <button
                onClick={onClose}
                className="icon-btn"
                title={t('common.closeEsc')}
                style={{ width: 24, height: 24, minWidth: 24 }}
              >
                <X size={14} />
              </button>
            </div>
          </div>
        )}

        <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>{children}</div>

        {footer && (
          <div
            style={{
              padding: '10px 14px',
              borderTop: '1px solid var(--border)',
              display: 'flex',
              justifyContent: 'flex-end',
              gap: 8,
              flexShrink: 0,
            }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
