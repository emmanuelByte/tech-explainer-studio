# Tech Explainer Studio — Implementation Roadmap

## Purpose

This is the execution roadmap for evolving the MotionEditor fork into Tech
Explainer Studio. It complements [the technical implementation plan](../IMPLEMENTATION.md):

- this document defines **what to deliver, in what order, and how to accept it**;
- `IMPLEMENTATION.md` defines the detailed architecture and behavior required by
  each domain;
- `PRODUCT_VISION.md` defines the user outcome and must win if a scope decision
  conflicts with an implementation convenience.

The canonical product proof is one fully editable **Load Balancer explainer**.
No phase is complete merely because the UI looks plausible; its exit criteria
must work in a saved project and in a rendered video.

## Product boundary

V1 is a local-first, manual-first editor for technical explainers. It must be
better than generic editors at diagram-based lessons, not broader than them.

In scope:

- editable technical diagrams, timed scenes, animation, camera, narration and
  captions;
- deterministic Remotion preview/export from one project model;
- landscape and vertical lesson output;
- optional AI assistance that produces normal editable project data.

Out of scope until after V1:

- accounts, collaboration, hosted projects, billing or a marketplace;
- broad social-video templates and non-technical editing features;
- automatic script-to-final-video generation;
- cloud-provider icon packs before their licenses and trademarks are reviewed.

## Delivery sequence

| Phase | Status | Outcome | Depends on |
| --- | --- | --- | --- |
| 0. Harden the fork | Complete | Safe project persistence, tests, branding and a working export baseline | — |
| 1. Script and scenes | Complete | A lesson script and scene ranges are first-class project data | 0 |
| 2. Technical component kit | Complete (V1 foundation) | Reusable editable technical diagram primitives | 1 |
| 3. Smart connectors | In progress | Components remain semantically connected while being edited | 2 |
| 4. Explainer motion and sketch style | In progress | Clear progressive draw/reveal behavior | 3 |
| 5. Video camera | Planned | Editable pan/zoom with preview/export parity | 4 |
| 6. Narration and captions | Planned | Timed script, narration and captions share one source of truth | 5 |
| 7. Acceptance lesson and local release | Planned | The full Load Balancer lesson proves the intended workflow | 6 |
| 8. Hosted-product readiness | Deferred | Secure multi-user/service operation, only if the product direction changes | 7 |

Phases 2 and 3 may share visual-design preparation, but their persisted data and
interactive behavior should land in the stated order. Do not start a phase by
adding fields directly to a large component or the root store; create the
relevant domain module first.

## Rules that apply to every phase

1. Persisted changes require a new `schemaVersion` migration and migration tests.
2. Preview and export use the same project data and renderer helpers.
3. Pure timing, geometry, migration, and interpolation logic receives unit tests.
4. New domain state is kept in `src/domains/<domain>/`; a Zustand slice/action
   factory is preferred over growing `store.ts`.
5. A change is not done until it survives save, reload, `.motionproj` import,
   and export where relevant.
6. Maintain a small real Load Balancer project throughout development; use it
   to expose regressions before the final acceptance phase.

## Phase 0 — Harden the fork

**Status: complete.**

Delivered:

- package renamed to `tech-explainer-studio`, upstream attribution, MIT license
  and project positioning;
- schema version `1` and a pure migration boundary shared by browser storage,
  server persistence, imports, history, and Remotion;
- Vitest with migration and interpolation tests;
- passing strict TypeScript, test, lint-error, Vite-build, Remotion-composition,
  and two-frame H.264-export checks;
- a tracked empty asset-index seed so a clean checkout can bundle Remotion.

Known follow-up debt:

- inherited React Compiler diagnostics are warnings; fix them one component at a
  time rather than creating a Phase 0 rewrite;
- the Vite middleware backend remains local-development infrastructure, not a
  hosted production service;
- dependency upgrades/security remediation should be handled as a focused,
  separately tested maintenance task.

## Phase 1 — Script and scenes

**Goal:** make a teaching lesson understandable and editable before a creator
starts building its diagram.

**Status: complete.** Schema v5 adds persisted script and scene data, with a
tested migration chain. The editor provides labeled Layers / Script / Scenes
tabs, paragraph- and validated JSON-plan scene creation, manual script and segment edits,
segment split/merge, scene create/rename/resize/split/merge/reorder,
scene click-to-seek, and a scene band above layer tracks. Scene utilities
enforce ordering and non-overlap on the global timeline.

### Work packages

1. **Domain model and migration**
   - Add `ScriptDocument`, `ScriptSegment`, and `Scene` types.
   - Migrate schema v1 to v2 with empty optional script/scene data.
   - Define and test frame clamping, non-overlap, ordering, split, merge, and
     duration-change utilities.

2. **Store boundary**
   - Create `src/domains/script/` and `src/domains/scenes/`.
   - Compose actions for editing raw script, segmenting, assigning segments,
     creating/removing/reordering scenes, and seeking by scene.
   - Keep scene ranges on the global timeline; do not turn scenes into child
     projects or duplicate layers.

3. **Editor UI**
   - Add `SCRIPT`, `SCENES`, and `LAYERS` navigation to the left panel.
   - Provide paste/edit script, manual segment create/edit, split, merge, scene
     rename, duration edit, and click-to-seek.
   - Add a scene band above normal timeline tracks and active-scene indication.

4. **Persistence and UX validation**
   - Confirm autosave, history, project duplication, `.motionproj` import/export
     and thumbnail generation retain script/scene data.
   - Build six scenes for the Load Balancer narrative without touching code.

### Exit criteria

- A creator can paste and edit a Load Balancer script, create at least six
  ordered scenes, resize them, and seek by clicking any scene.
- Scenes persist through reload, project duplication, and project-file export.
- No scene ranges overlap unless explicit overlap support is deliberately added
  later.
- Unit tests cover all scene timing invariants and the v1-to-v2 migration.

## Phase 2 — Technical component kit

**Goal:** make the first system-design diagram faster to author than a generic
collection of rectangles and icons.

**Status: complete (V1 foundation).** The first work package is a vendor-neutral Load
Balancer topology kit: client, load balancer, and server components with
editable labels and ordinary editor-layer ownership. The first acceptance
milestone is authoring `Clients → Load Balancer → Server 1 / Server 2 / Server 3`
without drawing basic component shapes manually.

Delivered foundation: schema v4 stores component kind metadata on normal group
layers. The Layers add menu inserts Client, Load Balancer, and Server groups;
each contains regular editable rectangle and text layers.

Deferred expansion: additional component families (data, messaging, and
observability) will be added from real lesson requirements, without changing
the editable-group model proven by this milestone.

The first requirement-driven expansion adds Queue, Dead Letter Queue, Event
Message, and Worker components for the DLQ production experiment. Their vector
artwork is embedded in normal editable component groups with separate text
layers; connectors remain semantic project data.

### Work packages

1. Define a restrained design system: spacing, label typography, color roles,
   standard ports, component sizing, and dark/light-ready surfaces.
2. Add optional `TechnicalComponentMeta` to normal layer groups via a v3-to-v4
   project migration. Components must remain editable groups, never opaque
   stickers.
3. Build vendor-neutral component templates:
   - clients: user, browser, mobile, external client;
   - edge: DNS, CDN, reverse proxy, API gateway, load balancer;
   - compute: server, service, worker, container, function;
   - data: SQL, NoSQL, cache, search, object storage;
   - messaging: queue, stream/Kafka, pub-sub, event bus;
   - observability: logs, metrics, tracing, alerts.
4. Add an insert/search/browse surface backed by the existing reusable library.
5. Test template serialization and insertion; manually verify a component can
   be ungrouped, edited, recolored, resized, duplicated and saved as a library
   item.

### Exit criteria

- A user can build the static Load Balancer topology with editable components
  and labels entirely through the UI.
- Components remain normal layers/groups after save, reload, import and export.
- No cloud-vendor marks are included without documented permission.

## Phase 3 — Smart connectors

**Goal:** give diagrams semantic connections rather than fragile manually
positioned line layers.

**Status: in progress.** Begin with source/target component relationships,
deterministic port geometry, and preview/export rendering. Drag-to-connect,
advanced routing, and endpoint reassignment follow once the base semantic
model is persisted and tested.

Delivered foundation: schema v5 persists connector endpoints, ports, labels,
and visual style independently from layers. Pure geometry resolves the four
standard component ports and deterministic source-to-target lines. The shared
preview/export renderer is verified with the Load Balancer topology: connectors
stay attached as components move and component labels render above their bodies.
Interactive connection authoring supports selected-component creation plus
visible component ports for direct drag-to-connect. A selected connector shows
endpoint handles that can be dragged onto another component port to reassign
that endpoint. Connection panels provide endpoint, label, color, stroke-width,
and straight, orthogonal, or bezier routing controls. Each route is resolved
by shared deterministic geometry for selection, preview, and export. The
remaining connector work is focused on final end-to-end persistence/export
verification with nested components.

### Work packages

1. Add a first-class connector layer/data model through a v3-to-v4 migration:
   source/target layer id, source/target port, routing, arrowheads, label and
   visual style.
2. Implement pure geometry helpers for port positions, bounds, straight,
   orthogonal, and bezier routes. Decide and document one deterministic policy
   for a deleted endpoint (recommended: delete its connectors).
3. Render connector geometry in both the editor and Remotion from the semantic
   endpoints, not persisted absolute points.
4. Add interaction: visible ports, drag-to-connect, endpoint reassignment,
   routing selection, label/style editing, selection, and delete behavior.
5. Test geometry, resizing/movement, missing endpoints, serialization and
   migration. Exercise nested/grouped components explicitly.

### Exit criteria

- The Load Balancer-to-three-servers topology can be created, moved and resized
  repeatedly without redrawing any connector.
- Preview and MP4/WebM export agree on connector geometry at the same frame.

## Phase 4 — Explainer motion and sketch style

**Goal:** turn a static architecture diagram into a clear progression of
teaching moments.

**Status: in progress.** Schema v6 adds deterministic connector draw ranges.
The Properties panel can animate a connector drawing in from the current
playhead, using the same SVG dash calculation in preview and export. The Layers
panel can also create editable, staggered reveal keyframes for selected
technical components, with author-controlled start time, reveal duration, and
stagger interval. Connectors are directly selectable on the canvas; their
inspector exposes precise draw start and end times. Selected technical
components can receive an editable highlight-pulse emphasis at the playhead.
Selected-component connections can also be sequenced as a draw-in flow.

### Work packages

1. Introduce animatable `drawProgress` with a v4-to-v5 migration and integrate
   it into existing property-keyframe mechanics.
2. Implement deterministic SVG dash/draw helpers for paths and connectors.
3. Add editable presets: draw-in, fade-and-draw, pop-in, directional slide,
   sequential child reveal, and highlight pulse. Presets must write ordinary
   editable keyframes.
4. Add optional, seeded sketch styling for compatible geometry. Seeds derive
   from stable project/layer ids; randomness must never vary by frame.
5. Test progress clamping, dash calculations, seeded output, and shared
   preview/export helpers.

### Exit criteria

- A creator can reveal the load balancer, servers, labels and connectors in a
  controlled sequence and freely revise that timing.
- Exported frames match preview and have no sketch jitter.

## Phase 5 — Video camera

**Goal:** add an animated video camera without confusing it with editor
navigation.

### Work packages

1. Define a persisted camera coordinate system, keyframes and limits; migrate
   v5-to-v6. Document whether coordinates are world center or translation
   before implementing UI.
2. Build pure camera interpolation, fit-to-bounds, focus-selection and
   world/screen transform helpers.
3. Wrap the rendered video world with the resolved camera transform and keep
   selection overlays aligned while camera preview mode is active.
4. Add a timeline camera lane and controls for add keyframe, hold, focus,
   fit, reset and direct numeric editing.
5. Test interpolation, zoom limits, coordinate transforms and renderer parity.

### Exit criteria

- The lesson can start wide, focus the load balancer, pan to servers, then
  return wide. Every framing change is editable and exports identically.

## Phase 6 — Narration and captions

**Goal:** let a creator align what is said with what appears, without making
speech synthesis or alignment a prerequisite.

### Work packages

1. Add audio roles (`narration`, `music`, `sound-effect`, `generic`) and timed
   script-segment fields in a v6-to-v7 migration.
2. Surface narration prominently in the timeline and provide manual scene /
   segment frame alignment.
3. Render captions from the timed script segments, beginning with a readable
   bottom style and a minimal technical style.
4. Keep captions derived from script timing. Do not create a duplicated, free
   text-caption data store.
5. Test role persistence, segment selection at frame boundaries, scene/audio
   timing utilities, reload and export audio synchronization.

### Exit criteria

- Imported narration, timed segments, and captions survive reload and export.
- Editing a script segment updates its caption source without manual copying.

## Phase 7 — Acceptance lesson and local release

**Goal:** prove the complete creator workflow with the canonical lesson.

### Work packages

1. Produce the complete lesson progression:
   - single server and growing traffic;
   - overload problem;
   - horizontal scaling and load balancer;
   - distributed request flow;
   - camera focus;
   - unhealthy server and healthy path;
   - summary.
2. Rehearse every manual-editability requirement from `PRODUCT_VISION.md`:
   script, scenes, components, labels, connectors, timing, draw effects,
   camera, narration and captions.
3. Export 1920×1080 and 1080×1920 outputs. Review readability, sync,
   connector attachment, camera behavior and render time.
4. Add a local-release checklist: clean startup, example project, backup/
   restore, known limitations, rollback via project files, and a short operator
   guide.
5. Measure performance on the real lesson before optimizing. Code-split or
   optimize only a measured bottleneck.

### Exit criteria

- A creator makes and revises the whole Load Balancer lesson without source
  edits.
- Both output formats render correctly with preview/export parity.
- The local-first V1 limitations are documented and backups are recoverable.

## Phase 8 — Hosted-product readiness (deferred)

Only start this phase after V1 has real users or a confirmed deployment need.
It is intentionally separate from the editor roadmap.

Potential work:

- replace Vite middleware with a deployed API, database/object storage and
  isolated render-job workers;
- authentication, authorization, tenant boundaries, rate limits, audit logs
  and secrets management;
- scalable asset upload/transcoding, render queues, retention policies and
  observability;
- collaboration/conflict strategy, sharing, billing and legal/privacy work;
- security review, dependency policy, backups/disaster recovery and deployment
  automation.

None of these are needed to validate the local-first editor. Starting them
early would delay the proof of the core authoring experience.

## Cross-cutting backlog

These may be scheduled within the phase that needs them, never as detached UI
work:

- accessibility and keyboard coverage for every new editor interaction;
- i18n strings for all new UI (English and Czech are currently supported);
- performance profiling for large diagrams and long timelines;
- fixture projects for migration and regression testing;
- design-library documentation and component naming;
- dependency/security maintenance in focused changes;
- upstream fork tracking and license/trademark review.

## Next implementation target

Begin **Phase 1, Work Package 1**: define script/scene types, pure scene-timing
utilities, schema v2 migration, and tests. Do not begin the scene UI until
those project-data invariants are tested.
