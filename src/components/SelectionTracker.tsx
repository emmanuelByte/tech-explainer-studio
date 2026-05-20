import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ChevronRight, Circle, Diamond, Film, Folder, Image as ImageIcon, Layers, PenLine, Slash, Square, Triangle, Type,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useStore } from '../store'
import { AnimatableProperty, Layer, LayerType } from '../types'

const TYPE_ICON: Record<LayerType, LucideIcon> = {
  rectangle: Square,
  ellipse: Circle,
  triangle: Triangle,
  line: Slash,
  path: PenLine,
  text: Type,
  image: ImageIcon,
  video: Film,
  group: Folder,
}

function layerPath(layers: Layer[], layer: Layer) {
  const byId = new Map(layers.map((item) => [item.id, item]))
  const path: Layer[] = [layer]
  let parentId = layer.parentId
  const seen = new Set([layer.id])
  while (parentId && !seen.has(parentId)) {
    const parent = byId.get(parentId)
    if (!parent) break
    path.unshift(parent)
    seen.add(parent.id)
    parentId = parent.parentId
  }
  return path
}

function propLabel(t: ReturnType<typeof useTranslation>['t'], propKey?: AnimatableProperty) {
  if (!propKey) return t('topbar.transformKeyframe')
  return t(`props.${propKey}`, { defaultValue: propKey })
}

/**
 * Figma-style selection breadcrumb shown in the editor topbar.
 * - Flat, no background or border
 * - Tiny icon + subtle chevron separators
 * - Truncates with ellipsis
 */
export function SelectionTracker() {
  const { t } = useTranslation()
  const { layers, selectedLayerIds, selectedKeyframes } = useStore()

  const view = useMemo(() => {
    if (selectedKeyframes.length) {
      const first = selectedKeyframes[0]
      const layer = layers.find((item) => item.id === first.layerId)
      const name = layer?.name ?? t('topbar.missingLayer')
      if (selectedKeyframes.length === 1) {
        return {
          icon: Diamond,
          parts: [name, propLabel(t, first.propKey), `${first.frame}f`],
          title: t('topbar.keyframeSelectionTitle', { layer: name, frame: first.frame, property: propLabel(t, first.propKey) }),
        }
      }
      const frames = selectedKeyframes.map((item) => item.frame)
      const minFrame = Math.min(...frames)
      const maxFrame = Math.max(...frames)
      const range = minFrame === maxFrame ? String(minFrame) : `${minFrame}–${maxFrame}`
      return {
        icon: Diamond,
        parts: [t('topbar.multiKeyframeSelection', { count: selectedKeyframes.length, range })],
        title: t('topbar.multiKeyframeSelectionTitle', { count: selectedKeyframes.length, range }),
      }
    }

    if (selectedLayerIds.length > 1) {
      return {
        icon: Layers,
        parts: [t('topbar.multiLayerSelection', { count: selectedLayerIds.length })],
        title: t('topbar.multiLayerSelectionTitle', { count: selectedLayerIds.length }),
      }
    }

    const layer = layers.find((item) => item.id === selectedLayerIds[0])
    if (layer) {
      const path = layerPath(layers, layer)
      const pathLabel = path.map((item) => item.name).join(' / ')
      return {
        icon: TYPE_ICON[layer.type] ?? Square,
        parts: path.map((item) => item.name),
        title: t('topbar.layerSelectionTitle', { path: pathLabel, type: t(`layers.${layer.type}`, { defaultValue: layer.type }) }),
      }
    }

    return null
  }, [layers, selectedKeyframes, selectedLayerIds, t])

  if (!view) return null
  const Icon = view.icon

  return (
    <div
      title={view.title}
      aria-label={view.title}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        minWidth: 0,
        maxWidth: 320,
        fontSize: 11,
        color: 'var(--text3)',
        userSelect: 'none',
      }}
    >
      <Icon size={11} strokeWidth={2} style={{ flexShrink: 0, color: 'var(--text2)' }} />
      {view.parts.map((part, idx) => {
        const isLast = idx === view.parts.length - 1
        return (
          <span key={idx} style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
            <span
              style={{
                color: isLast ? 'var(--text)' : 'var(--text3)',
                fontWeight: isLast ? 500 : 400,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {part}
            </span>
            {!isLast && <ChevronRight size={10} style={{ flexShrink: 0, color: 'var(--text3)', opacity: 0.6 }} />}
          </span>
        )
      })}
    </div>
  )
}
