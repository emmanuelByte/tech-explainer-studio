import type { MotionProject } from '../../types'

/**
 * Bump this value whenever the persisted MotionProject shape changes.
 * Projects are migrated one version at a time so an old file never relies on
 * incidental UI sanitisation to remain usable.
 */
export const CURRENT_PROJECT_SCHEMA_VERSION = 1

type ProjectRecord = Record<string, unknown>

export class ProjectMigrationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ProjectMigrationError'
  }
}

function isProjectRecord(value: unknown): value is ProjectRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function cloneProjectRecord(value: ProjectRecord): ProjectRecord {
  return structuredClone(value)
}

function schemaVersionOf(project: ProjectRecord): number {
  const version = project.schemaVersion
  if (version === undefined) return 0
  if (typeof version !== 'number' || !Number.isSafeInteger(version) || version < 0) {
    throw new ProjectMigrationError('Project schemaVersion must be a non-negative integer.')
  }
  return version
}

type ProjectMigration = {
  from: number
  to: number
  migrate: (project: ProjectRecord) => ProjectRecord
}

const PROJECT_MIGRATIONS: ProjectMigration[] = [
  {
    from: 0,
    to: 1,
    migrate: (project) => ({ ...project, schemaVersion: 1 }),
  },
]

/**
 * Migrates a persisted project without changing its domain data in place.
 * Validation/sanitisation that depends on editor defaults remains in the
 * project-storage boundary; this module only manages explicit schema changes.
 */
export function migrateProject(rawProject: unknown): MotionProject {
  if (!isProjectRecord(rawProject)) {
    throw new ProjectMigrationError('Project data must be a JSON object.')
  }

  let project = cloneProjectRecord(rawProject)
  let version = schemaVersionOf(project)

  if (version > CURRENT_PROJECT_SCHEMA_VERSION) {
    throw new ProjectMigrationError(
      `Project schema version ${version} is newer than this editor supports (${CURRENT_PROJECT_SCHEMA_VERSION}).`,
    )
  }

  while (version < CURRENT_PROJECT_SCHEMA_VERSION) {
    const migration = PROJECT_MIGRATIONS.find((candidate) => candidate.from === version)
    if (!migration) {
      throw new ProjectMigrationError(`No migration is registered for project schema version ${version}.`)
    }
    project = migration.migrate(project)
    version = migration.to
  }

  return project as unknown as MotionProject
}
