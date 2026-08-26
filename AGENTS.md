# AGENTS.md

## Project identity

This repository is a fork of `tomaslachmann/motion-editor`, being evolved into **Tech Explainer Studio**: a focused visual editor for creating technical education videos, especially software engineering and system design explainers.

The product is **not** an automatic prompt-to-video generator and it is **not** a general-purpose Canva/CapCut replacement.

The target workflow is:

```text
Paste a teaching script
  -> split/organize it into editable scenes
  -> visually build each scene on a freeform canvas
  -> add technical icons/components, text, arrows, diagrams and media
  -> animate/reveal elements on a timeline
  -> animate camera pan/zoom
  -> align narration and captions
  -> preview
  -> export MP4/WebM
```

The creator must retain full manual control at every stage. AI may assist with repetitive work later, but AI must never be the only path to authoring or editing a project.

## Main product goal

Build an editor that makes it unusually fast and pleasant to create KodeKloud-style / whiteboard-style technical explainers:

- dark or clean minimal backgrounds
- readable technical diagrams
- progressive reveal of elements
- hand-drawn/sketch feeling where appropriate
- arrows and data-flow animation
- narration-synchronized visuals
- virtual camera pan/zoom
- reusable system-design components
- horizontal and vertical output

The first acceptance lesson is a **Load Balancer explainer**. The product should be considered V1-capable when a creator can build that lesson entirely in the editor without touching source code and can freely move components, reroute connectors, edit text, change timing, alter camera framing and export a correct video.

## Product principles

1. **Manual-first, AI-assisted.** Every AI-generated result must become normal editable project data.
2. **Domain-focused.** Optimize for technical diagrams and explainers, not generic social-video editing.
3. **One project model.** Editor preview and Remotion export must consume the same source of truth.
4. **Deterministic rendering.** The same project and frame must render identically in preview and export.
5. **Scene ranges, not isolated mini-projects.** Scenes are ranges on one global timeline unless a later design proves otherwise.
6. **Semantic connectors.** Arrows must be attached to source/target layers and update when those layers move.
7. **Reuse existing MotionEditor infrastructure.** Do not rebuild timeline, canvas, assets, keyframes, grouping or export unless there is a demonstrated blocker.
8. **Keep the core maintainable.** Do not dump new domains into `store.ts`, `CanvasOverlay.tsx` or `Timeline.tsx` without extracting boundaries.
9. **Project files must migrate safely.** Any schema change requires an explicit project schema version and migration.
10. **Test timing/geometry logic.** Scene timing, camera interpolation, connector geometry, draw progress and migrations must have automated tests.

## Existing foundation we should preserve

MotionEditor already provides most generic editor infrastructure:

- React 19 + Vite
- Zustand state management
- Remotion Player and Remotion export
- layer tree and groups
- direct canvas manipulation
- rectangles, ellipses, lines, paths, text, images, video and audio
- nested groups and layer ordering
- keyframes, per-property animation tracks and easing
- text animation presets
- reusable design/animation library items
- local project/assets/library storage
- MP4/WebM export with progress and cancellation
- 16:9, 9:16 and custom canvas sizes
- icon browser using Lucide SVGs

Do not replace these foundations casually.

## Major missing domains to add

### 1. Script domain

A project needs a persisted script and editable script segments.

Suggested concepts:

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
```

### 2. Scene domain

Scenes should be explicit timeline ranges, not separate projects.

```ts
interface Scene {
  id: string
  title: string
  startFrame: number
  endFrame: number
  scriptSegmentIds: string[]
}
```

Required editor behavior:

- paste/edit script
- split/merge/reorder scene ranges
- seek playhead by clicking a scene
- scene bands/markers on timeline
- optionally assign layers to scenes for filtering/organization without making scene ownership mandatory

### 3. Technical component library

Create reusable vendor-neutral components before cloud-vendor packs.

Initial categories:

- Client/User/Browser/Mobile
- DNS/CDN/Reverse Proxy/API Gateway/Load Balancer
- Server/Service/Worker/Container/Function
- SQL DB/NoSQL DB/Cache/Search/Object Storage
- Queue/Kafka/PubSub/Event Bus
- Logs/Metrics/Tracing/Alerts

These should remain normal editable layer groups, not opaque bitmap stickers.

### 4. Smart connectors

This is a first-class domain. Do not fake it with manually positioned line layers.

A connector should persist semantic endpoint information, for example:

```ts
interface ConnectorEndpoint {
  layerId: string
  port: 'top' | 'right' | 'bottom' | 'left'
}

interface ConnectorData {
  source: ConnectorEndpoint
  target: ConnectorEndpoint
  routing: 'straight' | 'orthogonal' | 'bezier'
  arrowStart: boolean
  arrowEnd: boolean
  label?: string
  drawProgress: number
}
```

Moving or resizing either connected layer must update connector geometry automatically.

### 5. Whiteboard / draw-on animation

Add a numeric `drawProgress` capability for paths/connectors and render it deterministically using SVG path length / dash offset techniques.

The animation engine already supports property tracks; extend it rather than creating a second unrelated animation system.

### 6. Sketch style

Provide deterministic hand-drawn geometry for technical boxes, lines and connectors. Any pseudo-random variation must be seeded from stable project/layer data so exported frames do not jitter.

### 7. Camera domain

Editor viewport pan/zoom is not the video camera.

Persist a separate camera track:

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

Required actions:

- add camera keyframe
- focus selected layers
- fit architecture
- hold camera
- pan/zoom between keyframes
- show a camera lane in the timeline

Camera transforms must be shared by preview and Remotion export.

### 8. Narration and captions

Audio already exists. Add semantics such as:

```ts
type AudioRole = 'narration' | 'music' | 'sound-effect' | 'generic'
```

The first workflow can be manual narration import + scene alignment. TTS and forced word alignment are optional later features.

Captions should be generated from persisted timed script segments, not maintained as an unrelated text blob.

## Recommended project data evolution

Before adding the new domains, add `schemaVersion` to `MotionProject` and implement explicit migrations.

Target shape should evolve toward:

```ts
interface MotionProject {
  schemaVersion: number
  // existing metadata/canvas/layers/guides/timeline/editor fields
  script?: ScriptDocument
  scenes?: Scene[]
  camera?: CameraTrack
}
```

Do not make breaking project-schema edits without a migration.

## Recommended code organization

The current code has several very large files, notably `store.ts`, `CanvasOverlay.tsx` and `Timeline.tsx`. Extend with domain boundaries instead of adding more unrelated logic directly into those files.

Preferred direction:

```text
src/
  domains/
    script/
    scenes/
    technical-components/
    connectors/
    whiteboard/
    camera/
    narration/
  components/
  remotion/
  store/
    slices/
```

A single Zustand store is acceptable, but compose it from slices/action factories.

## Development roadmap

Follow `IMPLEMENTATION.md`. The intended order is:

1. Phase 0: harden the fork
2. Phase 1: script + scenes
3. Phase 2: technical components + smart connectors
4. Phase 3: whiteboard animation + sketch style
5. Phase 4: camera
6. Phase 5: narration + captions
7. Phase 6: polish + full Load Balancer acceptance lesson

Do not skip foundation work just to make a visual demo faster if doing so creates incompatible project data or duplicate rendering paths.

## Non-goals for V1

Do not spend time on these unless explicitly requested:

- multi-user collaboration
- cloud accounts/authentication
- marketplace
- generic social templates
- hundreds of fonts/effects
- stock-media search
- image generation subsystem
- full After Effects feature parity
- general-purpose NLE/video editor features unrelated to technical explanation
- automatic one-click script-to-final-video generation

## Engineering expectations

- Keep TypeScript strict and explicit for persisted schemas.
- Prefer pure geometry/timing functions that are easy to test.
- Avoid hidden mutation of persisted project data.
- Keep preview/export rendering code shared.
- Preserve upstream behavior unless a product requirement needs a change.
- Document architectural decisions that affect project compatibility.
- Add tests for every non-trivial migration and timing/geometry algorithm.
- Do not commit API keys, generated exports, local assets or local project data.

## Source-of-truth docs

Read these before implementing a major feature:

- `AGENTS.md` — project constraints and agent instructions
- `docs/PRODUCT_VISION.md` — product definition and UX target
- `docs/CODEBASE_DISCOVERY.md` — audit of the inherited MotionEditor codebase
- `IMPLEMENTATION.md` — phased implementation plan and acceptance criteria

If those docs conflict, the newest explicit product decision in the repository should win, and the docs should be updated together rather than silently diverging.
