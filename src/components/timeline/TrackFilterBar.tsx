import { Search } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useStore } from '../../store'
import { TRACK_FILTER_KEYS, type TrackFilterKey } from '../../domains/timeline/filters'

const LABEL_KEY: Record<TrackFilterKey, string> = {
  selected: 'filterSelected',
  animated: 'filterAnimated',
  visible: 'filterVisible',
  audio: 'filterAudio',
  warnings: 'filterWarnings',
}

const TITLE_KEY: Record<TrackFilterKey, string> = {
  selected: 'filterSelectedTitle',
  animated: 'filterAnimatedTitle',
  visible: 'filterVisibleTitle',
  audio: 'filterAudioTitle',
  warnings: 'filterWarningsTitle',
}

/**
 * Search + track filter chips shared by Timeline.tsx and LayersPanel.tsx.
 * State lives in the store (not per-component) so filtering in one panel is
 * reflected in the other — both represent the same layer list. Deliberately
 * not persisted across reloads (unlike `showAllSubtracks`/`showValueGraph`):
 * a stale hidden-by-search state surviving a reload would read as "where did
 * my layers go", so it always starts cleared.
 */
export function TrackFilterBar() {
  const { t } = useTranslation()
  const { trackSearchQuery, setTrackSearchQuery, activeTrackFilters, toggleTrackFilter } = useStore()
  return (
    <div className="flex items-center gap-1 px-2 flex-wrap" style={{ minHeight: 26, paddingTop: 3, paddingBottom: 3, borderBottom: '1px solid var(--border2)' }}>
      <Search size={11} style={{ color: 'var(--text3)', flexShrink: 0 }} />
      <input
        value={trackSearchQuery}
        onChange={(e) => setTrackSearchQuery(e.target.value)}
        placeholder={t('timeline.searchLayers')}
        aria-label={t('timeline.searchLayers')}
        className="input-base"
        style={{ height: 20, fontSize: 10, flex: '1 1 60px', minWidth: 40 }}
      />
      {TRACK_FILTER_KEYS.map((key) => (
        <button
          key={key}
          type="button"
          onClick={() => toggleTrackFilter(key)}
          className={`pill-btn ${activeTrackFilters.includes(key) ? 'active' : ''}`}
          style={{ height: 20, padding: '0 6px', fontSize: 9, flexShrink: 0 }}
          title={t(`timeline.${TITLE_KEY[key]}`)}
        >
          {t(`timeline.${LABEL_KEY[key]}`)}
        </button>
      ))}
    </div>
  )
}
