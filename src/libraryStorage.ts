import type { Layer } from './types'

export type LibraryItemKind = 'design' | 'animation'

export interface LibraryItem {
  id: string
  name: string
  kind: LibraryItemKind
  layers: Layer[]
  rootLayerIds: string[]
  frameStart?: number
  frameEnd?: number
  durationFrames?: number
  createdAt: string
  updatedAt: string
}

export type SaveLibraryItemPayload = Omit<LibraryItem, 'id' | 'createdAt' | 'updatedAt'>

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init)
  if (!response.ok) {
    const data = await response.json().catch(() => null) as { error?: string } | null
    throw new Error(data?.error || `Request failed with ${response.status}`)
  }
  return response.json() as Promise<T>
}

export function listLibraryItems() {
  return requestJson<LibraryItem[]>('/api/library')
}

export function saveLibraryItem(payload: SaveLibraryItemPayload) {
  return requestJson<LibraryItem>('/api/library', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

export function deleteLibraryItem(id: string) {
  return requestJson<{ ok: true }>(`/api/library/${id}`, { method: 'DELETE' })
}
