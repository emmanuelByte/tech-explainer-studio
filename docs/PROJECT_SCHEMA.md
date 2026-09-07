# Project schema and migrations

Tech Explainer Studio persists a complete project as JSON. Every project now
has a top-level `schemaVersion`; the current version is **11**.

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

- An unversioned MotionEditor project is version `0`. The migration chain adds
  explicit script/scenes, technical-component metadata, connector data,
  connector routing, connector line and arrowhead styles, and, in version `9`,
  deterministic sketch settings plus keyframeable path draw progress, and, in
  version `10`, a centred identity video-camera track.
  Version `11` adds audio roles, fills missing script timing from linked scenes,
  and introduces caption presentation settings.
- Version `8` gives older connectors the visual defaults they already had:
  solid line, no start arrow, and an end arrow.
- Version `9` keeps older visuals unchanged by disabling sketch treatment and
  setting existing keyframes to fully drawn paths.
- Version `10` keeps older compositions unchanged by adding one identity camera
  keyframe centred on the project canvas.
- Version `11` marks existing audio as generic, derives missing segment timing
  from linked scenes, and keeps captions disabled until the creator enables them.
- A project whose version is newer than the editor supports is rejected. It is
  never silently downgraded or overwritten.
- Any future persisted-field change must increment
  `CURRENT_PROJECT_SCHEMA_VERSION`, add exactly one migration from the prior
  version, and include migration tests.
- Renderer-only defaults do not replace migrations. If a value becomes part of
  the project file contract, it must be introduced through this pipeline.

The empty tracked `data/assets/index.json` is a build seed for Remotion. All
real project files and imported asset files remain ignored by Git.
