import type { Layer, LayerType, TechnicalComponentKind } from '../../types'
import { DEFAULT_TRANSFORM } from '../../types'
import clientGroupSvg from './assets/clients/client-group.svg?raw'
import applicationServerSvg from './assets/compute/application-server.svg?raw'
import deadLetterQueueSvg from './assets/messaging/dead-letter-queue.svg?raw'
import eventMessageSvg from './assets/messaging/event-message.svg?raw'
import queueSvg from './assets/messaging/queue.svg?raw'
import workerSvg from './assets/messaging/worker.svg?raw'
import loadBalancerSvg from './assets/traffic-edge/load-balancer.svg?raw'
import {
  TECHNICAL_VISUAL_SYSTEM,
  technicalComponentVisualStyle,
  type TechnicalComponentVisualState,
} from './visualSystem'

export type TechnicalLayerFactory = (type?: LayerType, overrides?: Partial<Layer>) => Layer

export interface TechnicalComponentOptions {
  makeLayer: TechnicalLayerFactory
  kind: TechnicalComponentKind
  title?: string
  x: number
  y: number
  startFrame: number
  endFrame: number
  visualState?: TechnicalComponentVisualState
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

const TECHNICAL_ASSETS = {
  client: clientGroupSvg,
  'load-balancer': loadBalancerSvg,
  server: applicationServerSvg,
  queue: queueSvg,
  'dead-letter-queue': deadLetterQueueSvg,
  'event-message': eventMessageSvg,
  worker: workerSvg,
} satisfies Record<TechnicalComponentKind, string>

function svgDataUrl(source: string) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(source)}`
}

function atFrame(frame: number, x = 0, y = 0) {
  return [{ frame, easing: 'ease-out' as const, props: { ...DEFAULT_TRANSFORM, x, y } }]
}

export function technicalComponentLabel(kind: TechnicalComponentKind) {
  return DEFAULT_LABELS[kind]
}

function makeStateIndicator(
  options: TechnicalComponentOptions,
  parentId: string,
  title: string,
  indicator: ReturnType<typeof technicalComponentVisualStyle>['indicator'],
  color: string,
) {
  if (indicator === 'none') return null

  const { makeLayer, startFrame, endFrame } = options
  const shared: Partial<Layer> = {
    name: `${title} ${indicator}`,
    parentId,
    width: 36,
    height: 36,
    fillType: 'none',
    fillColor: 'transparent',
    strokeEnabled: true,
    strokeColor: color,
    strokeWidth: 4,
    startFrame,
    endFrame,
    keyframes: atFrame(startFrame, 104, -68),
  }

  if (indicator === 'pulse-ring') return makeLayer('ellipse', shared)

  const pathData = indicator === 'check'
    ? 'M 4 18 L 14 28 L 32 6'
    : indicator === 'failure-x'
      ? 'M 5 5 L 31 31 M 31 5 L 5 31'
      : 'M 18 2 L 34 32 L 2 32 Z M 18 11 L 18 22 M 18 27 L 18 28'
  return makeLayer('path', { ...shared, pathData, pathClosed: false })
}

function makeComponentLayers(options: TechnicalComponentOptions, title: string, assetSource: string) {
  const { makeLayer, kind, x, y, startFrame, endFrame } = options
  const visual = technicalComponentVisualStyle(kind, options.visualState)
  const tokens = TECHNICAL_VISUAL_SYSTEM
  const parent = makeLayer('group', {
    name: title,
    width: tokens.component.width,
    height: tokens.component.height,
    technicalComponent: { kind, version: 1 },
    startFrame,
    endFrame,
    keyframes: atFrame(startFrame, x, y),
  })
  const body = makeLayer('rectangle', {
    name: `${title} body`,
    parentId: parent.id,
    width: tokens.component.bodyWidth,
    height: tokens.component.bodyHeight,
    fillColor: visual.surface,
    strokeEnabled: true,
    strokeColor: visual.stroke,
    strokeWidth: tokens.component.strokeWidth,
    borderRadius: tokens.component.cornerRadius,
    startFrame,
    endFrame,
    keyframes: atFrame(startFrame, 0, tokens.component.bodyY),
  })
  const artwork = makeLayer('image', {
    name: `${title} artwork`,
    parentId: parent.id,
    src: svgDataUrl(assetSource),
    imageKind: 'svg',
    imageFit: 'contain',
    imageNaturalWidth: 240,
    imageNaturalHeight: 150,
    width: tokens.component.artworkWidth,
    height: tokens.component.artworkHeight,
    svgStrokeColor: visual.stroke,
    svgFillColor: visual.stroke,
    svgFillEnabled: false,
    svgStrokeWidth: tokens.component.strokeWidth,
    startFrame,
    endFrame,
    keyframes: atFrame(startFrame, 0, tokens.component.artworkY),
  })
  const label = makeLayer('text', {
    name: `${title} label`,
    parentId: parent.id,
    text: title,
    width: tokens.component.labelWidth,
    height: tokens.component.labelHeight,
    sizeMode: 'fixed',
    fontFamily: tokens.typography.family,
    fontSize: tokens.typography.componentLabel.fontSize,
    fontWeight: tokens.typography.componentLabel.fontWeight,
    lineHeight: tokens.typography.componentLabel.lineHeight,
    textColor: visual.label,
    startFrame,
    endFrame,
    keyframes: atFrame(startFrame, 0, tokens.component.labelY),
  })
  const indicator = makeStateIndicator(options, parent.id, title, visual.indicator, visual.stroke)
  return indicator ? [parent, body, artwork, label, indicator] : [parent, body, artwork, label]
}

export function makeTechnicalComponentLayers(options: TechnicalComponentOptions) {
  const title = options.title ?? technicalComponentLabel(options.kind)
  return makeComponentLayers(options, title, TECHNICAL_ASSETS[options.kind])
}
