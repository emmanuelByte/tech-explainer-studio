import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { atomicWriteFile } from './atomicFile'

describe('atomicWriteFile', () => {
  it('creates parent directories and replaces a complete document', async () => {
    const root = await mkdtemp(join(tmpdir(), 'tech-explainer-atomic-'))
    const target = join(root, 'nested', 'project.json')
    await atomicWriteFile(target, '{"revision":1}\n')
    await atomicWriteFile(target, '{"revision":2}\n')
    await expect(readFile(target, 'utf8')).resolves.toBe('{"revision":2}\n')
  })
})
