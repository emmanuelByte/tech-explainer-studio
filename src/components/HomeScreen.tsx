import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Code2, Download, Grid2X2, Import, List, Moon, Plus, Search, Settings, Sun, Trash2, Upload, X } from 'lucide-react'
import { CANVAS_PRESETS, MotionProject, ProjectIndexItem } from '../types'
import {
  createBlankProject,
  deleteProject,
  duplicateProject,
  exportJson,
  readProject,
  readProjectIndex,
  readProjectIndexWithLegacyMigration,
  readProjectStorageStats,
  upsertProject,
  ProjectStorageStats,
} from '../projectStorage'
import { useStore } from '../store'
import { SettingsModal } from './SettingsModal'
import { ConfirmDialog, NoticeDialog } from './ConfirmDialog'
import { HtmlImportModal } from './HtmlImportModal'

type SortKey = 'updatedAt' | 'createdAt' | 'name'
type ViewMode = 'grid' | 'list'
type ConfirmAction = {
  title: string
  message: string
  confirmLabel: string
  onConfirm: () => Promise<void>
}
type NoticeMessage = {
  title: string
  message: string
}
type MarqueeState = {
  startX: number
  startY: number
  currentX: number
  currentY: number
  active: boolean
  additive: boolean
  baseSelection: Set<string>
}

function rectsIntersect(a: DOMRect | { left: number; top: number; right: number; bottom: number }, b: { left: number; top: number; right: number; bottom: number }) {
  return a.left <= b.right && a.right >= b.left && a.top <= b.bottom && a.bottom >= b.top
}

function marqueeRect(state: MarqueeState) {
  return {
    left: Math.min(state.startX, state.currentX),
    top: Math.min(state.startY, state.currentY),
    right: Math.max(state.startX, state.currentX),
    bottom: Math.max(state.startY, state.currentY),
  }
}

function relativeTime(iso: string, t: (key: string, options?: Record<string, unknown>) => string) {
  const delta = Date.now() - new Date(iso).getTime()
  const mins = Math.max(0, Math.round(delta / 60000))
  if (mins < 1) return t('home.justNow')
  if (mins < 60) return t('home.minutesAgo', { count: mins })
  const hours = Math.round(mins / 60)
  if (hours < 24) return t('home.hoursAgo', { count: hours })
  const days = Math.round(hours / 24)
  return t('home.daysAgo', { count: days })
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

function ProjectName({ project, onRename }: { project: ProjectIndexItem; onRename: (name: string) => void }) {
  const { t } = useTranslation()
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(project.name)

  function commit() {
    setEditing(false)
    const next = name.trim()
    if (next && next !== project.name) onRename(next)
    else setName(project.name)
  }

  if (editing) {
    return (
      <input
        className="input-base text-xs w-full"
        value={name}
        autoFocus
        data-home-interactive="true"
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => setName(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit()
          if (e.key === 'Escape') { setEditing(false); setName(project.name) }
        }}
      />
    )
  }

  return (
    <button
      className="text-left text-sm font-semibold truncate"
      style={{ color: 'var(--text)' }}
      data-home-interactive="true"
      onClick={(e) => { e.stopPropagation(); setEditing(true) }}
      title={t('home.projectName')}
    >
      {project.name}
    </button>
  )
}

function NewProjectModal({ onClose, onCreate, recentProjects }: {
  onClose: () => void
  onCreate: (project: MotionProject) => void
  recentProjects: ProjectIndexItem[]
}) {
  const { t } = useTranslation()
  const [name, setName] = useState(t('home.untitledProject'))
  const [presetName, setPresetName] = useState(CANVAS_PRESETS[0].name)
  const [width, setWidth] = useState(1280)
  const [height, setHeight] = useState(720)
  const [fps, setFps] = useState(30)
  const [duration, setDuration] = useState(8)
  const recent = recentProjects
    .map((p) => ({ name: `${p.canvasWidth} x ${p.canvasHeight}`, width: p.canvasWidth, height: p.canvasHeight }))
    .filter((p, i, arr) => arr.findIndex((x) => x.width === p.width && x.height === p.height) === i)
    .slice(0, 3)

  function create() {
    onCreate(createBlankProject({ name, presetName, width, height, fps, durationSeconds: duration }))
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.55)', zIndex: 2000 }}>
      <div className="w-[520px] max-w-[calc(100vw-32px)] rounded-md p-4" style={{ background: 'var(--panel)', border: '1px solid var(--border)' }}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold">{t('home.newProject')}</h2>
          <button onClick={onClose} className="icon-btn" style={{ color: 'var(--text2)' }} title={t('common.close')}><X size={16} /></button>
        </div>
        <label className="block text-xs mb-1" style={{ color: 'var(--text2)' }}>{t('home.projectName')}</label>
        <input className="input-base w-full mb-3" value={name} onChange={(e) => setName(e.target.value)} />

        {recent.length > 0 && (
          <>
            <div className="text-xs mb-1" style={{ color: 'var(--text2)' }}>{t('home.recentlyUsed')}</div>
            <div className="flex gap-2 mb-3">
              {recent.map((r) => (
                <button key={`${r.width}x${r.height}`} className="input-base" onClick={() => { setPresetName('Custom'); setWidth(r.width); setHeight(r.height) }}>
                  {r.name}
                </button>
              ))}
            </div>
          </>
        )}

        <label className="block text-xs mb-1" style={{ color: 'var(--text2)' }}>{t('home.canvasPreset')}</label>
        <select className="input-base w-full mb-3" value={presetName} onChange={(e) => setPresetName(e.target.value)}>
          {CANVAS_PRESETS.map((preset) => (
            <option key={preset.name} value={preset.name}>{preset.name} {preset.width}x{preset.height}</option>
          ))}
        </select>

        {presetName === 'Custom' && (
          <div className="grid grid-cols-2 gap-2 mb-3">
            <input className="input-base" type="number" min={1} value={width} onChange={(e) => setWidth(Number(e.target.value))} />
            <input className="input-base" type="number" min={1} value={height} onChange={(e) => setHeight(Number(e.target.value))} />
          </div>
        )}

        <div className="grid grid-cols-2 gap-2 mb-4">
          <div>
            <label className="block text-xs mb-1" style={{ color: 'var(--text2)' }}>{t('common.fps')}</label>
            <select className="input-base w-full" value={fps} onChange={(e) => setFps(Number(e.target.value))}>
              {[24, 30, 60].map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs mb-1" style={{ color: 'var(--text2)' }}>{t('home.durationSeconds')}</label>
            <input className="input-base w-full" type="number" min={1} value={duration} onChange={(e) => setDuration(Number(e.target.value))} />
          </div>
        </div>

        <button onClick={create} className="w-full rounded px-3 py-2 text-sm" style={{ background: '#0d99ff', color: '#fff' }}>
          {t('home.createProject')}
        </button>
      </div>
    </div>
  )
}

export function HomeScreen({ onOpenProject }: { onOpenProject: (project: MotionProject) => void }) {
  const { t } = useTranslation()
  const { theme, setTheme } = useStore()
  const [projects, setProjects] = useState<ProjectIndexItem[]>([])
  const [loading, setLoading] = useState(true)
  const [storageStats, setStorageStats] = useState<ProjectStorageStats | null>(null)
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<SortKey>('updatedAt')
  const [view, setView] = useState<ViewMode>('grid')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [showNew, setShowNew] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showHtmlImport, setShowHtmlImport] = useState(false)
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null)
  const [notice, setNotice] = useState<NoticeMessage | null>(null)
  const [dialogBusy, setDialogBusy] = useState(false)
  const [marquee, setMarquee] = useState<MarqueeState | null>(null)
  const importRef = useRef<HTMLInputElement>(null)
  const projectListRef = useRef<HTMLDivElement>(null)
  const marqueeRef = useRef<MarqueeState | null>(null)
  const suppressProjectClick = useRef(false)
  const lastSelectedId = useRef<string | null>(null)
  const migratedLegacyStorage = useRef(false)

  async function refresh() {
    setLoading(true)
    try {
      const items = migratedLegacyStorage.current
        ? await readProjectIndex()
        : await readProjectIndexWithLegacyMigration()
      migratedLegacyStorage.current = true
      setProjects(items)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void refresh()
  }, [])

  useEffect(() => {
    if (!showSettings) return
    void readProjectStorageStats().then(setStorageStats)
  }, [showSettings, projects])

  const filtered = useMemo(() => {
    return [...projects]
      .filter((p) => p.name.toLowerCase().includes(query.toLowerCase()))
      .sort((a, b) => {
        if (sort === 'name') return a.name.localeCompare(b.name)
        return new Date(b[sort]).getTime() - new Date(a[sort]).getTime()
      })
  }, [projects, query, sort])

  async function open(id: string) {
    const project = await readProject(id)
    if (project) onOpenProject(project)
  }

  async function create(project: MotionProject) {
    await upsertProject(project)
    setShowNew(false)
    onOpenProject(project)
  }

  async function rename(project: ProjectIndexItem, name: string) {
    const full = await readProject(project.id)
    if (!full) return
    full.name = name
    full.updatedAt = new Date().toISOString()
    await upsertProject(full)
    await refresh()
  }

  function importFile(file: File) {
    const reader = new FileReader()
    reader.onload = async () => {
      try {
        const parsed = JSON.parse(String(reader.result))
        const imports: MotionProject[] = Array.isArray(parsed) ? parsed : parsed.projects || [parsed]
        await Promise.all(imports.map((project) => upsertProject({
          ...project,
          id: crypto.randomUUID(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })))
        await refresh()
      } catch {
        setNotice({ title: t('home.importErrorTitle'), message: t('home.importError') })
      }
    }
    reader.readAsText(file)
  }

  function deleteSelected() {
    if (selected.size === 0) return
    const ids = [...selected]
    setConfirmAction({
      title: t('home.deleteSelectedTitle'),
      message: t('home.deleteSelectedConfirm', { count: ids.length }),
      confirmLabel: t('home.deleteSelected'),
      onConfirm: async () => {
        await Promise.all(ids.map((id) => deleteProject(id)))
        setSelected(new Set())
        await refresh()
      },
    })
  }

  function deleteSingle(project: ProjectIndexItem) {
    setConfirmAction({
      title: t('home.deleteProjectTitle'),
      message: t('home.deleteProjectConfirm', { name: project.name }),
      confirmLabel: t('common.delete'),
      onConfirm: async () => {
        await deleteProject(project.id)
        setSelected((prev) => {
          const next = new Set(prev)
          next.delete(project.id)
          return next
        })
        await refresh()
      },
    })
  }

  function updateSelectionForMarquee(state: MarqueeState) {
    const rect = marqueeRect(state)
    const hits = Array.from(projectListRef.current?.querySelectorAll<HTMLElement>('[data-project-id]') ?? [])
      .filter((element) => rectsIntersect(element.getBoundingClientRect(), rect))
      .map((element) => element.dataset.projectId)
      .filter((id): id is string => Boolean(id))
    const next = state.additive ? new Set(state.baseSelection) : new Set<string>()
    hits.forEach((id) => next.add(id))
    setSelected(next)
  }

  function selectProject(projectId: string, additive: boolean, range: boolean) {
    const rangeAnchorId = lastSelectedId.current ?? filtered.find((project) => selected.has(project.id))?.id ?? null
    if (range && rangeAnchorId) {
      const from = filtered.findIndex((project) => project.id === rangeAnchorId)
      const to = filtered.findIndex((project) => project.id === projectId)
      if (from >= 0 && to >= 0) {
        const [start, end] = from < to ? [from, to] : [to, from]
        const ids = filtered.slice(start, end + 1).map((project) => project.id)
        setSelected((previous) => {
          const next = additive ? new Set(previous) : new Set<string>()
          ids.forEach((id) => next.add(id))
          return next
        })
        return
      }
    }

    setSelected((previous) => {
      if (!additive) return new Set([projectId])
      const next = new Set(previous)
      if (next.has(projectId)) next.delete(projectId)
      else next.add(projectId)
      return next
    })
  }

  function onProjectClick(e: React.MouseEvent, projectId: string) {
    if (suppressProjectClick.current) {
      e.preventDefault()
      e.stopPropagation()
      return
    }
    if (e.shiftKey || e.metaKey || e.ctrlKey) {
      e.preventDefault()
      e.stopPropagation()
      selectProject(projectId, e.metaKey || e.ctrlKey, e.shiftKey)
      lastSelectedId.current = projectId
      return
    }
    void open(projectId)
  }

  function onProjectListMouseDown(e: React.MouseEvent) {
    if (e.button !== 0) return
    const target = e.target as HTMLElement
    // Skip drag-marquee when the mousedown originates inside a form widget,
    // a button/link, or an explicitly-marked interactive cell (project card
    // checkbox, rename input, duplicate/export/delete buttons). Marquee can
    // still start anywhere else in <main>, including the empty padding above
    // and below the project grid — not just inside the grid itself.
    if (target.closest('[data-home-interactive="true"]')) return
    if (target.closest('input, textarea, select, button, a, [role="button"]')) return
    if ((e.shiftKey || e.metaKey || e.ctrlKey) && target.closest('[data-project-id]')) return
    e.preventDefault()
    e.stopPropagation()
    const next: MarqueeState = {
      startX: e.clientX,
      startY: e.clientY,
      currentX: e.clientX,
      currentY: e.clientY,
      active: false,
      additive: e.shiftKey || e.metaKey || e.ctrlKey,
      baseSelection: selected,
    }
    marqueeRef.current = next
    setMarquee(next)
  }

  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      const state = marqueeRef.current
      if (!state) return
      const active = state.active || Math.abs(e.clientX - state.startX) > 4 || Math.abs(e.clientY - state.startY) > 4
      const next = { ...state, currentX: e.clientX, currentY: e.clientY, active }
      marqueeRef.current = next
      setMarquee(next)
      if (active) {
        suppressProjectClick.current = true
        updateSelectionForMarquee(next)
      }
    }

    function onMouseUp() {
      if (marqueeRef.current?.active) {
        updateSelectionForMarquee(marqueeRef.current)
        const rect = marqueeRect(marqueeRef.current)
        const firstHit = Array.from(projectListRef.current?.querySelectorAll<HTMLElement>('[data-project-id]') ?? [])
          .find((element) => rectsIntersect(element.getBoundingClientRect(), rect))
          ?.dataset.projectId
        if (firstHit) lastSelectedId.current = firstHit
        window.setTimeout(() => { suppressProjectClick.current = false }, 0)
      } else {
        suppressProjectClick.current = false
      }
      marqueeRef.current = null
      setMarquee(null)
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [])

  function clearHistory() {
    setConfirmAction({
      title: t('settings.clearHistoryTitle'),
      message: t('settings.clearHistoryConfirm'),
      confirmLabel: t('settings.clearHistory'),
      onConfirm: async () => {
        await Promise.all(projects.map((p) => fetch(`/api/projects/${encodeURIComponent(p.id)}/history`, { method: 'DELETE' })))
        setNotice({ title: t('settings.historyClearedTitle'), message: t('settings.historyCleared') })
      },
    })
  }

  async function confirmDialogAction() {
    if (!confirmAction) return
    setDialogBusy(true)
    try {
      await confirmAction.onConfirm()
      setConfirmAction(null)
    } finally {
      setDialogBusy(false)
    }
  }

  return (
    <div
      className="h-screen flex flex-col"
      style={{ background: 'var(--bg)', color: 'var(--text)' }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault()
        const file = e.dataTransfer.files[0]
        if (file?.name.endsWith('.motionproj') || file?.name.endsWith('.json')) importFile(file)
      }}
    >
      <header
        className="capcut-topbar flex items-center flex-shrink-0"
        style={{ minHeight: 40, zIndex: 5, gap: 0, padding: '0 8px' }}
      >
        {/* Left: brand mark + app name + settings — same rhythm as editor topbar
            (28px buttons, gap-1, thin divider). */}
        <div className="flex items-center gap-1 flex-shrink-0">
          <div
            style={{
              width: 18, height: 18, borderRadius: 5,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              background: 'var(--accent-bg)', color: 'var(--accent)',
              marginRight: 4,
            }}
          >
            <div style={{ width: 8, height: 8, borderRadius: 2, background: 'currentColor' }} />
          </div>
          <strong style={{ fontSize: 12, fontWeight: 600 }}>{t('home.appName')}</strong>
          <div style={{ width: 1, height: 16, background: 'var(--border)', margin: '0 4px 0 8px' }} />
          <button onClick={() => setShowSettings(true)} className="icon-btn" title={t('common.settings')}>
            <Settings size={14} />
          </button>
        </div>

        <div className="flex-1" />

        {/* Right: actions (destructive → HTML → import → theme → primary CTA). */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {selected.size > 0 && (
            <button
              onClick={deleteSelected}
              className="pill-btn"
              style={{
                height: 28, padding: '0 10px', fontSize: 11,
                display: 'flex', alignItems: 'center', gap: 5,
                color: '#ef4444',
                background: 'rgba(239,68,68,0.10)',
                border: '1px solid rgba(239,68,68,0.28)',
              }}
            >
              <Trash2 size={13} />{t('home.deleteSelected')}
            </button>
          )}
          <button
            onClick={() => setShowHtmlImport(true)}
            className="pill-btn"
            title={t('layers.importHtml')}
            style={{ height: 28, padding: '0 10px', fontSize: 11, display: 'flex', alignItems: 'center', gap: 5 }}
          >
            <Code2 size={13} />HTML
          </button>
          <button
            onClick={() => importRef.current?.click()}
            className="pill-btn"
            title={t('common.import')}
            style={{ height: 28, padding: '0 10px', fontSize: 11, display: 'flex', alignItems: 'center', gap: 5 }}
          >
            <Import size={13} />{t('common.import')}
          </button>
          <button
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="icon-btn"
            title={t('topbar.toggleTheme')}
          >
            {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
          </button>
          <div style={{ width: 1, height: 16, background: 'var(--border)', margin: '0 4px' }} />
          <button
            onClick={() => setShowNew(true)}
            className="primary-btn"
            style={{ height: 28, padding: '0 12px', fontSize: 11, display: 'flex', alignItems: 'center', gap: 5 }}
          >
            <Plus size={13} />{t('home.newProject')}
          </button>
        </div>
        <input ref={importRef} type="file" accept=".motionproj,.json,application/json" hidden onChange={(e) => e.target.files?.[0] && importFile(e.target.files[0])} />
      </header>

      <main
        className="relative flex-1 overflow-auto px-5 py-4"
        onMouseDown={onProjectListMouseDown}
        onDragStart={(e) => {
          if ((e.target as HTMLElement).closest('[data-project-id]')) e.preventDefault()
        }}
      >
        <div className="flex flex-wrap gap-2 mb-4">
          <div className="flex items-center gap-2 input-base min-w-[260px]">
            <Search size={14} style={{ color: 'var(--text3)' }} />
            <input className="bg-transparent outline-none flex-1" placeholder={t('home.searchProjects')} value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <select className="input-base" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
            <option value="updatedAt">{t('home.lastModified')}</option>
            <option value="createdAt">{t('home.dateCreated')}</option>
            <option value="name">{t('home.nameAz')}</option>
          </select>
          <button className="pill-btn" onClick={() => setView(view === 'grid' ? 'list' : 'grid')}>{view === 'grid' ? <Grid2X2 size={14} /> : <List size={14} />}{view === 'grid' ? t('home.grid') : t('home.list')}</button>
        </div>

        {loading ? (
          <div className="h-[60vh] flex items-center justify-center text-sm" style={{ color: 'var(--text2)' }}>
            {t('common.loadingProjects')}
          </div>
        ) : filtered.length === 0 ? (
          <div className="h-[60vh] flex flex-col items-center justify-center text-center">
            <div className="w-32 h-24 mb-4 rounded-md" style={{ background: 'linear-gradient(135deg,#0d99ff,#22c55e)', opacity: 0.8 }} />
            <div className="text-lg font-semibold mb-3">{t('home.createFirst')}</div>
            <button onClick={() => setShowNew(true)} className="pill-btn primary-btn"><Plus size={14} />{t('home.createFirst')}</button>
          </div>
        ) : (
          <div
            ref={projectListRef}
            data-project-list="true"
            className={view === 'grid' ? 'grid gap-3 grid-cols-[repeat(auto-fill,minmax(240px,1fr))]' : 'flex flex-col gap-2'}
          >
            {filtered.map((project) => (
              <div
                key={project.id}
                data-project-id={project.id}
                className={view === 'grid' ? 'group relative rounded-md overflow-hidden cursor-pointer' : 'group relative rounded-md cursor-pointer flex items-center gap-3 p-2'}
                style={{
                  background: 'var(--panel)',
                  border: selected.has(project.id) ? '1px solid #0d99ff' : '1px solid var(--border)',
                  boxShadow: selected.has(project.id) ? '0 0 0 1px rgba(13,153,255,0.45)' : undefined,
                }}
                onClick={(e) => onProjectClick(e, project.id)}
              >
                <input
                  type="checkbox"
                  checked={selected.has(project.id)}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => setSelected((prev) => {
                    const next = new Set(prev)
                    if (e.target.checked) next.add(project.id)
                    else next.delete(project.id)
                    lastSelectedId.current = project.id
                    return next
                  })}
                  data-home-interactive="true"
                  className={view === 'grid' ? `absolute z-10 m-2 ${selected.size > 0 ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}` : ''}
                />
                <img
                  src={project.thumbnail}
                  alt=""
                  draggable={false}
                  className={view === 'grid' ? 'w-full aspect-video object-cover select-none' : 'w-24 aspect-video object-cover rounded select-none'}
                />
                <div className={view === 'grid' ? 'p-3' : 'flex-1 min-w-0'}>
                  <div className="flex items-start gap-2">
                    <ProjectName project={project} onRename={(name) => rename(project, name)} />
                    <div className="ml-auto opacity-0 group-hover:opacity-100" data-home-interactive="true">
                      <button onClick={async (e) => { e.stopPropagation(); const copy = await duplicateProject(project.id); if (copy) await refresh() }}>{t('home.duplicate')}</button>
                      <button className="ml-2" onClick={async (e) => { e.stopPropagation(); const full = await readProject(project.id); if (full) exportJson(`${full.name}.motionproj`, full) }}>{t('common.export')}</button>
                      <button className="ml-2" style={{ color: '#ef4444' }} onClick={(e) => { e.stopPropagation(); deleteSingle(project) }}>{t('common.delete')}</button>
                    </div>
                  </div>
                  <div className="text-xs mt-1" style={{ color: 'var(--text2)' }}>{project.presetName} {project.canvasWidth}x{project.canvasHeight}</div>
                  <div className="text-xs mt-1" style={{ color: 'var(--text3)' }}>
                    {relativeTime(project.updatedAt, t)} · {Math.round(project.duration / project.fps)}s · {project.fps}fps · {t('topbar.layersCount', { count: project.layerCount })}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
        {marquee?.active && (
          <div
            style={{
              position: 'fixed',
              left: Math.min(marquee.startX, marquee.currentX),
              top: Math.min(marquee.startY, marquee.currentY),
              width: Math.abs(marquee.currentX - marquee.startX),
              height: Math.abs(marquee.currentY - marquee.startY),
              background: 'rgba(13,153,255,0.12)',
              border: '1px solid #0d99ff',
              pointerEvents: 'none',
              zIndex: 1200,
            }}
          />
        )}
      </main>

      {showNew && <NewProjectModal onClose={() => setShowNew(false)} onCreate={create} recentProjects={projects} />}
      {showHtmlImport && (
        <HtmlImportModal
          target="library"
          onClose={() => setShowHtmlImport(false)}
          onSavedToLibrary={(itemName) => setNotice({ title: t('library.design'), message: t('layers.savedToLibrary', { name: itemName }) })}
        />
      )}
      {showSettings && (
        <SettingsModal onClose={() => setShowSettings(false)}>
            <section>
            <div className="text-sm font-semibold mb-2">{t('settings.storage')}</div>
            <div className="text-sm mb-3">{t('settings.used')}: {formatBytes(storageStats?.totalBytes ?? 0)}</div>
            <div className="max-h-52 overflow-auto mb-3">
              {projects.map((p) => {
                const bytes = storageStats?.projects.find((item) => item.id === p.id)?.bytes ?? 0
                return <div key={p.id} className="flex justify-between py-1 text-xs"><span>{p.name}</span><span>{formatBytes(bytes)}</span></div>
              })}
            </div>
            <div className="flex flex-wrap gap-2">
              <button className="input-base" onClick={clearHistory}>{t('settings.clearHistory')}</button>
              <button className="pill-btn" onClick={async () => exportJson('motion-projects-backup.json', { projects: (await Promise.all(projects.map((p) => readProject(p.id)))).filter(Boolean) })}><Download size={14} />{t('settings.exportAll')}</button>
              <button className="pill-btn" onClick={() => importRef.current?.click()}><Upload size={14} />{t('settings.importProjects')}</button>
            </div>
            </section>
        </SettingsModal>
      )}
      {confirmAction && (
        <ConfirmDialog
          title={confirmAction.title}
          message={confirmAction.message}
          confirmLabel={confirmAction.confirmLabel}
          cancelLabel={t('common.cancel')}
          danger
          busy={dialogBusy}
          onCancel={() => {
            if (!dialogBusy) setConfirmAction(null)
          }}
          onConfirm={() => void confirmDialogAction()}
        />
      )}
      {notice && (
        <NoticeDialog
          title={notice.title}
          message={notice.message}
          buttonLabel={t('common.done')}
          onClose={() => setNotice(null)}
        />
      )}
    </div>
  )
}
