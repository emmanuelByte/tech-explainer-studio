import { describe, expect, it } from 'vitest'
import { markApplied, markVerified, mergeReviewNotes, noteStatus, openNotes, type ReviewNote } from './notes'

const note = (id: string, extra: Partial<ReviewNote> = {}): ReviewNote => ({ id, sceneId: 's', frame: 0, text: id, createdAt: '2026-01-01', ...extra })
const now = '2026-10-19T00:00:00Z'

describe('review note resolution', () => {
  const notes = [note('a'), note('b'), note('c')]

  it('changes only the named notes', () => {
    const next = markApplied(notes, ['b'], { summary: 'Shortened the label', specHash: 'h1', now })
    expect(next.map(noteStatus)).toEqual(['pending', 'applied', 'pending'])
    expect(next[0]).toBe(notes[0])
    expect(openNotes(next).map((n) => n.id)).toEqual(['a', 'c'])
  })

  it('refuses bulk, unknown and undescribed changes', () => {
    expect(() => markApplied(notes, [], { summary: 'x', specHash: 'h', now })).toThrow('never changed in bulk')
    expect(() => markApplied(notes, ['zzz'], { summary: 'x', specHash: 'h', now })).toThrow('Unknown')
    expect(() => markApplied(notes, ['a'], { summary: ' ', specHash: 'h', now })).toThrow('Describe')
  })

  it('verifies only applied notes against the spec the correction was made on', () => {
    expect(() => markVerified(notes, ['a'], { evidence: 'saw it', specHash: 'h1', now })).toThrow('apply a correction')
    const applied = markApplied(notes, ['a'], { summary: 'fix', specHash: 'h1', now })
    expect(() => markVerified(applied, ['a'], { evidence: 'saw it', specHash: 'h2', now })).toThrow('spec changed')
    expect(() => markVerified(applied, ['a'], { evidence: '', specHash: 'h1', now })).toThrow('what was checked')
    const verified = markVerified(applied, ['a'], { evidence: 'still 02 shows it', specHash: 'h1', now })
    expect(verified.map(noteStatus)).toEqual(['verified', 'pending', 'pending'])
  })

  it('reads the legacy done flag as applied, never verified', () => {
    expect(noteStatus(note('x', { done: true }))).toBe('applied')
  })
})

describe('mergeReviewNotes', () => {
  const applied = markApplied([note('a')], ['a'], { summary: 'fix', specHash: 'h', now })[0]

  it('keeps agent-owned status when a stale client copy is saved', () => {
    const merged = mergeReviewNotes([applied, note('b')], [note('a'), note('b'), note('c')])
    expect(merged.map(noteStatus)).toEqual(['applied', 'pending', 'pending'])
    expect(merged[0].appliedSummary).toBe('fix')
  })

  it('never deletes a note just because the client did not send it', () => {
    expect(mergeReviewNotes([applied, note('b')], []).map((n) => n.id)).toEqual(['a', 'b'])
  })

  it('deletes only notes that are named and still pending', () => {
    expect(mergeReviewNotes([applied, note('b'), note('c')], [], ['a', 'b']).map((n) => n.id)).toEqual(['a', 'c'])
  })

  it('never lets a client create a note that is already applied or verified', () => {
    const forged = { ...note('z'), status: 'verified' as const, verification: 'trust me' }
    const [merged] = mergeReviewNotes([], [forged])
    expect(noteStatus(merged)).toBe('pending')
    expect(merged.verification).toBeUndefined()
  })
})
