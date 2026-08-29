import { ArrowDown, ArrowUp, FileText, ListVideo, Merge, Plus, Scissors, Trash2 } from 'lucide-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { sceneAtFrame, suggestedScriptSplitOffset } from '../domains/scenes/model'
import { useStore } from '../store'

type PanelMode = 'script' | 'scenes'

function seconds(frame: number, fps: number) {
  return (frame / fps).toFixed(1)
}

export function ScriptScenesPanel({ mode }: { mode: PanelMode }) {
  const { t } = useTranslation()
  const {
    script, scenes, currentFrame, fps, totalFrames,
    setScriptText, generateScenesFromScript, addScene, updateScene, deleteScene,
    splitScene, mergeSceneWithNext, moveScene, setCurrentFrame,
    updateScriptSegment, splitScriptSegment, mergeScriptSegmentWithNext,
  } = useStore()
  const activeScene = useMemo(() => sceneAtFrame(scenes, currentFrame), [scenes, currentFrame])

  if (mode === 'script') {
    return (
      <div className="flex flex-col h-full" style={{ width: '100%', background: 'var(--panel)' }}>
        <div className="flex items-center gap-1.5 px-3 flex-shrink-0" style={{ height: 32, borderBottom: '1px solid var(--border)', color: 'var(--text2)' }}>
          <FileText size={13} />
          <span className="section-header" style={{ padding: 0 }}>{t('scenes.script')}</span>
        </div>
        <div className="p-3 flex flex-col gap-2 min-h-0 flex-1">
          <p className="text-[11px] leading-4" style={{ color: 'var(--text3)' }}>{t('scenes.scriptHelp')}</p>
          <textarea
            value={script.rawText}
            onChange={(event) => setScriptText(event.target.value)}
            placeholder={t('scenes.scriptPlaceholder')}
            className="input-base text-xs leading-5 resize-none"
            style={{ padding: 8, height: 150 }}
          />
          <button className="pill-btn active justify-center" onClick={generateScenesFromScript} disabled={!script.rawText.trim()}>
            <ListVideo size={13} />{t('scenes.createFromScript')}
          </button>
          <div className="text-[10px]" style={{ color: 'var(--text3)' }}>
            {t('scenes.segmentCount', { count: script.segments.length })}
          </div>
          {!script.rawText.trim() && (
            <ol className="flex flex-col gap-2 mt-1" style={{ color: 'var(--text3)' }}>
              {[t('scenes.scriptStepPaste'), t('scenes.scriptStepSeparate'), t('scenes.scriptStepGenerate')].map((step, index) => (
                <li key={step} className="flex gap-2 text-[11px] leading-4">
                  <span className="flex items-center justify-center rounded-full" style={{ width: 18, height: 18, flexShrink: 0, background: 'var(--input)', color: 'var(--accent)', fontSize: 10 }}>{index + 1}</span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          )}
          {script.segments.length > 0 && (
            <div className="flex flex-col gap-2 overflow-y-auto min-h-0 flex-1 pr-0.5">
              {script.segments.map((segment, index) => (
                <div key={segment.id} style={{ border: '1px solid var(--border)', background: 'var(--input)', borderRadius: 5, padding: 5 }}>
                  <div className="flex items-center gap-1 mb-1" style={{ color: 'var(--text3)', fontSize: 10 }}>
                    <span className="flex-1">{t('scenes.segmentLabel', { count: index + 1 })}</span>
                    <button className="icon-btn" onClick={() => splitScriptSegment(segment.id, suggestedScriptSplitOffset(segment.text))} title={t('scenes.splitSegment')} disabled={segment.text.trim().length < 2}><Scissors size={11} /></button>
                    <button className="icon-btn" onClick={() => mergeScriptSegmentWithNext(segment.id)} title={t('scenes.mergeSegment')} disabled={index === script.segments.length - 1}><Merge size={11} /></button>
                  </div>
                  <textarea
                    className="input-base text-[11px] leading-4 resize-y w-full"
                    value={segment.text}
                    onChange={(event) => updateScriptSegment(segment.id, event.target.value)}
                    aria-label={t('scenes.segmentLabel', { count: index + 1 })}
                    rows={3}
                    style={{ padding: 6, minHeight: 64 }}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full" style={{ width: '100%', background: 'var(--panel)' }}>
      <div className="flex items-center justify-between gap-2 px-3 flex-shrink-0" style={{ height: 32, borderBottom: '1px solid var(--border)', color: 'var(--text2)' }}>
        <div className="flex items-center gap-1.5"><ListVideo size={13} /><span className="section-header" style={{ padding: 0 }}>{t('scenes.title')}</span></div>
        <button className="icon-btn" title={t('scenes.addScene')} onClick={() => addScene(currentFrame)}><Plus size={14} /></button>
      </div>
      <div className="p-2 overflow-y-auto flex-1 flex flex-col gap-2">
        {!scenes.length && <p className="text-xs text-center mt-8" style={{ color: 'var(--text3)' }}>{t('scenes.empty')}</p>}
        {scenes.map((scene, index) => {
          const isActive = scene.id === activeScene?.id
          const canMerge = index < scenes.length - 1
          return (
            <div key={scene.id} style={{ border: `1px solid ${isActive ? 'var(--accent)' : 'var(--border)'}`, background: isActive ? 'var(--accent-bg)' : 'var(--input)', borderRadius: 6, padding: 7 }}>
              <button className="w-full text-left" onClick={() => setCurrentFrame(scene.startFrame)} title={t('scenes.seekScene')}>
                <div className="text-[10px] mb-1" style={{ color: 'var(--text3)' }}>
                  {t('scenes.timeRange', { start: seconds(scene.startFrame, fps), end: seconds(scene.endFrame, fps) })}
                </div>
              </button>
              <input
                className="input-base text-xs w-full"
                value={scene.title}
                onChange={(event) => updateScene(scene.id, { title: event.target.value })}
                aria-label={t('scenes.sceneTitle')}
              />
              <div className="flex items-center gap-1 mt-1.5">
                <input
                  className="input-base text-[10px] w-12 text-right"
                  type="number"
                  min={0}
                  max={Math.max(0, totalFrames - 1)}
                  value={scene.startFrame}
                  onChange={(event) => updateScene(scene.id, { startFrame: Number(event.target.value) })}
                  title={t('scenes.startFrame')}
                />
                <span className="text-[10px]" style={{ color: 'var(--text3)' }}>→</span>
                <input
                  className="input-base text-[10px] w-12 text-right"
                  type="number"
                  min={1}
                  max={totalFrames}
                  value={scene.endFrame}
                  onChange={(event) => updateScene(scene.id, { endFrame: Number(event.target.value) })}
                  title={t('scenes.endFrame')}
                />
                <span className="flex-1" />
                <button className="icon-btn" title={t('scenes.moveUp')} disabled={index === 0} onClick={() => moveScene(scene.id, -1)}><ArrowUp size={12} /></button>
                <button className="icon-btn" title={t('scenes.moveDown')} disabled={index === scenes.length - 1} onClick={() => moveScene(scene.id, 1)}><ArrowDown size={12} /></button>
                <button className="icon-btn" title={t('scenes.splitAtPlayhead')} disabled={currentFrame <= scene.startFrame || currentFrame >= scene.endFrame} onClick={() => splitScene(scene.id)}><Scissors size={12} /></button>
                <button className="icon-btn" title={t('scenes.mergeNext')} disabled={!canMerge} onClick={() => mergeSceneWithNext(scene.id)}><Merge size={12} /></button>
                <button className="icon-btn hover:!text-red-400" title={t('common.delete')} onClick={() => deleteScene(scene.id)}><Trash2 size={12} /></button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
