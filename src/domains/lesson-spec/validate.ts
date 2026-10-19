import { TECHNICAL_COMPONENT_KINDS } from '../../types'
import { narrationCueProblems, parseNarration } from './narration'
import { CARD_LIMITS, COMPARISON_LIMITS, SPEC_DEFAULTS, TITLE_LIMITS, type LessonSpec, type SpecIssue } from './types'

const KINDS = new Set<string>(TECHNICAL_COMPONENT_KINDS)
const ID_PATTERN = /^[a-z0-9][a-z0-9_-]*$/

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

/** Structural and referential validation. Returns every problem, not just the first. */
export function validateLessonSpec(input: unknown): SpecIssue[] {
  const issues: SpecIssue[] = []
  const add = (path: string, message: string) => issues.push({ path, message })

  if (!isRecord(input)) return [{ path: '', message: 'Spec must be a JSON object.' }]
  if (input.version !== 1) add('version', 'Must be 1.')
  if (typeof input.id !== 'string' || !ID_PATTERN.test(input.id)) add('id', 'Required lowercase slug (a-z, 0-9, - or _).')
  if (typeof input.title !== 'string' || !input.title.trim()) add('title', 'Required.')

  if (input.canvas !== undefined) {
    if (!isRecord(input.canvas)) add('canvas', 'Must be an object.')
    else {
      for (const key of ['width', 'height', 'fps'] as const) {
        const value = input.canvas[key]
        if (value !== undefined && (typeof value !== 'number' || !Number.isInteger(value) || value <= 0)) {
          add(`canvas.${key}`, 'Must be a positive integer.')
        }
      }
    }
  }

  for (const key of ['intro', 'outro'] as const) {
    const value = input[key]
    if (value === undefined) continue
    if (!isRecord(value)) { add(key, 'Must be an object.'); continue }
    const text = key === 'intro' ? value.subtitle : value.text
    const field = key === 'intro' ? 'subtitle' : 'text'
    if (key === 'outro' && (typeof text !== 'string' || !text.trim())) add(`${key}.text`, 'Required.')
    else if (text !== undefined && (typeof text !== 'string' || text.length > TITLE_LIMITS.subtitle)) add(`${key}.${field}`, `Text of ${TITLE_LIMITS.subtitle} characters or fewer.`)
    const seconds = value.seconds
    if (seconds !== undefined && (typeof seconds !== 'number' || seconds < TITLE_LIMITS.seconds[0] || seconds > TITLE_LIMITS.seconds[1])) {
      add(`${key}.seconds`, `A number from ${TITLE_LIMITS.seconds[0]} to ${TITLE_LIMITS.seconds[1]}.`)
    }
  }
  if (typeof input.title === 'string' && input.title.length > TITLE_LIMITS.title) add('title', `Text of ${TITLE_LIMITS.title} characters or fewer.`)

  const ids = new Map<string, 'node' | 'edge'>()
  const nodes = Array.isArray(input.nodes) ? input.nodes : null
  const edges = Array.isArray(input.edges) ? input.edges : null
  if (!nodes || !nodes.length) add('nodes', 'Must be a non-empty array.')
  if (!edges) add('edges', 'Must be an array (may be empty).')

  nodes?.forEach((node, index) => {
    const path = `nodes[${index}]`
    if (!isRecord(node)) return add(path, 'Must be an object.')
    if (typeof node.id !== 'string' || !ID_PATTERN.test(node.id)) add(`${path}.id`, 'Required lowercase slug.')
    else if (ids.has(node.id)) add(`${path}.id`, `Duplicate id "${node.id}".`)
    else ids.set(node.id, 'node')
    if (typeof node.kind !== 'string' || !KINDS.has(node.kind)) add(`${path}.kind`, `Must be one of: ${[...KINDS].join(', ')}.`)
    if (typeof node.label !== 'string' || !node.label.trim()) add(`${path}.label`, 'Required.')
    else if (node.label.length > 16) add(`${path}.label`, 'Keep labels to 16 characters or fewer so they fit the component.')
  })

  edges?.forEach((edge, index) => {
    const path = `edges[${index}]`
    if (!isRecord(edge)) return add(path, 'Must be an object.')
    if (typeof edge.id !== 'string' || !ID_PATTERN.test(edge.id)) add(`${path}.id`, 'Required lowercase slug.')
    else if (ids.has(edge.id)) add(`${path}.id`, `Duplicate id "${edge.id}".`)
    else ids.set(edge.id, 'edge')
    for (const end of ['from', 'to'] as const) {
      const value = edge[end]
      if (typeof value !== 'string') add(`${path}.${end}`, 'Required node id.')
    }
    if (edge.style !== undefined && edge.style !== 'solid' && edge.style !== 'dashed') add(`${path}.style`, 'Must be "solid" or "dashed".')
    if (edge.label !== undefined && (typeof edge.label !== 'string' || edge.label.length > 28)) add(`${path}.label`, 'Text of 28 characters or fewer.')
  })

  edges?.forEach((edge, index) => {
    if (!isRecord(edge)) return
    for (const end of ['from', 'to'] as const) {
      const value = edge[end]
      if (typeof value === 'string' && ids.get(value) !== 'node') add(`edges[${index}].${end}`, `"${value}" is not a node id.`)
    }
    if (edge.from === edge.to) add(`edges[${index}]`, 'An edge cannot connect a node to itself.')
  })

  const scenes = Array.isArray(input.scenes) ? input.scenes : null
  if (!scenes || !scenes.length) add('scenes', 'Must be a non-empty array.')
  const sceneIds = new Set<string>()
  const revealed = new Set<string>()
  const hidden = new Set<string>()
  const overlayIds = new Set<string>()
  const flowing = new Set<string>()
  scenes?.forEach((scene, index) => {
    const path = `scenes[${index}]`
    if (!isRecord(scene)) return add(path, 'Must be an object.')
    if (typeof scene.id !== 'string' || !ID_PATTERN.test(scene.id)) add(`${path}.id`, 'Required lowercase slug.')
    else if (sceneIds.has(scene.id)) add(`${path}.id`, `Duplicate scene id "${scene.id}".`)
    else sceneIds.add(scene.id)
    if (typeof scene.title !== 'string' || !scene.title.trim()) add(`${path}.title`, 'Required.')
    if (typeof scene.narration !== 'string' || !scene.narration.trim()) add(`${path}.narration`, 'Required.')
    if (scene.durationSeconds !== undefined && (typeof scene.durationSeconds !== 'number' || scene.durationSeconds < 1)) {
      add(`${path}.durationSeconds`, 'Must be a number of at least 1.')
    }
    const reveal = scene.reveal
    if (reveal !== undefined) {
      if (!Array.isArray(reveal)) add(`${path}.reveal`, 'Must be an array of ids.')
      else reveal.forEach((id, i) => {
        if (typeof id !== 'string' || !ids.has(id)) return add(`${path}.reveal[${i}]`, `Unknown id "${String(id)}".`)
        if (revealed.has(id)) return add(`${path}.reveal[${i}]`, `"${id}" is already revealed in an earlier scene or earlier in this one.`)
        revealed.add(id)
      })
    }
    const overlayCueIds: string[] = []
    if (scene.card !== undefined) {
      const card = scene.card
      if (!isRecord(card)) add(`${path}.card`, 'Must be an object.')
      else {
        if (typeof card.id !== 'string' || !ID_PATTERN.test(card.id)) add(`${path}.card.id`, 'Required lowercase slug.')
        else if (ids.has(card.id) || overlayIds.has(card.id)) add(`${path}.card.id`, `Duplicate id "${card.id}".`)
        else overlayIds.add(card.id)
        if (card.title !== undefined && (typeof card.title !== 'string' || card.title.length > CARD_LIMITS.titleLength)) {
          add(`${path}.card.title`, `Text of ${CARD_LIMITS.titleLength} characters or fewer.`)
        }
        const lines = card.lines
        if (!Array.isArray(lines) || !lines.length || lines.length > CARD_LIMITS.lines) {
          add(`${path}.card.lines`, `Must be 1 to ${CARD_LIMITS.lines} lines.`)
        } else {
          lines.forEach((line, i) => {
            if (typeof line !== 'string' || line.length > CARD_LIMITS.lineLength) {
              add(`${path}.card.lines[${i}]`, `Text of ${CARD_LIMITS.lineLength} characters or fewer.`)
            }
          })
          if (typeof card.id === 'string') lines.forEach((_, i) => overlayCueIds.push(`${card.id}.${i + 1}`))
        }
      }
    }
    if (scene.comparison !== undefined) {
      if (scene.card !== undefined) add(`${path}.comparison`, 'Use either card or comparison in a scene, not both.')
      const comparison = scene.comparison
      if (!isRecord(comparison)) add(`${path}.comparison`, 'Must be an object.')
      else {
        if (typeof comparison.id !== 'string' || !ID_PATTERN.test(comparison.id)) add(`${path}.comparison.id`, 'Required lowercase slug.')
        else if (ids.has(comparison.id) || overlayIds.has(comparison.id)) add(`${path}.comparison.id`, `Duplicate id "${comparison.id}".`)
        else overlayIds.add(comparison.id)
        for (const side of ['left', 'right'] as const) {
          const value = comparison[side]
          const sidePath = `${path}.comparison.${side}`
          if (!isRecord(value)) { add(sidePath, 'Must be an object.'); continue }
          if (typeof value.title !== 'string' || !value.title.trim() || value.title.length > COMPARISON_LIMITS.titleLength) {
            add(`${sidePath}.title`, `Required text of ${COMPARISON_LIMITS.titleLength} characters or fewer.`)
          }
          const lines = value.lines
          if (!Array.isArray(lines) || !lines.length || lines.length > COMPARISON_LIMITS.lines) {
            add(`${sidePath}.lines`, `Must be 1 to ${COMPARISON_LIMITS.lines} lines.`)
          } else {
            lines.forEach((line, i) => {
              if (typeof line !== 'string' || line.length > COMPARISON_LIMITS.lineLength) {
                add(`${sidePath}.lines[${i}]`, `Text of ${COMPARISON_LIMITS.lineLength} characters or fewer.`)
              }
            })
            if (typeof comparison.id === 'string') lines.forEach((_, i) => overlayCueIds.push(`${comparison.id}.${side}.${i + 1}`))
          }
        }
      }
    }
    const extraCueIds: string[] = []
    if (scene.emphasize !== undefined) {
      if (!Array.isArray(scene.emphasize)) add(`${path}.emphasize`, 'Must be an array of node ids.')
      else scene.emphasize.forEach((id, i) => {
        const here = Array.isArray(scene.reveal) && scene.reveal.includes(id)
        if (typeof id !== 'string' || ids.get(id) !== 'node') add(`${path}.emphasize[${i}]`, `"${String(id)}" is not a node id.`)
        else if (!revealed.has(id) && !here) add(`${path}.emphasize[${i}]`, `"${id}" is not revealed yet.`)
        else extraCueIds.push(`emphasize:${id}`)
      })
    }
    if (scene.flow !== undefined) {
      if (!Array.isArray(scene.flow)) add(`${path}.flow`, 'Must be an array of edge ids.')
      else scene.flow.forEach((id, i) => {
        const here = Array.isArray(scene.reveal) && scene.reveal.includes(id)
        if (typeof id !== 'string' || ids.get(id) !== 'edge') add(`${path}.flow[${i}]`, `"${String(id)}" is not an edge id.`)
        else if (!revealed.has(id) && !here) add(`${path}.flow[${i}]`, `"${id}" is not revealed yet.`)
        else if (flowing.has(id)) add(`${path}.flow[${i}]`, `"${id}" already flows in an earlier scene (an edge can have one flow range).`)
        else { flowing.add(id); extraCueIds.push(`flow:${id}`) }
      })
    }
    const hide = scene.hide
    if (hide !== undefined) {
      if (!Array.isArray(hide)) add(`${path}.hide`, 'Must be an array of ids.')
      else hide.forEach((id, i) => {
        if (typeof id !== 'string' || !ids.has(id)) return add(`${path}.hide[${i}]`, `Unknown id "${String(id)}".`)
        if (!revealed.has(id) || (Array.isArray(reveal) && reveal.includes(id))) {
          return add(`${path}.hide[${i}]`, `"${id}" must be revealed in an earlier scene before it can be hidden.`)
        }
        if (hidden.has(id)) return add(`${path}.hide[${i}]`, `"${id}" is already hidden.`)
        hidden.add(id)
      })
    }
    if (typeof scene.narration === 'string' && scene.narration.trim()) {
      for (const problem of narrationCueProblems(scene.narration)) add(`${path}.narration`, problem)
      const parsed = parseNarration(scene.narration)
      if (!parsed.plain) add(`${path}.narration`, 'Must contain spoken text, not only cues.')
      const allowed = new Set<string>([
        ...(Array.isArray(scene.reveal) ? scene.reveal : []),
        ...(Array.isArray(scene.hide) ? scene.hide : []),
        ...overlayCueIds,
        ...extraCueIds,
      ].filter((id): id is string => typeof id === 'string'))
      const seen = new Set<string>()
      for (const cue of parsed.cues) {
        if (!allowed.has(cue.id)) add(`${path}.narration`, `Cue "[[${cue.id}]]" is not in this scene's reveal, hide or overlay list.`)
        else if (seen.has(cue.id)) add(`${path}.narration`, `Cue "[[${cue.id}]]" appears more than once.`)
        seen.add(cue.id)
      }
    }
    const focus = scene.focus
    if (focus !== undefined) {
      if (!Array.isArray(focus) || !focus.length) add(`${path}.focus`, 'Must be a non-empty array of node ids.')
      else focus.forEach((id, i) => {
        if (typeof id !== 'string' || ids.get(id) !== 'node') add(`${path}.focus[${i}]`, `"${String(id)}" is not a node id.`)
        else if (hidden.has(id)) add(`${path}.focus[${i}]`, `"${id}" is hidden by this or an earlier scene.`)
      })
    }
  })

  // Every node and edge must be shown by some scene, or it would never appear.
  for (const [id] of ids) {
    if (!revealed.has(id)) add('scenes', `"${id}" is declared but never revealed by any scene.`)
  }

  // An edge can only appear after both of its nodes.
  if (!issues.length && scenes && edges) {
    const shown = new Set<string>()
    const gone = new Set<string>()
    for (const scene of scenes as Array<{ reveal?: string[]; hide?: string[] }>) {
      for (const id of scene.hide ?? []) gone.add(id)
      for (const id of scene.reveal ?? []) {
        const edge = (edges as Array<{ id: string; from: string; to: string }>).find((candidate) => candidate.id === id)
        if (edge && (!shown.has(edge.from) || !shown.has(edge.to))) {
          add('scenes', `Edge "${id}" is revealed before both its nodes ("${edge.from}", "${edge.to}").`)
        } else if (edge && (gone.has(edge.from) || gone.has(edge.to))) {
          add('scenes', `Edge "${id}" is revealed after one of its nodes was hidden.`)
        }
        shown.add(id)
      }
    }
  }

  const canvas = isRecord(input.canvas) ? input.canvas : {}
  const width = typeof canvas.width === 'number' ? canvas.width : SPEC_DEFAULTS.width
  if (nodes && !issues.length) {
    const ranks = rankCount(input as unknown as LessonSpec)
    if (ranks === null) add('edges', 'Edges form a cycle; the layout needs a directed acyclic graph.')
    else if ((ranks - 1) * 400 + 240 + 80 > width) add('nodes', `The graph is ${ranks} columns deep and will not fit a ${width}px canvas.`)
  }

  return issues
}

/** Number of left-to-right columns, or null when the edges contain a cycle. */
export function rankCount(spec: Pick<LessonSpec, 'nodes' | 'edges'>): number | null {
  const ranks = computeRanks(spec)
  if (!ranks) return null
  return Math.max(...ranks.values()) + 1
}

/** Longest-path ranking; null on a cycle. */
export function computeRanks(spec: Pick<LessonSpec, 'nodes' | 'edges'>): Map<string, number> | null {
  const rank = new Map<string, number>(spec.nodes.map((node) => [node.id, 0]))
  for (let pass = 0; pass <= spec.nodes.length; pass += 1) {
    let changed = false
    for (const edge of spec.edges) {
      const next = (rank.get(edge.from) ?? 0) + 1
      if (next > (rank.get(edge.to) ?? 0)) {
        rank.set(edge.to, next)
        changed = true
      }
    }
    if (!changed) return rank
  }
  return null
}
