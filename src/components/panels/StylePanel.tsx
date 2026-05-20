import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useStore } from '../../store'
import { Layer, FillType, GradientStop, GOOGLE_FONTS, ImageFit } from '../../types'
import { SectionHeader } from './TransformPanel'
import { ScrubField } from './ScrubField'
import { resolveLayerAnimation } from '../../animationProperties'

function estimateTextSize(text: string, fontSize: number, lineHeight: number, letterSpacing: number) {
  const lines = (text || 'Text').split('\n')
  const longest = Math.max(...lines.map((line) => line.length), 1)
  return {
    width: Math.ceil(longest * (fontSize * 0.58 + letterSpacing) + 24),
    height: Math.ceil(lines.length * fontSize * lineHeight + 16),
  }
}

function DebouncedColorInput({ value, onChange, className }: {
  value: string
  onChange: (value: string) => void
  className?: string
}) {
  const [local, setLocal] = useState(value)
  const timer = useRef<number | null>(null)
  const active = useRef(false)
  const { beginInteraction, endInteraction } = useStore()

  useEffect(() => {
    if (!active.current) setLocal(value)
  }, [value])

  function schedule(next: string) {
    setLocal(next)
    if (!active.current) {
      active.current = true
      beginInteraction(true)
    }
    if (timer.current) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      onChange(next)
      active.current = false
      endInteraction()
    }, 120)
  }

  function flush() {
    if (timer.current) window.clearTimeout(timer.current)
    onChange(local)
    if (active.current) endInteraction()
    active.current = false
  }

  return (
    <input
      type="color"
      value={local}
      onChange={(e) => schedule(e.target.value)}
      onBlur={flush}
      className={className ?? 'w-8 h-7 cursor-pointer border-0 bg-transparent'}
    />
  )
}

function getTextSelectionStyle(layer: Layer, range: { start: number; end: number } | null) {
  if (!range || range.start === range.end) return null
  const len = Math.max(0, Math.min(layer.text.length, range.end) - Math.max(0, range.start))
  if (len <= 0) return null
  const values = {
    fontFamily: new Set<string>(),
    fontSize: new Set<number>(),
    fontWeight: new Set<string>(),
    textColor: new Set<string>(),
    letterSpacing: new Set<number>(),
  }
  for (let idx = range.start; idx < range.end; idx += 1) {
    const span = [...(layer.textSpans ?? [])].reverse().find((item) => idx >= item.start && idx < item.end)
    values.fontFamily.add(span?.fontFamily ?? layer.fontFamily)
    values.fontSize.add(span?.fontSize ?? layer.fontSize)
    values.fontWeight.add(span?.fontWeight ?? layer.fontWeight)
    values.textColor.add(span?.textColor ?? layer.textColor)
    values.letterSpacing.add(span?.letterSpacing ?? layer.letterSpacing)
  }
  return {
    fontFamily: values.fontFamily.size === 1 ? [...values.fontFamily][0] : null,
    fontSize: values.fontSize.size === 1 ? [...values.fontSize][0] : null,
    fontWeight: values.fontWeight.size === 1 ? [...values.fontWeight][0] : null,
    textColor: values.textColor.size === 1 ? [...values.textColor][0] : null,
    letterSpacing: values.letterSpacing.size === 1 ? [...values.letterSpacing][0] : null,
  }
}

interface PathPoint {
  x: number
  y: number
}

function formatPathNumber(value: number) {
  return Number(value.toFixed(2))
}

function parsePathPoints(pathData = '') {
  const tokens = pathData.match(/[MLCQZ]|-?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? []
  const points: PathPoint[] = []
  let closed = false
  let i = 0

  function readPoint(offset = 0): PathPoint | null {
    const x = Number(tokens[i + offset])
    const y = Number(tokens[i + offset + 1])
    return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null
  }

  while (i < tokens.length) {
    const token = tokens[i]
    if (/^[ML]$/i.test(token)) {
      const point = readPoint(1)
      if (point) points.push(point)
      i += 3
      continue
    }
    if (/^C$/i.test(token)) {
      const point = readPoint(5)
      if (point) points.push(point)
      i += 7
      continue
    }
    if (/^Q$/i.test(token)) {
      const point = readPoint(3)
      if (point) points.push(point)
      i += 5
      continue
    }
    if (/^Z$/i.test(token)) {
      closed = true
      i += 1
      continue
    }
    i += 1
  }

  return { points, closed }
}

function pointsToLinePath(points: PathPoint[], closed: boolean) {
  if (!points.length) return ''
  const parts = [`M ${formatPathNumber(points[0].x)} ${formatPathNumber(points[0].y)}`]
  points.slice(1).forEach((point) => parts.push(`L ${formatPathNumber(point.x)} ${formatPathNumber(point.y)}`))
  if (closed) parts.push('Z')
  return parts.join(' ')
}

function pointsToBezierPath(points: PathPoint[], closed: boolean) {
  if (points.length < 2) return pointsToLinePath(points, closed)
  const parts = [`M ${formatPathNumber(points[0].x)} ${formatPathNumber(points[0].y)}`]
  const segmentCount = closed ? points.length : points.length - 1

  for (let index = 0; index < segmentCount; index += 1) {
    const p0 = points[index === 0 ? closed ? points.length - 1 : 0 : index - 1]
    const p1 = points[index]
    const p2 = points[(index + 1) % points.length]
    const p3 = points[index + 2 < points.length ? index + 2 : closed ? (index + 2) % points.length : points.length - 1]
    const c1 = {
      x: p1.x + (p2.x - p0.x) / 6,
      y: p1.y + (p2.y - p0.y) / 6,
    }
    const c2 = {
      x: p2.x - (p3.x - p1.x) / 6,
      y: p2.y - (p3.y - p1.y) / 6,
    }
    parts.push([
      'C',
      formatPathNumber(c1.x),
      formatPathNumber(c1.y),
      formatPathNumber(c2.x),
      formatPathNumber(c2.y),
      formatPathNumber(p2.x),
      formatPathNumber(p2.y),
    ].join(' '))
  }

  if (closed) parts.push('Z')
  return parts.join(' ')
}

export function StylePanel() {
  const { t } = useTranslation()
  const {
    layers, selectedLayerIds, currentFrame, updateLayerProp, setLayerAnimatedProperty,
    setTextSelection, updateTextSelectionStyle, beginInteraction, endInteraction, textSelection,
  } = useStore()
  const maybeLayer = layers.find((l) => l.id === selectedLayerIds[0])
  if (!maybeLayer) return null

  // Narrow type in closures
  const sourceLayer: Layer = maybeLayer
  const layer: Layer = resolveLayerAnimation(sourceLayer, currentFrame).layer
  const upd = <K extends keyof Layer>(k: K, v: Layer[K]) => updateLayerProp(sourceLayer.id, k, v)
  const textSelectionRange = textSelection?.layerId === sourceLayer.id
    ? {
      start: Math.min(textSelection.start, textSelection.end),
      end: Math.max(textSelection.start, textSelection.end),
    }
    : null
  const hasTextSelection = Boolean(textSelectionRange && textSelectionRange.start !== textSelectionRange.end)
  const textMixed = getTextSelectionStyle(sourceLayer, textSelectionRange)
  const updateTextSizing = (next: Partial<Layer>) => {
    if ((sourceLayer.sizeMode ?? 'fixed') !== 'fit-content') return
    const sized = estimateTextSize(
      String(next.text ?? sourceLayer.text),
      Number(next.fontSize ?? sourceLayer.fontSize),
      Number(next.lineHeight ?? sourceLayer.lineHeight),
      Number(next.letterSpacing ?? sourceLayer.letterSpacing),
    )
    setLayerAnimatedProperty(sourceLayer.id, 'width', sized.width)
    setLayerAnimatedProperty(sourceLayer.id, 'height', sized.height)
  }

  function addGradientStop() {
    upd('gradientStops', [...layer.gradientStops, { color: '#ffffff', position: 100 }])
  }

  function updateStop(idx: number, key: keyof GradientStop, val: string | number) {
    const stops = layer.gradientStops.map((s, i) => i === idx ? { ...s, [key]: val } : s)
    upd('gradientStops', stops)
  }

  function removeStop(idx: number) {
    upd('gradientStops', layer.gradientStops.filter((_, i) => i !== idx))
  }

  function setPathClosed(closed: boolean) {
    const parsed = parsePathPoints(layer.pathData)
    upd('pathClosed', closed)
    upd('pathData', layer.pathData?.trim()
      ? closed
        ? layer.pathData.replace(/\s*Z\s*$/i, '').trim() + ' Z'
        : layer.pathData.replace(/\s*Z\s*$/i, '').trim()
      : pointsToLinePath(parsed.points, closed))
  }

  function smoothPath() {
    const parsed = parsePathPoints(layer.pathData)
    if (parsed.points.length < 2) return
    const closed = layer.pathClosed ?? parsed.closed
    upd('pathClosed', closed)
    upd('pathData', pointsToBezierPath(parsed.points, closed))
  }

  function straightenPath() {
    const parsed = parsePathPoints(layer.pathData)
    if (parsed.points.length < 2) return
    const closed = layer.pathClosed ?? parsed.closed
    upd('pathClosed', closed)
    upd('pathData', pointsToLinePath(parsed.points, closed))
  }

  return (
    <div className="flex flex-col gap-0">
      {layer.type !== 'image' && layer.type !== 'video' && (
        <>
          {/* Fill */}
          <SectionHeader label={t('style.fill')} />
          <div className="px-3 pb-1 flex gap-1">
            {(['solid', 'linear-gradient', 'radial-gradient', 'none'] as FillType[]).map((fillType) => (
              <button
                key={fillType}
                onClick={() => upd('fillType', fillType)}
                className="flex-1 text-[10px] rounded py-1 transition-colors truncate"
                style={{
                  background: layer.fillType === fillType ? 'var(--accent)' : 'var(--input)',
                  color: layer.fillType === fillType ? '#fff' : 'var(--text2)',
                  border: '1px solid var(--border)',
                }}
              >
                {fillType === 'linear-gradient' ? t('style.linear') : fillType === 'radial-gradient' ? t('style.radial') : fillType === 'none' ? t('style.none') : t('style.solid')}
              </button>
            ))}
          </div>

          {layer.fillType === 'solid' && (
            <div className="flex items-center gap-2 px-3 py-1.5">
              <span className="text-xs" style={{ color: 'var(--text2)' }}>{t('style.color')}</span>
              <DebouncedColorInput value={layer.fillColor}
                onChange={(value) => setLayerAnimatedProperty(layer.id, 'fillColor', value)}
                className="w-8 h-7 rounded cursor-pointer border-0 bg-transparent"
              />
              <span className="text-xs font-mono" style={{ color: 'var(--text2)' }}>{layer.fillColor}</span>
            </div>
          )}

          {(layer.fillType === 'linear-gradient' || layer.fillType === 'radial-gradient') && (
            <div className="px-3 pb-2 flex flex-col gap-2">
              {layer.fillType === 'linear-gradient' && (
                <div className="flex items-center gap-2">
                  <span className="text-xs" style={{ color: 'var(--text2)' }}>{t('style.angle')}</span>
                  <input type="range" min={0} max={360} value={layer.gradientAngle}
                    onChange={(e) => upd('gradientAngle', Number(e.target.value))}
                    onPointerDown={() => beginInteraction(true)}
                    onPointerUp={() => endInteraction()}
                    onBlur={() => endInteraction()}
                    className="flex-1"
                  />
                  <span className="text-xs w-8 text-right" style={{ color: 'var(--text3)' }}>{layer.gradientAngle}°</span>
                </div>
              )}
              <div
                style={{
                  height: 20,
                  borderRadius: 4,
                  background: layer.fillType === 'linear-gradient'
                    ? `linear-gradient(${layer.gradientAngle}deg, ${layer.gradientStops.map((s) => `${s.color} ${s.position}%`).join(', ')})`
                    : `radial-gradient(circle, ${layer.gradientStops.map((s) => `${s.color} ${s.position}%`).join(', ')})`,
                }}
              />
              {layer.gradientStops.map((stop, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <DebouncedColorInput value={stop.color}
                    onChange={(value) => updateStop(i, 'color', value)}
                    className="w-7 h-6 cursor-pointer border-0 bg-transparent rounded"
                  />
                  <input type="number" min={0} max={100} value={stop.position}
                    onChange={(e) => updateStop(i, 'position', Number(e.target.value))}
                    className="input-base w-14 text-right"
                  />
                  <span style={{ color: 'var(--text3)', fontSize: 10 }}>%</span>
                  {layer.gradientStops.length > 2 && (
                    <button onClick={() => removeStop(i)}
                      style={{ color: 'var(--text3)', fontSize: 14, lineHeight: 1 }}
                      className="ml-auto hover:text-red-400"
                    >×</button>
                  )}
                </div>
              ))}
              <button onClick={addGradientStop}
                className="text-xs py-1 rounded"
                style={{ background: 'var(--input)', color: 'var(--text2)', border: '1px solid var(--border)' }}
              >+ {t('style.addStop')}</button>
            </div>
          )}
        </>
      )}

      {/* Stroke */}
      <SectionHeader label={t('style.stroke')} />
      <div className="px-3 pb-2 flex flex-col gap-1.5">
        <label className="flex items-center gap-2 text-xs cursor-pointer" style={{ color: 'var(--text2)' }}>
          <input type="checkbox" checked={layer.strokeEnabled}
            onChange={(e) => upd('strokeEnabled', e.target.checked)} className="accent-[#0d99ff]"
          />
          {t('style.enableStroke')}
        </label>
        {layer.strokeEnabled && (
          <>
            <div className="flex items-center gap-2">
              <span className="text-xs w-16" style={{ color: 'var(--text2)' }}>{t('style.color')}</span>
              <DebouncedColorInput value={layer.strokeColor}
                onChange={(value) => setLayerAnimatedProperty(layer.id, 'strokeColor', value)}
                className="w-8 h-7 cursor-pointer border-0 bg-transparent"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs w-16" style={{ color: 'var(--text2)' }}>{t('style.width')}</span>
              <ScrubField label="" value={layer.strokeWidth} min={0} step={1} sensitivity={1} precision={0}
                onChange={(v) => setLayerAnimatedProperty(layer.id, 'strokeWidth', Math.round(v))}
                compact />
            </div>
          </>
        )}
      </div>

      {/* Border radius */}
      {layer.type !== 'line' && layer.type !== 'ellipse' && layer.type !== 'triangle' && (
        <>
          <SectionHeader label={t('style.borderRadius')} />
          <ScrubField label={t('style.radius')} value={layer.borderRadius} min={0} max={200} step={1} sensitivity={1} precision={0} unit="px"
            onChange={(v) => setLayerAnimatedProperty(layer.id, 'borderRadius', Math.round(v))}
          />
        </>
      )}

      {/* Path options */}
      {layer.type === 'path' && (
        <>
          <SectionHeader label={t('style.path')} />
          <div className="px-3 pb-2 flex flex-col gap-2">
            <textarea
              value={layer.pathData ?? ''}
              onChange={(e) => upd('pathData', e.target.value)}
              className="input-base w-full resize-none font-mono text-[10px]"
              rows={4}
              spellCheck={false}
            />
            <label className="flex items-center gap-2 text-xs cursor-pointer" style={{ color: 'var(--text2)' }}>
              <input
                type="checkbox"
                checked={Boolean(layer.pathClosed)}
                onChange={(e) => setPathClosed(e.target.checked)}
                className="accent-[#0d99ff]"
              />
              {t('style.closedPath')}
            </label>
            <div className="grid grid-cols-2 gap-1">
              <button
                onClick={smoothPath}
                className="text-xs rounded py-1.5"
                style={{ background: 'var(--accent)', color: '#fff', border: '1px solid var(--border)' }}
              >
                {t('style.smoothBezier')}
              </button>
              <button
                onClick={straightenPath}
                className="text-xs rounded py-1.5"
                style={{ background: 'var(--input)', color: 'var(--text2)', border: '1px solid var(--border)' }}
              >
                {t('style.straightLines')}
              </button>
            </div>
            <div className="text-[10px]" style={{ color: 'var(--text3)' }}>
              {t('style.pathHelp')}
            </div>
          </div>
        </>
      )}

      {/* Image options */}
      {(layer.type === 'image' || layer.type === 'video') && (
        <>
          <SectionHeader label={layer.type === 'video' ? t('style.video') : layer.imageKind === 'svg' ? t('style.svgImage') : t('style.image')} />
          <div className="px-3 pb-2 flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <span className="text-xs w-16" style={{ color: 'var(--text2)' }}>{t('style.fit')}</span>
              <select
                value={layer.imageFit ?? 'contain'}
                onChange={(e) => upd('imageFit', e.target.value as ImageFit)}
                className="input-base flex-1"
              >
                <option value="contain">{t('style.contain')}</option>
                {(layer.type === 'video' || layer.imageKind !== 'svg') && <option value="cover">{t('style.cover')}</option>}
                <option value="fill">{t('style.stretch')}</option>
                <option value="scale-down">{t('style.scaleDown')}</option>
              </select>
            </div>
            <div className="text-[10px]" style={{ color: 'var(--text3)' }}>
              {layer.type === 'video'
                ? t('style.videoHelp')
                : layer.imageKind === 'svg'
                ? t('style.svgHelp')
                : t('style.imageHelp')}
            </div>
            {layer.type === 'image' && layer.imageKind === 'svg' && (
              <div className="mt-2 flex flex-col gap-2" style={{ borderTop: '1px solid var(--border)', paddingTop: 10 }}>
                <div className="flex items-center gap-2">
                  <span className="text-xs w-20" style={{ color: 'var(--text2)' }}>{t('style.svgStroke')}</span>
                  <DebouncedColorInput
                    value={sourceLayer.svgStrokeColor ?? '#ffffff'}
                    onChange={(value) => upd('svgStrokeColor', value)}
                    className="w-8 h-7 cursor-pointer border-0 bg-transparent"
                  />
                  <ScrubField
                    label=""
                    value={sourceLayer.svgStrokeWidth ?? 2}
                    min={0}
                    max={24}
                    step={0.25}
                    sensitivity={0.1}
                    precision={2}
                    compact
                    onChange={(v) => upd('svgStrokeWidth', Math.max(0, v))}
                  />
                </div>
                <label className="flex items-center gap-2 text-xs cursor-pointer" style={{ color: 'var(--text2)' }}>
                  <input
                    type="checkbox"
                    checked={Boolean(sourceLayer.svgFillEnabled)}
                    onChange={(e) => upd('svgFillEnabled', e.target.checked)}
                    className="accent-[#0d99ff]"
                  />
                  {t('style.enableFill')}
                </label>
                {sourceLayer.svgFillEnabled && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs w-20" style={{ color: 'var(--text2)' }}>{t('style.svgFill')}</span>
                    <DebouncedColorInput
                      value={sourceLayer.svgFillColor ?? sourceLayer.svgStrokeColor ?? '#ffffff'}
                      onChange={(value) => upd('svgFillColor', value)}
                      className="w-8 h-7 cursor-pointer border-0 bg-transparent"
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}

      {/* Text options */}
      {layer.type === 'text' && (
        <>
          <SectionHeader label={t('style.text')} />
          <div className="px-3 pb-2 flex flex-col gap-1.5">
            <textarea
              value={layer.text}
              onChange={(e) => {
                upd('text', e.target.value)
                updateTextSizing({ text: e.target.value } as Partial<Layer>)
              }}
              onSelect={(e) => {
                const el = e.currentTarget
                setTextSelection({ layerId: layer.id, start: el.selectionStart, end: el.selectionEnd })
              }}
              className="input-base w-full resize-none"
              rows={3}
            />
            <div className="flex items-center gap-2">
              <span className="text-xs w-16" style={{ color: 'var(--text2)' }}>{t('style.font')}</span>
              <select value={hasTextSelection && textMixed?.fontFamily === null ? '' : textMixed?.fontFamily ?? layer.fontFamily}
                onChange={(e) => updateTextSelectionStyle(layer.id, { fontFamily: e.target.value })}
                className="input-base flex-1"
              >
                {hasTextSelection && textMixed?.fontFamily === null && <option value="">{t('style.mixed')}</option>}
                {GOOGLE_FONTS.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
            <div className="flex gap-2">
              <div className="flex items-center gap-1 flex-1">
                <span className="text-xs" style={{ color: 'var(--text2)' }}>{t('style.size')}</span>
                <ScrubField label={hasTextSelection && textMixed?.fontSize === null ? t('style.mixed') : ''} value={textMixed?.fontSize ?? layer.fontSize} min={6} step={1} sensitivity={1} precision={0}
                  onChange={(v) => {
                    updateTextSelectionStyle(layer.id, { fontSize: Math.round(v) })
                    updateTextSizing({ fontSize: Math.round(v) } as Partial<Layer>)
                  }}
                  compact />
              </div>
              <div className="flex items-center gap-1 flex-1">
                <span className="text-xs" style={{ color: 'var(--text2)' }}>{t('style.weight')}</span>
                <select value={hasTextSelection && textMixed?.fontWeight === null ? '' : textMixed?.fontWeight ?? layer.fontWeight}
                  onChange={(e) => updateTextSelectionStyle(layer.id, { fontWeight: e.target.value })}
                  className="input-base flex-1"
                >
                  {hasTextSelection && textMixed?.fontWeight === null && <option value="">{t('style.mixed')}</option>}
                  {['300', '400', '500', '600', '700', '800', '900'].map((w) => (
                    <option key={w} value={w}>{w}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs w-16" style={{ color: 'var(--text2)' }}>{t('style.color')}</span>
              <DebouncedColorInput value={textMixed?.textColor ?? layer.textColor}
                onChange={(value) => useStore.getState().updateTextSelectionStyle(layer.id, { textColor: value })}
                className="w-8 h-7 cursor-pointer border-0 bg-transparent"
              />
              {hasTextSelection && textMixed?.textColor === null && <span className="text-xs" style={{ color: 'var(--text3)' }}>{t('style.mixed')}</span>}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs w-16" style={{ color: 'var(--text2)' }}>{t('style.align')}</span>
              {(['left', 'center', 'right'] as const).map((a) => (
                <button key={a} onClick={() => upd('textAlign', a)}
                  className="flex-1 text-xs rounded py-1 transition-colors"
                  style={{
                    background: layer.textAlign === a ? 'var(--accent)' : 'var(--input)',
                    color: layer.textAlign === a ? '#fff' : 'var(--text2)',
                    border: '1px solid var(--border)',
                  }}
                >{t(`style.${a}`)}</button>
              ))}
            </div>
            <div className="flex gap-2">
              <div className="flex items-center gap-1 flex-1">
                <span className="text-xs" style={{ color: 'var(--text2)' }}>{t('style.letterSpacing')}</span>
                <ScrubField label={hasTextSelection && textMixed?.letterSpacing === null ? t('style.mixed') : ''} value={textMixed?.letterSpacing ?? layer.letterSpacing} step={0.1} sensitivity={0.1} precision={2}
                  onChange={(v) => {
                    updateTextSelectionStyle(layer.id, { letterSpacing: v })
                    updateTextSizing({ letterSpacing: v } as Partial<Layer>)
                  }}
                  compact />
              </div>
              <div className="flex items-center gap-1 flex-1">
                <span className="text-xs" style={{ color: 'var(--text2)' }}>{t('style.lineHeight')}</span>
                <ScrubField label="" value={layer.lineHeight} min={0.1} step={0.05} sensitivity={0.01} precision={2}
                  onChange={(v) => {
                    setLayerAnimatedProperty(layer.id, 'lineHeight', v)
                    updateTextSizing({ lineHeight: v } as Partial<Layer>)
                  }}
                  compact />
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
