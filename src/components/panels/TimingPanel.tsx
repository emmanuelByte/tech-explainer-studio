import { Clock3 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useStore } from '../../store'
import { ScrubField } from './ScrubField'

function PanelGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mx-2 my-2 rounded-md overflow-hidden" style={{ border: '1px solid var(--border)', background: 'var(--panel)' }}>
      <div className="flex items-center gap-1.5 px-2.5 py-2" style={{ borderBottom: '1px solid var(--border)', color: 'var(--text2)' }}>
        <Clock3 size={13} />
        <span className="text-[10px] font-semibold uppercase tracking-widest">{title}</span>
      </div>
      <div className="p-2 flex flex-col gap-2">
        {children}
      </div>
    </section>
  )
}

export function TimingPanel() {
  const { t } = useTranslation()
  const { layers, selectedLayerIds, totalFrames, fps, updateLayerTimeRange, setLayerRange } = useStore()
  const layer = layers.find((l) => l.id === selectedLayerIds[0])
  if (!layer) return null

  const descendants = (layer.type === 'group' || layer.isGroup)
    ? layers.filter((item) => {
      let parentId = item.parentId
      while (parentId) {
        if (parentId === layer.id) return true
        parentId = layers.find((candidate) => candidate.id === parentId)?.parentId
      }
      return false
    })
    : []
  const rangeLayers = (layer.type === 'group' || layer.isGroup) ? [layer, ...descendants] : []
  const groupRange = rangeLayers.length
    ? {
      start: Math.min(...rangeLayers.map((item) => item.startFrame ?? 0)),
      end: Math.max(...rangeLayers.map((item) => item.endFrame ?? totalFrames)),
    }
    : null
  const startFrame = groupRange?.start ?? layer.startFrame ?? 0
  const endFrame = groupRange?.end ?? layer.endFrame ?? totalFrames
  const durationSec = totalFrames / fps
  const isGroup = layer.type === 'group' || layer.isGroup

  return (
    <PanelGroup title={t('timeline.editTiming')}>
      <ScrubField
        label={t('timeline.startTime')}
        value={startFrame / fps}
        min={0}
        max={(endFrame - 1) / fps}
        step={0.1}
        sensitivity={0.05}
        precision={2}
        unit="s"
        onChange={(v) => {
          const nextStart = Math.round(v * fps)
          const duration = Math.max(1, endFrame - startFrame)
          setLayerRange(layer.id, nextStart, Math.min(totalFrames, nextStart + duration))
        }}
      />
      <ScrubField
        label={t('transform.end', { defaultValue: 'End' })}
        value={endFrame / fps}
        min={(startFrame + 1) / fps}
        max={durationSec}
        step={0.1}
        sensitivity={0.05}
        precision={2}
        unit="s"
        onChange={(v) => {
          const nextEnd = Math.round(v * fps)
          if (isGroup) setLayerRange(layer.id, startFrame, nextEnd)
          else updateLayerTimeRange(layer.id, startFrame, nextEnd)
        }}
      />
      <div className="px-3 pb-1 text-[10px]" style={{ color: 'var(--text3)' }}>
        {t('common.frames')} {startFrame}-{endFrame}
      </div>
    </PanelGroup>
  )
}
