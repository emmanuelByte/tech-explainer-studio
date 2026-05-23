import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, Film, LoaderCircle, Sparkles, Wand2, X } from 'lucide-react'
import { useStore } from '../store'
import { AnimatableProperty, DEFAULT_TRANSFORM, Layer, LayerType, TransformProps } from '../types'
import { resolveLayerAnimation } from '../animationProperties'
import { htmlToLayers } from '../htmlImport'

type AiMode = 'graphic' | 'animation'

type AiAction =
  | {
    type: 'create_layer'
    layerType: LayerType
    name?: string
    text?: string
    x?: number
    y?: number
    width?: number
    height?: number
    fillColor?: string
    textColor?: string
    fontSize?: number
    clientId?: string
    parentId?: string | null
    parentClientId?: string
    props?: Record<string, unknown>
    transform?: Partial<TransformProps>
  }
  | { type: 'update_layer'; layerId: string; props?: Record<string, unknown>; transform?: Partial<TransformProps> }
  | { type: 'add_keyframe'; layerId: string; frame: number; props: Partial<TransformProps>; easing?: string }
  | { type: 'set_canvas'; backgroundColor?: string }
  | { type: 'select_layer'; layerId: string }

interface AiResponse {
  message?: string
  actions?: AiAction[]
  html?: string
  name?: string
}

const TRANSFORM_KEYS = new Set(Object.keys(DEFAULT_TRANSFORM))
const LAYER_PROPS = new Set<keyof Layer>([
  'name',
  'text',
  'width',
  'height',
  'fillType',
  'fillColor',
  'gradientStops',
  'gradientAngle',
  'strokeEnabled',
  'strokeColor',
  'strokeWidth',
  'borderRadius',
  'borderTopLeftRadius',
  'borderTopRightRadius',
  'borderBottomRightRadius',
  'borderBottomLeftRadius',
  'borderRadiusLinked',
  'pathData',
  'pathClosed',
  'isGroup',
  'clipChildren',
  'shadowEnabled',
  'shadowColor',
  'fontFamily',
  'fontSize',
  'fontWeight',
  'textAlign',
  'letterSpacing',
  'lineHeight',
  'textColor',
  'textRevealMode',
  'imageFit',
  'svgStrokeColor',
  'svgFillColor',
  'svgFillEnabled',
  'svgStrokeWidth',
  'startFrame',
  'endFrame',
  'layoutMode',
  'layoutDirection',
  'layoutGap',
  'layoutPadding',
  'layoutAlign',
  'layoutJustify',
  'gridColumns',
])

function stripJson(text: string) {
  return text
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```$/i, '')
    .trim()
}

function childIdsByParent(layers: Layer[]) {
  const map = new Map<string, string[]>()
  layers.forEach((layer) => {
    if (!layer.parentId) return
    map.set(layer.parentId, [...(map.get(layer.parentId) ?? []), layer.id])
  })
  return map
}

function collectDescendantIds(layerId: string, childrenByParent: Map<string, string[]>) {
  const result: string[] = []
  const stack = [...(childrenByParent.get(layerId) ?? [])]
  while (stack.length) {
    const id = stack.shift()!
    result.push(id)
    stack.push(...(childrenByParent.get(id) ?? []))
  }
  return result
}

function layerPath(layer: Layer, byId: Map<string, Layer>) {
  const parts = [layer.name]
  let parentId = layer.parentId
  while (parentId) {
    const parent = byId.get(parentId)
    if (!parent) break
    parts.unshift(parent.name)
    parentId = parent.parentId
  }
  return parts.join(' / ')
}

function layerDepth(layer: Layer, byId: Map<string, Layer>) {
  let depth = 0
  let parentId = layer.parentId
  while (parentId) {
    const parent = byId.get(parentId)
    if (!parent) break
    depth += 1
    parentId = parent.parentId
  }
  return depth
}

function animationTargetLayerIds(layers: Layer[], selectedLayerIds: string[]) {
  const childrenByParent = childIdsByParent(layers)
  return Array.from(new Set([
    ...selectedLayerIds,
    ...selectedLayerIds.flatMap((id) => collectDescendantIds(id, childrenByParent)),
  ]))
}

function clampFrameToLayerRange(frame: number, layer: Layer) {
  const start = Number.isFinite(layer.startFrame) ? Math.max(0, Math.round(layer.startFrame)) : 0
  const end = Number.isFinite(layer.endFrame) ? Math.max(start, Math.round(layer.endFrame)) : start
  return Math.max(start, Math.min(end, Math.round(frame)))
}

function sceneSummary(layers: Layer[], selectedLayerIds: string[], currentFrame: number) {
  const byId = new Map(layers.map((layer) => [layer.id, layer]))
  const childrenByParent = childIdsByParent(layers)
  const animationTargets = animationTargetLayerIds(layers, selectedLayerIds)
  return {
    currentFrame,
    selectedLayerIds,
    selectedDescendantLayerIds: animationTargets.filter((id) => !selectedLayerIds.includes(id)),
    animationTargetLayerIds: animationTargets,
    layers: layers.map((layer) => {
      const resolved = resolveLayerAnimation(layer, currentFrame)
      return {
        id: layer.id,
        name: layer.name,
        path: layerPath(layer, byId),
        type: layer.type,
        parentId: layer.parentId ?? null,
        childrenIds: childrenByParent.get(layer.id) ?? [],
        depth: layerDepth(layer, byId),
        visible: layer.visible,
        locked: layer.locked,
        width: layer.width,
        height: layer.height,
        fillType: layer.fillType,
        text: layer.type === 'text' ? layer.text : undefined,
        fillColor: layer.fillColor,
        strokeEnabled: layer.strokeEnabled,
        strokeColor: layer.strokeColor,
        strokeWidth: layer.strokeWidth,
        textColor: layer.textColor,
        textAlign: layer.textAlign,
        fontFamily: layer.fontFamily,
        fontSize: layer.fontSize,
        fontWeight: layer.fontWeight,
        startFrame: layer.startFrame,
        endFrame: layer.endFrame,
        durationFrames: Math.max(0, layer.endFrame - layer.startFrame),
        transform: {
          x: resolved.transform.x,
          y: resolved.transform.y,
          scale: resolved.transform.scale,
          opacity: resolved.transform.opacity,
          rotateX: resolved.transform.rotateX,
          rotateY: resolved.transform.rotateY,
          rotateZ: resolved.transform.rotateZ,
          skewX: resolved.transform.skewX,
          skewY: resolved.transform.skewY,
        },
      }
    }),
  }
}

function layerTarget(actionLayerId: string, targetLayerIds: string[], layers: Layer[]) {
  const id = actionLayerId === 'selected' ? targetLayerIds[0] : actionLayerId
  return layers.find((layer) => layer.id === id) ? id : null
}

function applyAiActions(response: AiResponse) {
  const store = useStore.getState()
  const createdIds: string[] = []
  const clientIdMap = new Map<string, string>()
  const allowedTargetIds = animationTargetLayerIds(store.layers, store.selectedLayerIds)

  response.actions?.forEach((action) => {
    const latest = useStore.getState()
    if (action.type === 'create_layer') {
      if (!['text', 'rectangle', 'ellipse', 'triangle', 'line', 'path', 'group'].includes(action.layerType)) return
      const explicitProps = action.props ?? {}
      const resolvedParentId = action.parentClientId
        ? clientIdMap.get(action.parentClientId) ?? null
        : action.parentId === null
          ? null
          : latest.layers.find((layer) => layer.id === action.parentId)?.id ?? null
      const overrides: Partial<Layer> = {
        ...(action.layerType === 'group' ? { fillType: 'none' as const, fillColor: 'transparent', strokeEnabled: false } : {}),
        ...(Object.fromEntries(
          Object.entries(explicitProps).filter(([key]) => LAYER_PROPS.has(key as keyof Layer))
        ) as Partial<Layer>),
        ...(typeof action.name === 'string' ? { name: action.name } : {}),
        ...(action.layerType === 'text' ? { text: action.text ?? (typeof action.props?.text === 'string' ? action.props.text : 'AI text') } : {}),
        ...(action.layerType === 'text' && explicitProps.fillType === undefined ? { fillType: 'none' } : {}),
        ...(resolvedParentId !== null ? { parentId: resolvedParentId } : {}),
        ...(typeof action.width === 'number' ? { width: action.width } : {}),
        ...(typeof action.height === 'number' ? { height: action.height } : {}),
        ...(typeof action.fillColor === 'string' ? { fillColor: action.fillColor } : {}),
        ...(typeof action.textColor === 'string' ? { textColor: action.textColor } : {}),
        ...(typeof action.fontSize === 'number' ? { fontSize: action.fontSize } : {}),
      }
      const transformEntries = Object.entries(action.transform ?? {}).filter(([key, value]) => (
        TRANSFORM_KEYS.has(key) && (typeof value === 'number' || typeof value === 'string')
      ))
      const initialTransform = {
        ...Object.fromEntries(transformEntries),
        ...(typeof action.x === 'number' ? { x: action.x } : {}),
        ...(typeof action.y === 'number' ? { y: action.y } : {}),
      } as Partial<TransformProps>
      if (Object.keys(initialTransform).length) {
        overrides.keyframes = [{
          frame: 0,
          easing: 'ease-out',
          props: {
            ...DEFAULT_TRANSFORM,
            ...initialTransform,
          },
        }]
      }
      const id = store.addGeneratedLayer(action.layerType, overrides)
      if (typeof action.clientId === 'string' && action.clientId.trim()) clientIdMap.set(action.clientId, id)
      createdIds.push(id)
      return
    }

    if (action.type === 'update_layer') {
      const id = layerTarget(action.layerId, allowedTargetIds, latest.layers)
      if (!id) return
      Object.entries(action.props ?? {}).forEach(([key, value]) => {
        if (LAYER_PROPS.has(key as keyof Layer)) store.updateLayerProp(id, key as keyof Layer, value as never)
      })
      Object.entries(action.transform ?? {}).forEach(([key, value]) => {
        if (TRANSFORM_KEYS.has(key) && (typeof value === 'number' || typeof value === 'string')) {
          store.setLayerAnimatedProperty(id, key as AnimatableProperty, value)
        }
      })
      return
    }

    if (action.type === 'add_keyframe') {
      const id = layerTarget(action.layerId, allowedTargetIds, latest.layers)
      const layer = id ? latest.layers.find((item) => item.id === id) : null
      if (!id || !layer) return
      const base = resolveLayerAnimation(layer, latest.currentFrame).transform
      const frame = clampFrameToLayerRange(action.frame, layer)
      store.addKeyframe(id, frame, { ...base, ...action.props }, action.easing)
      return
    }

    if (action.type === 'set_canvas' && typeof action.backgroundColor === 'string') {
      store.setCanvasBackgroundColor(action.backgroundColor)
      return
    }

    if (action.type === 'select_layer') {
      const id = latest.layers.find((layer) => layer.id === action.layerId)?.id
      if (id) store.selectLayer(id)
    }
  })

  if (createdIds.length) useStore.getState().selectLayers(createdIds)
}

export function AiAssistantModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const {
    layers,
    selectedLayerIds,
    currentFrame,
    fps,
    canvasPreset,
    customWidth,
    customHeight,
    canvasBackgroundColor,
    totalFrames,
    insertLibraryLayers,
  } = useStore()
  const [mode, setMode] = useState<AiMode>('graphic')
  const [prompt, setPrompt] = useState(t('ai.defaultGraphicPrompt'))
  const [status, setStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  // ESC handler
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { e.preventDefault(); onClose() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const selectedLabel = useMemo(() => {
    if (!selectedLayerIds.length) return t('ai.noSelection')
    return layers.filter((layer) => selectedLayerIds.includes(layer.id)).map((layer) => layer.name).join(', ')
  }, [layers, selectedLayerIds])

  const canvas = canvasPreset.name === 'Custom'
    ? { width: customWidth, height: customHeight, presetName: 'Custom' }
    : { width: canvasPreset.width, height: canvasPreset.height, presetName: canvasPreset.name }

  const quickPrompts = mode === 'graphic'
    ? [
      t('ai.quickGraphicCard'),
      t('ai.quickGraphicPhone'),
      t('ai.quickGraphicDashboard'),
      t('ai.quickGraphicMap'),
    ]
    : [
      t('ai.quickAnimate'),
      t('ai.quickBreathing'),
      t('ai.quickStagger'),
      t('ai.quickTextReveal'),
    ]

  function switchMode(nextMode: AiMode) {
    setMode(nextMode)
    setPrompt(nextMode === 'graphic' ? t('ai.defaultGraphicPrompt') : t('ai.defaultAnimationPrompt'))
    setMessage('')
    setError('')
    setStatus('idle')
  }

  async function runAi() {
    setStatus('running')
    setError('')
    setMessage('')
    try {
      const response = await fetch('/api/ai-assist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode,
          prompt,
          canvas: { ...canvas, backgroundColor: canvasBackgroundColor, fps },
          scene: sceneSummary(layers, selectedLayerIds, currentFrame),
        }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || t('ai.requestFailed'))
      const parsed = JSON.parse(stripJson(data.text || '{}')) as AiResponse

      if (mode === 'graphic') {
        if (!parsed.html?.trim()) throw new Error(t('ai.missingHtml'))
        const result = htmlToLayers(
          parsed.html,
          parsed.name || t('ai.generatedGraphicName'),
          totalFrames,
          canvas.width,
          canvas.height,
          { fitToCanvas: true },
        )
        insertLibraryLayers(result.layers, { fitToTimeline: true, rootLayerIds: result.rootLayerIds })
      } else {
        applyAiActions(parsed)
      }

      setMessage(parsed.message || t('ai.applied'))
      setStatus('done')
    } catch (err) {
      setError(err instanceof Error ? err.message : t('ai.requestFailed'))
      setStatus('error')
    }
  }

  return (
    <div
      className="fixed rounded-lg overflow-hidden"
      style={{
        top: 56,
        right: 270,
        width: 420,
        maxWidth: 'calc(100vw - 32px)',
        maxHeight: 'calc(100vh - 180px)',
        background: 'var(--panel)',
        color: 'var(--text)',
        border: '1px solid var(--border)',
        boxShadow: '0 18px 60px rgba(0,0,0,0.28)',
        zIndex: 2400,
      }}
      onKeyDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between px-3 py-2" style={{ borderBottom: '1px solid var(--border)' }}>
        <div className="flex items-center gap-2">
          <Sparkles size={15} style={{ color: '#0d99ff' }} />
          <div>
            <div className="text-xs font-semibold">{t('ai.title')}</div>
            <div className="text-[10px]" style={{ color: 'var(--text3)' }}>{selectedLabel}</div>
          </div>
        </div>
        <button onClick={onClose} className="icon-btn" title={t('common.close')}><X size={14} /></button>
      </div>

      <div className="p-3 flex flex-col gap-2 overflow-auto" style={{ maxHeight: 'calc(100vh - 240px)' }}>
        <div className="grid grid-cols-2 gap-1 rounded-md p-1" style={{ background: 'var(--bg2)' }}>
          <button
            className={`pill-btn ${mode === 'graphic' ? 'primary-btn' : ''}`}
            onClick={() => switchMode('graphic')}
            style={{ height: 30, justifyContent: 'center' }}
          >
            <Wand2 size={13} />
            {t('ai.modeGraphic')}
          </button>
          <button
            className={`pill-btn ${mode === 'animation' ? 'primary-btn' : ''}`}
            onClick={() => switchMode('animation')}
            style={{ height: 30, justifyContent: 'center' }}
          >
            <Film size={13} />
            {t('ai.modeAnimation')}
          </button>
        </div>
        <div className="text-[10px] leading-relaxed" style={{ color: 'var(--text3)' }}>
          {mode === 'graphic' ? t('ai.graphicModeHint') : t('ai.animationModeHint')}
        </div>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          className="input-base w-full"
          rows={5}
          placeholder={mode === 'graphic' ? t('ai.graphicPlaceholder') : t('ai.animationPlaceholder')}
          style={{ resize: 'vertical', minHeight: 100 }}
        />
        <div className="grid grid-cols-2 gap-1">
          {quickPrompts.map((item) => (
            <button key={item} onClick={() => setPrompt(item)} className="pill-btn text-[10px]" style={{ height: 26 }}>
              {item}
            </button>
          ))}
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded-md p-2 text-xs" style={{ background: 'rgba(239,68,68,0.12)', color: '#ef4444' }}>
            <AlertTriangle size={14} />
            <span>{error}</span>
          </div>
        )}
        {message && <div className="rounded-md p-2 text-xs" style={{ background: 'var(--accent-bg)', color: 'var(--text2)' }}>{message}</div>}

        <button
          onClick={runAi}
          disabled={status === 'running' || !prompt.trim()}
          className="pill-btn primary-btn w-full"
          style={{ height: 34 }}
        >
          {status === 'running' ? <LoaderCircle size={14} className="animate-spin" /> : <Sparkles size={14} />}
          {status === 'running' ? t('ai.thinking') : (mode === 'graphic' ? t('ai.generateGraphic') : t('ai.applyAnimation'))}
        </button>
        <div className="text-[10px]" style={{ color: 'var(--text3)' }}>
          {t('ai.localConfig')}
        </div>
      </div>
    </div>
  )
}
