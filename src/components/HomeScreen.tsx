import { useMemo, useRef, useState } from 'react'
import { Download, Grid2X2, Import, List, Moon, Plus, Search, Settings, Sun, Trash2, Upload } from 'lucide-react'
import { CANVAS_PRESETS, MotionProject, ProjectIndexItem } from '../types'
import {
  createBlankProject,
  deleteProject,
  duplicateProject,
  estimateLocalStorageBytes,
  exportJson,
  readProject,
  readProjectIndex,
  upsertProject,
  writeProjectIndex,
} from '../projectStorage'
import { useStore } from '../store'

type SortKey = 'updatedAt' | 'createdAt' | 'name'
type ViewMode = 'grid' | 'list'

function relativeTime(iso: string) {
  const delta = Date.now() - new Date(iso).getTime()
  const mins = Math.max(0, Math.round(delta / 60000))
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours} hours ago`
  const days = Math.round(hours / 24)
  return `${days} days ago`
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

function ProjectName({ project, onRename }: { project: ProjectIndexItem; onRename: (name: string) => void }) {
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
      title="Rename project"
    >
      {project.name}
    </button>
  )
}

function NewProjectModal({ onClose, onCreate }: { onClose: () => void; onCreate: (project: MotionProject) => void }) {
  const [name, setName] = useState('Untitled Project')
  const [presetName, setPresetName] = useState(CANVAS_PRESETS[0].name)
  const [width, setWidth] = useState(1280)
  const [height, setHeight] = useState(720)
  const [fps, setFps] = useState(30)
  const [duration, setDuration] = useState(8)
  const recent = readProjectIndex()
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
          <h2 className="text-base font-semibold">New Project</h2>
          <button onClick={onClose} className="text-lg" style={{ color: 'var(--text2)' }}>x</button>
        </div>
        <label className="block text-xs mb-1" style={{ color: 'var(--text2)' }}>Project name</label>
        <input className="input-base w-full mb-3" value={name} onChange={(e) => setName(e.target.value)} />

        {recent.length > 0 && (
          <>
            <div className="text-xs mb-1" style={{ color: 'var(--text2)' }}>Recently used</div>
            <div className="flex gap-2 mb-3">
              {recent.map((r) => (
                <button key={`${r.width}x${r.height}`} className="input-base" onClick={() => { setPresetName('Custom'); setWidth(r.width); setHeight(r.height) }}>
                  {r.name}
                </button>
              ))}
            </div>
          </>
        )}

        <label className="block text-xs mb-1" style={{ color: 'var(--text2)' }}>Canvas preset</label>
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
            <label className="block text-xs mb-1" style={{ color: 'var(--text2)' }}>FPS</label>
            <select className="input-base w-full" value={fps} onChange={(e) => setFps(Number(e.target.value))}>
              {[24, 30, 60].map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs mb-1" style={{ color: 'var(--text2)' }}>Duration seconds</label>
            <input className="input-base w-full" type="number" min={1} value={duration} onChange={(e) => setDuration(Number(e.target.value))} />
          </div>
        </div>

        <button onClick={create} className="w-full rounded px-3 py-2 text-sm" style={{ background: '#6366f1', color: '#fff' }}>
          Create Project
        </button>
      </div>
    </div>
  )
}

export function HomeScreen({ onOpenProject }: { onOpenProject: (project: MotionProject) => void }) {
  const { theme, setTheme } = useStore()
  const [projects, setProjects] = useState<ProjectIndexItem[]>(readProjectIndex())
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<SortKey>('updatedAt')
  const [view, setView] = useState<ViewMode>('grid')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [showNew, setShowNew] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const importRef = useRef<HTMLInputElement>(null)

  function refresh() {
    setProjects(readProjectIndex())
  }

  const filtered = useMemo(() => {
    return [...projects]
      .filter((p) => p.name.toLowerCase().includes(query.toLowerCase()))
      .sort((a, b) => {
        if (sort === 'name') return a.name.localeCompare(b.name)
        return new Date(b[sort]).getTime() - new Date(a[sort]).getTime()
      })
  }, [projects, query, sort])

  function open(id: string) {
    const project = readProject(id)
    if (project) onOpenProject(project)
  }

  function create(project: MotionProject) {
    upsertProject(project)
    setShowNew(false)
    onOpenProject(project)
  }

  function rename(project: ProjectIndexItem, name: string) {
    const full = readProject(project.id)
    if (!full) return
    full.name = name
    full.updatedAt = new Date().toISOString()
    upsertProject(full)
    refresh()
  }

  function importFile(file: File) {
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result))
        const imports: MotionProject[] = Array.isArray(parsed) ? parsed : parsed.projects || [parsed]
        imports.forEach((project) => upsertProject({ ...project, id: crypto.randomUUID(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }))
        refresh()
      } catch {
        alert('Could not import that project file.')
      }
    }
    reader.readAsText(file)
  }

  function deleteSelected() {
    if (selected.size === 0) return
    if (!confirm('Delete selected projects? This cannot be undone.')) return
    selected.forEach((id) => deleteProject(id))
    setSelected(new Set())
    refresh()
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
        <div className="w-3 h-3 rounded-sm" style={{ background: '#20d5f8', boxShadow: '0 0 18px rgba(32,213,248,0.6)' }} />
        <strong>MotionEditor</strong>
        <button onClick={() => setShowSettings(true)} className="icon-btn ml-2" title="Settings"><Settings size={16} /></button>
        <div className="flex-1" />
        {selected.size > 0 && <button onClick={deleteSelected} className="pill-btn" style={{ color: '#ef4444' }}><Trash2 size={14} />Delete selected</button>}
        <button onClick={() => importRef.current?.click()} className="pill-btn"><Import size={14} />Import</button>
        <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} className="pill-btn" title="Toggle theme">
          {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
          {theme === 'dark' ? 'Light' : 'Dark'}
        </button>
        <button onClick={() => setShowNew(true)} className="pill-btn primary-btn"><Plus size={14} />New Project</button>
        <input ref={importRef} type="file" accept=".motionproj,.json,application/json" hidden onChange={(e) => e.target.files?.[0] && importFile(e.target.files[0])} />
      </header>

      <main className="flex-1 overflow-auto px-5 py-4">
        <div className="flex flex-wrap gap-2 mb-4">
          <div className="flex items-center gap-2 input-base min-w-[260px]">
            <Search size={14} style={{ color: 'var(--text3)' }} />
            <input className="bg-transparent outline-none flex-1" placeholder="Search projects" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <select className="input-base" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
            <option value="updatedAt">Last modified</option>
            <option value="createdAt">Date created</option>
            <option value="name">Name (A-Z)</option>
          </select>
          <button className="pill-btn" onClick={() => setView(view === 'grid' ? 'list' : 'grid')}>{view === 'grid' ? <Grid2X2 size={14} /> : <List size={14} />}{view === 'grid' ? 'Grid' : 'List'}</button>
        </div>

        {filtered.length === 0 ? (
          <div className="h-[60vh] flex flex-col items-center justify-center text-center">
            <div className="w-32 h-24 mb-4 rounded-md" style={{ background: 'linear-gradient(135deg,#6366f1,#22c55e)', opacity: 0.8 }} />
            <div className="text-lg font-semibold mb-3">Create your first project</div>
            <button onClick={() => setShowNew(true)} className="pill-btn primary-btn"><Plus size={14} />Create your first project</button>
          </div>
        ) : (
          <div className={view === 'grid' ? 'grid gap-3 grid-cols-[repeat(auto-fill,minmax(240px,1fr))]' : 'flex flex-col gap-2'}>
            {filtered.map((project) => (
              <div
                key={project.id}
                className={view === 'grid' ? 'group rounded-md overflow-hidden cursor-pointer' : 'group rounded-md cursor-pointer flex items-center gap-3 p-2'}
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
                  className={view === 'grid' ? 'absolute m-2 opacity-0 group-hover:opacity-100' : ''}
                />
                <img src={project.thumbnail} alt="" className={view === 'grid' ? 'w-full aspect-video object-cover' : 'w-24 aspect-video object-cover rounded'} />
                <div className={view === 'grid' ? 'p-3' : 'flex-1 min-w-0'}>
                  <div className="flex items-start gap-2">
                    <ProjectName project={project} onRename={(name) => rename(project, name)} />
                    <div className="ml-auto opacity-0 group-hover:opacity-100">
                      <button onClick={(e) => { e.stopPropagation(); const copy = duplicateProject(project.id); if (copy) refresh() }}>Duplicate</button>
                      <button className="ml-2" onClick={(e) => { e.stopPropagation(); const full = readProject(project.id); if (full) exportJson(`${full.name}.motionproj`, full) }}>Export</button>
                      <button className="ml-2" style={{ color: '#ef4444' }} onClick={(e) => { e.stopPropagation(); if (confirm('Delete Project? This cannot be undone.')) { deleteProject(project.id); refresh() } }}>Delete</button>
                    </div>
                  </div>
                  <div className="text-xs mt-1" style={{ color: 'var(--text2)' }}>{project.presetName} {project.canvasWidth}x{project.canvasHeight}</div>
                  <div className="text-xs mt-1" style={{ color: 'var(--text3)' }}>
                    {relativeTime(project.updatedAt)} · {Math.round(project.duration / project.fps)}s · {project.fps}fps · {project.layerCount} layers
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {showNew && <NewProjectModal onClose={() => setShowNew(false)} onCreate={create} />}
      {showSettings && (
        <div className="fixed inset-0 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.55)', zIndex: 2000 }}>
          <div className="w-[520px] rounded-md p-4" style={{ background: 'var(--panel)', border: '1px solid var(--border)' }}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold">Storage</h2>
              <button onClick={() => setShowSettings(false)} style={{ color: 'var(--text2)' }}>x</button>
            </div>
            <div className="text-sm mb-3">Used: {formatBytes(estimateLocalStorageBytes())}</div>
            <div className="max-h-52 overflow-auto mb-3">
              {projects.map((p) => {
                const bytes = (localStorage.getItem(`project:${p.id}`)?.length ?? 0) * 2
                return <div key={p.id} className="flex justify-between py-1 text-xs"><span>{p.name}</span><span>{formatBytes(bytes)}</span></div>
              })}
            </div>
            <div className="flex flex-wrap gap-2">
              <button className="input-base" onClick={() => { projects.forEach((p) => localStorage.removeItem(`project:${p.id}:history`)); alert('History cleared.') }}>Clear history for all projects</button>
              <button className="pill-btn" onClick={() => exportJson('motion-projects-backup.json', { projects: projects.map((p) => readProject(p.id)).filter(Boolean) })}><Download size={14} />Export all projects</button>
              <button className="pill-btn" onClick={() => importRef.current?.click()}><Upload size={14} />Import projects</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
