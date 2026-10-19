import { describe, expect, it } from 'vitest'
import { markApplied, markVerified, noteStatus, openNotes, type ReviewNote } from './notes'

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
