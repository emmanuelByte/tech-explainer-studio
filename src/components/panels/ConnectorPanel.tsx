import { Trash2 } from 'lucide-react'
import type { ConnectorPort } from '../../types'
import { useStore } from '../../store'

const ports: ConnectorPort[] = ['left', 'right', 'top', 'bottom']

export function ConnectorPanel({ layerId }: { layerId: string }) {
  const { connectors, layers, updateConnector, deleteConnector } = useStore()
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
              <input value={connector.label ?? ''} onChange={(event) => updateConnector(connector.id, { label: event.target.value || undefined })} placeholder="Connection label" className="mt-1 w-full rounded px-2 py-1 text-[11px]" style={{ background: 'var(--panel)', border: '1px solid var(--border)' }} />
              <div className="mt-1 flex items-center gap-2">
                <input type="color" value={connector.color} onChange={(event) => updateConnector(connector.id, { color: event.target.value })} aria-label="Connection color" />
                <input type="number" min="1" max="16" value={connector.strokeWidth} onChange={(event) => updateConnector(connector.id, { strokeWidth: Math.max(1, Math.min(16, Number(event.target.value) || 1)) })} aria-label="Connection width" className="w-16 rounded px-2 py-1 text-[11px]" style={{ background: 'var(--panel)', border: '1px solid var(--border)' }} />
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
