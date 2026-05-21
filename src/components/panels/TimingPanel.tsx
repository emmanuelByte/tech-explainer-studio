import { useTranslation } from 'react-i18next'
import { useStore } from '../../store'
import { Section, Row, NumField } from './_panelKit'

export function TimingPanel() {
  const { t } = useTranslation()
  const { layers, selectedLayerIds, totalFrames, fps, updateLayerTimeRange, setLayerRange, setTotalFrames } = useStore()
  const layer = layers.find((l) => l.id === selectedLayerIds[0])
  if (!layer) return null

  const descendants = (layer.type === 'group' || layer.isGroup)
    ? layers.filter((item) => {
      let parentId = item.parentId
      while (parentId) {
        if (parentId === layer.id) return true
        parentId = layers.find((candidate) => candidate.id === parentId)?.parentId
      }
      return false
    })
    : []
  const rangeLayers = (layer.type === 'group' || layer.isGroup) ? [layer, ...descendants] : []
  const groupRange = rangeLayers.length
    ? {
      start: Math.min(...rangeLayers.map((item) => item.startFrame ?? 0)),
      end: Math.max(...rangeLayers.map((item) => item.endFrame ?? totalFrames)),
    }
    : null
  const startFrame = groupRange?.start ?? layer.startFrame ?? 0
  const endFrame = groupRange?.end ?? layer.endFrame ?? totalFrames
  const durationFrames = Math.max(1, endFrame - startFrame)
  const isGroup = layer.type === 'group' || layer.isGroup

  return (
    <Section title={t('timeline.editTiming')}>
      <Row label={t('timeline.startTime')}>
        <NumField
          leading="S"
          value={parseFloat((startFrame / fps).toFixed(2))}
          min={0}
          step={0.1}
          precision={2}
          unit="s"
          sensitivity={0.05}
          onChange={(v) => {
            const nextStart = Math.round(v * fps)
            const nextEnd = nextStart + durationFrames
            if (nextEnd > totalFrames) setTotalFrames(nextEnd)
            setLayerRange(layer.id, nextStart, nextEnd)
          }}
        />
      </Row>
      <Row label={t('transform.end')}>
        <NumField
          leading="E"
          value={parseFloat((endFrame / fps).toFixed(2))}
          min={(startFrame + 1) / fps}
          step={0.1}
          precision={2}
          unit="s"
          sensitivity={0.05}
          onChange={(v) => {
            const nextEnd = Math.round(v * fps)
            if (nextEnd > totalFrames) setTotalFrames(nextEnd)
            if (isGroup) setLayerRange(layer.id, startFrame, nextEnd)
            else updateLayerTimeRange(layer.id, startFrame, nextEnd)
          }}
        />
      </Row>
      <div style={{ fontSize: 10, color: 'var(--text3)' }}>
        {t('common.frames')} {startFrame}-{endFrame}
      </div>
    </Section>
  )
}
