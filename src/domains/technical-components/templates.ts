import type { Layer, LayerType, TechnicalComponentKind } from '../../types'
import { DEFAULT_TRANSFORM } from '../../types'
import clientGroupSvg from './assets/clients/client-group.svg?raw'
import applicationServerSvg from './assets/compute/application-server.svg?raw'
import deadLetterQueueSvg from './assets/messaging/dead-letter-queue.svg?raw'
import eventMessageSvg from './assets/messaging/event-message.svg?raw'
import queueSvg from './assets/messaging/queue.svg?raw'
import workerSvg from './assets/messaging/worker.svg?raw'
import loadBalancerSvg from './assets/traffic-edge/load-balancer.svg?raw'

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

const CLASSIC_ASSETS: Partial<Record<TechnicalComponentKind, string>> = {
  client: clientGroupSvg,
  'load-balancer': loadBalancerSvg,
  server: applicationServerSvg,
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

function makeClassicComponentLayers(
  options: TechnicalComponentOptions,
  title: string,
  assetSource: string,
) {
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
  const artwork = makeLayer('image', {
    name: `${title} artwork`,
    parentId: parent.id,
    src: svgDataUrl(assetSource),
    imageKind: 'svg',
    imageFit: 'contain',
    imageNaturalWidth: 240,
    imageNaturalHeight: 150,
    width: 180,
    height: 84,
    svgStrokeColor: palette.stroke,
    svgFillColor: palette.stroke,
    svgFillEnabled: false,
    svgStrokeWidth: 3,
    startFrame,
    endFrame,
    keyframes: atFrame(startFrame, 0, 10),
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
    keyframes: atFrame(startFrame, 0, -42),
  })
  return [parent, body, artwork, label]
}

export function makeTechnicalComponentLayers(options: TechnicalComponentOptions) {
  const title = options.title ?? technicalComponentLabel(options.kind)
  const assetSource = MESSAGING_ASSETS[options.kind]
  if (assetSource) return makeMessagingComponentLayers(options, title, assetSource)

  const classicAssetSource = CLASSIC_ASSETS[options.kind]
  if (!classicAssetSource) throw new Error(`No SVG asset registered for technical component: ${options.kind}`)

  return makeClassicComponentLayers(options, title, classicAssetSource)
}
