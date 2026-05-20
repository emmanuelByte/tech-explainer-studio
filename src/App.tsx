import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  AlertTriangle, Check, Circle, CircleDot, Download, FileJson, Hand, History,
  Home, LoaderCircle, Moon, MousePointer2, PenLine, Redo2, Save, Slash, Square,
  Settings, Sparkles, Sun, Triangle, Type, Undo2,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Modal } from './components/Modal'
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
    <Modal title={t('topbar.history')} onClose={onClose} width={720} zIndex={3000}>
      <div style={{ padding: 16, display: 'grid', gridTemplateColumns: '260px 1fr', gap: 16, minHeight: 280 }}>
        <div style={{ overflow: 'auto', borderRight: '1px solid var(--border)', paddingRight: 12 }}>
          {snapshots.length === 0 && <div style={{ fontSize: 11, color: 'var(--text3)' }}>{t('topbar.noManualSaves')}</div>}
          {snapshots.map((snapshot) => (
            <button
              key={snapshot.id}
              style={{
                display: 'block', width: '100%', textAlign: 'left',
                padding: '8px 10px', borderRadius: 4, fontSize: 11, marginBottom: 2,
                background: active?.id === snapshot.id ? 'var(--selected-bg)' : 'transparent',
                color: 'var(--text)',
              }}
              onClick={() => setActive(snapshot)}
            >
              <div>{snapshot.label}</div>
              <div style={{ color: 'var(--text3)', marginTop: 2 }}>{new Date(snapshot.timestamp).toLocaleString()}</div>
            </button>
          ))}
        </div>
        <div>
          {active ? (
            <>
              <div className="aspect-video rounded mb-3 flex items-center justify-center" style={{ background: 'var(--canvas-bg)', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: 11, color: 'var(--text2)' }}>
                  {active.project.canvas.width} × {active.project.canvas.height} · {t('topbar.layersCount', { count: active.project.layers.length })}
                </div>
              </div>
              <button
                onClick={() => void onRestore(active)}
                className="primary-btn"
                style={{ height: 30, padding: '0 14px', fontSize: 12 }}
              >
                {t('topbar.restoreVersion')}
              </button>
            </>
          ) : null}
        </div>
      </div>
    </Modal>
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
      className="capcut-topbar flex items-center flex-shrink-0"
      style={{ minHeight: 40, zIndex: 5, gap: 0, padding: '0 8px' }}
    >
      {/* Left: Home + Undo/Redo */}
      <div className="flex items-center gap-1 flex-shrink-0">
        <button onClick={onGoHome} className="icon-btn" title={t('topbar.home')}><Home size={14} /></button>
        <div style={{ width: 1, height: 16, background: 'var(--border)', margin: '0 2px' }} />
        <button onClick={undo} disabled={_past.length === 0} title={`${t('topbar.undo')} (Ctrl+Z)`} className="icon-btn"><Undo2 size={14} /></button>
        <button onClick={redo} disabled={_future.length === 0} title={`${t('topbar.redo')} (Ctrl+Shift+Z)`} className="icon-btn"><Redo2 size={14} /></button>
        <div style={{ width: 1, height: 16, background: 'var(--border)', margin: '0 2px' }} />
        {/* Tools */}
        {TOOLS.map((tool) => <ToolButton key={tool.id} tool={tool} active={currentTool === tool.id} onClick={() => setTool(tool.id)} />)}
      </div>

      {/* Center: Project name + save */}
      <div className="flex-1 flex items-center justify-center gap-2 min-w-0 px-3">
        <ProjectTitle />
        <SaveIndicator status={saveStatus} onRetry={onForceSave} />
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-1 flex-shrink-0">
        <button onClick={() => setShowHistory(true)} className="icon-btn" title={t('topbar.history')}><History size={14} /></button>
        <button onClick={onOpenAi} className="icon-btn" title={t('topbar.ai')}><Sparkles size={14} /></button>
        <button onClick={exportProject} className="icon-btn" title={t('topbar.project')}><FileJson size={14} /></button>
        <button
          onClick={() => setAutoKeyframe(!autoKeyframe)}
          title={t('topbar.autoKeyframe')}
          className="icon-btn"
          style={autoKeyframe ? { background: 'rgba(239,68,68,0.15)', color: '#ef4444' } : undefined}
        >
          <CircleDot size={14} />
        </button>
        <div style={{ width: 1, height: 16, background: 'var(--border)', margin: '0 2px' }} />
        <button onClick={() => setShowSettings(true)} className="icon-btn" title={t('common.settings')}><Settings size={14} /></button>
        <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} className="icon-btn" title={t('topbar.toggleTheme')}>
          {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
        </button>
        <button onClick={onExportMp4} className="primary-btn" style={{ height: 28, padding: '0 10px', fontSize: 11, display: 'flex', alignItems: 'center', gap: 5, marginLeft: 4 }}>
          <Download size={13} />{t('topbar.exportMp4')}
        </button>
      </div>

      {showHistory && <HistoryModal onClose={() => setShowHistory(false)} onRestore={async (snapshot) => { useStore.getState().loadProject(snapshot.project); await upsertProject(snapshot.project); setShowHistory(false) }} />}
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </header>
  )
}

function EditorScreen({ projectId }: { projectId: string }) {
  const { t } = useTranslation()
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
    if (saveStatus !== 'saved' && !confirm(t('topbar.unsavedLeaveConfirm'))) return
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
