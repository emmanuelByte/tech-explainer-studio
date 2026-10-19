import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Player, type PlayerRef } from '@remotion/player'
import { ArrowLeft, Check, Download, FolderOpen, RefreshCw, Trash2 } from 'lucide-react'
import { EditorComposition } from '../remotion/Composition'
import { readProject } from '../projectStorage'
import { noteStatus, type ReviewNote } from '../domains/review/notes'
import type { MotionProject } from '../types'

/**
 * Review-only screen: play the project, leave notes for the AI, export.
 * It never writes the project, so it cannot overwrite a build the way the
 * editor's autosave can.
 */

interface ExportJob {
  id: string
  status: 'queued' | 'running' | 'done' | 'failed' | 'cancelled'
  progress: number
  fileName: string
  error?: string
}

function clock(frame: number, fps: number) {
  const seconds = Math.max(0, frame) / Math.max(1, fps)
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init)
  const data = await response.json() as T & { error?: string }
  if (!response.ok) throw new Error(data.error ?? `Request failed (${response.status})`)
  return data
}

export function ReviewScreen({ projectId }: { projectId: string }) {
  const playerRef = useRef<PlayerRef>(null)
  const [project, setProject] = useState<MotionProject | null>(null)
  const [error, setError] = useState('')
  const [frame, setFrame] = useState(0)
  const [notes, setNotes] = useState<ReviewNote[]>([])
  const [draft, setDraft] = useState('')
  const [job, setJob] = useState<ExportJob | null>(null)
  const [noteScene, setNoteScene] = useState('')
  const [updated, setUpdated] = useState(false)
  const loadedSignature = useRef('')

  useEffect(() => {
    void (async () => {
      const loaded = await readProject(projectId)
      if (!loaded) return setError(`Project "${projectId}" could not be loaded.`)
      setProject(loaded)
      loadedSignature.current = JSON.stringify(loaded)
      document.title = `Review: ${loaded.name}`
      try {
        setNotes((await api<{ notes: ReviewNote[] }>(`/api/reviews/${encodeURIComponent(projectId)}`)).notes)
      } catch { /* notes are optional */ }
    })()
  }, [projectId])

  useEffect(() => {
    const player = playerRef.current
    if (!player || !project) return
    const onFrame = ({ detail }: { detail: { frame: number } }) => setFrame(detail.frame)
    player.addEventListener('frameupdate', onFrame)
    return () => player.removeEventListener('frameupdate', onFrame)
  }, [project])

  const saveNotes = useCallback(async (next: ReviewNote[], deleted: string[] = []) => {
    setNotes(next)
    // The server merges with what the AI has since done to the notes and returns the result.
    const saved = await api<{ notes: ReviewNote[] }>(`/api/reviews/${encodeURIComponent(projectId)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes: next, deleted }),
    })
    setNotes(saved.notes)
  }, [projectId])

  const scenes = useMemo(() => project?.scenes ?? [], [project])
  const currentScene = useMemo(
    () => scenes.find((scene) => frame >= scene.startFrame && frame < scene.endFrame) ?? scenes[scenes.length - 1],
    [scenes, frame],
  )

  // The AI rebuilds the project after applying notes and the notes' status changes; pick both up without a manual refresh.
  useEffect(() => {
    const timer = window.setInterval(() => {
      void (async () => {
        try {
          const latest = await readProject(projectId)
          if (latest && JSON.stringify(latest) !== loadedSignature.current) setUpdated(true)
          const saved = await api<{ notes: ReviewNote[] }>(`/api/reviews/${encodeURIComponent(projectId)}`)
          setNotes((current) => (JSON.stringify(current) === JSON.stringify(saved.notes) ? current : saved.notes))
        } catch { /* polling is best-effort */ }
      })()
    }, 4000)
    return () => window.clearInterval(timer)
  }, [projectId])

  // Poll the export job until it finishes.
  useEffect(() => {
    if (!job || job.status === 'done' || job.status === 'failed' || job.status === 'cancelled') return
    const timer = window.setTimeout(() => {
      void api<ExportJob>(`/api/exports/${job.id}`).then(setJob).catch((e: Error) => setError(e.message))
    }, 1000)
    return () => window.clearTimeout(timer)
  }, [job])

  if (error && !project) return <div style={{ padding: 32, color: 'var(--text)' }}>{error}</div>
  if (!project) return <div style={{ padding: 32, color: 'var(--text2)' }}>Loading…</div>

  const { width, height, fps, durationFrames, backgroundColor } = project.canvas
  const seek = (target: number) => { playerRef.current?.seekTo(target); setFrame(target) }
  const addNote = () => {
    const text = draft.trim()
    const target = scenes.find((scene) => scene.id === noteScene) ?? currentScene
    if (!text || !target) return
    // A note for another scene points at that scene's start; one for the current scene keeps the exact moment.
    const at = target.id === currentScene?.id ? frame : target.startFrame
    const note: ReviewNote = { id: `note_${Date.now().toString(36)}`, sceneId: target.id.replace(/^scene_/, ''), frame: at, text, createdAt: new Date().toISOString() }
    setDraft('')
    setNoteScene('')
    void saveNotes([...notes, note]).catch((e: Error) => setError(e.message))
  }
  const startExport = () => {
    setError('')
    void api<ExportJob>('/api/exports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId, fileName: project.name, format: 'mp4', quality: 'standard', startFrame: 0, endFrame: durationFrames - 1 }),
    }).then(setJob).catch((e: Error) => setError(e.message))
  }
  const exporting = job?.status === 'queued' || job?.status === 'running'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--bg)', color: 'var(--text)' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderBottom: '1px solid var(--border)', background: 'var(--topbar)' }}>
        <a href="/" className="icon-btn" title="All projects"><ArrowLeft size={16} /></a>
        <strong style={{ flex: 1 }}>{project.name}</strong>
        {error && <span style={{ color: '#ef4444', fontSize: 12 }}>{error}</span>}
        {updated && (
          <button className="pill-btn" onClick={() => window.location.reload()} title="The AI rebuilt this lesson">
            <RefreshCw size={14} /> New version - reload
          </button>
        )}
        {job?.status === 'done' && (
          <button className="pill-btn" onClick={() => void api(`/api/exports/${job.id}/reveal`, { method: 'POST' })}>
            <FolderOpen size={14} /> {job.fileName}
          </button>
        )}
        {job?.status === 'failed' && <span style={{ color: '#ef4444', fontSize: 12 }}>Export failed: {job.error}</span>}
        <button className="pill-btn primary-btn" disabled={exporting} onClick={startExport}>
          <Download size={14} /> {exporting ? `Exporting ${job?.progress ?? 0}%` : 'Export MP4'}
        </button>
      </header>

      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <main style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ width: '100%', maxWidth: `calc((100vh - 120px) * ${width / height})`, aspectRatio: `${width} / ${height}`, boxShadow: 'var(--preview-shadow)' }}>
            <Player
              ref={playerRef}
              component={EditorComposition}
              inputProps={{
                layers: project.layers,
                scenes: project.scenes ?? [],
                connectors: project.connectors ?? [],
                camera: project.camera,
                script: project.script,
                captions: project.captions,
                canvasWidth: width,
                canvasHeight: height,
                backgroundColor,
                showOutsideCanvas: false,
              }}
              durationInFrames={Math.max(1, durationFrames)}
              fps={fps}
              compositionWidth={width}
              compositionHeight={height}
              style={{ width: '100%', height: '100%' }}
              controls
              acknowledgeRemotionLicense
            />
          </div>
        </main>

        <aside style={{ width: 340, borderLeft: '1px solid var(--border)', background: 'var(--panel)', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <section style={{ padding: 12, borderBottom: '1px solid var(--border)', overflowY: 'auto', maxHeight: '34%' }}>
            <div style={{ fontSize: 11, color: 'var(--section-header)', marginBottom: 6 }}>SCENES</div>
            {scenes.map((scene, index) => (
              <button
                key={scene.id}
                onClick={() => seek(scene.startFrame)}
                style={{
                  display: 'block', width: '100%', textAlign: 'left', padding: '6px 8px', borderRadius: 6, border: 0, cursor: 'pointer',
                  background: scene.id === currentScene?.id ? 'var(--selected-bg)' : 'transparent', color: 'var(--text)',
                }}
              >
                {index + 1}. {scene.title} <span style={{ color: 'var(--text3)', fontSize: 12 }}>{clock(scene.startFrame, fps)}</span>
              </button>
            ))}
          </section>

          <section style={{ padding: 12, flex: 1, overflowY: 'auto', minHeight: 0 }}>
            <div style={{ fontSize: 11, color: 'var(--section-header)', marginBottom: 6 }}>NOTES FOR THE AI</div>
            {!notes.length && <div style={{ color: 'var(--text3)', fontSize: 13 }}>No notes yet. Pause on a moment and describe what to change.</div>}
            {notes.map((note) => (
              <div key={note.id} style={{ display: 'flex', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--border2)', opacity: noteStatus(note) === 'verified' ? 0.55 : 1 }}>
                <button className="icon-btn" title="Go to this moment" onClick={() => seek(note.frame)} style={{ fontSize: 12, width: 'auto', padding: '0 6px' }}>
                  {clock(note.frame, fps)}
                </button>
                <div style={{ flex: 1, fontSize: 13, }}>
                  <span style={{ color: 'var(--text3)' }}>{note.sceneId}</span> — {note.text}
                </div>
                {noteStatus(note) === 'applied' && <span title={`Changed, not yet checked: ${note.appliedSummary ?? ''}`} style={{ fontSize: 11, color: '#f59e0b' }}>applied</span>}
                {noteStatus(note) === 'verified' && <span title={`Checked: ${note.verification ?? ''}`} style={{ display: 'flex', alignItems: 'center', gap: 2, fontSize: 11, color: '#22c55e' }}><Check size={14} />verified</span>}
                {noteStatus(note) === 'pending' && (
                  <button className="icon-btn" title="Delete note" onClick={() => void saveNotes(notes.filter((n) => n.id !== note.id), [note.id]).catch((e: Error) => setError(e.message))}>
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            ))}
          </section>

          <section style={{ padding: 12, borderTop: '1px solid var(--border)' }}>
            <select className="input-base" value={noteScene || currentScene?.id || ''} onChange={(event) => setNoteScene(event.target.value)} style={{ width: '100%', marginBottom: 6 }} title="Which scene this note is about">
              {scenes.map((scene, index) => <option key={scene.id} value={scene.id}>{index + 1}. {scene.title}</option>)}
            </select>
            <textarea
              className="input-base"
              rows={3}
              placeholder={`Note at ${clock(frame, fps)}${currentScene ? ` (${currentScene.title})` : ''}…`}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => { if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) addNote() }}
              style={{ width: '100%', resize: 'vertical' }}
            />
            <button className="pill-btn" style={{ marginTop: 8 }} onClick={addNote} disabled={!draft.trim()}>Add note (⌘↵)</button>
          </section>
        </aside>
      </div>
    </div>
  )
}
