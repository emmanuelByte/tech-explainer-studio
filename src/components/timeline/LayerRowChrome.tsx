import type { CSSProperties } from 'react'
import { Eye, EyeOff, GripVertical, Lock, Unlock } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { useSortable } from '@dnd-kit/sortable'
import { useStore } from '../../store'
import type { Layer } from '../../types'

/**
 * Shared row-chrome pieces reused by Timeline.tsx's `SortableLabel` and
 * LayersPanel.tsx's `LayerRow`. Both files hand-rolled their own drag handle
 * and visibility/lock buttons; extracting the interactive/store-wired parts
 * here (while leaving each caller's own sizing/layout styles in place, since
 * the two rows are intentionally different densities) means new per-row
 * controls — mute/solo — only need to be added once, in one file, instead of
 * twice.
 */

type SortableHandle = Pick<ReturnType<typeof useSortable>, 'attributes' | 'listeners'>

export function LayerDragHandle({
  handle, size = 12, style, title,
}: {
  handle: SortableHandle
  size?: number
  style?: CSSProperties
  title?: string
}) {
  return (
    <span
      {...handle.attributes} {...handle.listeners}
      onClick={(e) => e.stopPropagation()}
      title={title}
      style={{ cursor: 'grab', color: 'var(--text3)', flexShrink: 0, touchAction: 'none', display: 'inline-flex', lineHeight: 1, ...style }}
    >
      <GripVertical size={size} />
    </span>
  )
}

export function LayerVisibilityLockButtons({
  layer, size = 12, buttonStyle,
}: {
  layer: Layer
  size?: number
  buttonStyle?: CSSProperties
}) {
  const { t } = useTranslation()
  const { toggleVisibility, toggleLock } = useStore()
  return (
    <>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); toggleVisibility(layer.id) }}
        className="icon-btn"
        style={{ color: layer.visible ? 'var(--text2)' : 'var(--text3)', ...buttonStyle }}
        title={t('layers.visibility')}
      >
        {layer.visible ? <Eye size={size} /> : <EyeOff size={size} />}
      </button>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); toggleLock(layer.id) }}
        className="icon-btn"
        style={{ color: layer.locked ? '#f59e0b' : 'var(--text3)', ...buttonStyle }}
        title={t('layers.lock')}
      >
        {layer.locked ? <Lock size={size} /> : <Unlock size={size} />}
      </button>
    </>
  )
}
