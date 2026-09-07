import type { CameraTrack, Connector, Layer } from '../../types'

type DiagramSnapshot = { layers: Layer[]; connectors: Connector[]; camera?: CameraTrack }

export function serializeDiagram(state: DiagramSnapshot): string {
  return JSON.stringify({ layers: state.layers, connectors: state.connectors, camera: state.camera })
}

export function restoreDiagram(snapshot: string): DiagramSnapshot {
  const parsed = JSON.parse(snapshot) as DiagramSnapshot | Layer[]
  // History is session-only. Accept the old layer-only shape during hot reload.
  return Array.isArray(parsed) ? { layers: parsed, connectors: [] } : parsed
}
