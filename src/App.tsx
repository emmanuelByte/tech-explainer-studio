import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  AlertTriangle, Check, Circle, CircleDot, Download, FileJson, Hand, History,
  Home, LoaderCircle, Moon, MousePointer2, PenLine, Redo2, Save, Slash, Square,
  Settings, Sparkles, Sun, Triangle, Type, Undo2,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { LayersPanel } from './components/LayersPanel'
import { PreviewCanvas } from './components/PreviewCanvas'
import { PropertiesPanel } from './components/PropertiesPanel'
import { Timeline } from './components/Timeline'
import { ExportModal } from './components/ExportModal'
import { AiAssistantModal } from './components/AiAssistantModal'
import { HomeScreen } from './components/HomeScreen'
import { SettingsModal } from './components/SettingsModal'
import { usePlayback } from './hooks/usePlayback'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import { useStore } from './store'
import { MotionProject, ProjectHistorySnapshot, Tool } from './types'
import {
  exportJson,
  projectFromStore,
  readHistory,
  readProject,
  saveHistorySnapshot,
  upsertProject,
} from './projectStorage'

const TOOLS: { id: Tool; label: string; key: string; icon: LucideIcon }[] = [
  { id: 'select', label: 'Select', key: 'V', icon: MousePointer2 },
  { id: 'hand', label: 'Pan', key: 'H', icon: Hand },
  { id: 'rectangle', label: 'Rectangle', key: 'R', icon: Square },
  { id: 'ellipse', label: 'Ellipse', key: 'E', icon: Circle },
  { id: 'text', label: 'Text', key: 'T', icon: Type },
  { id: 'line', label: 'Line', key: 'L', icon: Slash },
  { id: 'triangle', label: 'Triangle', key: '', icon: Triangle },
  { id: 'pen', label: 'Pen', key: 'P', icon: PenLine },
]

type Route = { name: 'home' } | { name: 'editor'; projectId: string }
type SaveStatus = 'saved' | 'unsaved' | 'saving' | 'failed'

function routeFromPath(): Route {
  const match = window.location.pathname.match(/^\/editor\/([^/]+)/)
  return match ? { name: 'editor', projectId: decodeURIComponent(match[1]) } : { name: 'home' }
}

function pushRoute(route: Route) {
  const path = route.name === 'home' ? '/' : `/editor/${encodeURIComponent(route.projectId)}`
  window.history.pushState(null, '', path)
  window.dispatchEvent(new PopStateEvent('popstate'))
}

function ToolButton({ tool, active, onClick }: { tool: typeof TOOLS[0]; active: boolean; onClick: () => void }) {
  const { t } = useTranslation()
  const Icon = tool.icon
  const label = t(`tools.${tool.id}`, { defaultValue: tool.label })
  return (
    <button
      onClick={onClick}
      title={`${label}${tool.key ? ` (${tool.key})` : ''}`}
      className={`icon-btn ${active ? 'active' : ''}`}
    >
      <Icon size={15} strokeWidth={2.2} />
    </button>
  )
}

function SaveIndicator({ status, onRetry }: { status: SaveStatus; onRetry: () => void }) {
  const { t } = useTranslation()
  const map = {
    saved: { icon: Check, text: t('topbar.saved'), color: '#22c55e' },
    unsaved: { icon: CircleDot, text: t('topbar.unsaved'), color: '#f59e0b' },
    saving: { icon: LoaderCircle, text: t('topbar.saving'), color: '#60a5fa' },
    failed: { icon: AlertTriangle, text: t('topbar.failed'), color: '#ef4444' },
  }[status]
  const Icon = map.icon
  return (
    <div className="flex items-center gap-1 text-xs" style={{ color: map.color }}>
      <Icon size={13} className={status === 'saving' ? 'animate-spin' : ''} />
      <span>{map.text}</span>
      {status === 'failed' && <button onClick={onRetry} className="underline ml-1">{t('topbar.retry')}</button>}
    </div>
  )
}

function ProjectTitle() {
  const { t } = useTranslation()
  const { projectName, renameProject } = useStore()
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(projectName)

  useEffect(() => setName(projectName), [projectName])

  function commit() {
    setEditing(false)
    const next = name.trim()
    if (next) renameProject(next)
    else setName(projectName)
  }

  if (editing) {
    return (
      <input
      className="input-base text-xs text-center"
        value={name}
        autoFocus
        onChange={(e) => setName(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit()
          if (e.key === 'Escape') { setEditing(false); setName(projectName) }
        }}
      />
    )
  }
  return (
    <button className="text-xs font-semibold truncate max-w-[260px]" title={t('topbar.renameProject')} onClick={() => setEditing(true)}>
      {projectName}
    </button>
  )
}

function HistoryModal({ onClose, onRestore }: { onClose: () => void; onRestore: (snapshot: ProjectHistorySnapshot) => void | Promise<void> }) {
  const { t } = useTranslation()
  const projectId = useStore((s) => s.projectId)
  const [snapshots, setSnapshots] = useState<ProjectHistorySnapshot[]>([])
  const [active, setActive] = useState<ProjectHistorySnapshot | null>(null)

  useEffect(() => {
    if (!projectId) {
      setSnapshots([])
      setActive(null)
      return
    }
    void readHistory(projectId).then((items) => {
      setSnapshots(items)
      setActive(items[0] ?? null)
    })
  }, [projectId])

  return (
    <div className="fixed inset-0 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.55)', zIndex: 3000 }}>
      <div className="w-[720px] max-w-[calc(100vw-32px)] rounded-lg p-4" style={{ background: 'var(--panel)', border: '1px solid var(--border)', boxShadow: '0 24px 80px rgba(0,0,0,0.5)' }}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold">{t('topbar.history')}</h2>
          <button onClick={onClose} style={{ color: 'var(--text2)' }}>x</button>
        </div>
        <div className="grid grid-cols-[260px_1fr] gap-4 min-h-[280px]">
          <div className="overflow-auto" style={{ borderRight: '1px solid var(--border)' }}>
            {snapshots.length === 0 && <div className="text-xs" style={{ color: 'var(--text3)' }}>{t('topbar.noManualSaves')}</div>}
            {snapshots.map((snapshot) => (
              <button
                key={snapshot.id}
                className="block w-full text-left px-2 py-2 rounded text-xs"
                style={{ background: active?.id === snapshot.id ? 'rgba(99,102,241,0.16)' : 'transparent' }}
                onClick={() => setActive(snapshot)}
              >
                <div>{snapshot.label}</div>
                <div style={{ color: 'var(--text3)' }}>{new Date(snapshot.timestamp).toLocaleString()}</div>
              </button>
            ))}
          </div>
          <div>
            {active ? (
              <>
                <div className="aspect-video rounded mb-3 flex items-center justify-center" style={{ background: 'var(--canvas-bg)', border: '1px solid var(--border)' }}>
                  <div className="text-xs" style={{ color: 'var(--text2)' }}>
                    {active.project.canvas.width} x {active.project.canvas.height} · {active.project.layers.length} layers
                  </div>
                </div>
                <button onClick={() => void onRestore(active)} className="rounded px-3 py-2 text-sm" style={{ background: '#6366f1', color: '#fff' }}>
                  {t('topbar.restoreVersion')}
                </button>
              </>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}

function EditorTopBar({ saveStatus, onForceSave, onGoHome, onExportMp4, onOpenAi }: {
  saveStatus: SaveStatus
  onForceSave: () => void
  onGoHome: () => void
  onExportMp4: () => void
  onOpenAi: () => void
}) {
  const { t } = useTranslation()
  const { theme, setTheme, undo, redo, _past, _future, currentTool, setTool, autoKeyframe, setAutoKeyframe } = useStore()
  const [showHistory, setShowHistory] = useState(false)
  const [showSettings, setShowSettings] = useState(false)

  function exportProject() {
    const project = projectFromStore()
    exportJson(`${project.name}.motionproj`, project)
  }

  return (
    <header
      className="capcut-topbar flex items-center gap-2 px-3 py-1.5 flex-shrink-0"
      style={{ minHeight: 44, zIndex: 5 }}
    >
      <button onClick={onGoHome} className="pill-btn" title={t('topbar.home')}><Home size={14} />{t('topbar.home')}</button>
      <div className="w-px h-4 mx-1" style={{ background: 'var(--border)' }} />
      <button onClick={undo} disabled={_past.length === 0} title={`${t('topbar.undo')} (Ctrl+Z)`} className="icon-btn disabled:opacity-30"><Undo2 size={15} /></button>
      <button onClick={redo} disabled={_future.length === 0} title={`${t('topbar.redo')} (Ctrl+Shift+Z)`} className="icon-btn disabled:opacity-30"><Redo2 size={15} /></button>
      <div className="w-px h-4 mx-1" style={{ background: 'var(--border)' }} />
      {TOOLS.map((tool) => <ToolButton key={tool.id} tool={tool} active={currentTool === tool.id} onClick={() => setTool(tool.id)} />)}

      <div className="flex-1 flex items-center justify-center gap-3 min-w-0">
        <ProjectTitle />
        <SaveIndicator status={saveStatus} onRetry={onForceSave} />
      </div>

      <button onClick={() => setShowHistory(true)} className="pill-btn"><History size={14} />{t('topbar.history')}</button>
      <button onClick={onOpenAi} className="pill-btn"><Sparkles size={14} />{t('topbar.ai')}</button>
      <button onClick={exportProject} className="pill-btn"><FileJson size={14} />{t('topbar.project')}</button>
      <button onClick={() => setAutoKeyframe(!autoKeyframe)} title={t('topbar.autoKeyframe')} className={`icon-btn ${autoKeyframe ? 'active' : ''}`} style={autoKeyframe ? { background: '#ef4444', color: '#fff' } : undefined}><CircleDot size={15} /></button>
      <button onClick={() => setShowSettings(true)} className="icon-btn" title={t('common.settings')}><Settings size={15} /></button>
      <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} className="icon-btn" title={t('topbar.toggleTheme')}>{theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}</button>
      <button onClick={onExportMp4} className="pill-btn primary-btn ml-1"><Download size={14} />{t('topbar.exportMp4')}</button>
      {showHistory && <HistoryModal onClose={() => setShowHistory(false)} onRestore={async (snapshot) => { useStore.getState().loadProject(snapshot.project); await upsertProject(snapshot.project); setShowHistory(false) }} />}
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </header>
  )
}

function EditorScreen({ projectId }: { projectId: string }) {
  const [showExport, setShowExport] = useState(false)
  const [showAi, setShowAi] = useState(false)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved')
  const saveTimer = useRef<number | null>(null)
  const loadedId = useRef<string | null>(null)
  const storeState = useStore()
  const timelinePanelHeight = useStore((s) => s.timelinePanelHeight)

  usePlayback()
  useKeyboardShortcuts()

  useEffect(() => {
    if (loadedId.current === projectId) return
    let cancelled = false
    void readProject(projectId).then((project) => {
      if (cancelled) return
      if (project) {
        useStore.getState().loadProject(project)
        loadedId.current = projectId
        setSaveStatus('saved')
      } else {
        pushRoute({ name: 'home' })
      }
    })
    return () => {
      cancelled = true
    }
  }, [projectId])

  const forceSave = async (history = false) => {
    try {
      setSaveStatus('saving')
      const project = projectFromStore()
      await upsertProject(project)
      useStore.setState({ projectUpdatedAt: project.updatedAt })
      if (history) await saveHistorySnapshot(project)
      setSaveStatus('saved')
    } catch {
      setSaveStatus('failed')
    }
  }

  useEffect(() => {
    if (!loadedId.current) return
    setSaveStatus((s) => s === 'failed' ? s : 'unsaved')
    if (saveTimer.current) window.clearTimeout(saveTimer.current)
    if (storeState.activeInteractionCount > 0) return
    saveTimer.current = window.setTimeout(() => void forceSave(false), 500)
    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current)
    }
  }, [
    storeState.projectName,
    storeState.layers,
    storeState.guides,
    storeState.currentFrame,
    storeState.totalFrames,
    storeState.fps,
    storeState.canvasPreset,
    storeState.customWidth,
    storeState.customHeight,
    storeState.canvasBackgroundColor,
    storeState.timelineZoom,
    storeState.timelineScrollX,
    storeState.editorZoom,
    storeState.editorPanX,
    storeState.editorPanY,
    storeState.selectedLayerIds,
    storeState.activeInteractionCount,
  ])

  useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (saveStatus === 'saved') return
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [saveStatus])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        if (saveTimer.current) window.clearTimeout(saveTimer.current)
        void forceSave(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  function goHome() {
    if (saveStatus !== 'saved' && !confirm('You have unsaved changes. Leave the editor?')) return
    pushRoute({ name: 'home' })
  }

  return (
    <div className="capcut-shell h-screen flex flex-col overflow-hidden" style={{ color: 'var(--text)' }}>
      <EditorTopBar saveStatus={saveStatus} onForceSave={() => void forceSave(false)} onGoHome={goHome} onExportMp4={() => setShowExport(true)} onOpenAi={() => setShowAi((v) => !v)} />
      <div className="relative flex-1 min-h-0 overflow-hidden">
        <div className="absolute left-0 right-0 top-0 flex min-h-0 overflow-hidden" style={{ bottom: timelinePanelHeight }}>
          <LayersPanel />
          <PreviewCanvas />
          <PropertiesPanel />
        </div>
        <Timeline />
      </div>
      {showAi && <AiAssistantModal onClose={() => setShowAi(false)} />}
      {showExport && <ExportModal onClose={() => setShowExport(false)} />}
    </div>
  )
}

function App() {
  const [route, setRoute] = useState<Route>(routeFromPath)
  const theme = useStore((s) => s.theme)

  useEffect(() => {
    const onPop = () => setRoute(routeFromPath())
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])

  if (route.name === 'home') {
    return <HomeScreen onOpenProject={(project: MotionProject) => { pushRoute({ name: 'editor', projectId: project.id }) }} />
  }

  return <EditorScreen projectId={route.projectId} />
}

export default App
