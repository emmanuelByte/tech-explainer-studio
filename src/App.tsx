import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  AlertTriangle, Check, CircleDot, Code2, Download, Eye, FileJson, History,
  Home, Keyboard, LoaderCircle, Moon, PanelBottomClose, PanelBottomOpen, Redo2, Save,
  Play, Settings, Sparkles, Sun, Undo2,
} from 'lucide-react'
import { Modal } from './components/Modal'
import { LayersPanel } from './components/LayersPanel'
import { PreviewCanvas } from './components/PreviewCanvas'
import { PreviewModal } from './components/PreviewModal'
import { PropertiesPanel } from './components/PropertiesPanel'
import { Timeline } from './components/Timeline'
import { ExportModal } from './components/ExportModal'
import { AiChatPanel } from './components/AiChatPanel'
import { FloatingToolbar } from './components/FloatingToolbar'
import { TopMenu, type TopMenuEntry, formatShortcut } from './components/TopMenu'
import { ShortcutsModal } from './components/ShortcutsModal'
import { HomeScreen } from './components/HomeScreen'
import { SettingsModal } from './components/SettingsModal'
import { SelectionTracker } from './components/SelectionTracker'
import { HtmlImportModal } from './components/HtmlImportModal'
import { usePlayback } from './hooks/usePlayback'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import { useStore } from './store'
import { MotionProject, ProjectHistorySnapshot } from './types'
import {
  exportJson,
  projectFromStore,
  readHistory,
  readProject,
  saveHistorySnapshot,
  upsertProject,
} from './projectStorage'

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

/** Thin vertical separator shown only when something is selected. */
function SelectionDivider() {
  const hasSelection = useStore((s) => s.selectedLayerIds.length > 0 || s.selectedKeyframes.length > 0)
  if (!hasSelection) return null
  return <div style={{ width: 1, height: 14, background: 'var(--border)', flexShrink: 0, opacity: 0.7 }} />
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

function EditorTopBar({ saveStatus, onForceSave, onGoHome, onPreview, onExportMp4, onOpenAi, onShowShortcuts }: {
  saveStatus: SaveStatus
  onForceSave: () => void
  onGoHome: () => void
  onPreview: () => void
  onExportMp4: () => void
  onOpenAi: () => void
  onShowShortcuts: () => void
}) {
  const { t } = useTranslation()
  const {
    theme, setTheme, undo, redo, _past, _future, autoKeyframe, setAutoKeyframe,
    timelineVisible, toggleTimelineVisible,
  } = useStore()
  const [showHistory, setShowHistory] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showHtmlImport, setShowHtmlImport] = useState(false)

  function exportProject() {
    const project = projectFromStore()
    exportJson(`${project.name}.motionproj`, project)
  }

  /* ── Menus ───────────────────────────────────────────────── */

  const fileMenu: TopMenuEntry[] = [
    { label: t('layers.importHtml'), icon: Code2, onClick: () => setShowHtmlImport(true) },
    { label: t('topbar.exportProject'), icon: FileJson, onClick: exportProject },
    { label: t('topbar.exportMp4'), icon: Download, shortcut: 'mod+e', onClick: onExportMp4 },
    { type: 'separator' },
    { label: t('topbar.history'), icon: History, onClick: () => setShowHistory(true) },
    { label: t('topbar.settings'), icon: Settings, onClick: () => setShowSettings(true) },
  ]

  const viewMenu: TopMenuEntry[] = [
    { label: t('topbar.preview'), icon: Eye, shortcut: 'mod+p', onClick: onPreview },
    {
      label: t('topbar.toggleTimeline'),
      icon: timelineVisible ? PanelBottomClose : PanelBottomOpen,
      shortcut: 'mod+\\',
      active: !timelineVisible,
      onClick: () => toggleTimelineVisible(),
    },
    { type: 'separator' },
    {
      label: t('topbar.autoKeyframe'),
      icon: CircleDot,
      active: autoKeyframe,
      onClick: () => setAutoKeyframe(!autoKeyframe),
    },
    {
      label: t('topbar.toggleTheme'),
      icon: theme === 'dark' ? Sun : Moon,
      onClick: () => setTheme(theme === 'dark' ? 'light' : 'dark'),
    },
    { type: 'separator' },
    {
      label: t('shortcuts.title', { defaultValue: 'Keyboard shortcuts' }),
      icon: Keyboard,
      shortcut: '?',
      onClick: onShowShortcuts,
    },
  ]

  return (
    <header
      className="capcut-topbar flex items-center flex-shrink-0"
      style={{ minHeight: 40, zIndex: 5, gap: 0, padding: '0 8px' }}
    >
      {/* Left: Home + Undo/Redo + File/View menus.
          Tool selection moved to <FloatingToolbar /> docked above the timeline. */}
      <div className="flex items-center gap-1 flex-shrink-0">
        <button onClick={onGoHome} className="icon-btn" title={t('topbar.home')}><Home size={14} /></button>
        <div style={{ width: 1, height: 16, background: 'var(--border)', margin: '0 2px' }} />
        <button onClick={undo} disabled={_past.length === 0} title={`${t('topbar.undo')} (${formatModZ()})`} className="icon-btn"><Undo2 size={14} /></button>
        <button onClick={redo} disabled={_future.length === 0} title={`${t('topbar.redo')} (${formatModShiftZ()})`} className="icon-btn"><Redo2 size={14} /></button>
        <div style={{ width: 1, height: 16, background: 'var(--border)', margin: '0 2px' }} />
        <TopMenu label={t('topbar.menuFile')} items={fileMenu} />
        <TopMenu label={t('topbar.menuView')} items={viewMenu} />
      </div>

      {/* Center: Project name + selection breadcrumb + save */}
      <div className="flex-1 flex items-center justify-center gap-3 min-w-0 px-3">
        <ProjectTitle />
        <SelectionDivider />
        <SelectionTracker />
        <SaveIndicator status={saveStatus} onRetry={onForceSave} />
      </div>

      {/* Right: high-frequency primary actions stay visible. */}
      <div className="flex items-center gap-1 flex-shrink-0">
        <button onClick={onOpenAi} className="icon-btn" title={t('topbar.ai')}><Sparkles size={14} /></button>
        <button onClick={onPreview} className="pill-btn" title={`${t('topbar.preview')} (${formatModP()})`} style={{ height: 28, padding: '0 10px', fontSize: 11, display: 'flex', alignItems: 'center', gap: 5 }}>
          <Play size={13} />{t('topbar.preview')}
        </button>
        <button onClick={onExportMp4} className="primary-btn" title={`${t('topbar.exportMp4')} (${formatModE()})`} style={{ height: 28, padding: '0 10px', fontSize: 11, display: 'flex', alignItems: 'center', gap: 5, marginLeft: 4 }}>
          <Download size={13} />{t('topbar.exportMp4')}
        </button>
      </div>

      {showHistory && <HistoryModal onClose={() => setShowHistory(false)} onRestore={async (snapshot) => { useStore.getState().loadProject(snapshot.project); await upsertProject(snapshot.project); setShowHistory(false) }} />}
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
      {showHtmlImport && <HtmlImportModal onClose={() => setShowHtmlImport(false)} />}
    </header>
  )
}

/* Tiny helpers so tooltip text uses platform-correct shortcut glyphs. */
function formatModZ() { return formatShortcut('mod+z') }
function formatModShiftZ() { return formatShortcut('mod+shift+z') }
function formatModE() { return formatShortcut('mod+e') }
function formatModP() { return formatShortcut('mod+p') }

function EditorScreen({ projectId }: { projectId: string }) {
  const { t } = useTranslation()
  const [showExport, setShowExport] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [showAi, setShowAi] = useState(false)
  const [showShortcuts, setShowShortcuts] = useState(false)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved')
  const saveTimer = useRef<number | null>(null)
  const loadedId = useRef<string | null>(null)
  const storeState = useStore()
  const timelinePanelHeight = useStore((s) => s.timelinePanelHeight)
  const timelineVisible = useStore((s) => s.timelineVisible)
  const effectiveTimelineHeight = timelineVisible ? timelinePanelHeight : 0

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
      return true
    } catch {
      setSaveStatus('failed')
      return false
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
    storeState.showOutsideCanvas,
    storeState.colorPalettes,
    storeState.activeColorPaletteId,
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
      const target = e.target as HTMLElement | null
      const tag = target?.tagName.toLowerCase()
      const editing = tag === 'input' || tag === 'textarea' || target?.isContentEditable
      // `?` (Shift+/) opens the shortcuts cheat-sheet. Standalone, no mod.
      if (!editing && e.key === '?') {
        e.preventDefault()
        setShowShortcuts(true)
        return
      }
      const mod = e.ctrlKey || e.metaKey
      if (!mod) return
      const key = e.key.toLowerCase()
      if (key === 's') {
        e.preventDefault()
        if (saveTimer.current) window.clearTimeout(saveTimer.current)
        void forceSave(true)
        return
      }
      // Cmd/Ctrl+E → export modal; Cmd/Ctrl+P → preview modal.
      // Skip when editing a text field so the user can still type 'e'/'p'.
      // Also skip if Shift/Alt are held — those are reserved for future shortcuts.
      if (editing || e.shiftKey || e.altKey) return
      if (key === 'e') {
        e.preventDefault()
        void openExport()
        return
      }
      if (key === 'p') {
        e.preventDefault()
        setShowPreview(true)
        return
      }
      // Cmd/Ctrl+\ → toggle timeline panel visibility.
      if (key === '\\') {
        e.preventDefault()
        useStore.getState().toggleTimelineVisible()
        return
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  function goHome() {
    if (saveStatus !== 'saved' && !confirm(t('topbar.unsavedLeaveConfirm'))) return
    pushRoute({ name: 'home' })
  }

  async function openExport() {
    if (saveTimer.current) {
      window.clearTimeout(saveTimer.current)
      saveTimer.current = null
    }
    const saved = await forceSave(false)
    if (saved) setShowExport(true)
  }

  return (
    <div className="capcut-shell h-screen flex flex-col overflow-hidden" style={{ color: 'var(--text)' }}>
      <EditorTopBar saveStatus={saveStatus} onForceSave={() => void forceSave(false)} onGoHome={goHome} onPreview={() => setShowPreview(true)} onExportMp4={() => void openExport()} onOpenAi={() => setShowAi((v) => !v)} onShowShortcuts={() => setShowShortcuts(true)} />
      <div className="flex-1 min-h-0 overflow-hidden flex">
        <div className="relative flex-1 min-w-0 min-h-0 overflow-hidden">
          <div className="absolute left-0 right-0 top-0 flex min-h-0 overflow-hidden" style={{ bottom: effectiveTimelineHeight }}>
            <LayersPanel />
            <div className="relative flex-1 min-w-0 min-h-0 overflow-hidden flex">
              <PreviewCanvas />
              <FloatingToolbar />
            </div>
            <PropertiesPanel />
          </div>
          {/* Timeline can be toggled off via View ▸ Toggle timeline (⌘\) when
              shape-creation needs the full canvas height. */}
          {timelineVisible && <Timeline />}
        </div>
        {showAi && <AiChatPanel onClose={() => setShowAi(false)} />}
      </div>
      {showPreview && <PreviewModal onClose={() => setShowPreview(false)} />}
      {showExport && <ExportModal onClose={() => setShowExport(false)} />}
      {showShortcuts && <ShortcutsModal onClose={() => setShowShortcuts(false)} />}
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
