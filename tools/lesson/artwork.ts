import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { TECHNICAL_COMPONENT_KINDS, type TechnicalComponentKind } from '../../src/types'
import type { ComponentArtwork } from '../../src/domains/lesson-spec/compile'

const ARTWORK_FILES: Record<TechnicalComponentKind, string> = {
  client: 'clients/client-group.svg',
  'load-balancer': 'traffic-edge/load-balancer.svg',
  server: 'compute/application-server.svg',
  database: 'data-stores/database.svg',
  cache: 'data-stores/cache.svg',
  queue: 'messaging/queue.svg',
  cdn: 'traffic-edge/cdn.svg',
  'api-gateway': 'traffic-edge/api-gateway.svg',
  'object-storage': 'data-stores/object-storage.svg',
  worker: 'compute/worker.svg',
}

export const ARTWORK_DIR = ['src', 'domains', 'technical-components', 'assets']

export async function loadArtwork(root: string): Promise<ComponentArtwork> {
  const assets = resolve(root, ...ARTWORK_DIR)
  const entries = await Promise.all(
    TECHNICAL_COMPONENT_KINDS.map(async (kind) => [kind, await readFile(resolve(assets, ARTWORK_FILES[kind]), 'utf-8')] as const),
  )
  return Object.fromEntries(entries) as ComponentArtwork
}

