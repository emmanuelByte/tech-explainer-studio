# AI-Authored Pivot — Plan (2026-10-19)

## Decision

Tech Explainer Studio changes direction from **manual-first, AI-assisted** to
**AI-authored, human-reviewed**:

- The AI (Claude Code) writes the lesson, builds the video project, renders it,
  inspects the frames, and fixes problems.
- The human only **previews and exports**. Feedback goes back to the AI as
  review notes, not as manual edits.

This supersedes the "manual-first / not AI-controlled" statements in
`AGENTS.md`, `docs/PRODUCT_VISION.md` and `docs/IMPLEMENTATION_ROADMAP.md`,
including "automatic script-to-final-video generation" being out of scope.
Those documents must be rewritten (see Docs below).

## Decisions made

1. **The lesson spec is the source of truth.** The editor is a read-only
   previewer. Changes go through the spec (via AI, driven by review notes);
   regenerating the project from the spec is expected and safe.
2. **Narration voice is the local Chatterbox `baseVoice`.** No hosted TTS.

## Starting point (what already exists)

Scenes and script, 3 technical components (client, load balancer, server),
semantic connectors, deterministic sketch draw-on, camera pan/zoom keyframes,
Chatterbox narration with captions, Remotion MP4/WebM export, schema v12 with a
single migration boundary (`src/domains/project/migrations.ts`).

Gaps for AI authoring: no diagram description language, no auto-layout, the AI
cannot see its own output, narration timing is not word-aligned, the component
kit is tiny, and the only AI integration is an in-app OpenAI ChatKit panel.

## Work to add (priority order)

1. **Lesson spec + compiler.** A small declarative JSON spec (scenes, nodes,
   edges, reveal steps, camera focus, narration) compiled deterministically into
   a `MotionProject` through the existing migration boundary — not through the
   Zustand store. Replaces the title/narration/`visual`-text import in
   `src/domains/scenes/structuredScript.ts`.
2. **Auto-layout.** Row / flow / layered / grid placement and connector routing;
   keep everything on-canvas and non-overlapping. The AI never writes pixel
   coordinates.
3. **Self-review loop (CLI).** `validate`, `build`, render stills at each
   scene's key moments, quick low-res render, and a lint pass (text overflow,
   overlaps, off-canvas, low contrast, overcrowded scenes, scenes without
   narration or reveals).
4. **Narration-driven timing.** Word/phrase timestamps from the generated audio;
   cue markers in narration (e.g. `[[reveal:lb]]`) drive reveal timing. Cache TTS
   per segment (hash of text + voice) so one edit does not re-synthesize the
   whole script.
5. **Bigger component kit.** SQL/NoSQL database, cache, queue, CDN, DNS, API
   gateway, object storage, worker, search, observability, plus a generic
   labeled box and Lucide-icon fallback.
6. **Explainer building blocks.** Code/JSON blocks with line reveal, terminal and
   HTTP request/response cards, sequence diagrams, bullet/comparison cards,
   title/outro/lower-third cards, data-flow pulses along connectors, semantic
   actions (reveal, highlight, dim others, camera-focus on nodes).
7. **Theme file.** Colors, fonts, sketch level, spacing in one place.
8. **Review-only UI.** Play, scrub per scene, timestamped review notes saved as
   structured data for the AI to read, Export. Editing panels hidden by default.
9. **Stable semantic IDs and patchable specs**, so a change request is a small
   spec patch, not a full regeneration.

## Remove or demote

- In-app OpenAI integration: `AiAssistantModal`, `AiChatPanel`,
  `server/aiAssistPlugin.ts`, `@openai/chatkit-react`, `ai.config.*`,
  `public/ai-*.md`. Replaced by the file/CLI interface above.
- Manual-first principles in `AGENTS.md`, `PRODUCT_VISION.md`, roadmap.
- Roadmap Phase 7.5 onward (human editing ergonomics). Redefine Phase 8 as: the
  AI produces the Load Balancer lesson end to end from a script.
- Generic MotionEditor leftovers (HTML import, video library, speed keyframes,
  social canvas presets, Czech i18n): hide first, delete later.

## Docs to update as work lands

- `AGENTS.md` — project identity and principles.
- `docs/PRODUCT_VISION.md` — "manual-first" sections.
- `docs/IMPLEMENTATION_ROADMAP.md` — phases 7.5+, new phases for this plan.
- `docs/PROJECT_SCHEMA.md` — any persisted-field change needs a schema bump and
  migration (existing rule still applies).

## Acceptance

The AI, given only a teaching script for the Load Balancer lesson, produces a
spec, builds the project, renders and self-reviews it, and delivers a video the
human can preview and export without opening an editing panel.

## Progress log

### 2026-10-19 — Milestone 1: spec, compiler, render-and-look loop

Delivered (items 1–3 above, first cut):

- `src/domains/lesson-spec/` — `types.ts` (spec), `validate.ts` (structure,
  references, reveal order, cycles, label/canvas fit), `compile.ts` (pure,
  deterministic spec → `MotionProject`, auto-layout, reveal keyframes, connector
  draw timing, per-scene camera that keeps content clear of the caption strip),
  `compile.test.ts`. Compiled output round-trips through `migrateProject`.
- `tools/lesson/cli.ts` and `npm run lesson -- <validate|build> <spec.json>`
  (bundled with esbuild; no new dependencies). `build` writes
  `data/projects/lesson_<id>.json`.
- `lessons/load-balancer.lesson.json` — first spec (5 nodes, 4 edges, 5 scenes).
- Self-review loop works: `npx remotion still src/remotion/index.tsx
  EditorComposition <out.png> --frame=<n> --props=data/projects/<id>.json`
  renders a frame in about 3.5 s, so the AI can look at its own output.

Renderer bugs found by looking at the stills and fixed:

- Fonts: `loadEditorFonts` asked the browser for Inter before the Google Fonts
  stylesheet had loaded, so renders (and therefore exports) used fallback
  fonts. It now waits for the stylesheet. Text layers also get a generic
  `sans-serif` fallback and the SVG connector label uses Inter.
- Caption box wrapped at half the canvas width; it now sizes to its text.

Findings still open:

- **An open editor tab overwrites rebuilt projects.** The editor autosaves its
  in-memory copy over `data/projects/<id>.json`, silently reverting a build.
  The review-only UI (item 8) must not autosave, and must reload from disk.
  Until then, close the editor tab before running `build`.
- Labels are limited to 16 characters; the component kit is still 3 kinds.
- Pre-existing type error in `src/domains/scenes/focus.test.ts` (not touched).


### 2026-10-19 — Milestone 2: hide, lint, stills

- **`hide`** on a scene removes earlier-revealed nodes/edges (fade-out). Needed a
  persisted field: connector `hideFrame`, schema **14** (identity migration +
  test; `docs/PROJECT_SCHEMA.md` updated, including the previously missing v13).
  Validator rejects hiding something not yet revealed, hiding twice, focusing a
  hidden node, and revealing an edge after its node is hidden.
- **Camera now holds.** Keyframes used to sit at scene starts, so the camera
  drifted for the whole scene. It now holds each framing, moves over 24 frames
  at the start of the next scene, and holds again.
- **`npm run lesson -- lint <spec>`** — off-canvas, caption collision, node
  overlap, narration faster than 3 words/s, narration over 45 words, dense
  scenes (>7 components), static scenes. Exit code 1 on errors.
- **`npm run lesson -- stills <spec>`** — builds the project and renders one
  frame per scene (just before it ends) to
  `data/exports/stills/<project id>/NN-<scene>.png` (~4 s per scene).
- Renderer fixes found from the stills: connectors that have not started
  drawing no longer leave an arrowhead dot; connector labels get a
  background-coloured halo so they stay readable over the line.
- Load Balancer lesson updated to use `hide`. Lint reports one genuine
  warning: the `recap` scene changes nothing on screen.

Workflow for the AI: edit spec -> `validate` -> `lint` -> `stills` -> read the
PNGs -> fix -> repeat. Keep the editor tab closed or on the home screen while
building (see autosave finding above).

Next: real narration timing from Chatterbox (item 4): generate per-scene audio
with a cache, measure durations, replace placeholder scene lengths, and add
reveal cues in narration.
