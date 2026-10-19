/**
 * Review-note lifecycle. A note is `pending` until the AI has changed the spec
 * for it (`applied`), and becomes `verified` only after the rebuilt output was
 * checked against the correction. Transitions are explicit and per note id.
 */
export type NoteStatus = 'pending' | 'applied' | 'verified'

export interface ReviewNote {
  id: string
  sceneId: string
  frame: number
  text: string
  createdAt: string
  status?: NoteStatus
  /** Legacy flag from before statuses existed; read as `applied`, never as `verified`. */
  done?: boolean
  /** What was changed in the spec, and the spec fingerprint that change produced. */
  appliedSummary?: string
  appliedAt?: string
  appliedSpecHash?: string
  /** What was checked in the rendered output, and the fingerprint it was checked against. */
  verification?: string
  verifiedAt?: string
}

export class NoteError extends Error {}

export function noteStatus(note: Pick<ReviewNote, 'status' | 'done'>): NoteStatus {
  return note.status ?? (note.done ? 'applied' : 'pending')
}

function select(notes: ReviewNote[], ids: string[]) {
  if (!ids.length) throw new NoteError('Name the note id(s) to update; notes are never changed in bulk.')
  const unknown = ids.filter((id) => !notes.some((note) => note.id === id))
  if (unknown.length) throw new NoteError(`Unknown note id(s): ${unknown.join(', ')}.`)
  return new Set(ids)
}

/** Records that the spec was changed for these notes. `specHash` fingerprints the spec after the change. */
export function markApplied(notes: ReviewNote[], ids: string[], change: { summary: string; specHash: string; now: string }): ReviewNote[] {
  if (!change.summary.trim()) throw new NoteError('Describe what was changed (--summary).')
  const chosen = select(notes, ids)
  return notes.map((note) => {
    if (!chosen.has(note.id)) return note
    if (noteStatus(note) === 'verified') throw new NoteError(`Note ${note.id} is already verified.`)
    const { done: _legacy, ...rest } = note
    return { ...rest, status: 'applied', appliedSummary: change.summary.trim(), appliedAt: change.now, appliedSpecHash: change.specHash }
  })
}

/**
 * Marks applied notes verified. The spec must still be the one the correction
 * was applied to, so a later unrelated edit cannot ride along on an old check.
 */
export function markVerified(notes: ReviewNote[], ids: string[], check: { evidence: string; specHash: string; now: string }): ReviewNote[] {
  if (!check.evidence.trim()) throw new NoteError('Say what was checked in the render (--evidence).')
  const chosen = select(notes, ids)
  return notes.map((note) => {
    if (!chosen.has(note.id)) return note
    if (noteStatus(note) !== 'applied') throw new NoteError(`Note ${note.id} is ${noteStatus(note)}; apply a correction to it before verifying.`)
    if (!note.appliedSpecHash) throw new NoteError(`Note ${note.id} has no recorded correction; re-apply it with --apply.`)
    if (note.appliedSpecHash !== check.specHash) throw new NoteError(`The spec changed after note ${note.id} was applied. Re-apply it, then verify the new build.`)
    return { ...note, status: 'verified', verification: check.evidence.trim(), verifiedAt: check.now }
  })
}

export const openNotes = (notes: ReviewNote[]) => notes.filter((note) => noteStatus(note) === 'pending')

/**
 * Reconciles the notes a client sends with those on disk. The client owns what a
 * note says and whether it exists while pending; the agent owns status and its
 * evidence. So an older client copy cannot reset an applied or verified note,
 * and notes that were handled are never silently dropped.
 */
export function mergeReviewNotes(onDisk: ReviewNote[], incoming: ReviewNote[]): ReviewNote[] {
  const stored = new Map(onDisk.map((note) => [note.id, note]))
  const merged: ReviewNote[] = []
  for (const note of incoming) {
    const existing = stored.get(note.id)
    if (!existing) {
      // A new note always starts pending, whatever the client claims.
      const { status: _s, done: _d, appliedSummary: _a, appliedAt: _t, appliedSpecHash: _h, verification: _v, verifiedAt: _w, ...fresh } = note
      merged.push(fresh)
    } else merged.push(existing)
    stored.delete(note.id)
  }
  // Present on disk but absent from the client: removed by the user if still pending, otherwise kept.
  for (const note of stored.values()) if (noteStatus(note) !== 'pending') merged.push(note)
  return merged
}
