import { useRef } from 'react'
import { useStore } from '../store'

const EyeIcon = ({ open }: { open: boolean }) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    {open ? (
      <>
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
        <circle cx="12" cy="12" r="3" />
      </>
    ) : (
      <>
        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
        <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
        <line x1="1" y1="1" x2="23" y2="23" />
      </>
    )}
  </svg>
)

const TrashIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
  </svg>
)

export function LayersPanel() {
  const { layers, selectedLayerId, selectLayer, toggleVisibility, deleteLayer, addRectangle, addImage } =
    useStore()
  const fileRef = useRef<HTMLInputElement>(null)

  function handleImageImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const url = URL.createObjectURL(file)
    addImage(url, file.name.replace(/\.[^.]+$/, ''))
    e.target.value = ''
  }

  return (
    <div className="flex flex-col h-full bg-[#161616] border-r border-[#2a2a2a]" style={{ width: 220 }}>
      <div className="px-3 py-2 border-b border-[#2a2a2a] flex items-center justify-between">
        <span className="text-xs font-semibold text-[#888] uppercase tracking-widest">Layers</span>
      </div>

      <div className="flex gap-1 px-2 py-2 border-b border-[#2a2a2a]">
        <button
          onClick={addRectangle}
          className="flex-1 text-xs bg-[#6366f1] hover:bg-[#4f52c8] text-white rounded px-2 py-1.5 transition-colors"
        >
          + Rect
        </button>
        <button
          onClick={() => fileRef.current?.click()}
          className="flex-1 text-xs bg-[#2a2a2a] hover:bg-[#333] text-[#ccc] rounded px-2 py-1.5 transition-colors"
        >
          + Image
        </button>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleImageImport} />
      </div>

      <div className="flex-1 overflow-y-auto">
        {layers.length === 0 && (
          <div className="text-xs text-[#555] text-center mt-8">No layers yet</div>
        )}
        {[...layers].map((layer, i) => (
          <div
            key={layer.id}
            onClick={() => selectLayer(layer.id)}
            className={`flex items-center gap-2 px-2 py-2 cursor-pointer group border-b border-[#1e1e1e] transition-colors ${
              selectedLayerId === layer.id
                ? 'bg-[#1e1e3a] border-l-2 border-l-[#6366f1]'
                : 'hover:bg-[#1d1d1d]'
            }`}
          >
            {/* Color swatch */}
            <div
              className="w-3 h-3 rounded-sm flex-shrink-0"
              style={{ background: layer.color || '#555' }}
            />

            {/* Name */}
            <span className="flex-1 text-xs text-[#ccc] truncate">{layer.name}</span>

            {/* Visibility */}
            <button
              onClick={(e) => { e.stopPropagation(); toggleVisibility(layer.id) }}
              className={`opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:text-white ${
                layer.visible ? 'text-[#888]' : 'text-[#444]'
              }`}
            >
              <EyeIcon open={layer.visible} />
            </button>

            {/* Delete */}
            <button
              onClick={(e) => { e.stopPropagation(); deleteLayer(layer.id) }}
              className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded text-[#888] hover:text-red-400"
            >
              <TrashIcon />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
