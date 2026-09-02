import { Trash2 } from 'lucide-react'
import type { ConnectorPort, ConnectorRouting } from '../../types'
import { useStore } from '../../store'

const ports: ConnectorPort[] = ['left', 'right', 'top', 'bottom']
const routes: ConnectorRouting[] = ['straight', 'orthogonal', 'bezier']

export function ConnectorPanel({ layerId }: { layerId: string }) {
  const { connectors, layers, currentFrame, fps, updateConnector, deleteConnector } = useStore()
  const related = connectors.filter((connector) => connector.sourceLayerId === layerId || connector.targetLayerId === layerId)

  if (!related.length) return null

  return (
    <section className="px-3 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
      <div className="section-header" style={{ padding: 0, marginBottom: 8 }}>Connections</div>
      <div className="flex flex-col gap-2">
        {related.map((connector) => {
          const isSource = connector.sourceLayerId === layerId
          const other = layers.find((layer) => layer.id === (isSource ? connector.targetLayerId : connector.sourceLayerId))
          return (
            <div key={connector.id} className="rounded p-2" style={{ background: 'var(--input)', border: '1px solid var(--input-border)' }}>
              <div className="mb-2 flex items-center justify-between gap-2" style={{ fontSize: 11, color: 'var(--text)' }}>
                <span className="truncate">{isSource ? 'To' : 'From'} {other?.name ?? 'Deleted layer'}</span>
                <button type="button" onClick={() => deleteConnector(connector.id)} title="Delete connection" style={{ color: 'var(--text3)' }}><Trash2 size={13} /></button>
              </div>
              <div className="grid grid-cols-2 gap-1">
                <select value={connector.sourcePort} onChange={(event) => updateConnector(connector.id, { sourcePort: event.target.value as ConnectorPort })} className="min-w-0 rounded px-1 py-1 text-[10px]" style={{ background: 'var(--panel)', border: '1px solid var(--border)' }} aria-label="Source port">
                  {ports.map((port) => <option key={port} value={port}>From: {port}</option>)}
                </select>
                <select value={connector.targetPort} onChange={(event) => updateConnector(connector.id, { targetPort: event.target.value as ConnectorPort })} className="min-w-0 rounded px-1 py-1 text-[10px]" style={{ background: 'var(--panel)', border: '1px solid var(--border)' }} aria-label="Target port">
                  {ports.map((port) => <option key={port} value={port}>To: {port}</option>)}
                </select>
              </div>
              <select value={connector.routing ?? 'straight'} onChange={(event) => updateConnector(connector.id, { routing: event.target.value as ConnectorRouting })} className="mt-1 w-full rounded px-1 py-1 text-[10px]" style={{ background: 'var(--panel)', border: '1px solid var(--border)' }} aria-label="Connection path">
                {routes.map((route) => <option key={route} value={route}>Path: {route}</option>)}
              </select>
              <input value={connector.label ?? ''} onChange={(event) => updateConnector(connector.id, { label: event.target.value || undefined })} placeholder="Connection label" className="mt-1 w-full rounded px-2 py-1 text-[11px]" style={{ background: 'var(--panel)', border: '1px solid var(--border)' }} />
              <div className="mt-1 flex items-center gap-2">
                <input type="color" value={connector.color} onChange={(event) => updateConnector(connector.id, { color: event.target.value })} aria-label="Connection color" />
                <input type="number" min="1" max="16" value={connector.strokeWidth} onChange={(event) => updateConnector(connector.id, { strokeWidth: Math.max(1, Math.min(16, Number(event.target.value) || 1)) })} aria-label="Connection width" className="w-16 rounded px-2 py-1 text-[11px]" style={{ background: 'var(--panel)', border: '1px solid var(--border)' }} />
              </div>
              <button
                type="button"
                className="mt-2 w-full rounded py-1 text-[11px]"
                style={{ background: 'var(--accent-bg)', color: 'var(--accent)' }}
                onClick={() => updateConnector(connector.id, { drawStartFrame: currentFrame, drawEndFrame: currentFrame + Math.max(1, Math.round(fps * 0.8)) })}
              >
                Animate draw-in from playhead
              </button>
            </div>
          )
        })}
      </div>
    </section>
  )
}

export function ConnectorAnimationPanel({ connectorId }: { connectorId: string }) {
  const { connectors, layers, fps, updateConnector, deleteConnector } = useStore()
  const connector = connectors.find((item) => item.id === connectorId)
  if (!connector) return null
  const name = `${layers.find((layer) => layer.id === connector.sourceLayerId)?.name ?? 'Source'} → ${layers.find((layer) => layer.id === connector.targetLayerId)?.name ?? 'Target'}`
  const start = (connector.drawStartFrame ?? 0) / fps
  const end = (connector.drawEndFrame ?? Math.round(fps * 0.8)) / fps
  return (
    <section className="px-3 py-3">
      <div className="mb-2 text-xs" style={{ color: 'var(--text)' }}>{name}</div>
      <label className="mb-2 block text-[10px]" style={{ color: 'var(--text3)' }}>Draw start (seconds)
        <input type="number" min="0" step="0.1" value={start} onChange={(event) => updateConnector(connector.id, { drawStartFrame: Math.max(0, Math.round((Number(event.target.value) || 0) * fps)) })} className="mt-1 w-full rounded px-2 py-1 text-xs" style={{ background: 'var(--input)', border: '1px solid var(--input-border)' }} />
      </label>
      <label className="mb-3 block text-[10px]" style={{ color: 'var(--text3)' }}>Draw end (seconds)
        <input type="number" min={start + 0.01} step="0.1" value={end} onChange={(event) => updateConnector(connector.id, { drawEndFrame: Math.max((connector.drawStartFrame ?? 0) + 1, Math.round((Number(event.target.value) || 0) * fps)) })} className="mt-1 w-full rounded px-2 py-1 text-xs" style={{ background: 'var(--input)', border: '1px solid var(--input-border)' }} />
      </label>
      <button type="button" className="w-full rounded py-1 text-xs" style={{ color: '#fca5a5', background: 'rgba(239,68,68,0.12)' }} onClick={() => deleteConnector(connector.id)}>Delete connection</button>
    </section>
  )
}
