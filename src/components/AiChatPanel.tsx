import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChatKit, useChatKit } from '@openai/chatkit-react'
import { Image as ImageIcon, MessageSquarePlus, Play, Sparkles, X } from 'lucide-react'
import { useStore } from '../store'
import { applyAiActions, runAsSingleHistoryAction, sceneSummary } from './AiAssistantModal'

function getOrCreateChatUserId() {
  const key = 'motion-editor:chatkit-user'
  const existing = localStorage.getItem(key)
  if (existing) return existing
  const next = crypto.randomUUID()
  localStorage.setItem(key, next)
  return next
}

export function AiChatPanel({ onClose }: { onClose: () => void }) {
  const { t, i18n } = useTranslation()
  const theme = useStore((s) => s.theme)
  const projectId = useStore((s) => s.projectId)
  const projectName = useStore((s) => s.projectName)
  const selectedLayerIds = useStore((s) => s.selectedLayerIds)
  const currentFrame = useStore((s) => s.currentFrame)
  const fps = useStore((s) => s.fps)
  const totalFrames = useStore((s) => s.totalFrames)
  const canvasPreset = useStore((s) => s.canvasPreset)
  const customWidth = useStore((s) => s.customWidth)
  const customHeight = useStore((s) => s.customHeight)
  const canvasBackgroundColor = useStore((s) => s.canvasBackgroundColor)
  const layers = useStore((s) => s.layers)
  const [mode, setMode] = useState<'graphic' | 'animation'>('graphic')
  const [chatUserId] = useState(getOrCreateChatUserId)
  const threadStorageKey = useMemo(
    () => `motion-editor:chatkit-thread:${projectId || 'unknown'}`,
    [projectId],
  )
  const [initialThread, setInitialThread] = useState<string | null>(() => localStorage.getItem(threadStorageKey))
  const chatFrameKey = `${projectId || 'unknown'}:${initialThread || 'new'}:${mode}`

  useEffect(() => {
    setInitialThread(localStorage.getItem(threadStorageKey))
  }, [threadStorageKey])

  const chat = useChatKit({
    api: {
      async getClientSecret() {
        const response = await fetch('/api/chatkit/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user: chatUserId,
            projectId,
            projectName,
            selectedLayerIds,
            currentFrame,
            fps,
            mode,
          }),
        })
        const data = await response.json()
        if (!response.ok) throw new Error(data?.error || data?.message || t('ai.chatSessionFailed'))
        return data.client_secret
      },
    },
    initialThread,
    locale: i18n.language.startsWith('cs') ? 'cs' : 'en',
    theme: {
      colorScheme: theme,
      color: { accent: { primary: '#f25f22', level: 2 } },
      radius: 'pill',
      density: 'compact',
      typography: {
        fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
        fontFamilyMono: "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
      },
    },
    header: { enabled: false },
    history: { enabled: true, showDelete: true, showRename: true },
    thread: { autoScroll: true },
    composer: {
      placeholder: mode === 'graphic' ? t('ai.graphicPlaceholder') : t('ai.animationPlaceholder'),
      dictation: { enabled: true },
    },
    startScreen: {
      greeting: t('ai.chatGreeting'),
      // Built-in prompt chips don't sit well in this narrow dock — we render
      // our own quick-pick suggestions above the composer instead (see below).
      prompts: [],
    },
    async onClientTool(toolCall) {
      try {
        console.info('[chatkit client tool]', toolCall.name, toolCall.params)
        if (toolCall.name === 'get_editor_contract') {
          const contractMode = toolCall.params?.mode === 'animation' ? 'animation' : mode
          const response = await fetch(contractMode === 'graphic' ? '/ai-graphic-prompt.md' : '/ai-animation-prompt.md')
          return {
            ok: true,
            mode: contractMode,
            contract: response.ok ? await response.text() : '',
          }
        }
        if (toolCall.name === 'apply_editor_actions') {
          const actions = Array.isArray(toolCall.params?.actions) ? toolCall.params.actions : []
          if (!actions.length) return { ok: false, error: 'No actions provided.' }
          runAsSingleHistoryAction(() => {
            applyAiActions({
              message: typeof toolCall.params?.summary === 'string' ? toolCall.params.summary : undefined,
              actions: actions as never,
            }, { allowAnyExplicitLayer: true })
          })
          return {
            ok: true,
            appliedActions: actions.length,
            message: typeof toolCall.params?.summary === 'string'
              ? toolCall.params.summary
              : `Applied ${actions.length} editor action${actions.length === 1 ? '' : 's'}.`,
          }
        }
        if (toolCall.name !== 'get_current_editor_context') {
          return { ok: false, error: `Unknown client tool: ${toolCall.name}` }
        }
        return {
          ok: true,
          mode,
          projectId,
          projectName,
          canvas: {
            width: customWidth,
            height: customHeight,
            presetName: canvasPreset,
            backgroundColor: canvasBackgroundColor,
            fps,
            totalFrames,
          },
          scene: sceneSummary(layers, selectedLayerIds, currentFrame),
          currentFrame,
          currentSecond: fps > 0 ? currentFrame / fps : 0,
          fps,
          selectedLayerIds,
          layerCount: layers.length,
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Client tool failed.'
        console.error('[chatkit client tool failed]', toolCall.name, error)
        return { ok: false, error: message, tool: toolCall.name }
      }
    },
    onError({ error }) {
      console.error('[chatkit]', error)
    },
    onLog(event) {
      if (event?.name?.toLowerCase().includes('error')) console.warn('[chatkit]', event)
    },
    onThreadChange({ threadId }) {
      if (threadId) localStorage.setItem(threadStorageKey, threadId)
      else localStorage.removeItem(threadStorageKey)
    },
  })

  async function startNewChat() {
    localStorage.removeItem(threadStorageKey)
    setInitialThread(null)
    await chat.setThreadId(null)
  }

  return (
    <aside className="ai-chat-dock" aria-label={t('ai.chatTitle')}>
      <div className="ai-chat-dock-header">
        <div className="ai-chat-dock-title">
          <span className="ai-chat-dock-title-mark" aria-hidden>
            <Sparkles size={11} strokeWidth={2.25} />
          </span>
          <span>{t('ai.chatTitle')}</span>
        </div>
        <button className="icon-btn" onClick={onClose} title={t('common.close')}>
          <X size={13} />
        </button>
      </div>
      <div className="ai-chat-mode-bar">
        <div className="ai-chat-mode-seg" role="tablist" aria-label={t('ai.chatTitle')}>
          <button
            role="tab"
            aria-selected={mode === 'graphic'}
            className={`ai-chat-mode ${mode === 'graphic' ? 'active' : ''}`}
            onClick={() => setMode('graphic')}
          >
            <ImageIcon size={12} strokeWidth={2} />
            {t('ai.modeGraphic')}
          </button>
          <button
            role="tab"
            aria-selected={mode === 'animation'}
            className={`ai-chat-mode ${mode === 'animation' ? 'active' : ''}`}
            onClick={() => setMode('animation')}
          >
            <Play size={12} strokeWidth={2} />
            {t('ai.modeAnimation')}
          </button>
        </div>
        <button className="ai-chat-new-btn" onClick={() => void startNewChat()} title={t('ai.chatNew')}>
          <MessageSquarePlus size={12} />
          {t('ai.chatNew')}
        </button>
      </div>
      <div className="ai-chatkit-wrap">
        <ChatKit key={chatFrameKey} control={chat.control} className="ai-chatkit-frame" />
      </div>
    </aside>
  )
}
