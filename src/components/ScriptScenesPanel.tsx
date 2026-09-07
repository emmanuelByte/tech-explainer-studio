import { ArrowDown, ArrowUp, Captions, FileText, ListVideo, LoaderCircle, Merge, Mic2, Plus, RefreshCw, Scissors, Sparkles, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { sceneAtFrame, suggestedScriptSplitOffset } from '../domains/scenes/model'
import { parseStructuredScript } from '../domains/scenes/structuredScript'
import { generateAndStoreLocalSpeech, getLocalTtsHealth, type LocalTtsHealth } from '../localTts'
import { useStore } from '../store'

type PanelMode = 'script' | 'scenes'

function seconds(frame: number, fps: number) {
  return (frame / fps).toFixed(1)
}

export function ScriptScenesPanel({ mode }: { mode: PanelMode }) {
  const { t } = useTranslation()
  const [scriptInputMode, setScriptInputMode] = useState<'text' | 'json'>('text')
  const [structuredInput, setStructuredInput] = useState('')
  const [structuredError, setStructuredError] = useState<string | null>(null)
  const [ttsHealth, setTtsHealth] = useState<LocalTtsHealth | null>(null)
  const [ttsError, setTtsError] = useState<string | null>(null)
  const [ttsLoading, setTtsLoading] = useState(false)
  const [ttsProgress, setTtsProgress] = useState<{ current: number; total: number } | null>(null)
  const {
    script, scenes, captions, localVoice, layers, currentFrame, fps, totalFrames,
    setScriptText, generateScenesFromScript, addScene, updateScene, deleteScene,
    splitScene, mergeSceneWithNext, moveScene, setCurrentFrame, openScene,
    updateScriptSegment, splitScriptSegment, mergeScriptSegmentWithNext,
    importStructuredScript, updateScriptSegmentRange, alignScriptSegmentsToScenes, setCaptions,
    setLocalVoice, applyGeneratedNarration,
  } = useStore()
  const activeScene = useMemo(() => sceneAtFrame(scenes, currentFrame), [scenes, currentFrame])
  const generatedNarrationCount = useMemo(() => layers.filter((layer) => (
    layer.type === 'audio' && layer.audioRole === 'narration' && layer.scriptSegmentId
  )).length, [layers])
  const staleNarrationCount = useMemo(() => layers.filter((layer) => {
    if (layer.type !== 'audio' || !layer.scriptSegmentId || !layer.narrationGeneration) return false
    const segment = script.segments.find((item) => item.id === layer.scriptSegmentId)
    return Boolean(segment && segment.text.trim() !== layer.narrationGeneration.sourceText)
  }).length, [layers, script.segments])

  async function refreshLocalVoice() {
    setTtsLoading(true)
    setTtsError(null)
    try {
      const health = await getLocalTtsHealth()
      setTtsHealth(health)
      if (!health.voices.some((voice) => voice.id === localVoice.baseVoiceId) && health.voices[0]) {
        setLocalVoice({ baseVoiceId: health.voices[0].id })
      }
    } catch (error) {
      setTtsHealth(null)
      setTtsError(error instanceof Error ? error.message : 'Local voice service is unavailable.')
    } finally {
      setTtsLoading(false)
    }
  }

  useEffect(() => {
    if (mode === 'script') void refreshLocalVoice()
    // Voice health is refreshed when the Script panel opens; the refresh button
    // handles service changes while the panel remains open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode])

  async function generateFullNarration() {
    if (!localVoice.baseVoiceId) return
    setTtsError(null)
    setTtsLoading(true)
    try {
      let segments = useStore.getState().script.segments
      if (!segments.length && useStore.getState().script.rawText.trim()) {
        generateScenesFromScript()
        segments = useStore.getState().script.segments
      }
      const targets = segments.filter((segment) => segment.text.trim())
      if (!targets.length) throw new Error('Add a script before generating narration.')
      const clips = []
      for (let index = 0; index < targets.length; index += 1) {
        const segment = targets[index]
        setTtsProgress({ current: index + 1, total: targets.length })
        const asset = await generateAndStoreLocalSpeech({
          text: segment.text.trim(),
          voice: localVoice.baseVoiceId,
          exaggeration: localVoice.exaggeration,
          cfgWeight: localVoice.cfgWeight,
        }, `Narration ${index + 1}`)
        if (!asset.duration || !Number.isFinite(asset.duration)) {
          throw new Error(`Could not read the duration of narration segment ${index + 1}.`)
        }
        clips.push({
          segmentId: segment.id,
          src: asset.url,
          name: asset.name,
          durationSeconds: asset.duration,
          sourceText: segment.text.trim(),
        })
      }
      applyGeneratedNarration(clips)
    } catch (error) {
      setTtsError(error instanceof Error ? error.message : 'Could not generate narration.')
    } finally {
      setTtsProgress(null)
      setTtsLoading(false)
    }
  }

  if (mode === 'script') {
    return (
      <div className="flex flex-col h-full" style={{ width: '100%', background: 'var(--panel)' }}>
        <div className="flex items-center gap-1.5 px-3 flex-shrink-0" style={{ height: 32, borderBottom: '1px solid var(--border)', color: 'var(--text2)' }}>
          <FileText size={13} />
          <span className="section-header" style={{ padding: 0 }}>{t('scenes.script')}</span>
          <span className="flex-1" />
          <button className={`text-[10px] px-1.5 py-0.5 rounded ${scriptInputMode === 'text' ? 'pill-btn active' : ''}`} onClick={() => setScriptInputMode('text')}>{t('scenes.plainText')}</button>
          <button className={`text-[10px] px-1.5 py-0.5 rounded ${scriptInputMode === 'json' ? 'pill-btn active' : ''}`} onClick={() => setScriptInputMode('json')}>{t('scenes.jsonImport')}</button>
        </div>
        <div className="p-3 flex flex-col gap-2 min-h-0 flex-1">
          {scriptInputMode === 'json' ? (
            <>
              <p className="text-[11px] leading-4" style={{ color: 'var(--text3)' }}>{t('scenes.jsonHelp')}</p>
              <textarea
                value={structuredInput}
                onChange={(event) => { setStructuredInput(event.target.value); setStructuredError(null) }}
                placeholder={t('scenes.jsonPlaceholder')}
                className="input-base text-[11px] leading-4 resize-none font-mono flex-1 min-h-0"
                style={{ padding: 8 }}
                aria-label={t('scenes.jsonImport')}
              />
              {structuredError && <p className="text-[11px]" style={{ color: 'var(--red, #ef4444)' }}>{structuredError}</p>}
              <button
                className="pill-btn active justify-center"
                disabled={!structuredInput.trim()}
                onClick={() => {
                  try {
                    importStructuredScript(parseStructuredScript(structuredInput, fps))
                    setStructuredError(null)
                    setScriptInputMode('text')
                  } catch (error) {
                    setStructuredError(error instanceof Error ? error.message : t('scenes.jsonError'))
                  }
                }}
              >
                <ListVideo size={13} />{t('scenes.importJson')}
              </button>
            </>
          ) : <>
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
          <div style={{ border: '1px solid var(--border)', borderRadius: 6, padding: 7, background: 'var(--input)' }}>
            <div className="flex items-center gap-2" style={{ color: 'var(--text2)', fontSize: 11 }}>
              <Mic2 size={13} style={{ color: ttsHealth?.ok ? '#a78bfa' : 'var(--text3)' }} />
              <strong>Local base voice</strong>
              <span style={{ marginLeft: 'auto', color: ttsHealth?.ok ? '#22c55e' : 'var(--text3)', fontSize: 9 }}>
                {ttsLoading && !ttsProgress ? 'Checking…' : ttsHealth?.ok ? `${ttsHealth.device} ready` : 'Offline'}
              </span>
              <button type="button" className="icon-btn" onClick={() => void refreshLocalVoice()} disabled={ttsLoading} title="Refresh local voice service">
                <RefreshCw size={11} className={ttsLoading && !ttsProgress ? 'animate-spin' : ''} />
              </button>
            </div>
            {ttsHealth?.voices.length ? (
              <>
                <select
                  aria-label="Base voice"
                  className="input-base"
                  value={localVoice.baseVoiceId}
                  onChange={(event) => setLocalVoice({ baseVoiceId: event.target.value })}
                  style={{ width: '100%', height: 27, marginTop: 7 }}
                >
                  {ttsHealth.voices.map((voice) => <option key={voice.id} value={voice.id}>{voice.id}</option>)}
                </select>
                <div className="grid grid-cols-2 gap-2" style={{ marginTop: 7 }}>
                  <label style={{ color: 'var(--text3)', fontSize: 9 }}>
                    Expression {localVoice.exaggeration.toFixed(1)}
                    <input type="range" min={0} max={2} step={0.1} value={localVoice.exaggeration} onChange={(event) => setLocalVoice({ exaggeration: Number(event.target.value) })} style={{ width: '100%' }} />
                  </label>
                  <label style={{ color: 'var(--text3)', fontSize: 9 }}>
                    Guidance {localVoice.cfgWeight.toFixed(1)}
                    <input type="range" min={0} max={1} step={0.1} value={localVoice.cfgWeight} onChange={(event) => setLocalVoice({ cfgWeight: Number(event.target.value) })} style={{ width: '100%' }} />
                  </label>
                </div>
                <label className="flex items-center gap-2" style={{ color: 'var(--text3)', fontSize: 9, marginTop: 5 }}>
                  Pause between segments
                  <input className="input-base text-[10px] text-right" type="number" min={0} max={Math.max(0, fps * 3)} value={localVoice.pauseFrames} onChange={(event) => setLocalVoice({ pauseFrames: Math.max(0, Number(event.target.value)) })} style={{ width: 48, height: 22 }} />
                  frames
                </label>
                <button
                  type="button"
                  className="pill-btn active justify-center"
                  onClick={() => void generateFullNarration()}
                  disabled={ttsLoading || !script.rawText.trim()}
                  style={{ width: '100%', marginTop: 7 }}
                >
                  {ttsProgress ? <LoaderCircle size={13} className="animate-spin" /> : <Sparkles size={13} />}
                  {ttsProgress ? `Generating ${ttsProgress.current} of ${ttsProgress.total}…` : generatedNarrationCount ? 'Regenerate Full Narration' : 'Generate Full Narration'}
                </button>
                {staleNarrationCount > 0 && (
                  <p style={{ color: '#f59e0b', fontSize: 9, lineHeight: '13px', marginTop: 5 }}>
                    {staleNarrationCount} narration {staleNarrationCount === 1 ? 'clip is' : 'clips are'} out of date with the script.
                  </p>
                )}
              </>
            ) : (
              <p style={{ color: 'var(--text3)', fontSize: 9, lineHeight: '13px', marginTop: 5 }}>
                Add baseVoice.wav to tools/local-tts/voices and start the local voice service.
              </p>
            )}
            {ttsError && <p style={{ color: 'var(--red, #ef4444)', fontSize: 9, lineHeight: '13px', marginTop: 5 }}>{ttsError}</p>}
          </div>
          <div style={{ border: '1px solid var(--border)', borderRadius: 6, padding: 7, background: 'var(--input)' }}>
            <label className="flex items-center gap-2" style={{ fontSize: 11, color: 'var(--text2)' }}>
              <Captions size={13} style={{ color: captions.enabled ? '#38bdf8' : 'var(--text3)' }} />
              <input type="checkbox" checked={captions.enabled} onChange={(event) => setCaptions({ enabled: event.target.checked })} />
              Show captions from timed segments
            </label>
            {captions.enabled && (
              <div className="flex items-center gap-2" style={{ marginTop: 7 }}>
                <select aria-label="Caption style" className="input-base" value={captions.style} onChange={(event) => setCaptions({ style: event.target.value as typeof captions.style })} style={{ flex: 1, height: 26 }}>
                  <option value="readable">Readable bottom</option>
                  <option value="technical">Technical minimal</option>
                </select>
                <button type="button" className="pill-btn" onClick={alignScriptSegmentsToScenes} disabled={!scenes.length}>Align to scenes</button>
              </div>
            )}
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
                  <div className="flex items-center gap-1 mt-1.5">
                    <button type="button" className="pill-btn" style={{ height: 23, padding: '0 6px', fontSize: 10 }} onClick={() => setCurrentFrame(segment.startFrame ?? 0)}>Seek</button>
                    <label className="flex items-center gap-1" style={{ color: 'var(--text3)', fontSize: 10 }}>
                      In
                      <input
                        aria-label={`Segment ${index + 1} start frame`}
                        className="input-base text-[10px] text-right"
                        type="number"
                        min={0}
                        max={Math.max(0, totalFrames - 1)}
                        value={segment.startFrame ?? 0}
                        onChange={(event) => updateScriptSegmentRange(segment.id, Number(event.target.value), segment.endFrame ?? totalFrames)}
                        style={{ width: 52, height: 23 }}
                      />
                    </label>
                    <label className="flex items-center gap-1" style={{ color: 'var(--text3)', fontSize: 10 }}>
                      Out
                      <input
                        aria-label={`Segment ${index + 1} end frame`}
                        className="input-base text-[10px] text-right"
                        type="number"
                        min={1}
                        max={totalFrames}
                        value={segment.endFrame ?? totalFrames}
                        onChange={(event) => updateScriptSegmentRange(segment.id, segment.startFrame ?? 0, Number(event.target.value))}
                        style={{ width: 52, height: 23 }}
                      />
                    </label>
                    <span style={{ marginLeft: 'auto', color: 'var(--text3)', fontSize: 9 }}>
                      {seconds(segment.startFrame ?? 0, fps)}–{seconds(segment.endFrame ?? totalFrames, fps)}s
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
          </>}
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
              <button className="w-full text-left" onClick={() => openScene(scene.id)} title={t('scenes.openScene')}>
                <div className="text-[10px] mb-1" style={{ color: 'var(--text3)' }}>
                  {t('scenes.timeRange', { start: seconds(scene.startFrame, fps), end: seconds(scene.endFrame, fps) })}
                </div>
                <div className="text-[10px] mb-1" style={{ color: 'var(--accent)' }}>{t('scenes.openScene')}</div>
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
