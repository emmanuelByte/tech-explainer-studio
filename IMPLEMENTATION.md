# Tech Explainer Studio Implementation Plan

## Purpose

This document defines the implementation order for turning the MotionEditor fork into **Tech Explainer Studio**.

The order matters. The goal is to avoid building impressive demos on top of unstable project data or duplicating infrastructure the inherited editor already solves.

The canonical acceptance lesson is the **Load Balancer explainer** described in `docs/PRODUCT_VISION.md`.

## Execution roadmap and status

`docs/IMPLEMENTATION_ROADMAP.md` is the authoritative delivery order, phase
status, work-package breakdown, cross-cutting backlog, and phase exit criteria.
Use this document for the detailed engineering requirements of each phase.

Current delivery status:

| Phase | Status |
| --- | --- |
| 0 — Harden the fork | Complete |
| 1 — Script + Scenes | Complete |
| 2 — Technical Component Kit | Planned |
| 3 — Smart Connectors | Planned |
| 4 — Explainer Motion + Sketch Style | Planned |
| 5 — Video Camera | Planned |
| 6 — Narration + Captions | Planned |
| 7 — Acceptance Lesson + Local Release | Planned |
| 8 — Hosted-product Readiness | Deferred |

The prior combined technical specification for components/connectors is retained
below for reference. The delivery roadmap intentionally splits it into phases 2
and 3 so component authoring is proven before semantic connection behavior is
introduced.

---

# Phase 0 — Harden the fork

## Goal

Create a safe foundation for domain work before adding script/scenes/connectors/camera.

## Tasks

### Repository identity

- Rename package metadata from the inherited temporary/editor naming to Tech Explainer Studio.
- Update README branding and project description without deleting useful inherited setup instructions.
- Preserve upstream attribution.

### Licensing

- Verify the upstream MotionEditor license/history.
- Add the correct root `LICENSE` and attribution/notice files if required.
- Document third-party icon/library licensing where necessary.

### Project schema versioning

Add an explicit project schema version.

Example:

```ts
interface MotionProject {
  schemaVersion: number
  // existing fields
}
```

Implement a migration pipeline such as:

```text
load raw project
  -> detect schema version
  -> migrate v1 -> v2 -> ... current
  -> validate/sanitize
  -> load into store
```

Implementation note: the Phase 0 baseline introduces schema version `1` and
the migration boundary at `src/domains/project/migrations.ts`. Subsequent
phases must extend that boundary rather than relying on sanitisation defaults.

Requirements:

- migrations are pure and testable
- old projects remain loadable
- imported `.motionproj` files use the same migration path
- every future persisted schema change updates the migration chain

### Test infrastructure

Add:

- Vitest
- React Testing Library where UI tests add value

Create initial tests for:

- project migration
- project serialization/deserialization
- frame clamping and timing utilities
- existing animation interpolation invariants

### Modular extension points

Do not rewrite the editor. Start extracting pure/domain logic so future features do not further inflate huge files.

Preferred direction:

```text
src/
  domains/
  store/
    slices/
```

At minimum:

- define a migration module
- define domain folders
- prepare store composition boundaries
- keep existing behavior unchanged

## Exit criteria

- app starts locally
- lint succeeds
- build succeeds
- existing preview works
- existing MP4 export works
- current projects still load
- project has `schemaVersion`
- migration tests pass
- test command exists
- upstream licensing status is explicitly documented

Do not begin Phase 1 until these are true.

---

# Phase 1 — Script + Scenes

## Goal

Make a technical lesson a first-class project concept rather than just a pile of animated layers.

## Data model

Add persisted types similar to:

```ts
interface ScriptDocument {
  rawText: string
  segments: ScriptSegment[]
}

interface ScriptSegment {
  id: string
  text: string
  sceneId?: string
  startFrame?: number
  endFrame?: number
}

interface Scene {
  id: string
  title: string
  startFrame: number
  endFrame: number
  scriptSegmentIds: string[]
}
```

Extend `MotionProject` with optional `script` and `scenes` fields through a schema migration.

## Scene rules

- scenes are ranges on one global timeline
- scene ranges must not overlap unless we intentionally support that later
- scene ordering follows timeline order
- scene edits must remain valid when project FPS or duration changes
- narration and camera should later be able to cross scene boundaries

## UI

Add left-panel navigation such as:

```text
SCRIPT | SCENES | LAYERS
```

Required script behaviors:

- paste full script
- edit full script
- create segments/scenes manually
- split a segment
- merge adjacent segments
- rename a scene
- reorder scene content where safely supported

Required scene behaviors:

- click scene -> seek playhead
- change scene duration
- display scene range on timeline
- display active scene based on playhead
- optionally filter/highlight layers relevant to the active scene later

## Timeline

Add a scene band above normal layer tracks.

Example:

```text
SCENES   | Scene 1        | Scene 2          | Scene 3
         |████████████████|██████████████████|██████████
```

## Tests

Cover:

- splitting scenes
- merging scenes
- duration changes
- scene ordering
- frame boundary clamping
- project migration with/without scenes

## Exit criteria

- user can paste the Load Balancer lesson script
- user can split it into at least six scenes
- clicking a scene seeks correctly
- scene timing persists after restart
- scene bands render on timeline

**Delivered:** schema v2 persists a script document and non-overlapping scene
ranges. The editor now has labeled Layers, Script, and Scenes tabs; paragraph
generation, segment editing/split/merge, scene create/rename/resize/split/
merge/reorder, scene click-to-seek, and a timeline scene band. The scene model
and v1-to-v2 migration have automated coverage.
- exported project file preserves the script/scenes

---

# Phase 2 — Technical Components + Smart Connectors

## Goal

Make architecture diagrams dramatically faster to build than in a general-purpose editor.

## Technical component library

Use existing reusable library/group mechanics.

Create vendor-neutral editable components first.

Initial categories:

### Clients

- User
- Browser
- Mobile Client
- External Client

### Traffic / Edge

- DNS
- CDN
- Reverse Proxy
- API Gateway
- Load Balancer

### Compute

- Application Server
- Service
- Worker
- Container
- Function

### Data

- SQL Database
- NoSQL Database
- Cache
- Search Engine
- Object Storage

### Messaging

- Queue
- Kafka / Stream
- Pub/Sub
- Event Bus

### Observability

- Logs
- Metrics
- Tracing
- Alerts

Each component should insert as normal editable layers/groups and support styling.

## Semantic metadata

Add optional component metadata to groups/layers rather than introducing opaque component objects.

Example:

```ts
interface TechnicalComponentMeta {
  kind: string
  category: string
  version?: number
}
```

## Smart connector model

Create first-class connectors.

Suggested model:

```ts
type ConnectorPort = 'top' | 'right' | 'bottom' | 'left'

type ConnectorRouting = 'straight' | 'orthogonal' | 'bezier'

interface ConnectorEndpoint {
  layerId: string
  port: ConnectorPort
}

interface ConnectorData {
  source: ConnectorEndpoint
  target: ConnectorEndpoint
  routing: ConnectorRouting
  arrowStart: boolean
  arrowEnd: boolean
  label?: string
}
```

Implementation can use either a dedicated `connector` layer type or a compatible extension of the persisted layer model, but connector semantics must be first-class in project data.

## Connector behavior

- drag from a connection port to another component
- moving either endpoint updates connector geometry
- resizing endpoint layers updates connector geometry
- deleting endpoint behavior is deterministic (delete connector or mark detached; choose one and document it)
- source/target can be changed
- support straight connectors
- support orthogonal connectors
- support bezier connectors
- arrowhead at start/end
- editable label
- line style (solid/dashed)

## Geometry

Keep connector routing calculations in pure functions under `src/domains/connectors/`.

Do not bury geometry inside React event handlers.

## Tests

Cover:

- source/target port positions
- endpoint move/resize
- straight routing
- orthogonal routing
- connector deletion/detachment rules
- serialization/migration

## Exit criteria

Build this diagram entirely through the UI:

```text
            Load Balancer
          /       |       \
       App 1    App 2    App 3
```

Then move every server and the load balancer. All connectors must remain correctly attached without manual redraw.

---

# Phase 3 — Whiteboard Animation + Sketch Style

## Goal

Turn static technical diagrams into progressive whiteboard/sketch explainers.

## Draw progress

Add an animatable numeric property such as:

```ts
drawProgress: number // 0..1
```

Integrate it into the existing property-keyframe animation system.

Do not create a parallel timing engine.

## Path drawing

For SVG/path-like elements:

- calculate or measure path length
- render `stroke-dasharray`
- animate `stroke-dashoffset`
- clamp progress to 0..1

Apply to:

- paths
- connectors
- relevant technical icon outlines if feasible

## Reveal presets

Add explainer-focused presets such as:

- draw in
- fade + draw
- pop in
- slide from direction
- sequential child reveal
- highlight pulse

These should produce normal keyframes and remain editable afterward.

## Sketch style

Add deterministic sketch rendering for compatible primitives.

Rules:

- no per-frame unseeded randomness
- same layer renders identical geometry in editor/export
- seed should be derived from stable data such as layer id
- style should be optional
- retain semantic connector endpoints even when visually sketchy

Consider a RoughJS-like approach or deterministic custom SVG perturbation.

## Tests

Cover:

- draw progress interpolation
- path dash calculations
- deterministic sketch output from same seed
- preview/export shared render helpers

## Exit criteria

Load Balancer scene can reveal:

1. load balancer box
2. three app servers
3. each connector drawing progressively
4. labels appearing in controlled order

Preview and exported MP4 must match.

---

# Phase 4 — Camera

## Goal

Add a video camera independent from the editor viewport.

## Data model

Add a persisted camera track through project migration.

```ts
interface CameraKeyframe {
  frame: number
  x: number
  y: number
  zoom: number
  easing: PairEasingType
}

interface CameraTrack {
  keyframes: CameraKeyframe[]
}
```

Define precisely whether `x/y` represent world center, translation, or another normalized coordinate system. Document it and keep it stable.

## Renderer

Wrap the video world in the resolved camera transform inside shared Remotion rendering.

The editor overlay must understand camera transforms so selections remain aligned when previewing camera mode.

## UI

Add:

- camera lane in timeline
- add camera keyframe
- edit camera keyframe
- focus selection
- fit architecture
- reset camera
- hold current framing
- optional camera-path preview

Keep editor navigation separate from video camera state.

## Tests

Cover:

- camera interpolation
- zoom limits
- focus-selection framing
- world/screen coordinate transforms
- preview/export parity helpers

## Exit criteria

The Load Balancer lesson can:

- start with full architecture framing
- zoom to the load balancer
- pan to app-server group
- return to full architecture

All moves are editable on the timeline and export identically.

---

# Phase 5 — Narration + Captions

## Goal

Make voiceover and script timing part of the lesson workflow.

## Audio roles

Extend audio semantics:

```ts
type AudioRole = 'narration' | 'music' | 'sound-effect' | 'generic'
```

Do not replace existing audio/video segment infrastructure.

## Narration workflow

V1 narration support:

- import audio
- mark layer as narration
- display narration prominently on timeline
- align scene boundaries manually
- map script segments to frame ranges

Optional later improvements:

- local/system TTS
- hosted TTS providers
- forced word alignment
- automatic scene-duration suggestions

These must remain optional helpers.

## Captions

Render captions from timed script segments.

Initial styles:

- simple bottom caption
- minimal technical caption
- optional word-highlight mode if word timings exist

Captions should not become unrelated duplicated text. Their source of truth is script timing.

## Tests

Cover:

- narration role persistence
- script timing persistence
- caption segment frame selection
- scene/narration alignment utilities

## Exit criteria

The Load Balancer lesson has narration audio, timed script segments and captions that survive reload and export correctly.

---

# Phase 6 — Full lesson validation and polish

## Goal

Stop building features in isolation and prove the actual workflow.

## Build the full Load Balancer lesson

Required story progression:

1. user -> single server
2. traffic increases
3. server overload problem
4. horizontal scaling introduced
5. load balancer introduced
6. traffic distributed to three app servers
7. camera focuses on load balancer
8. request/data-flow animation
9. one server becomes unhealthy
10. healthy traffic path remains
11. benefits summarized

## Manual-editability acceptance

During production of this lesson, verify that the creator can:

- edit script
- split/merge scenes
- move components
- resize components
- swap an icon
- change text
- change style
- reroute connector
- edit connector label
- alter draw timing
- alter scene duration
- alter camera framing
- alter narration timing
- edit captions
- export without touching code

## Output validation

Export at least:

- 1920x1080 landscape
- 1080x1920 vertical

Validate:

- preview/export parity
- audio sync
- text readability
- connector attachment
- camera motion
- progressive reveals
- no sketch jitter
- acceptable render time

## Performance pass

Only optimize based on measured problems from the real lesson.

Potential areas:

- selector granularity in Zustand
- rendering inactive layers
- SVG/path measurement caching
- connector geometry caching
- large-timeline rendering
- asset decoding

Avoid speculative rewrites.

## V1 completion definition

V1 is complete when Tech Explainer Studio is clearly more efficient for producing the Load Balancer/system-design lesson than using a generic video editor, while retaining full manual control.

---

# Later phases (not V1)

Potential future work after the core workflow is proven:

- AI-assisted script segmentation
- AI-generated editable scene drafts
- AI suggestions for diagram layout
- automatic narration alignment
- cloud-provider component packs
- diagram templates for common system-design patterns
- animated request tokens/data packets
- primary/replica DB templates
- cache-aside templates
- queue/worker templates
- CDN/edge templates
- distributed tracing visualization
- code snippets as editable visual components
- remote/cloud storage if the local-first model becomes limiting

None of these should distract from the V1 acceptance workflow.
