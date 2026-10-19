import { validateLessonSpec } from './validate'
import type { LessonSpec, SpecEdge, SpecNode, SpecScene } from './types'

type PatchFields<T> = Partial<Omit<T, 'id'>>

/** A small, semantic patch format intended for review-driven lesson revisions. */
export interface LessonSpecPatch {
  version: 1
  /** Optional guard against applying a patch to the wrong lesson. */
  lessonId?: string
  lesson?: Partial<Pick<LessonSpec, 'title' | 'intro' | 'outro'>>
  scenes?: Record<string, PatchFields<SpecScene>>
  nodes?: Record<string, PatchFields<SpecNode>>
  edges?: Record<string, PatchFields<SpecEdge>>
}

export class LessonSpecPatchError extends Error {
  constructor(public readonly issues: string[]) {
    super(`Invalid lesson patch:\n${issues.map((issue) => `  ${issue}`).join('\n')}`)
  }
}

const LESSON_FIELDS = new Set(['title', 'intro', 'outro'])
const SCENE_FIELDS = new Set(['title', 'narration', 'durationSeconds', 'reveal', 'hide', 'emphasize', 'flow', 'card', 'comparison', 'focus'])
const NODE_FIELDS = new Set(['kind', 'label'])
const EDGE_FIELDS = new Set(['from', 'to', 'label', 'style'])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function patchObject(value: unknown, path: string, issues: string[]) {
  if (!isRecord(value)) {
    issues.push(`${path} must be an object.`)
    return undefined
  }
  return value
}

function applyFields(target: Record<string, unknown>, patch: unknown, allowed: Set<string>, path: string, issues: string[]) {
  const values = patchObject(patch, path, issues)
  if (!values) return
  for (const [field, value] of Object.entries(values)) {
    if (!allowed.has(field)) {
      issues.push(`${path}.${field} is not patchable.`)
      continue
    }
    target[field] = value
  }
}

function applyById<T extends { id: string }>(items: T[], patches: unknown, allowed: Set<string>, path: string, issues: string[]) {
  if (patches === undefined) return
  const updates = patchObject(patches, path, issues)
  if (!updates) return
  for (const [id, patch] of Object.entries(updates)) {
    const item = items.find((candidate) => candidate.id === id)
    if (!item) {
      issues.push(`${path}.${id} does not name an existing stable id.`)
      continue
    }
    applyFields(item as unknown as Record<string, unknown>, patch, allowed, `${path}.${id}`, issues)
  }
}

/**
 * Applies a review-oriented semantic patch without mutating the source spec.
 * The finished result passes the normal lesson validator, so bad references or
 * reveal orders cannot be written into a spec by this helper.
 */
export function applyLessonSpecPatch(source: LessonSpec, input: unknown): LessonSpec {
  const issues: string[] = []
  const patch = patchObject(input, 'patch', issues)
  if (!patch) throw new LessonSpecPatchError(issues)
  if (patch.version !== 1) issues.push('patch.version must be 1.')
  if (patch.lessonId !== undefined && patch.lessonId !== source.id) {
    issues.push(`patch.lessonId "${String(patch.lessonId)}" does not match lesson id "${source.id}".`)
  }
  for (const field of Object.keys(patch)) {
    if (!['version', 'lessonId', 'lesson', 'scenes', 'nodes', 'edges'].includes(field)) issues.push(`patch.${field} is not supported.`)
  }
  if (issues.length) throw new LessonSpecPatchError(issues)

  const result = structuredClone(source)
  if (patch.lesson !== undefined) applyFields(result as unknown as Record<string, unknown>, patch.lesson, LESSON_FIELDS, 'patch.lesson', issues)
  applyById(result.scenes, patch.scenes, SCENE_FIELDS, 'patch.scenes', issues)
  applyById(result.nodes, patch.nodes, NODE_FIELDS, 'patch.nodes', issues)
  applyById(result.edges, patch.edges, EDGE_FIELDS, 'patch.edges', issues)
  if (issues.length) throw new LessonSpecPatchError(issues)

  const validationIssues = validateLessonSpec(result)
  if (validationIssues.length) {
    throw new LessonSpecPatchError(validationIssues.map((issue) => `${issue.path || '(root)'}: ${issue.message}`))
  }
  return result
}
