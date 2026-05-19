import { useRef } from 'react'
import {
  ChevronRight, Circle, Eye, EyeOff, Folder, GripVertical, Image as ImageIcon,
  Lock, Slash, Square, Trash2, Triangle, Type, Unlock,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useStore } from '../store'
import { Layer, LayerType, LAYER_TYPE_COLOR } from '../types'
import {
  DndContext, closestCenter, DragEndEvent,
  PointerSensor, useSensor, useSensors,
} from '@dnd-kit/core'
import {
  SortableContext, verticalListSortingStrategy,
  useSortable, arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useState } from 'react'
import { visibleLayerRows } from '../layerTree'

const TYPE_ICONS: Record<LayerType, LucideIcon> = {
  rectangle: Square, ellipse: Circle, line: Slash,
  triangle: Triangle, text: Type, image: ImageIcon,
  group: Folder,
}

function AddButton({ label, icon: Icon, onClick }: { label: string; icon: LucideIcon; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="pill-btn flex-1 text-xs"
      style={{ height: 26, padding: '0 6px' }}
      title={label}
    >
      <Icon size={13} />
      {label}
    </button>
  )
}

function LayerRow({ layer, depth, selected, childCount, onSelect, onContextMenu }: {
  layer: Layer
  depth: number
  selected: boolean
  childCount: number
  onSelect: (e: React.MouseEvent) => void
  onContextMenu: (e: React.MouseEvent) => void
}) {
  const { toggleVisibility, toggleLock, deleteLayer, renameLayer, toggleLayerCollapsed } = useStore()
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(layer.name)
  const inputRef = useRef<HTMLInputElement>(null)

  const {
    attributes, listeners, setNodeRef,
    transform, transition, isDragging,
  } = useSortable({ id: layer.id })
  const TypeIcon = TYPE_ICONS[layer.type]

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
        display: 'flex', alignItems: 'center', gap: 4, padding: '0 6px 0 2px',
        height: 32, cursor: 'pointer', userSelect: 'none',
        borderBottom: '1px solid var(--border2)',
        background: isDragging
          ? 'rgba(32,213,248,0.16)'
          : selected ? 'rgba(32,213,248,0.12)' : 'transparent',
        borderLeft: `2px solid ${selected ? LAYER_TYPE_COLOR[layer.type] : 'transparent'}`,
        transition: transition ?? 'background 0.1s',
        transform: CSS.Transform.toString(transform),
        opacity: isDragging ? 0.6 : 1,
        zIndex: isDragging ? 50 : undefined,
      }}
      className="group"
    >
      <div style={{ width: depth * 16, alignSelf: 'stretch', position: 'relative', flexShrink: 0 }}>
        {depth > 0 && <div style={{ position: 'absolute', left: depth * 16 - 9, top: 0, bottom: 0, borderLeft: '1px solid var(--border)' }} />}
      </div>

      {childCount > 0 || layer.type === 'group' || layer.isGroup ? (
        <button
          onClick={(e) => { e.stopPropagation(); toggleLayerCollapsed(layer.id) }}
          className="icon-btn"
          style={{ width: 18, minWidth: 18, height: 18, color: 'var(--text2)', transform: layer.collapsed ? 'none' : 'rotate(90deg)', transition: 'transform 0.12s' }}
          title={layer.collapsed ? 'Expand group' : 'Collapse group'}
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
        title="Drag to reorder or parent"
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
          title="Toggle visibility"
        >
          {layer.visible ? <Eye size={13} /> : <EyeOff size={13} />}
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); toggleLock(layer.id) }}
          style={{ color: layer.locked ? '#f59e0b' : 'var(--text3)', fontSize: 12, padding: '0 2px' }}
          title="Toggle lock"
        >
          {layer.locked ? <Lock size={13} /> : <Unlock size={13} />}
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); deleteLayer(layer.id) }}
          style={{ color: 'var(--text3)', fontSize: 12, padding: '0 2px' }}
          className="hover:!text-red-400 transition-colors"
          title="Delete layer"
        >
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  )
}

export function LayersPanel() {
  const {
    layers, selectedLayerIds, selectLayer, selectLayers, addLayer, addImage,
    reorderLayersById, moveLayerToParent, groupSelected, ungroupLayer,
    selectChildren, selectSiblings, collapseAllGroups, expandAllGroups,
  } = useStore()
  const fileRef = useRef<HTMLInputElement>(null)
  const [menu, setMenu] = useState<{ x: number; y: number; layer: Layer } | null>(null)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

  // Panel shows topmost layer first while preserving nesting.
  const rows = visibleLayerRows(layers, true)
  const childCount = (id: string) => layers.filter((l) => l.parentId === id).length

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const draggedIds = selectedLayerIds.includes(String(active.id)) ? selectedLayerIds : [String(active.id)]
    const target = layers.find((l) => l.id === over.id)
    if (!target) return

    const translated = active.rect.current.translated
    const overRect = over.rect
    const pointerY = translated ? translated.top + translated.height / 2 : overRect.top + overRect.height / 2
    const ratio = (pointerY - overRect.top) / overRect.height

    if (ratio >= 0.25 && ratio <= 0.75) {
      if (target.type !== 'group' && !target.isGroup && !confirm('Convert to group?')) return
      moveLayerToParent(draggedIds, target.id)
      return
    }

    const oldIdx = rows.findIndex((r) => r.layer.id === active.id)
    const newIdx = rows.findIndex((r) => r.layer.id === over.id)
    const newRows = arrayMove(rows, oldIdx, newIdx)
    reorderLayersById([...newRows].reverse().map((r) => r.layer.id))
    moveLayerToParent(draggedIds, target.parentId ?? null, target.id)
  }

  function handleImageImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    addImage(URL.createObjectURL(file), file.name.replace(/\.[^.]+$/, ''))
    e.target.value = ''
  }

  return (
    <div
      className="flex flex-col h-full"
      style={{ width: 220, background: 'var(--panel-glass)', borderRight: '1px solid var(--border)', flexShrink: 0 }}
    >
      {/* Header */}
      <div className="px-3 py-2 flex-shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
        <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text2)' }}>Layers</span>
      </div>

      {/* Shape buttons */}
      <div className="px-2 py-2 flex-shrink-0 flex flex-col gap-1.5" style={{ borderBottom: '1px solid var(--border)' }}>
        <div className="flex gap-1">
          <AddButton label="Rect" icon={Square} onClick={() => addLayer('rectangle')} />
          <AddButton label="Ellipse" icon={Circle} onClick={() => addLayer('ellipse')} />
          <AddButton label="Tri" icon={Triangle} onClick={() => addLayer('triangle')} />
        </div>
        <div className="flex gap-1">
          <AddButton label="Text" icon={Type} onClick={() => addLayer('text')} />
          <AddButton label="Line" icon={Slash} onClick={() => addLayer('line')} />
          <button
            onClick={() => fileRef.current?.click()}
            className="pill-btn flex-1 text-xs"
            style={{ height: 26, padding: '0 6px' }}
            title="Image"
          >
            <ImageIcon size={13} />
            Image
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleImageImport} />
        </div>
      </div>

      {/* Sortable layer list */}
      <div className="flex-1 overflow-y-auto">
        {layers.length === 0 && (
          <div className="text-xs text-center mt-8" style={{ color: 'var(--text3)' }}>No layers yet</div>
        )}
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={rows.map((r) => r.layer.id)} strategy={verticalListSortingStrategy}>
            {rows.map(({ layer, depth }) => (
              <LayerRow
                key={layer.id}
                layer={layer}
                depth={depth}
                childCount={childCount(layer.id)}
                selected={selectedLayerIds.includes(layer.id)}
                onSelect={(e) => selectLayer(layer.id, e.shiftKey || e.metaKey || e.ctrlKey)}
                onContextMenu={(e) => {
                  e.preventDefault()
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
          style={{ position: 'fixed', left: menu.x, top: menu.y, zIndex: 2500, minWidth: 180, background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 6, boxShadow: '0 8px 24px rgba(0,0,0,0.35)', padding: '4px 0' }}
          onClick={(e) => e.stopPropagation()}
          onMouseLeave={() => setMenu(null)}
        >
          {[
            { label: 'Group selected', action: groupSelected },
            { label: 'Ungroup', action: () => ungroupLayer(menu.layer.id) },
            { label: 'Move to root', action: () => moveLayerToParent([menu.layer.id], null) },
            { label: 'Duplicate', action: () => useStore.getState().duplicateLayer(menu.layer.id) },
            { label: 'Delete', danger: true, action: () => { if (childCount(menu.layer.id) === 0 || confirm('Delete layer and all children?')) useStore.getState().deleteLayer(menu.layer.id) } },
            { label: 'Select children', action: () => selectChildren(menu.layer.id) },
            { label: 'Select siblings', action: () => selectSiblings(menu.layer.id) },
            { label: 'Collapse all groups', action: collapseAllGroups },
            { label: 'Expand all groups', action: expandAllGroups },
          ].map((item) => (
            <button key={item.label} onClick={() => { item.action(); setMenu(null) }} className="block w-full text-left px-3 py-2 text-xs" style={{ color: item.danger ? '#ef4444' : 'var(--text)' }}>
              {item.label}
            </button>
          ))}
          <div style={{ borderTop: '1px solid var(--border)', margin: '4px 0' }} />
          <div className="px-3 py-1 text-[10px]" style={{ color: 'var(--text3)' }}>Move into group</div>
          {layers.filter((l) => (l.type === 'group' || l.isGroup) && l.id !== menu.layer.id).map((group) => (
            <button key={group.id} onClick={() => { moveLayerToParent([menu.layer.id], group.id); setMenu(null) }} className="block w-full text-left px-3 py-1.5 text-xs" style={{ color: 'var(--text2)' }}>
              {group.name}
            </button>
          ))}
          <button onClick={() => { selectLayers([]); setMenu(null) }} className="block w-full text-left px-3 py-2 text-xs" style={{ color: 'var(--text3)' }}>Clear selection</button>
        </div>
      )}
    </div>
  )
}
