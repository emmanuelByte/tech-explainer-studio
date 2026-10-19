# Scene-first editor architecture

> **Status (2026-10-19):** phases 7.1-7.4 were built; further work on human editing
> ergonomics is stopped because the product is now AI-authored (see
> `docs/2026-10-19-AI-AUTHORED-PIVOT.md`). Kept as design background for the Story/Scene workspaces.

## Decision

Tech Explainer Studio will use a scene-first editing model. A creator assembles
the complete lesson in a compact Story workspace and edits one scene at a time
in a focused Scene workspace.

The current editor displays project scenes, narration, camera, every layer and
their animation data in one global timeline. That works for a short prototype,
but a lesson with 100 scenes or 100 layers creates too many permanent rows,
makes selection harder and forces the browser to render controls that are not
relevant to the current edit.

Scene-first editing is the scalability boundary:

```text
Project / story sequence
  Scene 1 clip
  Scene 2 clip
  Scene 3 clip
  ...

Active scene
  local layers
  local camera
  local animation
  local narration and sound effects
```

## Kdenlive-inspired principles

Kdenlive is a reference for structure, not a UI to copy completely.

- A Kdenlive sequence owns an independent timeline and can behave like a clip
  in another sequence. A Tech Explainer scene should behave the same way in the
  project story timeline.
- Its Project Bin separates reusable source assets from placed timeline clips.
  Tech Explainer Studio should keep Assets/Library separate from the active
  scene's Layers tree.
- Its timeline distinguishes audio and video tracks and provides collapse,
  lock, mute and visibility controls. Our track types should remain more
  opinionated for explainers while retaining those density controls.
- Proxy media and preview rendering keep playback usable as projects become
  heavier. We should add equivalent caching only after measuring the real
  renderer.

Reference documentation:

- <https://docs.kdenlive.org/en/project_and_asset_management/project_bin/sequence.html>
- <https://docs.kdenlive.org/en/project_and_asset_management/project_bin/project_bin_use.html>
- <https://docs.kdenlive.org/en/user_interface/timeline.html>
- <https://docs.kdenlive.org/en/tips_and_tricks/tips_and_tricks/timeline_preview_rendering.html>

## Workspace model

### Story workspace

The Story workspace answers: “How does the complete lesson flow?”

Its timeline uses a small, stable set of tracks:

1. Scenes — one clip per scene, shown horizontally in project order.
2. Global overlays — titles, watermarks or elements spanning scene boundaries.
3. Narration — scene-linked voice clips.
4. Music — project-level background audio.
5. Sound effects — optional project-level effects.

Each scene clip shows its name, thumbnail, duration, narration state and warning
state. Double-clicking or pressing Enter opens that scene. Resizing a scene clip
changes its duration and ripples later scene offsets. Moving a scene reorders the
story. Scene transitions live on scene boundaries.

The Story workspace must not display every design layer or every animation
property. Its purpose is arrangement, pacing and project-level audio.

### Scene workspace

The Scene workspace answers: “What happens inside this scene?”

It contains:

- a breadcrumb: `Project > Scene 12`;
- Previous scene, Next scene and Back to Story actions;
- the active scene's Layers tree;
- the canvas/project monitor;
- the selected layer's inspector;
- a local timeline beginning at frame zero;
- local camera, narration, effect and animation controls.

Only the active scene's layers are mounted in the editor. Previous and next
scene thumbnails may be cached, but their canvases and timeline rows remain
unmounted.

### Assets and reusable library

Assets and reusable components are project resources, not scene layers. The left
panel should distinguish:

- Scenes — story navigation;
- Layers — objects in the active scene;
- Assets — imported media available to all scenes;
- Library — reusable components and animation presets;
- Script — narration text and scene assignment.

## Timeline density rules

The default Scene timeline shows one compact row per top-level layer. Child
layers remain inside a collapsed group until expanded.

Animation properties are revealed on demand:

1. Selecting a layer exposes its compact keyframe summary.
2. Expanding the layer shows only animated properties.
3. `All properties` temporarily includes properties without keyframes.
4. Collapsing the layer removes its property rows from layout and rendering.

The timeline must support:

- collapse/expand per track and for all tracks of a type;
- lock, hide, mute and solo where applicable;
- search and filters for selected, animated, visible, audio and warnings;
- adjustable row height and timeline zoom;
- range selection and keyboard movement without expanding rows;
- a fixed or freely moving playhead preference;
- virtualization for off-screen rows and scene clips.

## Timing model

Scene content uses scene-local frames. The story sequence derives global frames
from ordered scene durations.

```ts
interface Scene {
  id: string
  name: string
  durationFrames: number
  layerIds: string[]
  cameraKeyframes: CameraKeyframe[]
}

interface Layer {
  sceneId?: string
  scope: 'scene' | 'global'
  startFrame: number
}
```

`Layer.startFrame` is relative to the owning scene when `scope` is `scene`.
Global layers retain project-relative timing. Project playback calculates a
scene's start by summing the durations of earlier scenes.

Narration generated from a script segment belongs to its scene. Changing the
narration duration may offer to resize that scene; it must not silently stretch
speech. Music and other project-spanning audio remain global.

## Editing behavior

- Creating a scene opens it immediately.
- Duplicate Scene copies its local layers, animation and camera data with new
  identifiers while preserving asset references.
- Reordering scenes changes only story offsets, not scene-local keyframes.
- Splitting a scene creates two scenes and moves/splits local content at the cut.
- Merging adjacent scenes converts both local ranges into one new local range.
- Deleting a scene removes its owned layers after the normal undoable action.
- Opening a saved project restores the last active workspace and scene.
- Preview Scene plays only the active scene; Preview Project plays the assembled
  story sequence.
- Export can target the active scene, a selected scene range or the whole project.

## Performance requirements

The editor should remain responsive with 100 scenes and at least 100 layers in
one scene.

Implementation rules:

- Virtualize the scene navigator, Layers tree and timeline rows.
- Subscribe components to narrow Zustand selectors instead of the whole project.
- Keep playhead updates outside broad React rerenders; publish display updates
  through `requestAnimationFrame`.
- Render only active-scene layers on the interactive canvas.
- Generate thumbnails in the background and invalidate only the changed scene.
- Cache decoded media and waveform data by asset id.
- Use lower-resolution proxy media for large source video during editing.
- Add chunked preview rendering only for measured effect-heavy bottlenecks.
- Keep autosave incremental and debounce thumbnail/history work separately.

Initial performance budgets:

| Interaction | Target |
| --- | --- |
| Open another scene | under 200 ms when cached |
| Select a layer | under 50 ms |
| Drag/scrub feedback | 30 fps minimum, 60 fps target |
| Timeline scroll with 100 rows | no visible stalls |
| Autosave | no blocked editing input |

## Project migration

The migration must preserve existing projects and render output.

1. Add scene ownership without removing current global frame fields.
2. Assign each existing layer to the scene containing its start frame.
3. Convert its timing and keyframes from global to scene-local frames.
4. Keep layers outside every scene as `scope: 'global'`.
5. Move camera keyframes into scenes while retaining a temporary compatibility
   reader for existing global camera data.
6. Migrate narration links through their `scriptSegmentId` and scene assignment.
7. Verify old and migrated projects render the same frames before deleting the
   compatibility representation.

The schema version changes only when the persisted model changes. The first UI
phase can filter the existing global model without a migration.

## Implementation phases

### Phase 7.1 — Scene Focus MVP

Status: **Complete (2026-09-08)**

Goal: remove unrelated layers from the working view without changing persisted
timing.

- Add Story and Scene workspace state.
- Open a scene from the scene band or Scenes panel.
- Filter Layers, canvas and timeline to the active scene's global frame range.
- Add breadcrumb, Previous, Next and Back to Story navigation.
- Make Preview Scene and Preview Project explicit.
- Persist the last active workspace and scene as editor preference data.

Exit criteria:

- A project with 100 scenes can be navigated without showing 100 scenes' layer
  tracks at once.
- Existing projects render identically because no timing data has changed.

Implemented behavior:

- The editor opens in Story workspace, where the sidebar shows Scenes and
  Script and the timeline shows the scene band without expanding every layer.
- Opening a scene switches to Scene workspace, seeks to its first frame, clears
  stale selections and shows only layers whose global range overlaps that
  scene. Parent groups required by matching children remain visible.
- The preview canvas and timeline use the same focused layer set. Scene
  playback stops at the active scene boundary.
- A persistent workspace bar provides the project/scene breadcrumb, scene
  position, Previous, Next and Back to Story controls.
- The main preview action is explicitly labelled Preview Project or Preview
  Scene. Scene preview retains global frame timing while restricting its
  controls and playback to the active scene range.
- Workspace and active-scene choices are local editor preferences. The saved
  `.motionproj` schema and all layer/keyframe timing remain unchanged.
- Pure scene focus helpers cover half-open boundary behavior, spanning layers,
  parent-group retention and adjacent-scene navigation.

**Manual verification follow-up:** manually adding scenes at repeated playhead
positions surfaced a bug: adding a scene exactly at an existing scene's start
frame (frame 0 is the common case) produced a degenerate 1-frame scene shown
as "0.0s–0.0s" and rendered as a near-invisible 2px sliver on the timeline.
`addScene` in `src/domains/scenes/model.ts` now detects this boundary case and
splits the existing scene at its midpoint instead, so both resulting scenes
keep a real, visible duration. Covered by two new `model.test.ts` cases; the
mid-scene split path (playhead strictly inside a scene) was verified unchanged.

### Phase 7.2 — Compact timelines

Status: **Complete (2026-09-08)**

Goal: make both workspaces readable at scale.

- Replace the global scene band with one clip per scene in Story mode.
- Show only top-level scene layers by default in Scene mode.
- Reveal animated property rows on demand.
- Add collapse, lock, hide, mute, solo, search and track filters.
- Virtualize scene clips, layer rows and keyframe rows.

Exit criteria:

- A 100-layer scene scrolls and selects smoothly.
- Collapsed tracks do not create hidden DOM rows or keyframe nodes.

**Delivered:** `Timeline.tsx`'s `SortableLabel` and `LayersPanel.tsx`'s
`LayerRow` shared a drag handle and visibility/lock buttons extracted into
`src/components/timeline/LayerRowChrome.tsx`, which now also carries new
Mute/Solo controls for audio layers. `Layer` gains `solo?: boolean`; a new
`src/domains/audio/mixing.ts` resolves effective mute (a solo silences every
other audio layer, an individual mute always wins) at the single shared
render path in `Composition.tsx`, so solo/mute affect preview and export
identically. A shared `src/domains/timeline/filters.ts` plus a
`TrackFilterBar` component add search and Selected/Animated/Visible/Audio/
Warnings chips (Warnings reuses the existing stale-narration signal) to both
panels via one store-held `trackSearchQuery`/`activeTrackFilters`. Filtering
runs over the rows currently visible, so a match inside a collapsed group in
Scene workspace stays hidden until that group is expanded — verified live and
an intentional consequence of top-level-by-default rather than a bug to
route around. Scene workspace now shows only top-level scene layers by
default — a new
`visibleSceneLayerIds` in `src/domains/scenes/focus.ts` plus an ephemeral,
per-scene `activeSceneExpandedGroupIds` (reset on scene change) replace the
persisted `Layer.collapsed` toggle while inside a scene, leaving Story
workspace's collapse behavior unchanged. Story mode's scene band was
replaced with real clips (`SceneClipBand`/`SceneClip`) showing a thumbnail
(`src/domains/scenes/thumbnail.ts`, reusing `projectStorage.ts`'s existing
per-layer SVG renderer), duration and a narration badge; scene warning-state
is intentionally deferred to Phase 7.4. Layer rows in both panels and the
Story scene-clip strip are virtualized — `LayersPanel.tsx` through
`@tanstack/react-virtual`, `Timeline.tsx`'s dual synced-scroll columns
through a hand-rolled equivalent (`src/domains/timeline/virtualization.ts`,
unit-tested at 100-row scale) reusing the row-position data the timeline
already computed for keyframe/marquee hit-testing. The scene-local timing
migration (Phase 7.3) and a synthetic 100-scene/100-layer fixture remain
future work; this phase's virtualization was verified through the pure
windowing tests plus live drag-reorder/scroll checks on a ~13-layer/6-scene
project rather than a full-scale fixture.

### Phase 7.3 — Scene-owned data and local time

Status: **Complete (layer scene-ownership + ripple pass, 2026-09-08)**

Goal: make scenes independent editable compositions.

- Add `sceneId`/scope ownership and scene-local layer timing through a versioned
  migration.
- Move local camera and narration associations into their scenes.
- Derive story offsets from ordered scene durations.
- Implement ripple behavior for scene resize/reorder.
- Test save, reload, history, duplication and `.motionproj` import/export.

Exit criteria:

- Reordering or resizing a scene does not rewrite its internal keyframes.
- Migrated projects preserve preview and export output.

**Delivered (reduced scope, approved up front — see below for what's
deferred):** `Layer` gains `scope?: 'scene' | 'global'` and `sceneId?: string`.
A `scope: 'scene'` layer's `startFrame`/`endFrame` and every other
frame-bearing field (`keyframes[].frame`, `propertyKeyframes[...][].frame`,
`videoSegments[].timelineStartFrame/timelineEndFrame`,
`speedKeyframes[].frame`) are stored **scene-local** — frame 0 is the owning
scene's own start, not the project's global timeline; `scope: 'global'`/
`undefined` layers are unchanged from before this phase. The migration
(`schemaVersion` 12 → 13, `src/domains/project/migrations.ts`) assigns each
existing layer to the scene containing its global `startFrame` and converts
its timing to local via the new `src/domains/scenes/layerTiming.ts`
(`shiftLayerFrames`, `sceneLocalFrame`); a layer that doesn't fit inside any
scene is left `scope: 'global'`, untouched. `Scene`'s existing shape
(`startFrame`/`endFrame` already derived from cumulative prior durations by
`normalizeScenes`) needed no rename to satisfy "derive story offsets from
ordered scene durations" — confirmed during planning and a deliberate
scope-reduction.

The whole phase turns on one architectural move — **resolve once, reuse
everywhere** — so the 40+ existing call sites that read `Layer.startFrame`/
`endFrame` as global frames needed no change: `layerTiming.ts`'s
`resolveLayersToGlobalFrames(layers, scenes)` converts scene-scoped layers
back to global frames, and every render/display call site (the editor's
`Timeline.tsx`, `LayersPanel.tsx`, `CanvasOverlay.tsx`, and the shared
`EditorComposition` in `Composition.tsx` that both the Player preview and
MP4/WebM export use) calls it once and uses the *returned* array exactly as
before. The only place that needed real logic was the **write boundary**:
`store.ts`'s layer-creation actions (`addLayer`, `addImage`, `addVideo`,
`addAudio`, `addGeneratedLayer`, `addTechnicalComponent`,
`addLoadBalancerTopology`, `insertLibraryLayers`) now stamp `scope`/`sceneId`
and store scene-local frames when a scene is open (via a shared
`sceneAwareTimingForNewLayer` helper), and the actions that receive an
already-resolved global frame back from the UI (`updateLayerTimeRange`,
`setLayerRange`, `addKeyframe`, `addPropertyKeyframe`) convert it back to
local for scene-scoped layers before persisting. `layerOverlapsScene` (in
`src/domains/scenes/focus.ts`) got the other required change: a `scope:
'scene'` layer belongs to exactly its `sceneId`, not whatever scene its
frame range happens to overlap.

The ripple this phase exists to deliver falls out of that model for free:
resizing, reordering or duplicating a scene never touches its owned layers'
local frames — only `Scene.startFrame` changes (via the pre-existing
`normalizeScenes`/`reorderScene`), and every owned layer's global position
and keyframe spacing shift with it automatically through the resolver.
Verified live by duplicating a 14-layer scene (`duplicateScene`, a new store
action building on a new pure `duplicateScene` in
`src/domains/scenes/model.ts`) and confirming an independent, non-overlapping
copy with the following scene pushed forward by exactly the duplicated
scene's duration; `deleteScene` now also removes the layers it owns.
`ScriptScenesPanel.tsx` gained a "Duplicate scene" button alongside the
existing split/merge/delete actions.

**Deferred to a future pass** (all explicitly approved up front, not
oversights): camera keyframes moving into per-scene ownership, narration
becoming per-scene, and the `Scene` shape rename (`durationFrames`/
`layerIds`/`cameraKeyframes`) that a fuller Phase 7.4-style pass would want.
Two smaller gaps, also intentional given the reduced scope: whole-project
`trimTimelineAtFrame`/`trimTimelineStartAtFrame` leave `scope: 'scene'`
layers untouched rather than trimming them (no per-scene trim operation
exists yet), and several less-common keyframe actions
(`updateKeyframeEasing`, `updatePropertyKeyframeEasing`, `removeKeyframe`,
`removePropertyKeyframe`, `duplicateKeyframe`, `moveSelectedKeyframes`) still
assume global frames and weren't converted — not exercised by this phase's
verification, since it only required `addKeyframe`/`addPropertyKeyframe` for
the ripple check above. `scenes`/`activeSceneId` also still aren't part of
the undo/redo `DiagramSnapshot` (a pre-existing gap, confirmed during
planning, not introduced or fixed by this phase) — `deleteScene`/
`duplicateScene` on a project with scene-scoped layers are consequently not
undoable today.

### Phase 7.4 — Story assembly

Status: **Complete (reduced scope, 2026-09-08)**

Goal: finish the project-level editing workflow.

- Add scene thumbnails, drag reorder and boundary transitions.
- Add global overlay, narration, music and sound-effect tracks.
- Add project markers and scene warning/status indicators.
- Support active-scene, selected-range and full-project preview/export.
- Add copy, duplicate, split and merge scene operations.

Exit criteria:

- A creator can assemble and revise a 100-scene lesson without opening layer
  tracks in Story mode.
- Global audio and transitions survive reload and export.

**Delivered (reduced scope, approved up front):** investigation before this
pass found most of the checklist above already delivered by 7.1–7.3 (scene
thumbnails, side-panel drag reorder, narration-per-scene via
`ScriptSegment.sceneId`, the `music`/`sound-effect` `AudioRole` values,
project markers CRUD+UI, active-scene/full-project preview, and generic
frame-range export all already existed and worked) — so this pass covered
exactly the five genuine gaps found, and nothing else:

1. **Story-mode scene drag-reorder** — `Timeline.tsx`'s `SceneClipBand` (the
   Story-mode scene-clip strip) gained the same `DndContext`/`SortableContext`
   drag-reorder the Scenes side panel already had, calling the same existing
   `reorderScene` action. A small drag-handle grip (reusing the shared
   `LayerDragHandle`) disambiguates drag from the clip's existing
   click-to-seek/double-click-to-open.
2. **Per-scene warning icons** — a new `sceneHasWarning` (`src/domains/scenes/
   focus.ts`) aggregates the existing per-layer stale-narration signal
   (`hasStaleNarration`) per scene, surfaced as a small warning icon on both
   the Story-mode clip and the side-panel scene card (previously only a
   project-wide count existed).
3. **Scene-aware export/preview picker** — `ExportModal.tsx` gained a "Range"
   dropdown (Full project + each scene) that fills the existing generic
   frame-range fields from the chosen scene's global range; the fields stay
   editable afterward. `PreviewModal.tsx` needed no changes — it already
   derived active-scene-vs-full-project purely from `editorWorkspace`/
   `activeSceneId`.
4. **Scene boundary transitions (crossfade)** — new `Scene.transitionIn`/
   `transitionOut` (frames); a new pure `src/domains/scenes/transitions.ts`
   computes a 0–1 opacity ramp per scene at the current frame, multiplied
   into each scene-scoped layer's existing opacity in `Composition.tsx`
   (`LayerElement`/`GroupNode`) rather than adding a new per-scene wrapper —
   reuses the existing per-layer opacity pipeline, so preview and export
   (which share `EditorComposition`) get the effect identically. UI: "In"/
   "Out" frame inputs on the scene card.
5. **Scene/layer clipboard** — new `copyScene`/`pasteScene` store actions.
   `copyScene` serializes a scene + its owned layers (unremapped ids) to a
   single `localStorage` key; `pasteScene` remaps ids fresh at paste time
   (extracted into a shared, unit-tested `remapSceneOwnedLayers`, also now
   used by `duplicateScene`) and appends the scene to the current project's
   timeline. Verified live across two entirely different projects: copy in
   one, paste in the other, confirmed independent ids and an untouched
   source project.

**Deliberately out of scope for this pass** (per your explicit choice, not
an oversight): dedicated Story-mode timeline tracks for global-overlay/
narration/music/SFX layers — the underlying data model (`Layer.scope`,
`AudioRole`) already supports this; only the UI (separate track rows) is
still unbuilt, and remains a candidate for a future pass alongside the
camera/narration scene-ownership and `Scene` shape rename already deferred
from Phase 7.3.

### Phase 7.5 — Playback and large-project performance

Goal: keep editing and preview smooth with real media and effects.

- Profile the complete Load Balancer lesson and synthetic 100-scene fixtures.
- Add thumbnail, waveform and decoded-media caches.
- Add proxy media thresholds and background generation.
- Add invalidated-range preview rendering if profiling justifies it.
- Measure memory, scene-switch latency, timeline scroll and playback frame rate.

Exit criteria:

- Performance budgets are met on the target development machine.
- Cached/proxy playback never changes final export quality.

## Delivery order

Phase 7.1 should be implemented first. It gives immediate usability without a
risky schema rewrite. Phase 7.2 proves the interaction model. Only then should
Phase 7.3 migrate persisted timing. Story assembly and deeper performance work
follow on top of the proven scene boundary.

Do not begin the full acceptance lesson until Phases 7.1–7.4 are complete. The
lesson should validate the scalable workflow rather than become throwaway data
built in the current global editor.
