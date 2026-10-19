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

**Done** (2026-10-19):

- In-app OpenAI integration (`AiAssistantModal`, `AiChatPanel`,
  `server/aiAssistPlugin.ts`, `@openai/chatkit-react`, `ai.config.example.json`,
  `public/ai-*.md`) — removed.
- Manual-first principles in `AGENTS.md`, `PRODUCT_VISION.md`, roadmap, README —
  rewritten.
- Roadmap Phase 7.5 onward — stopped; Phase 8 superseded by phases 10-14.
- Home-screen HTML import button, video library and video timeline bars —
  removed. The app is English-only (the Czech translations were already gone;
  `src/i18n.ts` stays, with English only). The fork's Czech demo video and
  screenshot (`docs/videos/`, `docs/images/`) were deleted.
- Old test projects and test exports in `data/` — deleted.

**Not done, by choice:** speed keyframes and the segment controls (shared with
narration audio), social canvas presets, the video layer type (old projects
render), and the rest of the editor, which stays for inspection.

## Docs to update as work lands

All updated on 2026-10-19: `AGENTS.md` (rewritten), `README.md` (rewritten),
`docs/PRODUCT_VISION.md` and `docs/IMPLEMENTATION_ROADMAP.md` (contradicting
passages rewritten, phases 10-14 added), `docs/PROJECT_SCHEMA.md` (v13, v14),
`docs/LOCAL_TTS.md` (lesson CLI section); `IMPLEMENTATION.md` and
`docs/SCENE_FIRST_EDITOR.md` carry a status note. Any future persisted-field
change still needs a schema bump and migration.

## Acceptance

The AI, given only a teaching script for the Load Balancer lesson, produces a
spec, builds the project, renders and self-reviews it, and delivers a video the
human can preview and export without opening an editing panel.

## Status at a glance (end of 2026-10-19)

| Item | State |
| --- | --- |
| 1 Lesson spec + compiler | Done |
| 2 Auto-layout | Done (left-to-right layers, up to five columns) |
| 3 Self-review loop (`validate`/`build`/`lint`/`stills`) | Done |
| 4 Narration-driven timing | Done (chunk cues; no forced alignment needed) |
| 5 Component kit | Done (10 kinds) |
| 6 Explainer blocks | Done: `hide`, code/request, comparison and bullet cards, sequence diagrams, title/outro cards, emphasis and data-flow pulses |
| 7 Theme file | Done (`src/domains/lesson-spec/theme.ts`) |
| 8 Review-only UI | Done (`/review/<id>`) |
| 9 Patchable specs / stable ids | Done (stable-id patch CLI with validation and explicit write) |

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
  Use the review screen (`/review/<id>`, never writes) instead of the editor;
  close any editor tab before running `build`.
- Labels are limited to 16 characters.
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

### 2026-10-19 — Milestone 3: narration-driven timing (item 4)

- **Cues in narration.** `[[id]]` inside a scene's `narration` means "reveal (or
  hide) `id` when the words after this begin". Cues must name an id in the same
  scene's `reveal`/`hide`, at most once each. They are stripped from captions
  and the script. Elements without a cue keep the even-spacing fallback.
- **`npm run lesson -- narrate <spec> [--voice baseVoice] [--worker URL]`** —
  synthesises each scene with the local Chatterbox worker, one chunk per cue
  boundary, joins the chunks (0.18 s gap), measures real durations, registers
  one WAV per scene in the editor asset store (`data/assets`) and writes
  `data/narration/<spec id>.json`. Chunks are cached by hash of text + voice +
  settings (`data/narration/cache/`), so editing one phrase re-synthesises only
  that phrase. Start the worker first (see `docs/LOCAL_TTS.md`).
- **`build`/`lint`/`stills` use the manifest automatically.** Scene length =
  0.5 s lead + audio + 0.7 s tail; cue times become reveal/hide/draw frames;
  one `audioRole: 'narration'` layer per scene. A manifest older than the
  narration text is refused with "run `lesson narrate`".
- **Stills and renders need `--public-dir=data`** so Remotion can find the
  audio (the app's export already passes it; the CLI now does too).
- Verified: Load Balancer lesson is 31.8 s of real speech (was 37 s of
  placeholder); a rendered slice has an AAC audio track with audible speech.
- Cost: ~2.5 min for the first full synthesis (5 scenes, Apple GPU).

Known limits: chunking at cues can sound slightly choppy at a comma; the
fast-narration lint threshold (3 words/s) is a guess to be tuned by ear; the
`recap` scene still triggers the static-scene warning.

Next: a review-only UI (no autosave, per-scene notes the AI can read), then the
component kit and explainer building blocks.

### 2026-10-19 — Milestone 4: review-only screen, lighter testing

- **`/review/<project id>`** (`src/components/ReviewScreen.tsx`): plays the
  project from disk with Remotion Player controls, scene list that seeks,
  timestamped **notes for the AI** (saved to `data/reviews/<id>.json` via
  `server/reviewPlugin.ts`) and **Export MP4** (reuses `/api/exports`, with
  progress and reveal-in-Finder). It never writes the project, so it cannot
  overwrite a build.
- **`npm run lesson -- notes <spec> [--done]`** prints open notes (scene, time,
  text) for the AI; `--done` marks them handled.
- **Testing stance (user feedback):** keep tests to non-trivial pure logic
  (timing, cues, migrations, file formats); no per-error-message tests; one
  render check per visual change. Trimmed 25 over-specific tests.

Next: bigger component kit and explainer building blocks; remove the in-app
OpenAI ChatKit integration; hide leftover MotionEditor UI.

### 2026-10-19 — Milestone 5: component kit (item 5)

- Kit grows from 3 to 10 kinds: client, load-balancer, server, **database,
  cache, queue, cdn, api-gateway, object-storage, worker**. Single source of
  truth is `TECHNICAL_COMPONENT_KINDS` in `src/types.ts`; the validator,
  compiler palette (type-checked for completeness) and CLI artwork map all
  derive from it, so adding a kind is: add the name, an SVG, a colour pair and
  a path in `tools/lesson/cli.ts`.
- New SVGs follow the existing contract (240x150, line art, currentColor) under
  `data-stores/`, `messaging/` and `traffic-edge/`, `compute/`.
- Second lesson, `lessons/page-load.lesson.json` (browser -> CDN -> gateway ->
  server -> cache/database), uses five columns, the layout's maximum at
  1920 px. Not narrated yet.
- The in-app editor's "insert component" menu still offers only the original
  three; new kinds are spec-only, which is all the AI workflow needs.

Known limit: more than five columns will not fit (the validator says so); an
adaptive column step would raise it if a lesson needs it.


### 2026-10-19 — Milestone 6: ChatKit removed, code/request cards

- **Removed the in-app OpenAI integration:** `AiAssistantModal`, `AiChatPanel`,
  `server/aiAssistPlugin.ts`, `public/ai-*.md`, `ai.config.example.json`, the
  ChatKit script tag, `@openai/chatkit-react`, the top-bar AI button and its CSS.
  README now documents the `lesson` workflow instead. (`ai.config.local.json`
  stays in `.gitignore` as a safety net. `pnpm-lock.yaml` still lists the
  dependency; the project's own lockfile is `package-lock.json`.)
- **Cards:** a scene may carry `card: { id, title?, lines[] }` (max 8 lines of
  60 characters). It fades in over a dimmed diagram for that scene only, with
  monospace lines revealed one by one. Cue a line with `[[<card id>.<n>]]`
  in the narration, e.g. `[[req.2]]`. The card is placed at the centre of the
  scene's caption-free camera framing and scaled by 1/zoom so it keeps a fixed
  on-screen size.
- Renderer facts learned: top-level layers stack **first-on-top**, while a
  group's children stack **last-on-top**; the layer defaults carry per-side
  border widths and per-corner radii that override plain `strokeWidth` /
  `borderRadius`, so the compiler's layer builder now sets all of them (this
  also fixed square, borderless component boxes in every lesson).
- `lessons/page-load.lesson.json` now has an HTTP request card scene.

Next: hide leftover MotionEditor UI (home screen
still says "MotionEditor", HTML import, video library); optional adaptive
column spacing for graphs deeper than five columns.

### 2026-10-19 — page-load lesson narrated

- `lessons/page-load.lesson.json` has cues on every reveal, including the card
  lines (`[[req.1]]`..`[[req.4]]`). 7 scenes, 37 s of speech, 45.5 s video,
  ~3 min to synthesise (45 chunks). Lint is clean. A mid-scene frame confirmed
  the card lines appear on their cues.
- Both lessons are built from their specs; open
  `/review/lesson_page-load` or `/review/lesson_load-balancer` to preview.
- Not yet verified by ear: very short chunks (e.g. "a CDN,") may sound
  choppy; if so, merge cues into longer phrases or move the cue to a phrase
  boundary.

### 2026-10-19 — Milestone 7: first unaided end-to-end lesson

Topic chosen by the AI (no help from the human): **How a Message Queue Works**
(`lessons/message-queue.lesson.json`, 6 scenes, 37.5 s of speech, 44.7 s video,
uses the queue / worker / object-storage kinds and a JSON card). Flow:
write spec -> `validate` -> `lint` -> `narrate` (3 min) -> `build` -> `lint` ->
`stills` -> fix -> full MP4 export through the app's `/api/exports`.

What the test found and fixed:

- **Export bug (real):** the review screen's Export button sent no frame range,
  and the export API collapsed a missing `endFrame` to frame 0, so it would have
  produced a **one-frame video**. The server now defaults to the whole video and
  the screen sends the range explicitly.
- **Lint too strict:** zooming the camera onto a subset of components flagged
  the rest as "cut off". The rule now flags only *partially* visible components
  (a component fully out of frame is a deliberate camera move). The spec was
  also changed (`scale` scene hides `user` and `app` so no arrow dangles in).
- Verified the exported file: 1920x1080, 30 fps, H.264 + AAC, 44.7 s, steady
  speech level throughout, and the JSON card's lines reveal on their cues.

Still not verified by a human ear: voice quality and the choppiness of short
chunks. Still open from the status table: theme file, patch tooling, and the
remaining explainer blocks (data-flow pulses, title/outro cards, emphasis,
sequence diagrams).

### 2026-10-19 — Voice quality check (found by the human's ear)

- The human reported a mispronounced word in the "Save the result" scene. Cause:
  Chatterbox stretched the one-word chunk "storage," to 2.7 s (a normal take is
  ~0.7 s). "a queue," was also off (1.5 s).
- `narrate` now judges every chunk (`chunkLooksWrong`: longer than
  max(1.2 s, 0.18 s per character)), re-rolls a suspect take up to three times,
  keeps the best, caches only that, and also re-checks previously cached takes.
  It prints a warning if three tries all look wrong (then merge the phrase into
  a longer one). Short chunks of one or two words are the usual cause.
- After the fix: "storage," 0.76 s, "a queue," 0.88 s; message-queue video 42.1 s.
- Pace is a little slow (human feedback, "fine for now"). Possible knob later:
  a lower `--cfg` (e.g. 0.3) makes Chatterbox speak faster.
- VS Code's built-in video preview does not play audio; check videos in
  QuickTime or the review page.

### 2026-10-19 — Milestone 9: lesson theme

- `src/domains/lesson-spec/theme.ts` is now the typed visual system for
  compiled lessons: background and surface colours, the per-component palette,
  typography, layout spacing, motion timing and sketch defaults. The compiler
  consumes it instead of defining presentation constants inline.
- A focused test ensures the theme remains complete when a technical component
  kind is added. The theme does not change the spec schema or existing renders.

### 2026-10-19 — Milestone 10: patchable specs

- `npm run lesson -- patch <spec.json> <patch.json>` applies a narrow semantic
  patch format in memory and prints the resulting spec. `--write` is explicit;
  without it, no source file changes. Patches address existing lesson, scene,
  node and edge fields by their stable IDs and cannot replace those IDs.
- The patcher validates the complete proposed result through the usual lesson
  validator, so an invalid reference, reveal order or layout rule is rejected
  before it reaches a spec. It is intended for the AI to turn a human review
  note into a small, auditable JSON patch—not to interpret free-form notes
  automatically.

### 2026-10-19 — Milestone 11: comparison cards

- Scenes can now use `comparison: { id, left, right }` for two titled panels
  over a dimmed diagram. Each side accepts one to six short lines; those lines
  can reveal on narration cues such as `[[tradeoff.left.2]]`. A comparison and
  a code/request `card` are intentionally mutually exclusive in one scene.
- `lessons/queue-vs-direct.lesson.json` is a small source-controlled example.
  It validates and lints cleanly, and its rendered comparison still was checked
  at video scale for legibility and layout.

### 2026-10-19 — Production pipeline: reliability baseline

- Generated `lesson_*` project files are now atomically written by the lesson
  CLI, and the local project API refuses legacy-editor saves over them. Manual
  projects retain ordinary editor persistence; lesson changes continue to flow
  through the source spec and rebuild command.
- Runtime asset indexes are no longer tracked. A clean clone creates an empty
  ignored index on first use; missing asset files return an actionable 404, and
  the lesson CLI rejects a narration manifest whose WAV files are unavailable.
- Project histories and review notes use the same atomic replacement pattern.
  The previously failing `focus.test.ts` fixture was made structurally valid,
  restoring a clean TypeScript baseline.

### 2026-10-19 — Production pipeline: semantic teaching overlays

- `bullets` provides cue-driven explanation, definition, takeaway and recap
  cards, including neutral/positive/negative emphasis. It deliberately reuses
  the established compiler overlay geometry and animation.
- `sequence` describes participants and synchronous, asynchronous or response
  messages—without coordinates. The compiler positions participant labels and
  lifelines, then reveals directional message rows from narration cues.
- `lessons/request-response-sequence.lesson.json` is the representative source
  example. Its validated/linted, rendered sequence frame was inspected at
  video scale.

## Milestone 8 handoff and implementation notes (written 2026-10-19)

The following was written as a handoff when the implementation was complete but
not yet visually checked. The verification result is recorded below.

### Visual polish (Milestone 8) — implementation

The human approved this plan: **data-flow pulses, title card + outro, emphasis**,
then a **voice-speed comparison**. The code for the first three was written
with no new tests (testing stance: keep tests light, see `AGENTS.md`).

What was added (all uncommitted work is now committed; see `git log`):

- **Pulses (flow dots).** Spec: scene `flow: ["<edge id>"]` (edge must already be
  revealed; one flow range per edge; optional cue `[[flow:<edge id>]]`). Compiler
  sets connector `pulseStartFrame`/`pulseEndFrame` (start = cue, else after the edge
  finishes drawing; end = end of the scene). Schema **15** (identity migration).
  Renderer: `connectorPulses()` in `src/domains/connectors/draw.ts` (2 dots, 54-frame
  loop, fade in/out), `pointAtDistance()` in `geometry.ts`, drawn in
  `ConnectorOverlay` in `src/remotion/Composition.tsx` (white-ringed dot with a halo).
- **Emphasis.** Spec: scene `emphasize: ["<node id>"]` (node must be revealed;
  optional cue `[[emphasize:<node id>]]`). Compiler: scale bump to 1.06 on the
  component group plus a glow on its body via `shadowBlur`/`shadowSpread`
  `propertyKeyframes` (`glowKeyframes()` in `compile.ts`). The renderer draws the
  box-shadow glow cleanly, so no fallback halo layer is needed.
- **Intro / outro.** Spec: top-level `intro: { subtitle?, seconds? }` (silent title
  card, opaque, fades out; title = spec `title`) and `outro: { text, seconds? }`
  (silent, dims the final diagram, holds to the end). Compiler adds scenes
  `scene_intro` / `scene_outro` with no script segment (so no captions) and
  `titleCardLayers()` in `compile.ts`. Default 3 s each. Lint now maps spec scenes
  to project scenes by id (indices shift when an intro exists).
- `lessons/message-queue.lesson.json` now uses all of it: intro "Background jobs,
  explained", outro "Thanks for watching", `flow` on `app-queue` / `w1-store` /
  `w2-store` / `queue-w1` / `queue-w2`, `emphasize` on `w1,w2` (workers scene) and
  `queue` (scale scene). Narration text is unchanged, so the existing audio is still
  valid. It built to 8 scenes / 48.1 s with no lint issues.
- `npm run lesson -- stills` now clears its output folder first (stale stills from an
  older scene order used to mix in).

### Verification, export and documentation

- `validate` and `lint` are clean. The rebuilt Message Queue project has eight
  scenes and runs for 48.1 seconds.
- The full still set was inspected: the title card and outro are readable, the
  worker and queue glow is clear without obscuring their labels, and pulse dots
  remain distinct from the connector lines.
- The review screen was used to play the flow scenes. Dots begin after their
  cue and visibly travel along their worker paths; the scene change removes them
  before the outro. No visual code changes were needed.
- A new standard MP4 was exported through `/review/lesson_message-queue` and
  verified as 1920×1080 at 30 fps with H.264 video and AAC audio (48.15 s).
  Review it in QuickTime or at `/review/lesson_message-queue`, not VS Code's
  preview, which does not play audio.
- `README.md` now documents `intro`, `outro`, `emphasize`, `flow`, their cues,
  and title-card limits.
- `npm test` passes (25 files, 175 tests). `npx tsc --noEmit` still reports the
  documented pre-existing error in `src/domains/scenes/focus.test.ts`; this work
  does not add type errors.

### Voice-speed comparison

- The separate Chatterbox worker was started and a non-destructive `--cfg 0.3`
  pass was generated. It produced **35.82 s** of speech and a **49.05 s** video,
  slightly longer than the default `cfg 0.5` result (**34.94 s** speech,
  **48.15 s** video), despite the lower setting being expected to sound faster.
- The comparison is exported as `How a Message Queue Works (cfg 0.3 comparison).mp4`.
  The default `cfg 0.5` manifest was then regenerated from cache and the project
  rebuilt, so `/review/lesson_message-queue` remains on the standard version.
- The remaining decision is human listening: compare the two MP4s in QuickTime
  or the review screen and choose the preferred delivery, rather than assuming
  a configuration value predicts perceived pace.

### Gotchas learned this session

- **Never** write `open(p,'w').write(open(p).read())` in an edit script: it empties
  the file (it wiped `compile.ts` once; recovered with `git checkout`). Read first,
  then write.
- Top-level layers stack **first-on-top**; a group's children stack **last-on-top**.
- Do not open `/editor/<id>` before `build`: autosave overwrites the build.
- `data/assets/index.json` is local runtime data (lists narration audio): do not commit it.
- Chatterbox can stretch one- or two-word chunks; `narrate` now re-rolls takes that
  look wrong (3 tries). If it warns "still looks wrong", merge the phrase into a
  longer one in the spec.
- Pushed history has one non-buildable commit (`e5e726d`); not worth rewriting.

### Remaining roadmap after this task (see "Status at a glance")

9:16 vertical output (layout assumes wide canvas), sequence diagrams and bullet
lists, adaptive column spacing for graphs deeper than five columns, and a human
listen to the voice on `page-load`.

## Production pipeline (branch `feat/production-pipeline`, 2026-10-19)

Done, in order: atomic narration commits and scoped review-note resolution;
orientation-independent cycle validation; real sequence diagrams (lifelines,
sync/async/response arrows); native 9:16 (`frame.ts`, responsive `overlays.ts`,
portrait node layout, camera zoom-out); `dark-sketch` and `clean-technical`
themes (`theme.ts`, `spec.theme` / `--theme`); `npm run produce` (resumable,
fingerprinted, ffprobe-verified, 16:9/9:16/both; `docs/PRODUCTION_PIPELINE.md`);
agent authoring from a plain script (`--script`, `docs/AUTHORING_GUIDE.md`);
review/revise/compare/verify cycle; GitHub Actions (`.github/workflows/ci.yml`).

Decisions worth keeping:

- Portrait output is a different **project id** (`lesson_<id>-9x16`), not a mode of
  the landscape project, so both can be reviewed and exported side by side.
- Narration depends only on narration text and voice settings, so theme, aspect
  and quality changes never re-speak anything.
- Verification is evidence-gated: `notes --verify` refuses until something was
  rendered after the correction; deleting a review note needs an explicit id and
  only works while it is pending.
- Sketch distortion is applied to component bodies and connectors only.

Gotchas learned:

- `tsconfig.json` used to include only `src`; `tools/` and `server/` were never
  type-checked. It now covers all three (`npm run typecheck`).
- A fresh clone has no `data/assets/index.json`, which the Remotion entry imports;
  render paths create the empty list (`ensureAssetIndex`).
- Remotion's default colour output is full-range `yuvj420p`; renders use
  `--color-space=bt709` (yuv420p, limited range).
- ffmpeg prints tiny differences in exponent form (`4.8e-07`); parse it.
- Stills are taken 16 frames before a scene ends so overlays are not mid fade-out.

Not done / limits: GitHub Actions has not been observed running (written and
exercised locally on a clean clone only); captions show a whole scene's narration
at once (long scenes make tall captions, lint warns); the voice worker is
required for narrated output and is slow (about 10 minutes for a 100-second
lesson the first time, near-instant from cache).
