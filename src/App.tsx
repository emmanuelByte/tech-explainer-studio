import { useState } from 'react'
import { LayersPanel } from './components/LayersPanel'
import { PreviewCanvas } from './components/PreviewCanvas'
import { PropertiesPanel } from './components/PropertiesPanel'
import { Timeline } from './components/Timeline'
import { ExportModal } from './components/ExportModal'
import { usePlayback } from './hooks/usePlayback'

function App() {
  const [showExport, setShowExport] = useState(false)
  usePlayback()

  return (
    <div className="flex flex-col h-screen bg-[#0f0f0f] overflow-hidden">
      {/* Top bar */}
      <header className="flex items-center justify-between px-4 py-2 bg-[#141414] border-b border-[#2a2a2a] flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-sm bg-[#6366f1]" />
          <span className="text-sm font-semibold text-white tracking-tight">MotionEditor</span>
        </div>
        <button
          onClick={() => setShowExport(true)}
          className="text-xs bg-[#2a2a2a] hover:bg-[#333] text-[#ccc] border border-[#3a3a3a] rounded px-3 py-1.5 transition-colors flex items-center gap-1.5"
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          Export MP4
        </button>
      </header>

      {/* Main area: panels + canvas */}
      <div className="flex flex-1 min-h-0">
        <LayersPanel />
        <PreviewCanvas />
        <PropertiesPanel />
      </div>

      {/* Timeline */}
      <Timeline />

      {showExport && <ExportModal onClose={() => setShowExport(false)} />}
    </div>
  )
}

export default App
