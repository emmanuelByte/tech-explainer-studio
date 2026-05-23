import { useTranslation } from 'react-i18next'
import { Link2, Unlink2 } from 'lucide-react'
import { useStore } from '../../store'
import { Layer, FillType, GradientStop, GOOGLE_FONTS, ImageFit } from '../../types'
import { SectionHeader } from './TransformPanel'
import { ScrubField } from './ScrubField'
import { Section, Row, NumField, ToggleRow } from './_panelKit'
import { resolveLayerAnimation } from '../../animationProperties'
import { ColorPicker } from '../ColorPicker'

/* Small 12×12 SVG icon for stroke side picker: rectangle with ONE side highlighted. */
function SideIcon({ side }: { side: 'all' | 't' | 'r' | 'b' | 'l' }) {
  const baseStroke = 'currentColor'
  const muted = 'rgba(0,0,0,0.18)'
  const sides = ['t', 'r', 'b', 'l'] as const
  const color = (s: typeof sides[number]) => (side === 'all' || side === s ? baseStroke : muted)
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" strokeWidth="1.5" strokeLinecap="round">
      <line x1="2" y1="2" x2="10" y2="2" stroke={color('t')} />
      <line x1="10" y1="2" x2="10" y2="10" stroke={color('r')} />
      <line x1="10" y1="10" x2="2" y2="10" stroke={color('b')} />
      <line x1="2" y1="10" x2="2" y2="2" stroke={color('l')} />
    </svg>
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

const STROKE_WIDTH_KEYS = ['strokeTopWidth', 'strokeRightWidth', 'strokeBottomWidth', 'strokeLeftWidth'] as const

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
  const canSplitStroke = layer.type === 'rectangle' || layer.type === 'text' || layer.type === 'image' || layer.type === 'video' || layer.type === 'group' || layer.isGroup
  const strokeSideValues = STROKE_WIDTH_KEYS.map((key) => Math.round(Number(layer[key] ?? layer.strokeWidth ?? 0)))
  const strokeSidesAreEqual = strokeSideValues.every((value) => value === strokeSideValues[0])
  const strokeLinked = layer.strokeWidthLinked ?? strokeSidesAreEqual
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

  function setStrokeWidth(value: number) {
    const next = Math.max(0, Math.round(value))
    setLayerAnimatedProperty(layer.id, 'strokeWidth', next)
    if (strokeLinked && canSplitStroke) {
      STROKE_WIDTH_KEYS.forEach((key) => setLayerAnimatedProperty(layer.id, key, next))
    }
  }

  function setStrokeSide(index: number, value: number) {
    const next = Math.max(0, Math.round(value))
    if (strokeLinked) {
      setStrokeWidth(next)
      return
    }
    setLayerAnimatedProperty(layer.id, STROKE_WIDTH_KEYS[index], next)
  }

  function toggleStrokeLinked() {
    const nextLinked = !strokeLinked
    upd('strokeWidthLinked', nextLinked)
    if (nextLinked) {
      const next = strokeSideValues[0] ?? Math.round(layer.strokeWidth)
      setLayerAnimatedProperty(layer.id, 'strokeWidth', next)
      STROKE_WIDTH_KEYS.forEach((key) => setLayerAnimatedProperty(layer.id, key, next))
    }
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
            <div className="flex items-start gap-2 px-3 py-1.5">
              <span className="text-xs" style={{ color: 'var(--text2)', width: 44, paddingTop: 6 }}>{t('style.color')}</span>
              <ColorPicker value={layer.fillColor}
                onChange={(value) => setLayerAnimatedProperty(layer.id, 'fillColor', value)}
              />
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
                <div key={i} className="flex items-start gap-1.5">
                  <ColorPicker value={stop.color}
                    onChange={(value) => updateStop(i, 'color', value)}
                    compact
                  />
                  <input type="number" min={0} max={100} value={stop.position}
                    onChange={(e) => updateStop(i, 'position', Number(e.target.value))}
                    className="input-base w-12 text-right"
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

      {/* Stroke — unified Section/Row/NumField/ToggleRow design */}
      <Section title={t('style.stroke')} defaultOpen={!!layer.strokeEnabled}>
        <ToggleRow
          label={t('style.enableStroke')}
          checked={!!layer.strokeEnabled}
          onChange={(v) => upd('strokeEnabled', v)}
        />
        {layer.strokeEnabled && (
          <>
            <Row label={t('style.color')}>
              <ColorPicker
                value={layer.strokeColor}
                onChange={(value) => setLayerAnimatedProperty(layer.id, 'strokeColor', value)}
                compact
              />
            </Row>
            <Row label={t('style.width')}>
              <NumField
                leading={<SideIcon side="all" />}
                value={strokeLinked && canSplitStroke ? (strokeSideValues[0] ?? layer.strokeWidth) : layer.strokeWidth}
                min={0} step={1} precision={0} unit="px"
                onChange={setStrokeWidth}
                ariaLabel={t('style.width')}
              />
              {canSplitStroke && (
                <button
                  type="button"
                  onClick={toggleStrokeLinked}
                  title={strokeLinked ? t('style.unlockStrokeSides') : t('style.lockStrokeSides')}
                  style={{
                    width: 22, height: 26, flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    borderRadius: 3,
                    color: strokeLinked ? 'var(--accent)' : 'var(--text3)',
                    background: strokeLinked ? 'var(--accent-bg)' : 'transparent',
                    transition: 'background 0.1s, color 0.1s',
                  }}
                >
                  {strokeLinked ? <Link2 size={12} /> : <Unlink2 size={12} />}
                </button>
              )}
            </Row>
            {/* Per-side widths in a clean 2×2 grid, fully inside the panel */}
            {canSplitStroke && !strokeLinked && (
              <Row>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, flex: 1, minWidth: 0 }}>
                  <NumField
                    leading={<SideIcon side="t" />}
                    value={strokeSideValues[0] ?? 0}
                    min={0} step={1} precision={0}
                    onChange={(v) => setStrokeSide(0, v)}
                    ariaLabel={t('style.strokeTopShort')}
                  />
                  <NumField
                    leading={<SideIcon side="r" />}
                    value={strokeSideValues[1] ?? 0}
                    min={0} step={1} precision={0}
                    onChange={(v) => setStrokeSide(1, v)}
                    ariaLabel={t('style.strokeRightShort')}
                  />
                  <NumField
                    leading={<SideIcon side="l" />}
                    value={strokeSideValues[3] ?? 0}
                    min={0} step={1} precision={0}
                    onChange={(v) => setStrokeSide(3, v)}
                    ariaLabel={t('style.strokeLeftShort')}
                  />
                  <NumField
                    leading={<SideIcon side="b" />}
                    value={strokeSideValues[2] ?? 0}
                    min={0} step={1} precision={0}
                    onChange={(v) => setStrokeSide(2, v)}
                    ariaLabel={t('style.strokeBottomShort')}
                  />
                </div>
              </Row>
            )}
          </>
        )}
      </Section>

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
                  <ColorPicker
                    value={sourceLayer.svgStrokeColor ?? '#ffffff'}
                    onChange={(value) => upd('svgStrokeColor', value)}
                    compact
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
                    <ColorPicker
                      value={sourceLayer.svgFillColor ?? sourceLayer.svgStrokeColor ?? '#ffffff'}
                      onChange={(value) => upd('svgFillColor', value)}
                      compact
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
                    if (hasTextSelection) updateTextSelectionStyle(layer.id, { fontSize: Math.round(v) })
                    else setLayerAnimatedProperty(layer.id, 'fontSize', Math.round(v))
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
              <ColorPicker value={textMixed?.textColor ?? layer.textColor}
                onChange={(value) => {
                  if (hasTextSelection) updateTextSelectionStyle(layer.id, { textColor: value })
                  else setLayerAnimatedProperty(layer.id, 'textColor', value)
                }}
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
                    if (hasTextSelection) updateTextSelectionStyle(layer.id, { letterSpacing: v })
                    else setLayerAnimatedProperty(layer.id, 'letterSpacing', v)
                  }}
                  compact />
              </div>
              <div className="flex items-center gap-1 flex-1">
                <span className="text-xs" style={{ color: 'var(--text2)' }}>{t('style.lineHeight')}</span>
                <ScrubField label="" value={layer.lineHeight} min={0.1} step={0.05} sensitivity={0.01} precision={2}
                  onChange={(v) => {
                    setLayerAnimatedProperty(layer.id, 'lineHeight', v)
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
