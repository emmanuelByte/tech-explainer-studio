# Codebase Discovery

## Summary

This repository is a fork of `tomaslachmann/motion-editor`. After reviewing the inherited codebase, the conclusion is to **keep MotionEditor as the foundation** and extend it into Tech Explainer Studio rather than rebuilding a new editor.

The inherited project already provides most of the expensive generic editor infrastructure. The major missing work is domain-specific: script/scenes, technical components, semantic connectors, whiteboard draw-on behavior, camera, narration semantics and captions.

Rough estimate: MotionEditor already supplies about **65–70% of the generic editor infrastructure** needed for the product. The remaining work is largely the actual differentiating product.

## Existing architecture

### Frontend stack

The project currently uses:

- React 19
- Vite 8
- TypeScript
- Zustand
- Tailwind CSS
- Remotion + Remotion Player
- Lucide icons
- i18next
- dnd-kit

This is a suitable stack for the target product.

### Local backend

The Vite dev server mounts lightweight local middleware for:

- project JSON persistence
- asset persistence
- reusable library items
- AI-assist requests
- Remotion exports

The project is intentionally local-first and currently requires no hosted database.

## Existing editor shell

`src/App.tsx` already assembles the familiar visual-editor layout:

```text
Top bar

Layers panel | Canvas/Preview | Properties panel

Timeline
```

It also handles:

- project routing
- autosave
- manual history snapshots
- preview modal
- export modal
- AI panel
- keyboard shortcuts

This shell should be preserved and specialized, not replaced.

## Existing project model

The core persisted types live in `src/types.ts`.

Current `MotionProject` already stores:

- project identity and metadata
- canvas size/preset/FPS/duration/background
- full layer tree
- guides
- timeline zoom/scroll
- editor viewport state
- selected layers
- playhead position
- color palettes

The project model currently has **no explicit script, scene or camera domain**.

The current `LayerType` supports:

- rectangle
- ellipse
- line
- triangle
- path
- text
- image
- video
- audio
- group

The layer model is already rich enough for generic design and animation, but it has no semantic connector type and no technical-component metadata.

## Existing animation system

The inherited animation system is strong and should be extended.

It supports:

- transform keyframes
- per-property keyframe tracks
- easing
- custom bezier easing
- animated dimensions
- opacity
- colors
- stroke width
- typography
- blur/brightness/contrast/grayscale
- shadow properties
- text reveal animation
- video speed keyframes

`src/animationProperties.ts` resolves animated property values for arbitrary frames, and `src/remotion/interpolateProps.ts` handles interpolation of transform keyframes.

This means new numeric properties such as `drawProgress` should be integrated into the existing animation model rather than implemented as a second animation engine.

## Existing timeline

`src/components/Timeline.tsx` is already a substantial timeline implementation.

It supports:

- layer range bars
- property subtracks
- keyframe selection
- keyframe dragging
- snapping
- easing editing
- marquee selection
- value graphs
- media segments
- layer reordering
- timeline zoom and resizing

Do not replace this timeline. Extend it with scene and camera bands/tracks.

## Existing canvas/editor interaction

`src/components/PreviewCanvas.tsx` embeds the shared Remotion composition in `@remotion/player` and adds editor viewport pan/zoom.

`src/components/CanvasOverlay.tsx` provides editing affordances such as:

- selection
- movement
- resize handles
- rotation
- skew/perspective interactions
- alignment guides
- spacing guides
- marquee selection
- pen/path creation
- editable path control points

This is a major reason to keep MotionEditor. Rebuilding this interaction layer would waste significant time.

Important distinction: current editor pan/zoom is **editor navigation**, not a persisted video camera. The future camera system must be separate.

## Existing rendering path

`src/remotion/Composition.tsx` renders the project for both preview/export concepts.

It already renders:

- shape layers
- text
- SVG/raster images
- video
- audio
- groups
- paths
- animated transform/style properties

This shared renderer is strategically important. New features must be implemented so editor preview and final export consume the same project model and rendering logic.

Avoid separate preview-only implementations.

## Existing export pipeline

`server/exportPlugin.ts` already starts Remotion render jobs and supports:

- MP4/H.264
- WebM/VP9
- standard/high/ultra scale presets
- frame-range export
- progress reporting
- logs
- cancellation
- reveal/open output location

This export pipeline is adequate for the target product and should be extended rather than replaced.

## Existing assets and reusable library

The project already supports importing and persisting:

- images
- videos
- audio

It also has reusable design and animation library items. Selected layer trees can be saved and reused across projects.

This should become the basis of the **technical component library**. System-design components should remain editable groups/layers rather than being flattened to PNGs.

## Existing icons

`src/components/IconPickerModal.tsx` dynamically loads Lucide icons and converts selected icons into SVG data URLs.

This is immediately useful for vendor-neutral technical components and avoids the need to build an icon browser from scratch.

Cloud-vendor icon packs should be handled later, after checking each pack's licensing/trademark requirements.

## Existing AI integration

The repository has optional local AI middleware in `server/aiAssistPlugin.ts` and UI components for AI assistance.

The current AI integration can request OpenAI responses for graphic or animation assistance.

For Tech Explainer Studio, AI should remain optional and should produce normal editable project data. It must not become a required black-box path from script to final video.

## Existing storage

Projects are persisted as local JSON files through `src/projectStorage.ts` and `server/projectStoragePlugin.ts`.

The loader already sanitizes and normalizes old project data, but there is currently no explicit persisted `schemaVersion` migration system.

Before extending `MotionProject` significantly, add formal schema versioning and migrations.

## Problems discovered

### 1. Large core files

Several files are already very large:

- `src/store.ts` is roughly 144 KB
- `src/components/CanvasOverlay.tsx` is roughly 85 KB
- `src/components/Timeline.tsx` is roughly 88 KB

These are manageable today but are dangerous extension points for script/scenes/connectors/camera logic.

Do not perform a giant rewrite. Instead, introduce domain modules and store slices/action factories while preserving behavior.

### 2. Missing project schema version

Persisted project changes currently depend on sanitization rather than explicit migrations.

This becomes unsafe once we add:

- script data
- scene ranges
- camera tracks
- connector endpoint metadata
- component semantics
- narration/caption metadata

Add `schemaVersion` before major model extensions.

### 3. No meaningful test suite

The current `package.json` has no test script and there is no visible automated test suite in the repository root.

Before adding substantial timing/geometry logic, add a test framework and cover:

- project migrations
- scene ranges
- connector geometry
- camera interpolation
- draw-progress interpolation
- serialization
- component insertion

### 4. Licensing needs explicit verification

`package.json` declares MIT, but the fork currently has no root LICENSE file and GitHub metadata does not detect a license.

Before treating the repository as a long-lived derivative product, verify upstream licensing history and attribution requirements, then add the correct license/notice files.

## Gap analysis

| Capability | Inherited state | Decision |
| --- | --- | --- |
| Visual editor shell | Strong | Keep |
| Layer hierarchy/groups | Strong | Keep |
| Direct manipulation | Strong | Keep |
| Paths/freehand | Good | Extend |
| Timeline | Strong | Extend |
| Keyframes/easing | Strong | Keep |
| Text animations | Good | Add explainer presets |
| Asset storage | Good | Keep |
| Audio/video layers | Good | Add narration semantics |
| Reusable library | Good | Base technical components on it |
| 16:9 / 9:16 | Already supported | Keep |
| MP4/WebM export | Strong | Keep |
| Script workflow | Missing | Build |
| Scenes | Missing | Build |
| Smart connectors | Missing | Build |
| Technical semantics | Missing | Build |
| Video camera | Missing | Build |
| Whiteboard draw-on | Partial primitives only | Build |
| Sketch look | Missing | Build |
| Captions | Missing | Build |
| Explicit migrations | Missing | Build first |
| Tests | Missing | Build first |

## Recommended domain architecture

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
    ...generic editor UI...

  remotion/
    ...shared renderer...

  store/
    slices/
      layers.ts
      timeline.ts
      scenes.ts
      camera.ts
      connectors.ts
```

A single Zustand store is still acceptable. The goal is to separate responsibilities and pure logic, not to perform architecture theater.

## New domains required

### Script

Persist the user's lesson script and split it into normal editable segments.

### Scenes

Persist scene ranges on the global timeline. A scene is not a separate project.

### Technical components

Create curated editable system-design building blocks using normal layer groups.

### Smart connectors

Create a first-class connector layer/domain with semantic source and target endpoints, ports, routing and arrowheads.

### Whiteboard animation

Add deterministic SVG draw-on progress and reusable reveal presets.

### Sketch style

Generate stable hand-drawn-looking geometry using deterministic seeds.

### Camera

Persist camera pan/zoom keyframes independently from editor viewport state and render them in both preview and export.

### Narration/captions

Add audio roles and timed script metadata so narration and captions share one source of truth.

## Acceptance target

The canonical acceptance test is a Load Balancer lesson.

The editor must be capable of authoring this sequence without source-code changes:

```text
User -> Single Server

More users -> overloaded server

            Load Balancer
          /       |       \
       App 1    App 2    App 3

Camera focuses on the load balancer

Requests visibly travel across connectors

One app server becomes unavailable and the healthy path is emphasized
```

The creator must be able to change every relevant visual/timing choice manually and export a correct 16:9 and 9:16 video.

## Final discovery decision

**Do not change foundations again unless a concrete blocker is found.**

MotionEditor is a sufficiently capable base. The next work should focus on hardening the fork, then adding the script/scenes workflow before moving into technical components and connectors.
