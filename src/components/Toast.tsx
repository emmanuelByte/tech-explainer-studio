import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { AlertCircle, Check, Info, X } from 'lucide-react'

type ToastKind = 'success' | 'error' | 'info'
interface ToastItem {
  id: number
  kind: ToastKind
  message: string
  durationMs: number
}

interface ToastContext {
  show: (message: string, opts?: { kind?: ToastKind; durationMs?: number }) => void
  success: (message: string, durationMs?: number) => void
  error: (message: string, durationMs?: number) => void
  info: (message: string, durationMs?: number) => void
}

const Ctx = createContext<ToastContext | null>(null)

let idCounter = 0

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const timers = useRef<Map<number, number>>(new Map())

  const dismiss = useCallback((id: number) => {
    setToasts((items) => items.filter((t) => t.id !== id))
    const timer = timers.current.get(id)
    if (timer) {
      window.clearTimeout(timer)
      timers.current.delete(id)
    }
  }, [])

  const show = useCallback<ToastContext['show']>((message, opts = {}) => {
    const id = ++idCounter
    const item: ToastItem = {
      id,
      kind: opts.kind ?? 'success',
      message,
      durationMs: opts.durationMs ?? 3200,
    }
    setToasts((items) => [...items, item])
    const t = window.setTimeout(() => dismiss(id), item.durationMs)
    timers.current.set(id, t)
  }, [dismiss])

  useEffect(() => {
    const ref = timers.current
    return () => {
      ref.forEach((t) => window.clearTimeout(t))
      ref.clear()
    }
  }, [])

  const value: ToastContext = {
    show,
    success: (m, d) => show(m, { kind: 'success', durationMs: d }),
    error: (m, d) => show(m, { kind: 'error', durationMs: d }),
    info: (m, d) => show(m, { kind: 'info', durationMs: d }),
  }

  return (
    <Ctx.Provider value={value}>
      {children}
      {createPortal(
        <div
          style={{
            position: 'fixed',
            top: 56,
            left: '50%',
            transform: 'translateX(-50%)',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            zIndex: 5000,
            pointerEvents: 'none',
          }}
        >
          {toasts.map((t) => (
            <ToastView key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
          ))}
        </div>,
        document.body,
      )}
    </Ctx.Provider>
  )
}

function ToastView({ toast, onDismiss }: { toast: ToastItem; onDismiss: () => void }) {
  const { t } = useTranslation()
  const accentMap = {
    success: { color: '#22c55e', Icon: Check },
    error: { color: '#ef4444', Icon: AlertCircle },
    info: { color: '#0d99ff', Icon: Info },
  } as const
  const { color, Icon } = accentMap[toast.kind]
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 12px',
        background: 'var(--panel)',
        border: '1px solid var(--border)',
        borderLeft: `3px solid ${color}`,
        borderRadius: 4,
        boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
        fontSize: 12,
        color: 'var(--text)',
        pointerEvents: 'auto',
        minWidth: 240,
        maxWidth: 420,
        animation: 'toastSlideIn 0.18s ease-out',
      }}
    >
      <Icon size={14} style={{ color, flexShrink: 0 }} />
      <span style={{ flex: 1 }}>{toast.message}</span>
      <button
        onClick={onDismiss}
        className="icon-btn"
        style={{ width: 20, height: 20, minWidth: 20 }}
        title={t('common.dismiss')}
      >
        <X size={12} />
      </button>
    </div>
  )
}

export function useToast(): ToastContext {
  const ctx = useContext(Ctx)
  if (!ctx) {
    // Fallback no-op so calls in non-provider contexts don't crash
    return {
      show: () => {},
      success: () => {},
      error: () => {},
      info: () => {},
    }
  }
  return ctx
}
