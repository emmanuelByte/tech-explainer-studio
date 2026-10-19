import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { join, relative } from 'node:path'

/** JSON with object keys sorted, so equal data always serialises identically. */
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`
  }
  return JSON.stringify(value) ?? 'null'
}

/** Short stable digest of any JSON-like inputs; used to decide whether a stage's output is still current. */
export function fingerprint(...parts: unknown[]) {
  return createHash('sha256').update(canonical(parts)).digest('hex').slice(0, 16)
}

async function* walk(dir: string): AsyncGenerator<string> {
  let entries
  try { entries = await readdir(dir, { withFileTypes: true }) } catch { return }
  for (const entry of entries.sort((a, b) => (a.name < b.name ? -1 : 1))) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) yield* walk(path)
    else yield path
  }
}

/**
 * Digest of the code that shapes an output (compiler, renderer, artwork), so a
 * change to it invalidates stages that depended on it. Tests are excluded.
 */
export async function sourceFingerprint(root: string, paths: string[]) {
  const hash = createHash('sha256')
  for (const path of paths) {
    const full = join(root, path)
    const files = path.match(/\.\w+$/) ? [full] : [...(await collect(full))]
    for (const file of files) {
      if (/\.test\.[tj]sx?$/.test(file)) continue
      hash.update(relative(root, file))
      try { hash.update(await readFile(file)) } catch { /* a listed file that is absent simply contributes nothing */ }
    }
  }
  return hash.digest('hex').slice(0, 16)
}

async function collect(dir: string) {
  const files: string[] = []
  for await (const file of walk(dir)) files.push(file)
  return files
}
