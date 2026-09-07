import type { CSSProperties } from 'react'
import { Trash2 } from 'lucide-react'
import type { ConnectorPort, ConnectorRouting } from '../../types'
import { useStore } from '../../store'

const ports: ConnectorPort[] = ['left', 'right', 'top', 'bottom']
const routes: ConnectorRouting[] = ['straight', 'orthogonal', 'bezier']
const fieldStyle: CSSProperties = { background: 'var(--input)', color: 'var(--text)', border: '1px solid var(--input-border)' }
const fieldClass = 'mt-1 w-full min-w-0 rounded px-2 py-1.5 text-xs'

export function ConnectorPanel({ layerId }: { layerId: string }) {
  const connectors = useStore((state) => state.connectors)
  const layers = useStore((state) => state.layers)
  const selectConnector = useStore((state) => state.selectConnector)
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
            <button key={connector.id} type="button" onClick={() => selectConnector(connector.id)} className="rounded px-2 py-2 text-left text-xs" style={fieldStyle}>
              <span className="block truncate">{isSource ? 'To' : 'From'} {other?.name ?? 'Missing component'}</span>
              <span className="mt-1 block text-[10px]" style={{ color: 'var(--text3)' }}>Edit connection · {connector.routing ?? 'straight'}</span>
            </button>
          )
        })}
      </div>
    </section>
  )
}

export function ConnectorInspector({ connectorId }: { connectorId: string }) {
  const connectors = useStore((state) => state.connectors)
  const layers = useStore((state) => state.layers)
  const fps = useStore((state) => state.fps)
  const currentFrame = useStore((state) => state.currentFrame)
  const updateConnector = useStore((state) => state.updateConnector)
  const deleteConnector = useStore((state) => state.deleteConnector)
  const connector = connectors.find((item) => item.id === connectorId)
  if (!connector) return null
  const hasDraw = connector.drawStartFrame !== undefined && connector.drawEndFrame !== undefined
  const start = (connector.drawStartFrame ?? 0) / fps
  const end = (connector.drawEndFrame ?? Math.round(fps * 0.8)) / fps
  const candidates = layers.filter((layer) => layer.technicalComponent || layer.id === connector.sourceLayerId || layer.id === connector.targetLayerId)
  return (
    <section className="flex min-h-0 flex-col gap-3 overflow-y-auto px-3 py-3" aria-label="Connection inspector">
      <p className="text-[11px]" style={{ color: 'var(--text3)' }}>Choose components and ports, or drag either endpoint on the canvas.</p>
      {(['source', 'target'] as const).map((endpoint) => {
        const layerKey = endpoint === 'source' ? 'sourceLayerId' : 'targetLayerId'
        const portKey = endpoint === 'source' ? 'sourcePort' : 'targetPort'
        const opposite = endpoint === 'source' ? connector.targetLayerId : connector.sourceLayerId
        return (
          <div key={endpoint} className="grid grid-cols-[1fr_85px] gap-2">
            <label className="min-w-0 text-[11px]">{endpoint === 'source' ? 'From component' : 'To component'}
              <select value={connector[layerKey]} onChange={(event) => updateConnector(connector.id, { [layerKey]: event.target.value })} className={fieldClass} style={fieldStyle}>
                {candidates.filter((layer) => layer.id !== opposite).map((layer) => <option key={layer.id} value={layer.id}>{layer.name}</option>)}
              </select>
            </label>
            <label className="text-[11px]">{endpoint === 'source' ? 'From port' : 'To port'}
              <select value={connector[portKey]} onChange={(event) => updateConnector(connector.id, { [portKey]: event.target.value as ConnectorPort })} className={fieldClass} style={fieldStyle}>
                {ports.map((port) => <option key={port} value={port}>{port}</option>)}
              </select>
            </label>
          </div>
        )
      })}
      <label className="text-[11px]">Connection path
        <select value={connector.routing ?? 'straight'} onChange={(event) => updateConnector(connector.id, { routing: event.target.value as ConnectorRouting })} className={fieldClass} style={fieldStyle}>
          {routes.map((route) => <option key={route} value={route}>{route === 'bezier' ? 'Curved (bezier)' : route === 'orthogonal' ? 'Elbow (orthogonal)' : 'Straight'}</option>)}
        </select>
      </label>
      <label className="text-[11px]">Line style
        <select value={connector.lineStyle} onChange={(event) => updateConnector(connector.id, { lineStyle: event.target.value as 'solid' | 'dashed' })} className={fieldClass} style={fieldStyle}>
          <option value="solid">Solid</option>
          <option value="dashed">Dashed</option>
        </select>
      </label>
      <fieldset className="grid grid-cols-2 gap-2 text-[11px]">
        <legend className="mb-1">Arrowheads</legend>
        <label className="flex items-center gap-2 rounded px-2 py-2" style={fieldStyle}>
          <input type="checkbox" checked={connector.arrowStart} onChange={(event) => updateConnector(connector.id, { arrowStart: event.target.checked })} />
          Start
        </label>
        <label className="flex items-center gap-2 rounded px-2 py-2" style={fieldStyle}>
          <input type="checkbox" checked={connector.arrowEnd} onChange={(event) => updateConnector(connector.id, { arrowEnd: event.target.checked })} />
          End
        </label>
      </fieldset>
      <fieldset className="grid grid-cols-[1fr_90px] gap-2 text-[11px]">
        <legend className="mb-1">Sketch style</legend>
        <label className="flex items-center gap-2 rounded px-2 py-2" style={fieldStyle}>
          <input type="checkbox" checked={Boolean(connector.sketchEnabled)} onChange={(event) => updateConnector(connector.id, { sketchEnabled: event.target.checked })} />
          Hand-drawn
        </label>
        <label>Roughness
          <input type="number" min="0.25" max="3" step="0.25" disabled={!connector.sketchEnabled} value={connector.sketchRoughness ?? 1} onChange={(event) => updateConnector(connector.id, { sketchRoughness: Number(event.target.value) || 1 })} className={fieldClass} style={fieldStyle} />
        </label>
      </fieldset>
      <label className="text-[11px]">Connection label
        <input value={connector.label ?? ''} onChange={(event) => updateConnector(connector.id, { label: event.target.value || undefined })} placeholder="e.g. HTTP requests" className={fieldClass} style={fieldStyle} />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-[11px]">Color
          <input type="color" value={connector.color} onChange={(event) => updateConnector(connector.id, { color: event.target.value })} className="mt-1 block h-8 w-full" />
        </label>
        <label className="text-[11px]">Line width
          <input type="number" min="1" max="16" value={connector.strokeWidth} onChange={(event) => updateConnector(connector.id, { strokeWidth: Number(event.target.value) || 1 })} className={fieldClass} style={fieldStyle} />
        </label>
      </div>
      <div className="pt-3" style={{ borderTop: '1px solid var(--border)' }}>
        <div className="mb-2 text-xs font-medium">Draw animation</div>
        {hasDraw ? (
          <div className="grid grid-cols-2 gap-2">
            <label className="text-[11px]">Draw start (seconds)
              <input type="number" min="0" step={1 / fps} value={Number(start.toFixed(3))} onChange={(event) => updateConnector(connector.id, { drawStartFrame: (Number(event.target.value) || 0) * fps })} className={fieldClass} style={fieldStyle} />
            </label>
            <label className="text-[11px]">Draw end (seconds)
              <input type="number" min={start + 1 / fps} step={1 / fps} value={Number(end.toFixed(3))} onChange={(event) => updateConnector(connector.id, { drawEndFrame: (Number(event.target.value) || 0) * fps })} className={fieldClass} style={fieldStyle} />
            </label>
          </div>
        ) : <p className="text-[11px]" style={{ color: 'var(--text3)' }}>No draw animation. The connection follows its components’ visibility.</p>}
        <button type="button" className="mt-2 w-full rounded py-2 text-xs" style={{ background: 'var(--accent-bg)', color: 'var(--accent)' }} onClick={() => updateConnector(connector.id, { drawStartFrame: currentFrame, drawEndFrame: currentFrame + Math.max(1, Math.round(fps * 0.8)) })}>Draw in from playhead</button>
        {hasDraw && <button type="button" className="mt-2 w-full rounded py-1 text-[11px]" style={{ color: 'var(--text3)' }} onClick={() => updateConnector(connector.id, { drawStartFrame: undefined, drawEndFrame: undefined })}>Remove draw animation</button>}
      </div>
      <button type="button" className="flex w-full items-center justify-center gap-2 rounded py-2 text-xs" style={{ color: '#fca5a5', background: 'rgba(239,68,68,0.12)' }} onClick={() => deleteConnector(connector.id)}><Trash2 size={13} />Delete connection</button>
    </section>
  )
}
