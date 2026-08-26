# Project schema and migrations

Tech Explainer Studio persists a complete project as JSON. Every project now
has a top-level `schemaVersion`; the current version is **1**.

## Loading and saving

`src/domains/project/migrations.ts` is the single migration boundary:

```text
raw project JSON
  -> migrateProject()
  -> editor-specific sanitisation
  -> editor or Remotion renderer
```

The browser project loader, project import flow, local server save path,
history snapshots, and Remotion renderer all use this migration boundary.
Migration functions are pure: they clone input data and never mutate the
imported object.

## Version rules

- An unversioned MotionEditor project is version `0` and migrates to version
  `1` by adding `schemaVersion: 1`.
- A project whose version is newer than the editor supports is rejected. It is
  never silently downgraded or overwritten.
- Any future persisted-field change must increment
  `CURRENT_PROJECT_SCHEMA_VERSION`, add exactly one migration from the prior
  version, and include migration tests.
- Renderer-only defaults do not replace migrations. If a value becomes part of
  the project file contract, it must be introduced through this pipeline.

The empty tracked `data/assets/index.json` is a build seed for Remotion. All
real project files and imported asset files remain ignored by Git.
