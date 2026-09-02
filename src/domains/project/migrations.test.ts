import { describe, expect, it } from 'vitest'
import {
  CURRENT_PROJECT_SCHEMA_VERSION,
  ProjectMigrationError,
  migrateProject,
} from './migrations'

const legacyProject = {
  id: 'project-1',
  name: 'Legacy project',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  canvas: {
    width: 1920,
    height: 1080,
    fps: 30,
    durationFrames: 300,
    backgroundColor: '#111111',
    presetName: 'YouTube',
  },
  layers: [],
  guides: [],
  timeline: { zoom: 1, scrollX: 0 },
  editor: { zoom: 1, panX: 0, panY: 0, selectedLayerIds: [], playheadFrame: 0 },
}

describe('migrateProject', () => {
  it('migrates unversioned projects without mutating their input', () => {
    const raw = structuredClone(legacyProject)

    const migrated = migrateProject(raw)

    expect(migrated.schemaVersion).toBe(CURRENT_PROJECT_SCHEMA_VERSION)
    expect(migrated.id).toBe(raw.id)
    expect(raw).not.toHaveProperty('schemaVersion')
  })

  it('preserves a project already on the current schema', () => {
    const raw = {
      ...legacyProject,
      schemaVersion: CURRENT_PROJECT_SCHEMA_VERSION,
      script: { rawText: '', segments: [] },
      scenes: [],
    }

    expect(migrateProject(raw)).toEqual(raw)
  })

  it('adds empty script and scene domains to version 1 projects', () => {
    const migrated = migrateProject({ ...legacyProject, schemaVersion: 1 })

    expect(migrated).toMatchObject({
      schemaVersion: CURRENT_PROJECT_SCHEMA_VERSION,
      script: { rawText: '', segments: [] },
      scenes: [],
    })
  })

  it('gives existing connectors the deterministic straight routing default', () => {
    const migrated = migrateProject({
      ...legacyProject,
      schemaVersion: 6,
      connectors: [{ id: 'connection-1', sourceLayerId: 'source', targetLayerId: 'target', sourcePort: 'right', targetPort: 'left', color: '#60a5fa', strokeWidth: 4 }],
    })

    expect(migrated.connectors?.[0]).toMatchObject({ id: 'connection-1', routing: 'straight' })
  })

  it('advances version 7 projects for the expanded technical component catalog', () => {
    const messagingLayer = {
      id: 'queue-1',
      type: 'group',
      technicalComponent: { kind: 'queue', version: 1 },
    }
    const raw = {
      ...legacyProject,
      schemaVersion: 7,
      script: { rawText: '', segments: [] },
      scenes: [],
      connectors: [],
      layers: [messagingLayer],
    }

    expect(migrateProject(raw)).toMatchObject({
      schemaVersion: 8,
      layers: [messagingLayer],
    })
  })

  it('rejects malformed and future project versions without downgrading them', () => {
    expect(() => migrateProject([])).toThrow(ProjectMigrationError)
    expect(() => migrateProject({ ...legacyProject, schemaVersion: -1 })).toThrow(ProjectMigrationError)
    expect(() => migrateProject({ ...legacyProject, schemaVersion: CURRENT_PROJECT_SCHEMA_VERSION + 1 }))
      .toThrow('newer than this editor supports')
  })
})
