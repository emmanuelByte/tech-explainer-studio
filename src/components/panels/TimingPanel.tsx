import { Clock3 } from 'lucide-react'
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
  const { layers, selectedLayerIds, totalFrames, fps, updateLayerTimeRange } = useStore()
  const layer = layers.find((l) => l.id === selectedLayerIds[0])
  if (!layer) return null

  const startFrame = layer.startFrame ?? 0
  const endFrame = layer.endFrame ?? totalFrames
  const durationSec = totalFrames / fps

  return (
    <PanelGroup title="Timing">
      <ScrubField
        label="Start"
        value={startFrame / fps}
        min={0}
        max={(endFrame - 1) / fps}
        step={0.1}
        sensitivity={0.05}
        precision={2}
        unit="s"
        onChange={(v) => updateLayerTimeRange(layer.id, Math.round(v * fps), endFrame)}
      />
      <ScrubField
        label="End"
        value={endFrame / fps}
        min={(startFrame + 1) / fps}
        max={durationSec}
        step={0.1}
        sensitivity={0.05}
        precision={2}
        unit="s"
        onChange={(v) => updateLayerTimeRange(layer.id, startFrame, Math.round(v * fps))}
      />
      <div className="px-3 pb-1 text-[10px]" style={{ color: 'var(--text3)' }}>
        Frames {startFrame}-{endFrame}
      </div>
    </PanelGroup>
  )
}
