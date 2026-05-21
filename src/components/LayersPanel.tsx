import { useEffect, useRef, useState } from 'react'
import {
  ChevronRight, Circle, Eye, EyeOff, Folder, GripVertical, Image as ImageIcon,
  Film, Layers, Library, Lock, PenLine, Plus, Settings2, Slash, Sparkles, Square, Trash2, Triangle,
  Type, Unlock,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useStore } from '../store'
import { Layer, LayerType, LAYER_TYPE_COLOR } from '../types'
import {
  DndContext, closestCenter, DragEndEvent, DragMoveEvent,
  PointerSensor, useSensor, useSensors,
} from '@dnd-kit/core'
import {
  SortableContext, verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useTranslation } from 'react-i18next'
import { animationLayerInRange, designLayerAtFrame, frameRangeFromSelection, rootLayerIds, selectedWithDescendants } from '../libraryItems'
import { saveLibraryItem } from '../libraryStorage'
import { visibleLayerRows } from '../layerTree'
import { IconPickerModal } from './IconPickerModal'
import type { IconPick } from './IconPickerModal'
import { ImageLibraryModal } from './ImageLibraryModal'
import { VideoLibraryModal } from './VideoLibraryModal'
import { LibraryModal } from './LibraryModal'
import { ColorPicker } from './ColorPicker'
import type { ImageAsset, VideoAsset } from '../assetStorage'
import { useToast } from './Toast'
import { LayerOrderAction, reorderLayersForStack } from '../layerOrdering'

function CompositionAccordion() {
  const { t } = useTranslation()
  const {
    canvasBackgroundColor, setCanvasBackgroundColor,
    fps, totalFrames, setTotalFrames,
  } = useStore()
  const [open, setOpen] = useState(true)

  return (
    <div style={{ borderBottom: '1px solid var(--border)' }}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-1.5 px-3"
        style={{ height: 32, color: 'var(--text2)', background: 'transparent' }}
      >
        <ChevronRight size={12} style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.12s', color: 'var(--text3)' }} />
        <Settings2 size={12} />
        <span className="section-header" style={{ padding: 0 }}>{t('layers.composition')}</span>
      </button>
      {open && (
        <div className="px-3 pb-2.5 flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <span style={{ fontSize: 11, color: 'var(--text2)', flex: 1 }}>{t('layers.background')}</span>
            <ColorPicker value={canvasBackgroundColor} onChange={setCanvasBackgroundColor} compact />
          </div>
          <div className="flex items-center gap-2">
            <span style={{ fontSize: 11, color: 'var(--text2)', flex: 1 }}>{t('layers.duration')}</span>
            <input
              type="number"
              min={0.1}
              step={0.1}
              value={parseFloat((totalFrames / fps).toFixed(2))}
              onChange={(e) => setTotalFrames(Math.max(1, Math.round(Number(e.target.value) * fps)))}
              className="input-base text-right"
              style={{ width: 60 }}
            />
            <span style={{ fontSize: 11, color: 'var(--text3)' }}>{t('common.secondShort')}</span>
          </div>
          <div style={{ fontSize: 10, color: 'var(--text3)' }}>
            {t('layers.framesAtFps', { frames: totalFrames, fps })}
          </div>
        </div>
      )}
    </div>
  )
}

const TYPE_ICONS: Record<LayerType, LucideIcon> = {
  rectangle: Square, ellipse: Circle, line: Slash,
  triangle: Triangle, path: PenLine, text: Type, image: ImageIcon,
  video: Film,
  group: Folder,
}

function AddMenuItem({ label, icon: Icon, onClick, hasSubmenu }: {
  label: string
  icon: LucideIcon
  onClick: () => void
  hasSubmenu?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="add-menu-item w-full flex items-center gap-2 px-2.5 py-2 text-xs rounded-md"
    >
      <Icon size={14} style={{ color: 'var(--text2)' }} />
      <span className="flex-1 text-left">{label}</span>
      {hasSubmenu && <ChevronRight size={13} style={{ color: 'var(--text3)' }} />}
    </button>
  )
}

type DropHint = { targetId: string; mode: 'above' | 'below' | 'inside'; armed: boolean }
type ConvertGroupModal = { draggedIds: string[]; target: Layer }

function LayerRow({ layer, depth, selected, childCount, dropHint, onSelect, onContextMenu }: {
  layer: Layer
  depth: number
  selected: boolean
  childCount: number
  dropHint?: DropHint | null
  onSelect: (e: React.MouseEvent) => void
  onContextMenu: (e: React.MouseEvent) => void
}) {
  const { t } = useTranslation()
  const { toggleVisibility, toggleLock, deleteLayer, renameLayer, toggleLayerCollapsed } = useStore()
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(layer.name)
  const inputRef = useRef<HTMLInputElement>(null)

  const {
    attributes, listeners, setNodeRef,
    transform, transition, isDragging,
  } = useSortable({ id: layer.id })
  const TypeIcon = TYPE_ICONS[layer.type]
  const activeDropHint = dropHint?.targetId === layer.id ? dropHint : null

  function commitRename() {
    setEditing(false)
    if (name.trim()) renameLayer(layer.id, name.trim())
    else setName(layer.name)
  }

  return (
    <div
      ref={setNodeRef}
      onClick={onSelect}
      onContextMenu={onContextMenu}
      style={{
        position: 'relative',
        display: 'flex', alignItems: 'center', gap: 4, padding: '0 6px 0 2px',
        height: 32, cursor: 'pointer', userSelect: 'none',
        borderBottom: activeDropHint?.mode === 'below' ? '2px solid var(--accent)' : '1px solid transparent',
        borderTop: activeDropHint?.mode === 'above' ? '2px solid var(--accent)' : undefined,
        background: isDragging
          ? 'var(--accent-bg)'
          : activeDropHint?.mode === 'inside' ? 'var(--accent-bg)'
          : selected ? 'var(--selected-bg)' : 'transparent',
        borderLeft: activeDropHint?.mode === 'inside'
          ? `2px solid ${activeDropHint.armed ? 'var(--accent)' : '#f59e0b'}`
          : `2px solid ${selected ? 'var(--accent)' : 'transparent'}`,
        outline: activeDropHint?.mode === 'inside' ? `1px solid ${activeDropHint.armed ? 'var(--accent)' : '#f59e0b'}` : undefined,
        outlineOffset: -2,
        transition: transition ?? 'background 0.1s',
        transform: CSS.Transform.toString(transform),
        opacity: isDragging ? 0.6 : 1,
        zIndex: isDragging ? 50 : undefined,
      }}
      className="group"
    >
      {activeDropHint?.mode === 'inside' && (
        <div
          style={{
            position: 'absolute',
            right: 6,
            top: '50%',
            transform: 'translateY(-50%)',
            color: activeDropHint.armed ? 'var(--accent)' : '#f59e0b',
            fontSize: 10,
            pointerEvents: 'none',
            background: 'var(--panel)',
            border: '1px solid currentColor',
            borderRadius: 4,
            padding: '1px 5px',
            zIndex: 2,
          }}
        >
          → {activeDropHint.armed ? t('layers.nest') : t('layers.hold')}
        </div>
      )}
      <div style={{ width: depth * 16, alignSelf: 'stretch', position: 'relative', flexShrink: 0 }}>
        {depth > 0 && <div style={{ position: 'absolute', left: depth * 16 - 9, top: 0, bottom: 0, borderLeft: '1px solid var(--border)' }} />}
      </div>

      {childCount > 0 || layer.type === 'group' || layer.isGroup ? (
        <button
          onClick={(e) => { e.stopPropagation(); toggleLayerCollapsed(layer.id) }}
          className="icon-btn"
          style={{ width: 18, minWidth: 18, height: 18, color: 'var(--text2)', transform: layer.collapsed ? 'none' : 'rotate(90deg)', transition: 'transform 0.12s' }}
          title={layer.collapsed ? t('layers.expandGroup') : t('layers.collapseGroup')}
        >
          <ChevronRight size={13} />
        </button>
      ) : (
        <span style={{ width: 14, color: 'var(--text3)', fontSize: 10 }}>{depth > 0 ? '└' : ''}</span>
      )}

      {/* Drag handle */}
      <span
        {...attributes}
        {...listeners}
        onClick={(e) => e.stopPropagation()}
        style={{
          cursor: 'grab', color: 'var(--text3)', fontSize: 13,
          padding: '0 2px', flexShrink: 0, lineHeight: 1,
          touchAction: 'none',
        }}
        title={t('layers.drag')}
      >
        <GripVertical size={14} />
      </span>

      {/* Type icon */}
      <span style={{ width: 16, color: LAYER_TYPE_COLOR[layer.type], flexShrink: 0, display: 'flex', justifyContent: 'center' }}>
        <TypeIcon size={14} />
      </span>

      {/* Name */}
      {editing ? (
        <input
          ref={inputRef}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={commitRename}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitRename()
            if (e.key === 'Escape') { setEditing(false); setName(layer.name) }
          }}
          onClick={(e) => e.stopPropagation()}
          autoFocus
          className="flex-1 input-base text-xs h-5"
          style={{ minWidth: 0 }}
        />
      ) : (
        <span
          className="flex-1 text-xs truncate"
          style={{ color: 'var(--text)', opacity: layer.visible ? 1 : 0.4 }}
          onDoubleClick={(e) => {
            e.stopPropagation()
            setEditing(true)
            setTimeout(() => inputRef.current?.select(), 10)
          }}
        >
          {layer.name}
        </span>
      )}

      {/* Actions (show on hover) */}
      <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={(e) => { e.stopPropagation(); toggleVisibility(layer.id) }}
          style={{ color: 'var(--text3)', fontSize: 12, padding: '0 2px' }}
          title={t('layers.visibility')}
        >
          {layer.visible ? <Eye size={13} /> : <EyeOff size={13} />}
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); toggleLock(layer.id) }}
          style={{ color: layer.locked ? '#f59e0b' : 'var(--text3)', fontSize: 12, padding: '0 2px' }}
          title={t('layers.lock')}
        >
          {layer.locked ? <Lock size={13} /> : <Unlock size={13} />}
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); deleteLayer(layer.id) }}
          style={{ color: 'var(--text3)', fontSize: 12, padding: '0 2px' }}
          className="hover:!text-red-400 transition-colors"
          title={t('layers.deleteLayer')}
        >
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  )
}

export function LayersPanel() {
  const { t } = useTranslation()
  const toast = useToast()
  const {
    layers, selectedLayerIds,
    selectLayer, selectLayers, addLayer, addGeneratedLayer, addImage, addVideo,
    replaceImageSource, replaceVideoSource,
    reorderLayersById, moveLayerToParent, groupSelected, ungroupLayer,
    selectChildren, selectSiblings, collapseAllGroups, expandAllGroups,
  } = useStore()
  const addMenuRef = useRef<HTMLDivElement>(null)
  const [menu, setMenu] = useState<{ x: number; y: number; layer: Layer } | null>(null)
  const [dropHint, setDropHint] = useState<DropHint | null>(null)
  const [convertModal, setConvertModal] = useState<ConvertGroupModal | null>(null)
  const [showIcons, setShowIcons] = useState(false)
  const [showImages, setShowImages] = useState(false)
  const [showVideos, setShowVideos] = useState(false)
  const [showLibrary, setShowLibrary] = useState(false)
  const [replaceImageLayerId, setReplaceImageLayerId] = useState<string | null>(null)
  const [replaceVideoLayerId, setReplaceVideoLayerId] = useState<string | null>(null)
  const [addMenuOpen, setAddMenuOpen] = useState(false)
  const [shapeMenuOpen, setShapeMenuOpen] = useState(false)
  const hoverRef = useRef<{ targetId: string; startedAt: number } | null>(null)
  const lastSelectedId = useRef<string | null>(null)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

  // Panel shows topmost layer first while preserving nesting.
  const rows = visibleLayerRows(layers, true)
  const childCount = (id: string) => layers.filter((l) => l.parentId === id).length

  useEffect(() => {
    if (!addMenuOpen) return
    function close(e: MouseEvent) {
      if (!addMenuRef.current?.contains(e.target as Node)) {
        setAddMenuOpen(false)
        setShapeMenuOpen(false)
      }
    }
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [addMenuOpen])

  function getDropIntent(event: DragMoveEvent | DragEndEvent): DropHint | null {
    const { active, over } = event
    if (!over || active.id === over.id) return null
    const target = layers.find((l) => l.id === over.id)
    if (!target) return null
    const translated = active.rect.current.translated
    const overRect = over.rect
    const pointerY = translated ? translated.top + translated.height / 2 : overRect.top + overRect.height / 2
    const ratio = (pointerY - overRect.top) / overRect.height
    if (ratio < 0.4) {
      hoverRef.current = null
      return { targetId: target.id, mode: 'above', armed: true }
    }
    if (ratio > 0.6) {
      hoverRef.current = null
      return { targetId: target.id, mode: 'below', armed: true }
    }

    const isExistingGroup = target.type === 'group' || target.isGroup
    const now = performance.now()
    if (hoverRef.current?.targetId !== target.id) hoverRef.current = { targetId: target.id, startedAt: now }
    const armed = isExistingGroup || now - hoverRef.current.startedAt >= 500
    return { targetId: target.id, mode: 'inside', armed }
  }

  function handleDragMove(event: DragMoveEvent) {
    setDropHint(getDropIntent(event))
  }

  function topChildId(parentId: string | null, movingIds: string[] = []) {
    const moving = new Set(movingIds)
    return [...layers]
      .reverse()
      .find((layer) => (layer.parentId ?? null) === parentId && !moving.has(layer.id))
      ?.id ?? null
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    const intent = getDropIntent(event)
    setDropHint(null)
    hoverRef.current = null
    if (!over || active.id === over.id) return

    const draggedIds = selectedLayerIds.includes(String(active.id)) ? selectedLayerIds : [String(active.id)]
    const target = layers.find((l) => l.id === over.id)
    if (!target) return

    if (intent?.mode === 'inside' && intent.armed) {
      if (target.type !== 'group' && !target.isGroup) {
        setConvertModal({ draggedIds, target })
        return
      }
      moveLayerToParent(draggedIds, target.id, topChildId(target.id, draggedIds))
      return
    }
    if (intent?.mode === 'inside') return

    const movingSet = new Set(draggedIds)
    const remainingRows = rows.filter((r) => !movingSet.has(r.layer.id))
    const movingRows = rows.filter((r) => movingSet.has(r.layer.id))
    const targetIdx = remainingRows.findIndex((r) => r.layer.id === target.id)
    if (targetIdx < 0 || movingRows.length === 0) return
    const insertIdx = intent?.mode === 'below' ? targetIdx + 1 : targetIdx
    const newRows = [...remainingRows]
    newRows.splice(insertIdx, 0, ...movingRows)
    reorderLayersById([...newRows].reverse().map((r) => r.layer.id))
    moveLayerToParent(draggedIds, target.parentId ?? null)
  }

  function handleLayerSelect(layerId: string, e: React.MouseEvent) {
    if (e.shiftKey && lastSelectedId.current) {
      const from = rows.findIndex((r) => r.layer.id === lastSelectedId.current)
      const to = rows.findIndex((r) => r.layer.id === layerId)
      if (from >= 0 && to >= 0) {
        const [start, end] = from < to ? [from, to] : [to, from]
        selectLayers(rows.slice(start, end + 1).map((r) => r.layer.id))
      } else {
        selectLayer(layerId, true)
      }
    } else {
      selectLayer(layerId, e.metaKey || e.ctrlKey)
    }
    lastSelectedId.current = layerId
  }

  function addImageAsset(asset: ImageAsset) {
    if (replaceImageLayerId) {
      replaceImageSource(replaceImageLayerId, asset.url, asset.imageKind, asset.naturalWidth, asset.naturalHeight)
      setReplaceImageLayerId(null)
    } else {
      const maxW = 360
      const maxH = 260
      const aspect = asset.naturalWidth && asset.naturalHeight ? asset.naturalWidth / asset.naturalHeight : 1.5
      const scale = asset.naturalWidth && asset.naturalHeight ? Math.min(1, maxW / asset.naturalWidth, maxH / asset.naturalHeight) : 1
      const width = asset.naturalWidth && asset.naturalHeight ? Math.max(1, Math.round(asset.naturalWidth * scale)) : 300
      const height = asset.naturalWidth && asset.naturalHeight ? Math.max(1, Math.round(width / aspect)) : 200
      addGeneratedLayer('image', {
        parentId: insertionParentId(),
        name: asset.name,
        src: asset.url,
        imageKind: asset.imageKind,
        imageFit: 'contain',
        imageNaturalWidth: asset.naturalWidth,
        imageNaturalHeight: asset.naturalHeight,
        width,
        height,
      })
    }
    setShowImages(false)
  }

  function addVideoAsset(asset: VideoAsset) {
    if (replaceVideoLayerId) {
      replaceVideoSource(replaceVideoLayerId, asset.url, asset.naturalWidth, asset.naturalHeight, asset.duration)
      setReplaceVideoLayerId(null)
    } else {
      const maxW = 420
      const maxH = 280
      const aspect = asset.naturalWidth && asset.naturalHeight ? asset.naturalWidth / asset.naturalHeight : 16 / 9
      const scale = asset.naturalWidth && asset.naturalHeight ? Math.min(1, maxW / asset.naturalWidth, maxH / asset.naturalHeight) : 1
      const width = asset.naturalWidth && asset.naturalHeight ? Math.max(1, Math.round(asset.naturalWidth * scale)) : 320
      const height = asset.naturalWidth && asset.naturalHeight ? Math.max(1, Math.round(width / aspect)) : 180
      addGeneratedLayer('video', {
        parentId: insertionParentId(),
        name: asset.name,
        src: asset.url,
        imageFit: 'contain',
        videoNaturalWidth: asset.naturalWidth,
        videoNaturalHeight: asset.naturalHeight,
        videoDuration: asset.duration,
        width,
        height,
      })
    }
    setShowVideos(false)
  }

  function addIconLayer(choice: IconPick) {
    addGeneratedLayer('image', {
      parentId: insertionParentId(),
      name: choice.name,
      src: choice.src,
      imageKind: 'svg',
      imageFit: 'contain',
      imageNaturalWidth: 128,
      imageNaturalHeight: 128,
      width: 128,
      height: 128,
    })
    setShowIcons(false)
  }

  function addShape(type: LayerType) {
    addGeneratedLayer(type, { parentId: insertionParentId() })
    setAddMenuOpen(false)
    setShapeMenuOpen(false)
  }

  function addTextLayer() {
    addGeneratedLayer('text', { parentId: insertionParentId() })
    setAddMenuOpen(false)
  }

  function insertionParentId() {
    const selected = selectedLayerIds
      .map((id) => layers.find((layer) => layer.id === id))
      .filter((layer): layer is Layer => Boolean(layer))
    if (selected.length === 1) {
      const [layer] = selected
      if (layer.type === 'group' || layer.isGroup) return layer.id
      return layer.parentId ?? null
    }
    if (selected.length > 1) {
      const parentId = selected[0].parentId ?? null
      if (selected.every((layer) => (layer.parentId ?? null) === parentId)) return parentId
    }
    return null
  }

  function menuTargetIds(layerId: string) {
    return selectedLayerIds.includes(layerId) ? selectedLayerIds : [layerId]
  }

  function applyLayerOrder(action: LayerOrderAction) {
    if (!menu) return
    const ids = menuTargetIds(menu.layer.id)
    reorderLayersById(reorderLayersForStack(useStore.getState().layers, ids, action))
    setMenu(null)
  }

  async function exportSelectionToLibrary(kind: 'design' | 'animation', sourceLayer: Layer) {
    const state = useStore.getState()
    const ids = state.selectedLayerIds.includes(sourceLayer.id) ? state.selectedLayerIds : [sourceLayer.id]
    const selected = selectedWithDescendants(state.layers, ids)
    if (!selected.length) return
    const roots = rootLayerIds(selected)
    let itemName = ''
    try {
      if (kind === 'design') {
        itemName = `${sourceLayer.name} design`
        await saveLibraryItem({
          name: itemName,
          kind,
          layers: selected.map((item) => designLayerAtFrame(item, state.currentFrame, state.totalFrames)),
          rootLayerIds: roots,
        })
      } else {
        const range = frameRangeFromSelection(selected, state.selectedKeyframes)
        itemName = `${sourceLayer.name} animation`
        await saveLibraryItem({
          name: itemName,
          kind,
          layers: selected.map((item) => animationLayerInRange(item, range.start, range.end)),
          rootLayerIds: roots,
          frameStart: range.start,
          frameEnd: range.end,
          durationFrames: Math.max(1, range.end - range.start),
        })
      }
      toast.success(t('layers.savedToLibrary', { name: itemName }))
    } catch (err) {
      toast.error(t('layers.saveFailed', { message: err instanceof Error ? err.message : String(err) }))
    }
  }

  return (
    <div
      className="flex flex-col h-full"
      style={{ width: 220, background: 'var(--panel)', borderRight: '1px solid var(--border)', flexShrink: 0 }}
    >
      <CompositionAccordion />

      {/* Header — Layers icon aligned with Composition's Settings2 icon (offset for chevron) */}
      <div className="flex items-center justify-between px-3 flex-shrink-0" style={{ height: 32, borderBottom: '1px solid var(--border)' }}>
        <div className="flex items-center gap-1.5" style={{ color: 'var(--text2)' }}>
          {/* Spacer to match composition's chevron width (12px chevron + 6px gap) */}
          <span style={{ width: 12, flexShrink: 0 }} aria-hidden />
          <Layers size={12} />
          <span className="section-header" style={{ padding: 0 }}>{t('layers.title')}</span>
        </div>
        <div ref={addMenuRef} className="relative">
        <button
          type="button"
          onClick={() => {
            setAddMenuOpen((open) => !open)
            setShapeMenuOpen(false)
          }}
          className="icon-btn"
          style={{ width: 22, height: 22, minWidth: 22 }}
        >
          <Plus size={13} />
        </button>
        {addMenuOpen && (
          <div
            className="absolute right-0 top-[26px] rounded p-1"
            style={{
              zIndex: 2300,
              minWidth: 160,
              background: 'var(--panel)',
              border: '1px solid var(--border)',
              boxShadow: '0 8px 24px rgba(0,0,0,0.28)',
            }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="relative" onMouseEnter={() => setShapeMenuOpen(true)}>
              <AddMenuItem
                label={t('layers.shape')}
                icon={Square}
                hasSubmenu
                onClick={() => setShapeMenuOpen((open) => !open)}
              />
              {shapeMenuOpen && (
                <div
                  className="absolute left-[calc(100%+8px)] top-0 rounded-md p-1.5 min-w-36"
                  style={{
                    background: 'var(--panel)',
                    border: '1px solid var(--border)',
                    boxShadow: '0 12px 36px rgba(0,0,0,0.32)',
                  }}
                  onMouseLeave={() => setShapeMenuOpen(false)}
                >
                  <AddMenuItem label={t('layers.rectangle')} icon={Square} onClick={() => addShape('rectangle')} />
                  <AddMenuItem label={t('layers.ellipse')} icon={Circle} onClick={() => addShape('ellipse')} />
                  <AddMenuItem label={t('layers.triangle')} icon={Triangle} onClick={() => addShape('triangle')} />
                  <AddMenuItem label={t('layers.line')} icon={Slash} onClick={() => addShape('line')} />
                  <AddMenuItem label={t('layers.path')} icon={PenLine} onClick={() => addShape('path')} />
                </div>
              )}
            </div>
            <AddMenuItem label={t('layers.text')} icon={Type} onClick={addTextLayer} />
            <AddMenuItem label={t('layers.image')} icon={ImageIcon} onClick={() => { setShowImages(true); setAddMenuOpen(false) }} />
            <AddMenuItem label={t('layers.video')} icon={Film} onClick={() => { setShowVideos(true); setAddMenuOpen(false) }} />
            <AddMenuItem label={t('layers.icons')} icon={Sparkles} onClick={() => { setShowIcons(true); setAddMenuOpen(false) }} />
            <AddMenuItem label={t('layers.library')} icon={Library} onClick={() => { setShowLibrary(true); setAddMenuOpen(false) }} />
          </div>
        )}
        </div>
      </div>

      {/* Sortable layer list */}
      <div className="flex-1 overflow-y-auto">
        {layers.length === 0 && (
          <div className="text-xs text-center mt-8" style={{ color: 'var(--text3)' }}>{t('layers.empty')}</div>
        )}
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragMove={handleDragMove}
          onDragCancel={() => { setDropHint(null); hoverRef.current = null }}
          onDragEnd={handleDragEnd}
        >
              <SortableContext items={rows.map((r) => r.layer.id)} strategy={verticalListSortingStrategy}>
            {rows.map(({ layer, depth }) => (
              <LayerRow
                key={layer.id}
                layer={layer}
                depth={depth}
                childCount={childCount(layer.id)}
                selected={selectedLayerIds.includes(layer.id)}
                dropHint={dropHint}
                onSelect={(e) => handleLayerSelect(layer.id, e)}
                onContextMenu={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  setMenu({ x: e.clientX, y: e.clientY, layer })
                  if (!selectedLayerIds.includes(layer.id)) selectLayer(layer.id)
                }}
              />
            ))}
          </SortableContext>
        </DndContext>
      </div>
      {menu && (
        <div
          style={{ position: 'fixed', left: menu.x, top: menu.y, zIndex: 2500, minWidth: 190, background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 6, boxShadow: '0 8px 24px rgba(0,0,0,0.35)', padding: '4px 0' }}
          onClick={(e) => e.stopPropagation()}
          onMouseLeave={() => setMenu(null)}
        >
          {[
            { label: t('layers.bringToFront'), action: () => applyLayerOrder('front') },
            { label: t('layers.bringForward'), action: () => applyLayerOrder('forward') },
            { label: t('layers.sendBackward'), action: () => applyLayerOrder('backward') },
            { label: t('layers.sendToBack'), action: () => applyLayerOrder('back') },
          ].map((item) => (
            <button key={item.label} onClick={() => { void item.action(); setMenu(null) }} className="popover-menu-item block w-full text-left px-3 py-2 text-xs" style={{ color: 'var(--text)' }}>
              {item.label}
            </button>
          ))}
          <div style={{ borderTop: '1px solid var(--border)', margin: '4px 0' }} />
          {[
            { label: t('layers.groupSelected'), action: groupSelected },
            { label: t('layers.ungroup'), action: () => ungroupLayer(menu.layer.id) },
            { label: t('layers.moveRoot'), action: () => moveLayerToParent([menu.layer.id], null) },
            { label: t('layers.duplicate'), action: () => useStore.getState().duplicateLayer(menu.layer.id) },
            { label: t('layers.exportDesign'), action: () => exportSelectionToLibrary('design', menu.layer) },
            { label: t('layers.exportAnimation'), action: () => exportSelectionToLibrary('animation', menu.layer) },
            ...(menu.layer.type === 'image' ? [{
              label: t('layers.replaceImage'),
              action: () => {
                setReplaceImageLayerId(menu.layer.id)
                setShowImages(true)
              },
            }] : []),
            ...(menu.layer.type === 'video' ? [{
              label: t('layers.replaceVideo'),
              action: () => {
                setReplaceVideoLayerId(menu.layer.id)
                setShowVideos(true)
              },
            }] : []),
            { label: t('common.delete'), danger: true, action: () => { if (childCount(menu.layer.id) === 0 || confirm(t('layers.deleteChildrenConfirm'))) useStore.getState().deleteLayer(menu.layer.id) } },
            { label: t('layers.selectChildren'), action: () => selectChildren(menu.layer.id) },
            { label: t('layers.selectSiblings'), action: () => selectSiblings(menu.layer.id) },
            { label: t('layers.collapseAll'), action: collapseAllGroups },
            { label: t('layers.expandAll'), action: expandAllGroups },
          ].map((item) => (
            <button key={item.label} onClick={() => { void item.action(); setMenu(null) }} className="popover-menu-item block w-full text-left px-3 py-2 text-xs" style={{ color: item.danger ? '#ef4444' : 'var(--text)' }}>
              {item.label}
            </button>
          ))}
          <div style={{ borderTop: '1px solid var(--border)', margin: '4px 0' }} />
          <div className="px-3 py-1 text-[10px]" style={{ color: 'var(--text3)' }}>{t('layers.moveIntoGroup')}</div>
          {layers.filter((l) => (l.type === 'group' || l.isGroup) && l.id !== menu.layer.id).map((group) => (
            <button key={group.id} onClick={() => { moveLayerToParent([menu.layer.id], group.id, topChildId(group.id, [menu.layer.id])); setMenu(null) }} className="popover-menu-item block w-full text-left px-3 py-1.5 text-xs" style={{ color: 'var(--text2)' }}>
              {group.name}
            </button>
          ))}
          <button onClick={() => { selectLayers([]); setMenu(null) }} className="popover-menu-item block w-full text-left px-3 py-2 text-xs" style={{ color: 'var(--text3)' }}>{t('layers.clearSelection')}</button>
        </div>
      )}
      {convertModal && (
        <div
          className="fixed inset-0 flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.45)', zIndex: 2600 }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div
            className="flex flex-col gap-3"
            style={{ width: 360, background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 10, padding: 16, boxShadow: '0 18px 60px rgba(0,0,0,0.35)' }}
          >
            <div>
              <div className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{t('layers.createWrapper')}</div>
              <div className="text-xs mt-1" style={{ color: 'var(--text3)' }}>
                {t('layers.createWrapperHelp', { name: convertModal.target.name })}
              </div>
            </div>
            <div className="text-xs" style={{ color: 'var(--text2)' }}>
              {t('layers.createWrapperDetail')}
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" className="pill-btn" onClick={() => setConvertModal(null)}>{t('common.cancel')}</button>
              <button
                type="button"
                className="pill-btn active"
                onClick={() => {
                  moveLayerToParent(convertModal.draggedIds, convertModal.target.id, topChildId(convertModal.target.id, convertModal.draggedIds))
                  setConvertModal(null)
                }}
              >
                {t('layers.createGroup')}
              </button>
            </div>
          </div>
        </div>
      )}
      {showIcons && <IconPickerModal onClose={() => setShowIcons(false)} onPick={addIconLayer} />}
      {showLibrary && <LibraryModal onClose={() => setShowLibrary(false)} />}
      {showImages && (
        <ImageLibraryModal
          onClose={() => {
            setShowImages(false)
            setReplaceImageLayerId(null)
          }}
          onPick={addImageAsset}
        />
      )}
      {showVideos && (
        <VideoLibraryModal
          onClose={() => {
            setShowVideos(false)
            setReplaceVideoLayerId(null)
          }}
          onPick={addVideoAsset}
        />
      )}
    </div>
  )
}
