import { DEFAULT_TRANSFORM, type Keyframe, type Layer } from '../../types'
import { baseLayer, staticKeyframe, type BuildContext } from './layerKit'
import type { DatabaseIndexDiagramMode } from './types'

/**
 * Native database-index diagrams. These deliberately use pages, key slots and
 * tuple identifiers instead of the generic architecture-component treatment.
 * They are original artwork, informed by PostgreSQL's page-level B-tree model.
 */
export function databaseIndexLayers(
  ctx: BuildContext,
  sceneId: string,
  mode: DatabaseIndexDiagramMode,
  start: number,
  end: number,
): Layer[] {
  const { frame, theme } = ctx
  const portrait = frame.orientation === 'portrait'
  const id = `dbi_${sceneId}`
  const layers: Layer[] = []
  const palette = {
    panel: theme.colors.panel,
    text: theme.colors.text,
    muted: theme.colors.mutedText,
    blue: theme.colors.accent,
    purple: theme.colors.accentSecondary,
    // Focus states are part of the same blue / purple / green system as the
    // pages themselves; a bright warning-yellow would read as an unrelated UI.
    gold: '#a78bfa',
    goldSurface: '#261b45',
    goldText: '#e9ddff',
    mint: theme.colors.positive,
    red: theme.colors.negative,
    ink: theme.colors.background,
    faint: 'rgba(148, 163, 184, 0.16)',
  }
  const parentId = `${id}_group`
  const timing = { startFrame: start, endFrame: end }
  const group = baseLayer(theme, 'group', {
    id: parentId,
    name: `Database index diagram: ${mode}`,
    width: frame.width,
    height: frame.height,
    ...timing,
    keyframes: staticKeyframe(start, 0, 0),
  })
  layers.push(group)

  const fade = (at = start, x = 0, y = 0): Keyframe[] => [
    { frame: at, easing: 'ease-out', props: { ...DEFAULT_TRANSFORM, x, y, opacity: 0, scale: 0.97 } },
    { frame: Math.min(end - 1, at + 12), easing: 'ease-out', props: { ...DEFAULT_TRANSFORM, x, y } },
  ]
  const addRect = (name: string, x: number, y: number, width: number, height: number, fill: string, stroke = palette.faint, radius = 14, at = start) => {
    layers.push(baseLayer(theme, 'rectangle', {
      id: `${id}_${name}`,
      name,
      parentId,
      width,
      height,
      fillColor: fill,
      strokeEnabled: Boolean(stroke),
      strokeColor: stroke,
      strokeWidth: 2,
      borderRadius: radius,
      ...timing,
      keyframes: fade(at, x, y),
    }))
  }
  const addText = (name: string, text: string, x: number, y: number, width: number, height: number, size: number, color = palette.text, weight = '600', at = start, align: 'left' | 'center' | 'right' = 'center') => {
    layers.push(baseLayer(theme, 'text', {
      id: `${id}_${name}`,
      name,
      parentId,
      text,
      width,
      height,
      fontSize: size,
      fontFamily: theme.typography.mono,
      fontWeight: weight,
      textColor: color,
      textAlign: align,
      ...timing,
      keyframes: fade(at, x, y),
    }))
  }
  const addLine = (name: string, fromX: number, fromY: number, toX: number, toY: number, color = palette.blue, at = start) => {
    const dx = toX - fromX
    const dy = toY - fromY
    const width = Math.hypot(dx, dy)
    layers.push(baseLayer(theme, 'line', {
      id: `${id}_${name}`,
      name,
      parentId,
      width,
      height: 10,
      strokeEnabled: true,
      strokeColor: color,
      strokeWidth: 4,
      fillType: 'none',
      ...timing,
      keyframes: fade(at, (fromX + toX) / 2, (fromY + toY) / 2).map((keyframe) => ({
        ...keyframe,
        props: { ...keyframe.props, rotateZ: Math.atan2(dy, dx) * 180 / Math.PI },
      })),
    }))
  }
  const addProbe = (name: string, steps: Array<{ frame: number; x: number; y: number }>, accent = palette.gold) => {
    const frames: Keyframe[] = []
    steps.forEach((step, index) => {
      const shown = { ...DEFAULT_TRANSFORM, x: step.x, y: step.y, scale: 1 }
      if (index === 0) {
        frames.push(
          { frame: step.frame, easing: 'ease-out', props: { ...shown, opacity: 0, scale: 0.82 } },
          { frame: Math.min(end - 1, step.frame + 8), easing: 'spring', props: shown },
        )
      } else {
        frames.push({ frame: step.frame, easing: 'ease-in-out', props: shown })
      }
    })
    layers.push(baseLayer(theme, 'ellipse', {
      id: `${id}_${name}`,
      name: `${name} probe`,
      parentId,
      width: 22,
      height: 22,
      fillColor: accent,
      strokeEnabled: true,
      strokeColor: palette.text,
      strokeWidth: 2,
      shadowEnabled: true,
      shadowColor: accent,
      ...timing,
      keyframes: frames,
    }))
  }
  const header = (label: string, detail: string) => {
    addText('header', label.toUpperCase(), 0, portrait ? -350 : -310, 760, 34, portrait ? 18 : 20, palette.muted, '700')
    addText('subheader', detail, 0, portrait ? -314 : -274, 920, 34, portrait ? 24 : 26, palette.text, '700')
  }
  const page = (name: string, x: number, y: number, title: string, cells: string[], options: { width?: number; accent?: string; highlight?: number; at?: number } = {}) => {
    const width = options.width ?? 300
    const height = 88 + cells.length * 38
    const accent = options.accent ?? palette.blue
    const at = options.at ?? start
    addRect(`${name}_page`, x, y, width, height, palette.panel, accent, 16, at)
    addRect(`${name}_head`, x, y - height / 2 + 22, width - 4, 40, 'rgba(15, 23, 42, 0.7)', accent, 12, at)
    addText(`${name}_title`, title, x, y - height / 2 + 22, width - 26, 30, 15, accent, '700', at)
    cells.forEach((cell, index) => {
      const cellY = y - height / 2 + 60 + index * 38
      const selected = index === options.highlight
      addRect(`${name}_cell_${index}`, x, cellY, width - 28, 31, selected ? palette.goldSurface : 'rgba(15,23,42,0.40)', selected ? palette.gold : 'rgba(148,163,184,0.20)', 7, at + index * 3)
      addText(`${name}_cell_text_${index}`, cell, x, cellY, width - 48, 24, 14, selected ? palette.goldText : palette.text, selected ? '700' : '500', at + index * 3)
    })
    return { width, height }
  }
  const table = (name: string, x: number, y: number, rows: string[], highlight?: number, width = portrait ? 590 : 620, at = start) => {
    const height = 112 + rows.length * 45
    addRect(`${name}_table`, x, y, width, height, palette.panel, palette.blue, 18, at)
    addRect(`${name}_head`, x, y - height / 2 + 26, width - 4, 48, 'rgba(15, 23, 42, 0.74)', palette.blue, 14, at)
    addText(`${name}_title`, 'users  •  heap table', x - width * 0.21, y - height / 2 + 26, width * 0.5, 30, 16, palette.blue, '700', at)
    addText(`${name}_cols`, 'id        email', x + width * 0.20, y - height / 2 + 26, width * 0.35, 30, 14, palette.muted, '600', at)
    rows.forEach((row, index) => {
      const rowY = y - height / 2 + 70 + index * 45
      const selected = index === highlight
      addRect(`${name}_row_${index}`, x, rowY, width - 30, 36, selected ? palette.goldSurface : index % 2 ? 'rgba(15,23,42,0.40)' : 'rgba(30,41,59,0.45)', selected ? palette.gold : 'rgba(148,163,184,0.12)', 8, at + index * 2)
      addText(`${name}_row_text_${index}`, row, x, rowY, width - 48, 25, 15, selected ? palette.goldText : palette.text, selected ? '700' : '500', at + index * 2)
    })
    return { width, height }
  }
  const btree = (prefix: string, tokenAt?: number) => {
    const rootY = portrait ? -185 : -180
    const branchY = portrait ? 25 : 30
    const leafY = portrait ? 235 : 235
    // Portrait retains the two-way branch split; stacking both branches on one
    // rail would conceal the choice the search is making.
    const branchX = portrait ? -190 : -220
    const otherX = portrait ? 190 : 220
    const root = page(`${prefix}_root`, 0, rootY, 'ROOT PAGE  •  level 2', ['maria@  │  nora@'], { width: 330, accent: palette.purple })
    const branch = page(`${prefix}_branch`, branchX, branchY, 'INTERNAL PAGE  •  level 1', ['hannah@  │  lucas@'], { width: 330, accent: palette.blue })
    const leaf = page(`${prefix}_leaf`, branchX, leafY, 'LEAF PAGE  •  level 0', ['alex@  →  (48291, 6)', 'anna@  →  (48291, 7)'], { width: 350, accent: palette.mint, highlight: 0 })
    const other = page(`${prefix}_other`, otherX, branchY, 'INTERNAL PAGE  •  level 1', ['nora@  │  zoe@'], { width: 330, accent: palette.blue })
    const otherLeaf = page(`${prefix}_other_leaf`, otherX, leafY, 'LEAF PAGE  •  level 0', ['nora@  →  (49002, 1)', 'zoe@   →  (49002, 2)'], { width: 350, accent: palette.mint })
    addLine(`${prefix}_root_branch`, -80, rootY + root.height / 2, branchX - 90, branchY - branch.height / 2, palette.blue)
    addLine(`${prefix}_root_other`, 80, rootY + root.height / 2, otherX + 90, branchY - other.height / 2, palette.blue)
    addLine(`${prefix}_branch_leaf`, branchX, branchY + branch.height / 2, branchX, leafY - leaf.height / 2, palette.mint)
    addLine(`${prefix}_other_leaf`, otherX, branchY + other.height / 2, otherX, leafY - otherLeaf.height / 2, palette.mint)
    if (tokenAt !== undefined) {
      addProbe(`${prefix}_probe`, [
        { frame: start + 18, x: portrait ? -190 : -370, y: rootY },
        { frame: tokenAt, x: 0, y: rootY },
        { frame: tokenAt + 42, x: branchX, y: branchY },
        { frame: tokenAt + 84, x: branchX, y: leafY },
      ])
    }
    return { rootY, branchY, leafY, branchX, leaf }
  }

  if (mode === 'million-rows') {
    header('A lookup request', 'Find one account in 1,000,000 rows')
    table('million_table', 0, 28, ['48288   mia@example.com', '48289   noah@example.com', '48290   olivia@example.com', '48291   alex@example.com', '48292   zoe@example.com'], 3, portrait ? 620 : 760)
    addText('million_query', "WHERE email = 'alex@example.com'", 0, portrait ? -275 : -220, portrait ? 700 : 780, 38, portrait ? 18 : 20, palette.purple, '700', start + 10)
    addText('million_badge', '1,000,000 rows', 0, portrait ? 315 : 305, 340, 36, 20, palette.muted, '700', start + 24)
  }

  if (mode === 'sequential-scan') {
    header('No index', 'Sequential scan • inspect rows in order')
    const y = portrait ? 10 : 20
    table('scan_table', 0, y, ['page 001  •  maria@example.com', 'page 002  •  noah@example.com', 'page 003  •  alex@example.com', 'page 004  •  zoe@example.com', '…  remaining pages still checked'], 2, portrait ? 640 : 800)
    addText('scan_counter', 'rows examined  →  1  •  2  •  3  •  4  •  …', 0, portrait ? 340 : 330, portrait ? 660 : 780, 38, portrait ? 17 : 20, palette.muted, '700', start + 20)
    addProbe('scan_cursor', [
      { frame: start + 16, x: portrait ? -278 : -365, y: y - 90 },
      { frame: start + 52, x: portrait ? -278 : -365, y: y - 45 },
      { frame: start + 88, x: portrait ? -278 : -365, y },
      { frame: start + 124, x: portrait ? -278 : -365, y: y + 45 },
      { frame: start + 160, x: portrait ? -278 : -365, y: y + 90 },
    ], palette.blue)
  }

  if (mode === 'index-intro') {
    header('Index = a route to the row', 'Sorted key → tuple identifier → heap row')
    const x = portrait ? 0 : -310
    page('intro_index', x, portrait ? -115 : 20, 'email_idx  •  sorted leaf', ['alex@  →  (48291, 6)', 'anna@  →  (48291, 7)', 'maria@ →  (48288, 4)'], { width: portrait ? 500 : 430, accent: palette.mint, highlight: 0 })
    table('intro_table', portrait ? 0 : 350, portrait ? 230 : 20, ['48290   olivia@example.com', '48291   alex@example.com', '48292   zoe@example.com'], 1, portrait ? 590 : 500)
    if (!portrait) addLine('intro_link', -90, 20, 92, 20, palette.gold, start + 20)
    else addLine('intro_link', 0, 10, 0, 105, palette.gold, start + 20)
    addProbe('intro_probe', [{ frame: start + 20, x: portrait ? 0 : 350, y: portrait ? 230 : 20 }, { frame: start + 78, x, y: portrait ? -115 : 20 }], palette.purple)
  }

  if (mode === 'btree-anatomy') {
    header('B-tree index', 'Sorted pages narrow the search range')
    btree('anatomy')
  }

  if (mode === 'btree-traversal') {
    header('Indexed lookup', 'One probe follows only the matching branch')
    const tree = btree('traversal', start + 48)
    const recordY = portrait ? 396 : 235
    const recordX = portrait ? 0 : 515
    addRect('record', recordX, recordY, portrait ? 530 : 320, 104, 'rgba(34,197,94,0.12)', palette.mint, 16, start + 122)
    addText('record_title', 'HEAP ROW  •  users', recordX, recordY - 19, portrait ? 490 : 290, 28, 15, palette.mint, '700', start + 122)
    addText('record_value', '48291   alex@example.com', recordX, recordY + 22, portrait ? 490 : 290, 30, 15, palette.text, '600', start + 122)
    addLine('leaf_to_row', tree.branchX + tree.leaf.width / 2, tree.leafY + 18, recordX - (portrait ? 0 : 170), recordY, palette.gold, start + 125)
  }

  if (mode === 'comparison') {
    header('Same query, different work', 'Table scan touches rows • B-tree touches a few pages')
    const top = portrait ? -180 : 25
    const leftX = portrait ? 0 : -410
    const rightX = portrait ? 0 : 410
    const topRight = portrait ? 210 : 25
    addText('compare_scan_title', 'SEQUENTIAL SCAN', leftX, top - (portrait ? 175 : 220), 340, 30, 18, palette.red, '700')
    table('compare_scan', leftX, top, ['row 1   •  no match', 'row 2   •  no match', 'row 3   •  alex@', 'row 4   •  still scan'], 2, portrait ? 590 : 560)
    addText('compare_scan_cost', 'many rows read', leftX, top + (portrait ? 172 : 185), 320, 30, 17, palette.red, '700', start + 70)
    addText('compare_index_title', 'B-TREE LOOKUP', rightX, topRight - (portrait ? 135 : 220), 340, 30, 18, palette.mint, '700', start + 12)
    page('compare_root', rightX, topRight - (portrait ? 45 : 95), 'ROOT', ['maria@  │  nora@'], { width: portrait ? 360 : 290, accent: palette.purple })
    page('compare_leaf', rightX, topRight + (portrait ? 90 : 120), 'LEAF', ['alex@  →  TID'], { width: portrait ? 360 : 290, accent: palette.mint, highlight: 0, at: start + 25 })
    addLine('compare_index_link', rightX, topRight - (portrait ? -8 : 35), rightX, topRight + (portrait ? 35 : 50), palette.mint, start + 30)
    addText('compare_index_cost', 'few pages read', rightX, topRight + (portrait ? 200 : 235), 320, 30, 17, palette.mint, '700', start + 85)
    addProbe('compare_probe', [{ frame: start + 30, x: rightX, y: topRight - (portrait ? 45 : 95) }, { frame: start + 84, x: rightX, y: topRight + (portrait ? 90 : 120) }], palette.purple)
  }

  if (mode === 'write-amplification') {
    header('Indexes have a write cost', 'A data change can update both the table and the index')
    const tableY = portrait ? -105 : 25
    const indexY = portrait ? 230 : 25
    table('write_table', portrait ? 0 : -360, tableY, ['48291   alex@old.example', '48291   alex@new.example'], 1, portrait ? 590 : 540)
    page('write_index', portrait ? 0 : 365, indexY, 'email_idx  •  leaf page', ['alex@old  →  remove', 'alex@new  →  insert'], { width: portrait ? 520 : 430, accent: palette.purple, highlight: 1 })
    addProbe('write_change', [{ frame: start + 58, x: portrait ? 0 : -360, y: tableY }, { frame: start + 108, x: portrait ? 0 : 365, y: indexY }], palette.purple)
    addText('write_badge', 'one change  →  two structures maintained', 0, portrait ? 390 : 310, portrait ? 680 : 850, 38, portrait ? 17 : 20, palette.gold, '700', start + 105)
  }

  if (mode === 'planner') {
    header('The planner chooses', 'Estimate cost first • use the cheaper plan')
    const narrow = { x: portrait ? -240 : -500, y: portrait ? -215 : -105 }
    const wide = { x: portrait ? 240 : -500, y: portrait ? -215 : 75 }
    const core = { x: 0, y: portrait ? 0 : -15 }
    const indexPlan = { x: portrait ? -240 : 430, y: portrait ? 175 : -105 }
    const scanPlan = { x: portrait ? 240 : 430, y: portrait ? 175 : 75 }
    const inputWidth = portrait ? 420 : 360
    const outputWidth = portrait ? 420 : 360
    addRect('planner_narrow', narrow.x, narrow.y, inputWidth, 76, 'rgba(96,165,250,0.12)', palette.blue, 14)
    addText('planner_narrow_text', 'email = alex@  •  few rows', narrow.x, narrow.y, inputWidth - 30, 36, 16, palette.text, '700')
    addRect('planner_wide', wide.x, wide.y, inputWidth, 76, 'rgba(96,165,250,0.12)', palette.blue, 14)
    addText('planner_wide_text', 'active = true  •  most rows', wide.x, wide.y, inputWidth - 30, 36, 16, palette.text, '700')
    addRect('planner_core', core.x, core.y, 230, 118, 'rgba(168,85,247,0.16)', palette.purple, 22, start + 20)
    addText('planner_core_title', 'QUERY\nPLANNER', core.x, core.y, 190, 76, 19, palette.purple, '700', start + 20)
    addLine('planner_one', portrait ? -240 : -315, narrow.y + (portrait ? 45 : 0), portrait ? -75 : -125, portrait ? -45 : -15, palette.blue, start + 22)
    addLine('planner_two', portrait ? 240 : -315, wide.y - (portrait ? 45 : 0), portrait ? 75 : -125, portrait ? -45 : -15, palette.blue, start + 22)
    addRect('planner_index_plan', indexPlan.x, indexPlan.y, outputWidth, 80, 'rgba(34,197,94,0.12)', palette.mint, 14, start + 62)
    addText('planner_index_text', 'selective  →  INDEX SCAN', indexPlan.x, indexPlan.y, outputWidth - 30, 40, 16, palette.mint, '700', start + 62)
    addRect('planner_scan_plan', scanPlan.x, scanPlan.y, outputWidth, 80, 'rgba(96,165,250,0.12)', palette.blue, 14, start + 78)
    addText('planner_scan_text', 'most rows  →  SEQ SCAN', scanPlan.x, scanPlan.y, outputWidth - 30, 40, 16, palette.blue, '700', start + 78)
    addLine('planner_index_line', portrait ? -70 : 125, portrait ? 50 : -15, portrait ? -125 : 230, indexPlan.y, palette.mint, start + 62)
    addLine('planner_scan_line', portrait ? 70 : 125, portrait ? 50 : -15, portrait ? 125 : 230, scanPlan.y, palette.blue, start + 78)
  }

  if (mode === 'takeaway') {
    header('Find the needle', 'Sorted pages lead directly to the matching row')
    const tree = btree('takeaway', start + 42)
    addText('takeaway_caption', 'root  →  branch  →  leaf  →  row', 0, portrait ? 410 : 350, portrait ? 680 : 860, 42, portrait ? 20 : 24, palette.gold, '700', start + 120)
    addText('takeaway_detail', 'less search work for selective queries', 0, portrait ? 454 : 395, portrait ? 700 : 860, 34, portrait ? 16 : 19, palette.muted, '600', start + 130)
    void tree
  }

  return layers
}
