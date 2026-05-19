import { useRef, useState } from 'react'
import { useStore } from '../store'
import { Layer, LayerType, LAYER_TYPE_COLOR } from '../types'

const TYPE_ICONS: Record<LayerType, string> = {
  rectangle: '▭', ellipse: '◯', line: '╱',
  triangle: '△', text: 'T', image: '🖼',
}

function AddButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex-1 text-xs rounded py-1 transition-colors"
      style={{ background: 'var(--input)', color: 'var(--text2)', border: '1px solid var(--border)' }}
    >
      {label}
    </button>
  )
}

function LayerRow({ layer, selected, onSelect }: { layer: Layer; selected: boolean; onSelect: () => void }) {
  const { toggleVisibility, toggleLock, deleteLayer, renameLayer } = useStore()
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(layer.name)
  const inputRef = useRef<HTMLInputElement>(null)

  function commitRename() {
    setEditing(false)
    if (name.trim()) renameLayer(layer.id, name.trim())
    else setName(layer.name)
  }

  return (
    <div
      onClick={onSelect}
      style={{
        display: 'flex', alignItems: 'center', gap: 6, padding: '0 8px',
        height: 32, cursor: 'pointer', userSelect: 'none',
        borderBottom: '1px solid var(--border2)',
        background: selected ? 'rgba(99,102,241,0.1)' : 'transparent',
        borderLeft: `2px solid ${selected ? LAYER_TYPE_COLOR[layer.type] : 'transparent'}`,
        transition: 'background 0.1s',
      }}
      className="group"
    >
      {/* Type icon */}
      <span style={{ fontSize: 12, width: 14, textAlign: 'center', color: LAYER_TYPE_COLOR[layer.type], flexShrink: 0 }}>
        {TYPE_ICONS[layer.type]}
      </span>

      {/* Name */}
      {editing ? (
        <input
          ref={inputRef}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={commitRename}
          onKeyDown={(e) => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') { setEditing(false); setName(layer.name) } }}
          onClick={(e) => e.stopPropagation()}
          autoFocus
          className="flex-1 input-base text-xs h-5"
          style={{ minWidth: 0 }}
        />
      ) : (
        <span
          className="flex-1 text-xs truncate"
          style={{ color: 'var(--text)', opacity: layer.visible ? 1 : 0.4 }}
          onDoubleClick={(e) => { e.stopPropagation(); setEditing(true); setTimeout(() => inputRef.current?.select(), 10) }}
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
          {layer.visible ? '◎' : '○'}
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); toggleLock(layer.id) }}
          style={{ color: layer.locked ? '#f59e0b' : 'var(--text3)', fontSize: 12, padding: '0 2px' }}
          title="Toggle lock"
        >
          {layer.locked ? '⚿' : '⚿'}
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); deleteLayer(layer.id) }}
          style={{ color: 'var(--text3)', fontSize: 12, padding: '0 2px' }}
          className="hover:!text-red-400 transition-colors"
          title="Delete layer"
        >
          ✕
        </button>
      </div>
    </div>
  )
}

export function LayersPanel() {
  const { layers, selectedLayerIds, selectLayer, addLayer, addImage } = useStore()
  const fileRef = useRef<HTMLInputElement>(null)

  function handleImageImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    addImage(URL.createObjectURL(file), file.name.replace(/\.[^.]+$/, ''))
    e.target.value = ''
  }

  return (
    <div
      className="flex flex-col h-full"
      style={{ width: 210, background: 'var(--panel)', borderRight: '1px solid var(--border)', flexShrink: 0 }}
    >
      {/* Header */}
      <div className="px-3 py-2 flex-shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
        <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text2)' }}>Layers</span>
      </div>

      {/* Shape buttons */}
      <div className="px-2 py-2 flex-shrink-0 flex flex-col gap-1.5" style={{ borderBottom: '1px solid var(--border)' }}>
        <div className="flex gap-1">
          <AddButton label="▭ Rect" onClick={() => addLayer('rectangle')} />
          <AddButton label="◯ Ellipse" onClick={() => addLayer('ellipse')} />
          <AddButton label="△ Tri" onClick={() => addLayer('triangle')} />
        </div>
        <div className="flex gap-1">
          <AddButton label="T Text" onClick={() => addLayer('text')} />
          <AddButton label="╱ Line" onClick={() => addLayer('line')} />
          <button
            onClick={() => fileRef.current?.click()}
            className="flex-1 text-xs rounded py-1 transition-colors"
            style={{ background: 'var(--input)', color: 'var(--text2)', border: '1px solid var(--border)' }}
          >
            🖼 Image
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleImageImport} />
        </div>
      </div>

      {/* Layer list (reverse: topmost first) */}
      <div className="flex-1 overflow-y-auto">
        {layers.length === 0 && (
          <div className="text-xs text-center mt-8" style={{ color: 'var(--text3)' }}>No layers yet</div>
        )}
        {[...layers].reverse().map((layer) => (
          <LayerRow
            key={layer.id}
            layer={layer}
            selected={selectedLayerIds.includes(layer.id)}
            onSelect={() => selectLayer(layer.id)}
          />
        ))}
      </div>
    </div>
  )
}
