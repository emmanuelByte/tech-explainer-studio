import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, LoaderCircle, Sparkles, X } from 'lucide-react'
import { useStore } from '../store'
import { AnimatableProperty, DEFAULT_TRANSFORM, Layer, LayerType, TransformProps } from '../types'
import { resolveLayerAnimation } from '../animationProperties'

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
}

const TRANSFORM_KEYS = new Set(Object.keys(DEFAULT_TRANSFORM))
const LAYER_PROPS = new Set<keyof Layer>([
  'name',
  'text',
  'width',
  'height',
  'fillType',
  'fillColor',
  'strokeEnabled',
  'strokeColor',
  'strokeWidth',
  'borderRadius',
  'pathData',
  'pathClosed',
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

function sceneSummary(layers: Layer[], selectedLayerIds: string[], currentFrame: number) {
  return {
    currentFrame,
    selectedLayerIds,
    layers: layers.map((layer) => {
      const resolved = resolveLayerAnimation(layer, currentFrame)
      return {
        id: layer.id,
        name: layer.name,
        type: layer.type,
        parentId: layer.parentId ?? null,
        visible: layer.visible,
        locked: layer.locked,
        width: layer.width,
        height: layer.height,
        text: layer.type === 'text' ? layer.text : undefined,
        fillColor: layer.fillColor,
        textColor: layer.textColor,
        fontSize: layer.fontSize,
        startFrame: layer.startFrame,
        endFrame: layer.endFrame,
        transform: {
          x: resolved.transform.x,
          y: resolved.transform.y,
          scale: resolved.transform.scale,
          opacity: resolved.transform.opacity,
          rotateZ: resolved.transform.rotateZ,
        },
      }
    }),
  }
}

function layerTarget(actionLayerId: string, selectedLayerIds: string[], layers: Layer[]) {
  const id = actionLayerId === 'selected' ? selectedLayerIds[0] : actionLayerId
  return layers.find((layer) => layer.id === id) ? id : null
}

function applyAiActions(response: AiResponse) {
  const store = useStore.getState()
  const createdIds: string[] = []

  response.actions?.forEach((action) => {
    const latest = useStore.getState()
    if (action.type === 'create_layer') {
      if (!['text', 'rectangle', 'ellipse', 'triangle', 'line', 'path', 'group'].includes(action.layerType)) return
      const overrides: Partial<Layer> = {
        ...(Object.fromEntries(
          Object.entries(action.props ?? {}).filter(([key]) => LAYER_PROPS.has(key as keyof Layer))
        ) as Partial<Layer>),
        ...(typeof action.name === 'string' ? { name: action.name } : {}),
        ...(action.layerType === 'text' ? { text: action.text ?? (typeof action.props?.text === 'string' ? action.props.text : 'AI text') } : {}),
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
      createdIds.push(id)
      return
    }

    if (action.type === 'update_layer') {
      const id = layerTarget(action.layerId, latest.selectedLayerIds, latest.layers)
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
      const id = layerTarget(action.layerId, latest.selectedLayerIds, latest.layers)
      const layer = id ? latest.layers.find((item) => item.id === id) : null
      if (!id || !layer) return
      const base = resolveLayerAnimation(layer, latest.currentFrame).transform
      store.addKeyframe(id, Math.max(0, Math.round(action.frame)), { ...base, ...action.props }, action.easing)
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
  const { layers, selectedLayerIds, currentFrame, fps, canvasPreset, customWidth, customHeight, canvasBackgroundColor } = useStore()
  const [prompt, setPrompt] = useState(t('ai.defaultPrompt'))
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

  async function runAi() {
    setStatus('running')
    setError('')
    setMessage('')
    try {
      const canvas = canvasPreset.name === 'Custom'
        ? { width: customWidth, height: customHeight, presetName: 'Custom' }
        : { width: canvasPreset.width, height: canvasPreset.height, presetName: canvasPreset.name }
      const response = await fetch('/api/ai-assist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          canvas: { ...canvas, backgroundColor: canvasBackgroundColor, fps },
          scene: sceneSummary(layers, selectedLayerIds, currentFrame),
        }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || t('ai.requestFailed'))
      const parsed = JSON.parse(stripJson(data.text || '{}')) as AiResponse
      applyAiActions(parsed)
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
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          className="input-base w-full"
          rows={5}
          placeholder={t('ai.placeholder')}
          style={{ resize: 'vertical', minHeight: 100 }}
        />
        <div className="grid grid-cols-2 gap-1">
          {[
            t('ai.quickTitle'),
            t('ai.quickAnimate'),
            t('ai.quickPremium'),
            t('ai.quickTypewriter'),
          ].map((item) => (
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
          {status === 'running' ? t('ai.thinking') : t('ai.generate')}
        </button>
        <div className="text-[10px]" style={{ color: 'var(--text3)' }}>
          {t('ai.localConfig')}
        </div>
      </div>
    </div>
  )
}
