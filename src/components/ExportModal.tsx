import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FileVideo, Film, FolderOpen, Gauge, LoaderCircle, Play, Sparkles, X, Zap } from 'lucide-react'
import { useStore } from '../store'
import { Modal } from './Modal'

type ExportFormat = 'mp4' | 'webm'
type ExportQuality = 'standard' | 'high' | 'ultra'
type ExportStatus = 'queued' | 'running' | 'done' | 'failed' | 'cancelled'
type ExportPhase = 'queued' | 'bundling' | 'preparing' | 'rendering' | 'encoding' | 'done'

interface ExportJob {
  id: string
  status: ExportStatus
  phase: ExportPhase
  progress: number
  fileName: string
  format: ExportFormat
  quality: ExportQuality
  outputPath: string
  startFrame: number
  endFrame: number
  error?: string
  renderedFrames: number
  totalRenderFrames: number
  encodedFrames: number
  totalEncodeFrames: number
  logs: string[]
}

const QUALITY_SCALE: Record<ExportQuality, number> = {
  standard: 1,
  high: 2,
  ultra: 3,
}

async function requestJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options)
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Export request failed.')
  return data as T
}

function sanitizeFileName(value: string, fallback: string) {
  const base = value
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
  return base || fallback
}

/* ── Local Figma-style primitives ──────────────────────────── */

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 500,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        color: 'var(--section-header)',
      }}
    >
      {children}
    </span>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 5, minWidth: 0 }}>
      <FieldLabel>{label}</FieldLabel>
      {children}
    </label>
  )
}

function MetaChip({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        fontSize: 10,
        padding: '3px 8px',
        borderRadius: 4,
        background: 'var(--panel2)',
        color: 'var(--text2)',
        border: '1px solid var(--border)',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </span>
  )
}

function FormatCard({
  active, disabled, icon, label, sub, onClick,
}: {
  active: boolean
  disabled?: boolean
  icon: React.ReactNode
  label: string
  sub: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
        height: 64,
        padding: '8px 6px',
        borderRadius: 5,
        background: active ? 'var(--accent-bg)' : 'var(--panel2)',
        border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
        color: active ? 'var(--accent)' : 'var(--text2)',
        fontSize: 12,
        fontWeight: 600,
        letterSpacing: '0.02em',
        transition: 'background 0.1s, border-color 0.1s, color 0.1s',
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.55 : 1,
      }}
    >
      {icon}
      <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
        <span>{label}</span>
        <span
          style={{
            fontSize: 9,
            fontWeight: 500,
            letterSpacing: '0.04em',
            color: active ? 'var(--accent)' : 'var(--text3)',
            opacity: active ? 0.85 : 1,
          }}
        >
          {sub}
        </span>
      </span>
    </button>
  )
}

export function ExportModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const { projectId, projectName, canvasPreset, customWidth, customHeight, totalFrames, fps } = useStore()
  const isCustom = canvasPreset.name === 'Custom'
  const w = isCustom ? customWidth : canvasPreset.width
  const h = isCustom ? customHeight : canvasPreset.height
  const defaultName = useMemo(() => sanitizeFileName(projectName || projectId || 'video', 'video'), [projectId, projectName])

  const [fileName, setFileName] = useState(defaultName)
  const [format, setFormat] = useState<ExportFormat>('mp4')
  const [quality, setQuality] = useState<ExportQuality>('high')
  const [startFrame, setStartFrame] = useState(0)
  const [endFrame, setEndFrame] = useState(Math.max(0, totalFrames - 1))
  const [job, setJob] = useState<ExportJob | null>(null)
  const [error, setError] = useState('')
  const [opening, setOpening] = useState(false)

  const isRunning = job?.status === 'queued' || job?.status === 'running'
  const outputName = `${sanitizeFileName(fileName, defaultName)}.${format}`
  const qualityScale = QUALITY_SCALE[quality]
  const outputWidth = Math.round(w * qualityScale)
  const outputHeight = Math.round(h * qualityScale)
  const clampedStart = Math.max(0, Math.min(Math.max(0, totalFrames - 1), Math.round(startFrame || 0)))
  const clampedEnd = Math.max(clampedStart, Math.min(Math.max(0, totalFrames - 1), Math.round(endFrame || 0)))
  const durationSec = ((clampedEnd - clampedStart + 1) / fps).toFixed(1)
  const lastLogLine = job?.logs[job.logs.length - 1]
  const phaseCount = job?.phase === 'rendering'
    ? ` ${job.renderedFrames}/${job.totalRenderFrames}`
    : job?.phase === 'encoding'
      ? ` ${job.encodedFrames}/${job.totalEncodeFrames}`
      : ''

  useEffect(() => {
    if (!job || (job.status !== 'queued' && job.status !== 'running')) return
    const poll = window.setInterval(() => {
      void requestJson<ExportJob>(`/api/exports/${encodeURIComponent(job.id)}`)
        .then(setJob)
        .catch((err) => setError(err instanceof Error ? err.message : t('exportModal.failed')))
    }, 600)
    return () => window.clearInterval(poll)
  }, [job, t])

  async function startExport() {
    if (!projectId || isRunning) return
    setError('')
    try {
      const nextJob = await requestJson<ExportJob>('/api/exports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          fileName: sanitizeFileName(fileName, defaultName),
          format,
          quality,
          startFrame: clampedStart,
          endFrame: clampedEnd,
        }),
      })
      setJob(nextJob)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('exportModal.failed'))
    }
  }

  async function cancelExport() {
    if (!job || !isRunning) return
    try {
      const nextJob = await requestJson<ExportJob>(`/api/exports/${encodeURIComponent(job.id)}/cancel`, { method: 'POST' })
      setJob(nextJob)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('exportModal.failed'))
    }
  }

  async function openLocation() {
    if (!job || job.status !== 'done') return
    setOpening(true)
    setError('')
    try {
      await requestJson<{ ok: true }>(`/api/exports/${encodeURIComponent(job.id)}/reveal`, { method: 'POST' })
    } catch (err) {
      setError(err instanceof Error ? err.message : t('exportModal.openFailed'))
    } finally {
      setOpening(false)
    }
  }

  /* ── Footer buttons ────────────────────────────────────── */

  const exportDisabled = !projectId || isRunning

  /* Editor system: footer buttons are flat 28px pills, icon + label inline.
     Matches .pill-btn / .primary-btn used throughout the app. */
  const footerBtnBase: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 28,
    padding: '0 12px',
    fontSize: 11,
    fontWeight: 500,
    borderRadius: 4,
    transition: 'background 0.1s, color 0.1s, opacity 0.1s',
  }

  const footer = (
    <>
      <button
        onClick={onClose}
        style={{
          ...footerBtnBase,
          background: 'transparent',
          color: 'var(--text2)',
          border: '1px solid var(--border)',
        }}
      >
        {t('common.close')}
      </button>

      {isRunning && (
        <button
          onClick={cancelExport}
          style={{
            ...footerBtnBase,
            background: 'rgba(239,68,68,0.10)',
            color: '#ef4444',
            border: '1px solid rgba(239,68,68,0.28)',
            fontWeight: 600,
          }}
        >
          <X size={13} strokeWidth={2.2} />
          <span>{t('exportModal.cancel')}</span>
        </button>
      )}

      {job?.status === 'done' && (
        <button
          onClick={openLocation}
          disabled={opening}
          style={{
            ...footerBtnBase,
            background: 'var(--panel2)',
            color: 'var(--text)',
            border: '1px solid var(--border)',
            fontWeight: 500,
          }}
        >
          {opening ? <LoaderCircle size={13} className="animate-spin" /> : <FolderOpen size={13} strokeWidth={2.2} />}
          <span>{t('exportModal.openLocation')}</span>
        </button>
      )}

      <button
        onClick={startExport}
        disabled={exportDisabled}
        style={{
          ...footerBtnBase,
          padding: '0 14px',
          background: 'var(--accent)',
          color: '#ffffff',
          border: '1px solid var(--accent)',
          fontWeight: 600,
          opacity: exportDisabled ? 0.55 : 1,
        }}
      >
        {isRunning ? <LoaderCircle size={13} className="animate-spin" /> : <Play size={13} strokeWidth={2.4} fill="currentColor" />}
        <span>{isRunning ? t('exportModal.exporting') : t('exportModal.startExport')}</span>
      </button>
    </>
  )

  return (
    <Modal title={t('exportModal.title')} onClose={onClose} width={560} footer={footer} zIndex={2500}>
      <div style={{ padding: '14px 16px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Help blurb */}
        <p style={{ fontSize: 11, color: 'var(--text2)', margin: 0, lineHeight: 1.5 }}>
          {t('exportModal.help')}
        </p>

        {/* File name */}
        <Field label={t('exportModal.fileName')}>
          <input
            className="input-base"
            style={{ height: 28, padding: '0 8px', fontSize: 12 }}
            value={fileName}
            disabled={isRunning}
            onChange={(event) => setFileName(event.target.value)}
          />
        </Field>

        {/* Format — two stacked cards (icon above label) */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <FieldLabel>{t('exportModal.format')}</FieldLabel>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            <FormatCard
              active={format === 'mp4'}
              disabled={isRunning}
              icon={<FileVideo size={18} strokeWidth={1.8} />}
              label="MP4"
              sub="H.264"
              onClick={() => setFormat('mp4')}
            />
            <FormatCard
              active={format === 'webm'}
              disabled={isRunning}
              icon={<Film size={18} strokeWidth={1.8} />}
              label="WebM"
              sub="VP9"
              onClick={() => setFormat('webm')}
            />
          </div>
        </div>

        {/* Quality */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <FieldLabel>{t('exportModal.quality')}</FieldLabel>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
            <FormatCard
              active={quality === 'standard'}
              disabled={isRunning}
              icon={<Gauge size={17} strokeWidth={1.8} />}
              label={t('exportModal.qualityStandard')}
              sub="1×"
              onClick={() => setQuality('standard')}
            />
            <FormatCard
              active={quality === 'high'}
              disabled={isRunning}
              icon={<Sparkles size={17} strokeWidth={1.8} />}
              label={t('exportModal.qualityHigh')}
              sub="2×"
              onClick={() => setQuality('high')}
            />
            <FormatCard
              active={quality === 'ultra'}
              disabled={isRunning}
              icon={<Zap size={17} strokeWidth={1.8} />}
              label={t('exportModal.qualityUltra')}
              sub="3×"
              onClick={() => setQuality('ultra')}
            />
          </div>
          <p style={{ fontSize: 10, color: 'var(--text3)', margin: 0, lineHeight: 1.45 }}>
            {t('exportModal.qualityHelp')}
          </p>
        </div>

        {/* Frame range */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <Field label={t('exportModal.startFrame')}>
            <input
              className="input-base"
              style={{ height: 28, padding: '0 8px', fontSize: 12 }}
              type="number"
              min={0}
              max={Math.max(0, totalFrames - 1)}
              value={startFrame}
              disabled={isRunning}
              onChange={(event) => setStartFrame(Number(event.target.value))}
            />
          </Field>
          <Field label={t('exportModal.endFrame')}>
            <input
              className="input-base"
              style={{ height: 28, padding: '0 8px', fontSize: 12 }}
              type="number"
              min={clampedStart}
              max={Math.max(0, totalFrames - 1)}
              value={endFrame}
              disabled={isRunning}
              onChange={(event) => setEndFrame(Number(event.target.value))}
            />
          </Field>
        </div>

        {/* Summary chips */}
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          <MetaChip>{outputName}</MetaChip>
          <MetaChip>{outputWidth}×{outputHeight}</MetaChip>
          <MetaChip>{qualityScale}× {t('exportModal.quality')}</MetaChip>
          <MetaChip>{fps} fps</MetaChip>
          <MetaChip>{t('exportModal.framesRange', { start: clampedStart, end: clampedEnd })}</MetaChip>
          <MetaChip>{durationSec}s</MetaChip>
        </div>

        {/* Status block */}
        {job && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              padding: 12,
              borderRadius: 5,
              border: '1px solid var(--border)',
              background: 'var(--panel2)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <span
                  style={{
                    width: 7, height: 7, borderRadius: 999,
                    background:
                      job.status === 'done' ? '#22c55e' :
                      job.status === 'failed' ? '#ef4444' :
                      job.status === 'cancelled' ? 'var(--text3)' :
                      'var(--accent)',
                    boxShadow: isRunning ? '0 0 0 3px var(--accent-bg)' : 'none',
                  }}
                />
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text)' }}>
                  {job.status === 'running' ? t(`exportModal.phase.${job.phase}`) : t(`exportModal.status.${job.status}`)}
                  {phaseCount}
                </span>
              </div>
              <span
                style={{
                  fontSize: 11,
                  fontFamily: "'JetBrains Mono', ui-monospace, monospace",
                  color: job.status === 'failed' ? '#ef4444' : 'var(--text2)',
                }}
              >
                {Math.round(job.progress)}%
              </span>
            </div>
            <div style={{ height: 5, borderRadius: 999, background: 'var(--input)', overflow: 'hidden' }}>
              <div
                style={{
                  width: `${Math.max(0, Math.min(100, job.progress))}%`,
                  height: '100%',
                  background: job.status === 'failed' ? '#ef4444' : 'var(--accent)',
                  transition: 'width 180ms ease',
                }}
              />
            </div>
            {job.status === 'done' && (
              <div style={{ fontSize: 10, color: 'var(--text3)', wordBreak: 'break-all', fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}>
                {job.outputPath}
              </div>
            )}
            {(job.error || lastLogLine) && (
              <div
                style={{
                  fontFamily: "'JetBrains Mono', ui-monospace, monospace",
                  fontSize: 10,
                  lineHeight: 1.4,
                  color: job.error ? '#ef4444' : 'var(--text3)',
                  wordBreak: 'break-word',
                }}
              >
                {job.error || lastLogLine}
              </div>
            )}
          </div>
        )}

        {error && (
          <div
            style={{
              fontSize: 11,
              color: '#ef4444',
              background: 'rgba(239,68,68,0.08)',
              border: '1px solid rgba(239,68,68,0.22)',
              borderRadius: 5,
              padding: '8px 10px',
            }}
          >
            {error}
          </div>
        )}
      </div>
    </Modal>
  )
}
