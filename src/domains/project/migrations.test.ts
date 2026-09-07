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

    expect(migrated.connectors?.[0]).toMatchObject({
      id: 'connection-1',
      routing: 'straight',
      lineStyle: 'solid',
      arrowStart: false,
      arrowEnd: true,
    })
  })

  it('preserves connector styles while filling version 8 defaults', () => {
    const migrated = migrateProject({
      ...legacyProject,
      schemaVersion: 7,
      connectors: [
        { id: 'default-link', sourceLayerId: 'a', targetLayerId: 'b' },
        { id: 'styled-link', sourceLayerId: 'a', targetLayerId: 'b', lineStyle: 'dashed', arrowStart: true, arrowEnd: false },
      ],
    })

    expect(migrated.connectors?.[0]).toMatchObject({ lineStyle: 'solid', arrowStart: false, arrowEnd: true })
    expect(migrated.connectors?.[1]).toMatchObject({ lineStyle: 'dashed', arrowStart: true, arrowEnd: false })
  })

  it('adds deterministic sketch defaults and path draw progress in version 9', () => {
    const migrated = migrateProject({
      ...legacyProject,
      schemaVersion: 8,
      layers: [{ id: 'path-1', keyframes: [{ frame: 0, easing: 'linear', props: { opacity: 1 } }] }],
      connectors: [{ id: 'connector-1' }],
    })

    expect(migrated.layers[0]).toMatchObject({
      sketchEnabled: false,
      sketchRoughness: 1,
      keyframes: [{ props: { opacity: 1, drawProgress: 1 } }],
    })
    expect(migrated.connectors?.[0]).toMatchObject({ sketchEnabled: false, sketchRoughness: 1 })
  })

  it('adds a centred identity camera track in version 10', () => {
    const migrated = migrateProject({ ...legacyProject, schemaVersion: 9 })
    expect(migrated.camera).toEqual({
      keyframes: [{ frame: 0, x: 960, y: 540, zoom: 1, easing: 'ease-in-out' }],
    })
  })

  it('adds narration roles, timed script defaults, and caption settings in version 11', () => {
    const migrated = migrateProject({
      ...legacyProject,
      schemaVersion: 10,
      layers: [{ id: 'voice', type: 'audio' }, { id: 'shape', type: 'rectangle' }],
      scenes: [{ id: 'intro', startFrame: 20, endFrame: 80 }],
      script: { rawText: 'Welcome', segments: [{ id: 'line', text: 'Welcome', sceneId: 'intro' }] },
    })
    expect(migrated.layers[0]).toMatchObject({ audioRole: 'generic' })
    expect(migrated.layers[1]).not.toHaveProperty('audioRole')
    expect(migrated.script?.segments[0]).toMatchObject({ startFrame: 20, endFrame: 80 })
    expect(migrated.captions).toEqual({ enabled: false, style: 'readable' })
  })

  it('adds reusable local voice settings in version 12', () => {
    const migrated = migrateProject({ ...legacyProject, schemaVersion: 11 })
    expect(migrated.localVoice).toEqual({
      baseVoiceId: '',
      exaggeration: 0.5,
      cfgWeight: 0.5,
      pauseFrames: 6,
    })
  })

  it('rejects malformed and future project versions without downgrading them', () => {
    expect(() => migrateProject([])).toThrow(ProjectMigrationError)
    expect(() => migrateProject({ ...legacyProject, schemaVersion: -1 })).toThrow(ProjectMigrationError)
    expect(() => migrateProject({ ...legacyProject, schemaVersion: CURRENT_PROJECT_SCHEMA_VERSION + 1 }))
      .toThrow('newer than this editor supports')
  })
})
