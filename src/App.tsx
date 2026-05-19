import { useState, useEffect } from 'react'
import { LayersPanel } from './components/LayersPanel'
import { PreviewCanvas } from './components/PreviewCanvas'
import { PropertiesPanel } from './components/PropertiesPanel'
import { Timeline } from './components/Timeline'
import { ExportModal } from './components/ExportModal'
import { usePlayback } from './hooks/usePlayback'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import { useStore } from './store'
import { Tool } from './types'

const TOOLS: { id: Tool; label: string; key: string; icon: string }[] = [
  { id: 'select', label: 'Select', key: 'V', icon: '↖' },
  { id: 'hand', label: 'Pan', key: 'H', icon: '✋' },
  { id: 'rectangle', label: 'Rectangle', key: 'R', icon: '▭' },
  { id: 'ellipse', label: 'Ellipse', key: 'E', icon: '◯' },
  { id: 'text', label: 'Text', key: 'T', icon: 'T' },
  { id: 'line', label: 'Line', key: 'L', icon: '╱' },
  { id: 'triangle', label: 'Triangle', key: '', icon: '△' },
]

function ToolButton({ tool, active, onClick }: { tool: typeof TOOLS[0]; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title={`${tool.label}${tool.key ? ` (${tool.key})` : ''}`}
      className="w-7 h-7 flex items-center justify-center rounded text-xs transition-colors"
      style={{
        background: active ? 'rgba(99,102,241,0.2)' : 'transparent',
        color: active ? '#6366f1' : 'var(--text2)',
        border: `1px solid ${active ? '#6366f1' : 'transparent'}`,
        fontFamily: 'monospace',
      }}
    >
      {tool.icon}
    </button>
  )
}

function App() {
  const [showExport, setShowExport] = useState(false)
  const { theme, setTheme, undo, redo, _past, _future, currentTool, setTool } = useStore()

  usePlayback()
  useKeyboardShortcuts()

  // Apply theme class to <html>
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])

  return (
    <div className="flex flex-col h-screen overflow-hidden" style={{ background: 'var(--bg)', color: 'var(--text)' }}>
      {/* Top toolbar */}
      <header
        className="flex items-center gap-2 px-3 py-1.5 flex-shrink-0"
        style={{ background: 'var(--panel)', borderBottom: '1px solid var(--border)', minHeight: 40 }}
      >
        {/* Logo */}
        <div className="flex items-center gap-1.5 mr-2">
          <div className="w-2.5 h-2.5 rounded-sm" style={{ background: '#6366f1' }} />
          <span className="text-xs font-bold tracking-tight" style={{ color: 'var(--text)' }}>MotionEditor</span>
        </div>

        <div className="w-px h-4 mx-1" style={{ background: 'var(--border)' }} />

        {/* Undo / Redo */}
        <button
          onClick={undo}
          disabled={_past.length === 0}
          title="Undo (Ctrl+Z)"
          className="w-7 h-7 flex items-center justify-center rounded text-xs transition-colors disabled:opacity-30"
          style={{ color: 'var(--text2)', background: 'transparent' }}
        >
          ↩
        </button>
        <button
          onClick={redo}
          disabled={_future.length === 0}
          title="Redo (Ctrl+Shift+Z)"
          className="w-7 h-7 flex items-center justify-center rounded text-xs transition-colors disabled:opacity-30"
          style={{ color: 'var(--text2)', background: 'transparent' }}
        >
          ↪
        </button>

        <div className="w-px h-4 mx-1" style={{ background: 'var(--border)' }} />

        {/* Tools */}
        {TOOLS.map((tool) => (
          <ToolButton key={tool.id} tool={tool} active={currentTool === tool.id} onClick={() => setTool(tool.id)} />
        ))}

        <div className="flex-1" />

        {/* Theme toggle */}
        <button
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          className="w-7 h-7 flex items-center justify-center rounded text-sm transition-colors"
          style={{ background: 'var(--input)', color: 'var(--text2)', border: '1px solid var(--border)' }}
          title="Toggle dark/light mode"
        >
          {theme === 'dark' ? '☀️' : '🌙'}
        </button>

        {/* Export */}
        <button
          onClick={() => setShowExport(true)}
          className="text-xs rounded px-3 py-1.5 transition-colors flex items-center gap-1.5 ml-1"
          style={{ background: '#6366f1', color: '#fff', border: 'none' }}
        >
          ↓ Export MP4
        </button>
      </header>

      {/* Main area */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
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
