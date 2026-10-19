import { mkdir, rename, rm, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { randomUUID } from 'node:crypto'

/**
 * Write a complete replacement beside the destination, then rename it into
 * place. Readers therefore see either the old valid JSON document or the new
 * one—not a partially-written file if a render or dev server is interrupted.
 */
export async function atomicWriteFile(path: string, content: string | Buffer) {
  await mkdir(dirname(path), { recursive: true })
  const temporary = `${path}.${randomUUID()}.tmp`
  try {
    await writeFile(temporary, content)
    await rename(temporary, path)
  } finally {
    await rm(temporary, { force: true }).catch(() => undefined)
  }
}
