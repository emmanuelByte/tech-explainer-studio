import { ImageKind } from './types'

export interface ImageAsset {
  id: string
  name: string
  fileName: string
  mimeType: string
  imageKind: ImageKind
  naturalWidth?: number
  naturalHeight?: number
  bytes: number
  createdAt: string
  updatedAt: string
  url: string
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init)
  if (!response.ok) {
    const data = await response.json().catch(() => null) as { error?: string } | null
    throw new Error(data?.error || `Request failed with ${response.status}`)
  }
  return response.json() as Promise<T>
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Could not read file.'))
    reader.onerror = () => reject(reader.error || new Error('Could not read file.'))
    reader.readAsDataURL(file)
  })
}

export function getImageKind(file: File): ImageKind {
  return file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg') ? 'svg' : 'raster'
}

export function measureImage(dataUrl: string) {
  return new Promise<{ naturalWidth?: number; naturalHeight?: number }>((resolve) => {
    const img = new Image()
    img.onload = () => resolve({ naturalWidth: img.naturalWidth || undefined, naturalHeight: img.naturalHeight || undefined })
    img.onerror = () => resolve({})
    img.src = dataUrl
  })
}

export function listImageAssets() {
  return requestJson<ImageAsset[]>('/api/assets')
}

export async function uploadImageAsset(file: File) {
  const dataUrl = await readFileAsDataUrl(file)
  const size = await measureImage(dataUrl)
  return requestJson<ImageAsset>('/api/assets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: file.name.replace(/\.[^.]+$/, ''),
      fileName: file.name,
      mimeType: file.type || (getImageKind(file) === 'svg' ? 'image/svg+xml' : 'image/jpeg'),
      imageKind: getImageKind(file),
      dataUrl,
      ...size,
    }),
  })
}
