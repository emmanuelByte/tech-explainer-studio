import { BringToFront, MoveDown, MoveUp, SendToBack } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { LayerOrderAction } from '../layerOrdering'

interface Props {
  x: number
  y: number
  count?: number
  onAction: (action: LayerOrderAction) => void
  onClose: () => void
}

export function LayerOrderMenu({ x, y, count = 1, onAction, onClose }: Props) {
  const { t } = useTranslation()
  const left = Math.max(8, Math.min(x, window.innerWidth - 212))
  const top = Math.max(8, Math.min(y, window.innerHeight - 188))
  const items = [
    { action: 'front' as const, label: t('layers.bringToFront'), icon: BringToFront },
    { action: 'forward' as const, label: t('layers.bringForward'), icon: MoveUp },
    { action: 'backward' as const, label: t('layers.sendBackward'), icon: MoveDown },
    { action: 'back' as const, label: t('layers.sendToBack'), icon: SendToBack },
  ]

  return (
    <div
      data-layer-order-menu
      className="fixed inset-0"
      style={{ zIndex: 2600, background: 'transparent' }}
      onMouseDown={onClose}
      onContextMenu={(e) => {
        e.preventDefault()
        onClose()
      }}
    >
      <div
        style={{
          position: 'fixed',
          left,
          top,
          width: 204,
          background: 'var(--panel)',
          border: '1px solid var(--border)',
          borderRadius: 6,
          boxShadow: '0 12px 36px rgba(0,0,0,0.28)',
          padding: 4,
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="px-2 py-1.5 text-[10px] uppercase tracking-wide" style={{ color: 'var(--text3)' }}>
          {t('layers.orderMenuTitle', { count })}
        </div>
        {items.map(({ action, label, icon: Icon }) => (
          <button
            key={action}
            type="button"
            className="popover-menu-item w-full flex items-center gap-2 px-2 py-2 text-xs rounded"
            style={{ color: 'var(--text)' }}
            onClick={() => onAction(action)}
          >
            <Icon size={14} style={{ color: 'var(--text2)' }} />
            <span>{label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
