import { ChevronLeft, ChevronRight, Clapperboard, Layers3 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useStore } from '../store'

export function WorkspaceBar() {
  const { t } = useTranslation()
  const {
    projectName, scenes, editorWorkspace, activeSceneId,
    setEditorWorkspace, goToAdjacentScene,
  } = useStore()
  const activeIndex = scenes.findIndex((scene) => scene.id === activeSceneId)
  const activeScene = activeIndex >= 0 ? scenes[activeIndex] : null

  return (
    <div
      className="flex items-center gap-2 px-3 flex-shrink-0"
      style={{ height: 36, background: 'var(--toolbar)', borderBottom: '1px solid var(--border)' }}
    >
      <div className="flex items-center rounded p-0.5" style={{ background: 'var(--input)', border: '1px solid var(--border)' }}>
        <button
          type="button"
          className="pill-btn"
          aria-pressed={editorWorkspace === 'story'}
          onClick={() => setEditorWorkspace('story')}
          style={{ height: 25, border: 0, background: editorWorkspace === 'story' ? 'var(--accent-bg)' : 'transparent', color: editorWorkspace === 'story' ? 'var(--accent)' : 'var(--text3)' }}
        >
          <Clapperboard size={12} />{t('workspace.story')}
        </button>
        <button
          type="button"
          className="pill-btn"
          aria-pressed={editorWorkspace === 'scene'}
          onClick={() => setEditorWorkspace('scene')}
          disabled={!scenes.length}
          style={{ height: 25, border: 0, background: editorWorkspace === 'scene' ? 'var(--accent-bg)' : 'transparent', color: editorWorkspace === 'scene' ? 'var(--accent)' : 'var(--text3)' }}
        >
          <Layers3 size={12} />{t('workspace.scene')}
        </button>
      </div>

      <div className="flex items-center gap-1 min-w-0 text-[11px]" style={{ color: 'var(--text3)' }}>
        <span className="truncate" style={{ maxWidth: 220 }}>{projectName}</span>
        {editorWorkspace === 'scene' && activeScene && (
          <>
            <ChevronRight size={12} />
            <strong className="truncate" style={{ color: 'var(--text)', maxWidth: 280 }}>{activeScene.title}</strong>
            <span style={{ color: 'var(--text3)' }}>{t('workspace.scenePosition', { current: activeIndex + 1, total: scenes.length })}</span>
          </>
        )}
      </div>

      <span className="flex-1" />
      {editorWorkspace === 'scene' && activeScene && (
        <div className="flex items-center gap-1">
          <button type="button" className="pill-btn" onClick={() => setEditorWorkspace('story')}>
            <ChevronLeft size={12} />{t('workspace.backToStory')}
          </button>
          <button type="button" className="icon-btn" disabled={activeIndex <= 0} onClick={() => goToAdjacentScene(-1)} title={t('workspace.previousScene')}>
            <ChevronLeft size={14} />
          </button>
          <button type="button" className="icon-btn" disabled={activeIndex >= scenes.length - 1} onClick={() => goToAdjacentScene(1)} title={t('workspace.nextScene')}>
            <ChevronRight size={14} />
          </button>
        </div>
      )}
    </div>
  )
}
