import { useRef } from 'react'

/**
 * True when `a` and `b` hold the exact same elements, in the same order
 * (reference equality per element, not deep equality) — a plain, testable
 * predicate extracted from `useStableArray` below.
 */
export function sameArrayContents<T>(a: T[], b: T[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false
  }
  return true
}

/**
 * Returns a referentially-stable array: `next` is only "adopted" (its
 * identity passed through) when it actually differs in contents from the
 * previously-returned array; otherwise the previous array's identity is
 * reused. This matters for callers who filter a shared source array down to
 * a subset every render (e.g. `layersForScene(layers, scene)`) — `.filter()`
 * always allocates a brand-new array wrapper, even when the source array
 * changed for a reason unrelated to this subset (an edit to a different
 * scene's layer, say), so a plain `useMemo` keyed on that filtered array
 * would still see a "changed" dependency and invalidate every downstream
 * memo needlessly. `useStableArray` breaks that by comparing contents, not
 * just the wrapper's identity.
 */
export function useStableArray<T>(next: T[]): T[] {
  const ref = useRef<T[]>(next)
  if (!sameArrayContents(ref.current, next)) {
    ref.current = next
  }
  return ref.current
}
