import type { Layer, LayerType, TechnicalComponentKind } from '../../types'
import { DEFAULT_TRANSFORM } from '../../types'
import deadLetterQueueSvg from './assets/messaging/dead-letter-queue.svg?raw'
import eventMessageSvg from './assets/messaging/event-message.svg?raw'
import queueSvg from './assets/messaging/queue.svg?raw'
import workerSvg from './assets/messaging/worker.svg?raw'

export type TechnicalLayerFactory = (type?: LayerType, overrides?: Partial<Layer>) => Layer

export interface TechnicalComponentOptions {
  makeLayer: TechnicalLayerFactory
  kind: TechnicalComponentKind
  title?: string
  x: number
  y: number
  startFrame: number
  endFrame: number
}

const DEFAULT_LABELS = {
  client: 'Client',
  'load-balancer': 'Load Balancer',
  server: 'Server',
  queue: 'Main Queue',
  'dead-letter-queue': 'Dead Letter Queue',
  'event-message': 'Event Message',
  worker: 'Worker',
} satisfies Record<TechnicalComponentKind, string>

const MESSAGING_ASSETS: Partial<Record<TechnicalComponentKind, string>> = {
  queue: queueSvg,
  'dead-letter-queue': deadLetterQueueSvg,
  'event-message': eventMessageSvg,
  worker: workerSvg,
}

function svgDataUrl(source: string) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(source)}`
}

function atFrame(frame: number, x = 0, y = 0) {
  return [{ frame, easing: 'ease-out' as const, props: { ...DEFAULT_TRANSFORM, x, y } }]
}

export function technicalComponentLabel(kind: TechnicalComponentKind) {
  return DEFAULT_LABELS[kind]
}

function makeMessagingComponentLayers(
  options: TechnicalComponentOptions,
  title: string,
  assetSource: string,
) {
  const { makeLayer, kind, x, y, startFrame, endFrame } = options
  const accent = kind === 'dead-letter-queue' ? '#fbbf24' : '#f8fafc'
  const parent = makeLayer('group', {
    name: title,
    width: 260,
    height: 190,
    technicalComponent: { kind, version: 1 },
    startFrame,
    endFrame,
    keyframes: atFrame(startFrame, x, y),
  })
  const artwork = makeLayer('image', {
    name: `${title} artwork`,
    parentId: parent.id,
    src: svgDataUrl(assetSource),
    imageKind: 'svg',
    imageFit: 'contain',
    imageNaturalWidth: 240,
    imageNaturalHeight: 150,
    width: 220,
    height: 138,
    svgStrokeColor: accent,
    svgFillEnabled: false,
    svgStrokeWidth: 4,
    startFrame,
    endFrame,
    keyframes: atFrame(startFrame, 0, -20),
  })
  const label = makeLayer('text', {
    name: `${title} label`,
    parentId: parent.id,
    text: title,
    width: 240,
    height: 34,
    sizeMode: 'fixed',
    fontSize: 22,
    fontWeight: '700',
    textColor: accent,
    startFrame,
    endFrame,
    keyframes: atFrame(startFrame, 0, 72),
  })
  return [parent, artwork, label]
}

function makeClassicComponentLayers(options: TechnicalComponentOptions, title: string) {
  const { makeLayer, kind, x, y, startFrame, endFrame } = options
  const palette = kind === 'load-balancer'
    ? { fill: '#1d4ed8', stroke: '#60a5fa' }
    : kind === 'server'
      ? { fill: '#166534', stroke: '#4ade80' }
      : { fill: '#7c3aed', stroke: '#c4b5fd' }
  const parent = makeLayer('group', {
    name: title,
    width: 240,
    height: 150,
    technicalComponent: { kind, version: 1 },
    startFrame,
    endFrame,
    keyframes: atFrame(startFrame, x, y),
  })
  const body = makeLayer('rectangle', {
    name: `${title} body`,
    parentId: parent.id,
    width: 220,
    height: 110,
    fillColor: palette.fill,
    strokeEnabled: true,
    strokeColor: palette.stroke,
    strokeWidth: 2,
    borderRadius: 16,
    startFrame,
    endFrame,
    keyframes: atFrame(startFrame),
  })
  const label = makeLayer('text', {
    name: `${title} label`,
    parentId: parent.id,
    text: title,
    width: 190,
    height: 40,
    sizeMode: 'fixed',
    fontSize: 24,
    fontWeight: '700',
    textColor: '#ffffff',
    startFrame,
    endFrame,
    keyframes: atFrame(startFrame),
  })
  const decoration = (name: string, overrides: Partial<Layer>) => makeLayer('rectangle', {
    name,
    parentId: parent.id,
    fillColor: 'rgba(255,255,255,0.28)',
    strokeEnabled: false,
    startFrame,
    endFrame,
    keyframes: atFrame(startFrame),
    ...overrides,
  })
  const details = kind === 'server'
    ? [
        decoration(`${title} status 1`, { width: 166, height: 7, borderRadius: 4, keyframes: atFrame(startFrame, 0, -30) }),
        decoration(`${title} status 2`, { width: 166, height: 7, borderRadius: 4, keyframes: atFrame(startFrame, 0, 30) }),
      ]
    : kind === 'load-balancer'
      ? [
          decoration(`${title} route left`, { width: 32, height: 7, borderRadius: 4, keyframes: atFrame(startFrame, -78, 30) }),
          decoration(`${title} route center`, { width: 32, height: 7, borderRadius: 4, keyframes: atFrame(startFrame, 0, 30) }),
          decoration(`${title} route right`, { width: 32, height: 7, borderRadius: 4, keyframes: atFrame(startFrame, 78, 30) }),
        ]
      : [
          decoration(`${title} activity`, { width: 100, height: 7, borderRadius: 4, keyframes: atFrame(startFrame, 0, 30) }),
        ]
  return [parent, body, ...details, label]
}

export function makeTechnicalComponentLayers(options: TechnicalComponentOptions) {
  const title = options.title ?? technicalComponentLabel(options.kind)
  const assetSource = MESSAGING_ASSETS[options.kind]
  return assetSource
    ? makeMessagingComponentLayers(options, title, assetSource)
    : makeClassicComponentLayers(options, title)
}
