import { AssetKind, ImageKind } from './types'

export interface LocalAsset {
  id: string
  name: string
  fileName: string
  mimeType: string
  kind?: AssetKind
  imageKind: ImageKind
  naturalWidth?: number
  naturalHeight?: number
  duration?: number
  bytes: number
  createdAt: string
  updatedAt: string
  url: string
}

export type ImageAsset = LocalAsset & { kind?: 'image'; imageKind: ImageKind }
export type VideoAsset = LocalAsset & { kind: 'video'; imageKind: 'raster' }
export type AudioAsset = LocalAsset & { kind: 'audio'; imageKind: 'raster' }

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

function decodeDataUrl(dataUrl: string) {
  const match = dataUrl.match(/^data:[^,]*?(;base64)?,(.*)$/)
  if (!match) return ''
  try {
    return match[1] ? atob(match[2]) : decodeURIComponent(match[2])
  } catch {
    return ''
  }
}

function svgLength(value: string | null) {
  if (!value || value.endsWith('%')) return undefined
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
}

export function measureSvg(dataUrl: string) {
  try {
    const source = decodeDataUrl(dataUrl)
    if (!source) return {}
    const doc = new DOMParser().parseFromString(source, 'image/svg+xml')
    const svg = doc.querySelector('svg')
    if (!svg) return {}

    const width = svgLength(svg.getAttribute('width'))
    const height = svgLength(svg.getAttribute('height'))
    if (width && height) return { naturalWidth: width, naturalHeight: height }

    const viewBox = svg.getAttribute('viewBox')?.trim().split(/[\s,]+/).map(Number)
    if (viewBox?.length === 4 && viewBox.every(Number.isFinite) && viewBox[2] > 0 && viewBox[3] > 0) {
      return { naturalWidth: viewBox[2], naturalHeight: viewBox[3] }
    }
  } catch {
    // Fall back to browser image probing below.
  }
  return {}
}

async function measureImageAsset(dataUrl: string, imageKind: ImageKind) {
  if (imageKind !== 'svg') return measureImage(dataUrl)
  const svgSize = measureSvg(dataUrl)
  if (svgSize.naturalWidth && svgSize.naturalHeight) return svgSize
  return measureImage(dataUrl)
}

export function measureVideo(dataUrl: string) {
  return new Promise<{ naturalWidth?: number; naturalHeight?: number; duration?: number }>((resolve) => {
    const video = document.createElement('video')
    video.preload = 'metadata'
    video.muted = true
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(video.src)
      resolve({
        naturalWidth: video.videoWidth || undefined,
        naturalHeight: video.videoHeight || undefined,
        duration: Number.isFinite(video.duration) ? video.duration : undefined,
      })
    }
    video.onerror = () => {
      URL.revokeObjectURL(video.src)
      resolve({})
    }
    video.src = dataUrl
  })
}

export function listAssets() {
  return requestJson<LocalAsset[]>('/api/assets')
}

export function listImageAssets() {
  return listAssets().then((assets) => assets.filter((asset) => (asset.kind ?? 'image') === 'image') as ImageAsset[])
}

export function listVideoAssets() {
  return listAssets().then((assets) => assets.filter((asset) => asset.kind === 'video') as VideoAsset[])
}

export function listAudioAssets() {
  return listAssets().then((assets) => assets.filter((asset) => asset.kind === 'audio') as AudioAsset[])
}

/** Probe an audio file URL/dataUrl for its duration via an HTMLAudioElement. */
export function measureAudio(dataUrl: string) {
  return new Promise<{ duration?: number }>((resolve) => {
    const audio = document.createElement('audio')
    audio.preload = 'metadata'
    audio.onloadedmetadata = () => {
      resolve({ duration: Number.isFinite(audio.duration) ? audio.duration : undefined })
    }
    audio.onerror = () => resolve({})
    audio.src = dataUrl
  })
}

export async function uploadImageAsset(file: File) {
  const dataUrl = await readFileAsDataUrl(file)
  const imageKind = getImageKind(file)
  const size = await measureImageAsset(dataUrl, imageKind)
  return requestJson<ImageAsset>('/api/assets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: file.name.replace(/\.[^.]+$/, ''),
      fileName: file.name,
      mimeType: file.type || (imageKind === 'svg' ? 'image/svg+xml' : 'image/jpeg'),
      kind: 'image',
      imageKind,
      dataUrl,
      ...size,
    }),
  })
}

export async function uploadVideoAsset(file: File) {
  const dataUrl = await readFileAsDataUrl(file)
  const size = await measureVideo(dataUrl)
  return requestJson<VideoAsset>('/api/assets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: file.name.replace(/\.[^.]+$/, ''),
      fileName: file.name,
      mimeType: file.type || 'video/mp4',
      kind: 'video',
      imageKind: 'raster',
      dataUrl,
      ...size,
    }),
  })
}

export async function uploadAudioAsset(file: File) {
  const dataUrl = await readFileAsDataUrl(file)
  const meta = await measureAudio(dataUrl)
  return requestJson<AudioAsset>('/api/assets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: file.name.replace(/\.[^.]+$/, ''),
      fileName: file.name,
      mimeType: file.type || 'audio/mpeg',
      kind: 'audio',
      imageKind: 'raster',
      dataUrl,
      ...meta,
    }),
  })
}
