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
  const importRef = useRef<HTMLInputElement>(null)
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
      <header className="capcut-topbar flex items-center gap-3 px-5 py-3">
        <div className="w-3 h-3 rounded-sm" style={{ background: '#0d99ff', boxShadow: '0 0 18px rgba(32,213,248,0.6)' }} />
        <strong>{t('home.appName')}</strong>
        <button onClick={() => setShowSettings(true)} className="icon-btn ml-2" title={t('common.settings')}><Settings size={16} /></button>
        <div className="flex-1" />
        {selected.size > 0 && <button onClick={deleteSelected} className="pill-btn" style={{ color: '#ef4444' }}><Trash2 size={14} />{t('home.deleteSelected')}</button>}
        <button onClick={() => setShowHtmlImport(true)} className="pill-btn"><Code2 size={14} />{t('layers.importHtml')}</button>
        <button onClick={() => importRef.current?.click()} className="pill-btn"><Import size={14} />{t('common.import')}</button>
        <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} className="pill-btn" title={t('topbar.toggleTheme')}>
          {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
          {theme === 'dark' ? t('common.light') : t('common.dark')}
        </button>
        <button onClick={() => setShowNew(true)} className="pill-btn primary-btn"><Plus size={14} />{t('home.newProject')}</button>
        <input ref={importRef} type="file" accept=".motionproj,.json,application/json" hidden onChange={(e) => e.target.files?.[0] && importFile(e.target.files[0])} />
      </header>

      <main className="flex-1 overflow-auto px-5 py-4">
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
          <div className={view === 'grid' ? 'grid gap-3 grid-cols-[repeat(auto-fill,minmax(240px,1fr))]' : 'flex flex-col gap-2'}>
            {filtered.map((project) => (
              <div
                key={project.id}
                className={view === 'grid' ? 'group relative rounded-md overflow-hidden cursor-pointer' : 'group relative rounded-md cursor-pointer flex items-center gap-3 p-2'}
                style={{ background: 'var(--panel)', border: '1px solid var(--border)' }}
                onClick={() => open(project.id)}
              >
                <input
                  type="checkbox"
                  checked={selected.has(project.id)}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => setSelected((prev) => {
                    const next = new Set(prev)
                    if (e.target.checked) next.add(project.id)
                    else next.delete(project.id)
                    return next
                  })}
                  className={view === 'grid' ? `absolute z-10 m-2 ${selected.size > 0 ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}` : ''}
                />
                <img src={project.thumbnail} alt="" className={view === 'grid' ? 'w-full aspect-video object-cover' : 'w-24 aspect-video object-cover rounded'} />
                <div className={view === 'grid' ? 'p-3' : 'flex-1 min-w-0'}>
                  <div className="flex items-start gap-2">
                    <ProjectName project={project} onRename={(name) => rename(project, name)} />
                    <div className="ml-auto opacity-0 group-hover:opacity-100">
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
