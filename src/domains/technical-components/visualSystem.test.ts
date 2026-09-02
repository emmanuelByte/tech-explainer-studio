import { describe, expect, it } from 'vitest'
import {
  TECHNICAL_VISUAL_SYSTEM,
  technicalComponentPlacementBounds,
  technicalComponentVisualStyle,
} from './visualSystem'

describe('technical visual system', () => {
  it('locks the vertical production canvas and conservative overlay safe areas', () => {
    expect(TECHNICAL_VISUAL_SYSTEM.verticalVideo).toMatchObject({
      width: 1080,
      height: 1920,
      safeArea: { top: 160, right: 180, bottom: 300, left: 72 },
    })
    expect(technicalComponentPlacementBounds(1080, 1920)).toEqual({
      left: -328,
      right: 220,
      top: -700,
      bottom: 560,
    })
  })

  it('keeps semantic colors distinct and never uses color as the only state signal', () => {
    const styles = [
      technicalComponentVisualStyle('queue', 'active'),
      technicalComponentVisualStyle('worker', 'healthy'),
      technicalComponentVisualStyle('dead-letter-queue', 'warning'),
      technicalComponentVisualStyle('event-message', 'failed'),
    ]

    expect(new Set(styles.map((style) => style.stroke))).toHaveLength(4)
    expect(styles.map((style) => style.indicator)).toEqual([
      'pulse-ring',
      'check',
      'warning-triangle',
      'failure-x',
    ])
  })

  it('uses a warning treatment for a DLQ without making normal components look successful', () => {
    expect(technicalComponentVisualStyle('dead-letter-queue')).toMatchObject({
      state: 'warning',
      stroke: TECHNICAL_VISUAL_SYSTEM.color.warning,
    })
    expect(technicalComponentVisualStyle('queue')).toMatchObject({
      state: 'normal',
      stroke: TECHNICAL_VISUAL_SYSTEM.color.line,
    })
  })

  it('keeps sketch variation deterministic and disabled until the renderer supports it', () => {
    expect(TECHNICAL_VISUAL_SYSTEM.sketch).toEqual({
      enabledByDefault: false,
      seedSource: 'layer-id',
      roughness: 0.75,
      bowing: 0.35,
      strokePasses: 1,
    })
  })
})
