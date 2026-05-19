type ConfirmDialogProps = {
  title: string
  message: string
  confirmLabel: string
  cancelLabel: string
  danger?: boolean
  busy?: boolean
  onCancel: () => void
  onConfirm: () => void
}

type NoticeDialogProps = {
  title: string
  message: string
  buttonLabel: string
  onClose: () => void
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  cancelLabel,
  danger,
  busy,
  onCancel,
  onConfirm,
}: ConfirmDialogProps) {
  return (
    <div
      className="fixed inset-0 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      style={{ background: 'rgba(0,0,0,0.48)', zIndex: 2800 }}
      onMouseDown={onCancel}
    >
      <div
        className="w-[380px] max-w-[calc(100vw-32px)] rounded-md p-4"
        style={{ background: 'var(--panel)', border: '1px solid var(--border)', boxShadow: '0 18px 60px rgba(0,0,0,0.35)' }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="text-sm font-semibold mb-2" style={{ color: 'var(--text)' }}>{title}</div>
        <div className="text-xs leading-relaxed mb-4" style={{ color: 'var(--text2)' }}>{message}</div>
        <div className="flex justify-end gap-2">
          <button type="button" className="pill-btn" onClick={onCancel} disabled={busy}>{cancelLabel}</button>
          <button
            type="button"
            className="pill-btn"
            onClick={onConfirm}
            disabled={busy}
            style={danger ? { color: '#ef4444' } : undefined}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

export function NoticeDialog({ title, message, buttonLabel, onClose }: NoticeDialogProps) {
  return (
    <div
      className="fixed inset-0 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      style={{ background: 'rgba(0,0,0,0.42)', zIndex: 2800 }}
      onMouseDown={onClose}
    >
      <div
        className="w-[360px] max-w-[calc(100vw-32px)] rounded-md p-4"
        style={{ background: 'var(--panel)', border: '1px solid var(--border)', boxShadow: '0 18px 60px rgba(0,0,0,0.35)' }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="text-sm font-semibold mb-2" style={{ color: 'var(--text)' }}>{title}</div>
        <div className="text-xs leading-relaxed mb-4" style={{ color: 'var(--text2)' }}>{message}</div>
        <div className="flex justify-end">
          <button type="button" className="pill-btn active" onClick={onClose}>{buttonLabel}</button>
        </div>
      </div>
    </div>
  )
}
