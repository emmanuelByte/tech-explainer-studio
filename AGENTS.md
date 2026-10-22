# AGENTS.md

## Project identity

Tech Explainer Studio turns a lesson spec into a narrated, animated technical
explainer video (system design, architecture). It is a fork of
`tomaslachmann/motion-editor` (React 19, Vite, Zustand, Remotion).

Since 2026-10-19 it is **AI-authored and human-reviewed**:

- **You (the AI) author**: write `lessons/<name>.lesson.json`, build it, look at
  the rendered stills, fix problems.
- **The human reviews**: previews at `/review/<project id>`, leaves notes, exports.

The plan, decisions and a dated progress log are in
`docs/2026-10-19-AI-AUTHORED-PIVOT.md`. Read it before starting a major feature.
It supersedes the old "manual-first" documents.

## Visual-quality benchmark and approval gate (2026-10-22)

Read [the reference benchmark](docs/2026-10-22-VISUAL-REFERENCE-BENCHMARK.md),
[the technique catalog](docs/visual-references/TECHNIQUES.md), and the annotated
screenshots of **all seven reference videos**
([CodewithIddris](docs/visual-references/README.md) and
[the other six](docs/visual-references/extra-six/README.md)) before any lesson
visual design or production work. The seven references carry **equal weight**:
there is no primary or secondary reference. Take each technique from whichever
video does it best (the KodeKloud protocol and authentication videos are the
richest source of sequence and state techniques), render it in our own house
style, and do not assume the current engine supports every shot. The user wants polished
application-driven technical motion graphics, **including evolving fictional
app UI, architecture, data flow, meaningful state changes, typography, pacing,
and transitions**, not disconnected diagrams or a pure sketch slideshow.
This is a desired quality bar; the current lesson spec does not implement all
of it. Reuse the production engine and only add demonstrated missing primitives.
Do not copy third-party footage, branding or app assets from the reference.

**Production gate:** For publishable lessons, the user and ChatGPT agree on the
teaching script and explicitly approve narration **before** the coding agent
starts production. Preserve approved narration verbatim. Make a storyboard of
what visually changes with each beat; if the compiler cannot express an approved
shot, report/implement the smallest necessary extension rather than replacing
it with a generic overlay. Never change approved words without approval.

## In-house visual bar: the caching hero shot (approved 2026-10-22)

`src/remotion/hero/` is a hand-built 30 s, 9:16 shot that the user approved as
**exactly the target look**. Watch `docs/hero-reference/caching-hero.mp4` (or run
`npm run hero:studio`) before any visual work. It defines our **house style**
(tokens, type, composition) and proves these techniques render in this engine.
It does not rank the references: they are all equal sources of technique, and
the techniques it does not cover yet are listed in
`docs/visual-references/TECHNIQUES.md`.

What it establishes, and what every lesson should now do:

- Portrait-first composition; one persistent layout that changes state in place
  (no text-card slideshow).
- A hook with a concrete number in the first 3 s; consistent illustrative numbers.
- A fictional app UI (phone screen) tied to backend state.
- Visible cause and effect: chips carry payloads, meters move, nodes glow under
  pressure, badges mark hit/miss, a big readout changes value.
- One highlighted keyword per caption phrase; handwriting only for short notes.
- Tokens in `src/remotion/hero/theme.ts` (navy field, blue request, teal cache/
  healthy, amber attention, red pressure, IBM Plex Sans / Kalam / JetBrains Mono).

**Next engineering step:** promote each file in `src/remotion/hero/primitives/`
into a lesson-spec component or action (see `src/remotion/hero/README.md`), then
rebuild this shot from a lesson JSON and compare it with the hand-built render.
Do not edit the hero files to fit the compiler; extend the compiler to reach the hero.
Then work through the **build** rows in `docs/visual-references/TECHNIQUES.md`,
starting with whatever the next lesson's storyboard needs.

## Studio skills (making videos)

Video production runs through the project skills in `.claude/skills/`, **one video
at a time**: `studio-video` (the conductor: stages, gates, `docs/videos/<nn>-<slug>/STATUS.md`),
`studio-script` (hook-first narration and fact-check, Gate A), `studio-storyboard`
(beat plan and new primitives, Gate B), `studio-primitive` (reusable library pieces),
`studio-review` (side-by-side, scores, metrics, Gate C). The benchmark queue of six
reference topics is in `.claude/skills/studio-video/references/benchmark-queue.md`.
Never start the next video before the user signs off the current one.

## The workflow

Run from the repository root. The app (`npm run dev`, port 3005) must be running
for the human, not for the CLI.

```bash
npm run lesson -- validate lessons/x.lesson.json   # structure and references
npm run lesson -- build    lessons/x.lesson.json   # writes data/projects/lesson_<id>.json
npm run lesson -- lint     lessons/x.lesson.json   # layout and pacing checks
npm run lesson -- stills   lessons/x.lesson.json   # data/exports/stills/<id>/NN-<scene>.png - read them
npm run lesson -- narrate  lessons/x.lesson.json   # Chatterbox voice -> real timings (needs the worker)
npm run lesson -- notes    lessons/x.lesson.json   # the human's review notes (--done marks them handled)
```

### Approval-gated production workflow

1. **Visual pass first — no narration and no MP4 export.** The AI authors the
   spec, then runs `validate` -> `build` -> `lint` -> `stills` in each requested
   aspect. The human reviews and plays the scene visuals at `/review/<project id>`
   and gives per-scene notes. Iterate on the spec until every scene is approved.
2. **Narrated preview second — still no final export.** Only after visual approval,
   run `narrate`, rebuild, and let the human preview the synchronized narration,
   captions, and approved visuals. Apply any final notes to the spec and repeat
   this preview as needed.
3. **Export last.** Run `produce` (render, ffprobe verify, and decoded-frame
   inspection) only after the human explicitly approves the narrated preview.

When the human leaves notes, apply them **to the spec**, never to a generated
project. Do not begin narration or an export merely because a spec validates.

**One command does the whole chain** (validate, narrate, build, lint, stills,
render, ffprobe verify), resumable and incremental, in 16:9 and/or 9:16. It is
the post-approval export command, not the default first review step:

```bash
npm run produce -- lessons/x.lesson.json --aspect both          # from a spec
npm run produce -- --script lessons/x.script.md --aspect both   # an agent authors the spec first
```

See `docs/PRODUCTION_PIPELINE.md` (options, restart rules) and
`docs/AUTHORING_GUIDE.md` (how to turn a script into a spec). Add `--aspect 9:16`
to `build`/`lint`/`stills` to check portrait, and `--theme dark-sketch|clean-technical`.

Review notes are resolved one id at a time, never in bulk:
`notes <spec>` lists pending ones; `revise <spec> --patch p.json --notes id --summary "..."`
applies a scoped semantic patch (status `applied`); after `produce`,
`compare <spec> --scene <id>` shows before | after; `notes <spec> --verify id --evidence "..."`
marks it `verified` only once you have looked at the rebuilt output.

Rules for this workflow:

- **The spec is the source of truth.** Never hand-edit `data/projects/lesson_*.json`.
- Review at `/review/...`. The legacy editor cannot overwrite or delete a
  `lesson_*` project (the server answers 409), so opening one there is harmless
  but changes made there are not saved.
- Start the voice worker for `narrate`:
  `cd tools/local-tts && HF_HOME="$PWD/.cache" .venv/bin/python -m uvicorn server:app --host 127.0.0.1 --port 8123`
  (see `docs/LOCAL_TTS.md`).
- Narration text may contain `[[id]]` cues that pin a reveal to the words after
  it (card lines: `[[<card id>.<n>]]`). A changed narration needs `narrate` again.
- Limits the validator enforces: labels up to 16 characters, graphs up to five
  columns, card up to 8 lines of 60 characters. Component kinds are listed in
  `TECHNICAL_COMPONENT_KINDS` (`src/types.ts`).

## Where things are

```text
lessons/                         lesson specs (tracked, the source of truth)
src/domains/lesson-spec/         spec types, validate, compile, lint, narration cues, theme presets (theme.ts),
                                 output-format frame model (frame.ts), responsive overlays (overlays.ts), sequence geometry
src/domains/review/              review-note lifecycle (pending/applied/verified) and merge rules
tools/lesson/                    CLI (cli.ts), `produce` pipeline (pipeline.ts, render.ts, stills.ts, author.ts, revise*.ts),
                                 voice + audio registration (narrate.ts), WAV helpers
src/components/ReviewScreen.tsx  review-only screen (never writes projects)
server/                          Vite middleware: projects, assets, exports, reviews, tts, library
src/remotion/                    the renderer shared by preview and export
src/domains/*                    camera, connectors, scenes, narration, sketch, timeline, project migrations
src/domains/technical-components/assets/   component SVGs (240x150, line art, currentColor)
data/                            local runtime files; git-ignored (asset storage initializes itself)
docs/                            vision, roadmap, schema, TTS, pivot plan
```

To add a component kind: add the name to `TECHNICAL_COMPONENT_KINDS`, an SVG
under the assets folder, a colour pair in `PALETTE` (`compile.ts`) and a path in
`ARTWORK_FILES` (`tools/lesson/artwork.ts`). The compiler's types enforce completeness.

## Engineering principles

1. **One project model.** Preview and Remotion export consume the same project JSON.
2. **Deterministic.** The same spec compiles to the same project; no `Math.random`, no wall-clock in rendering.
3. **Migrations.** Any persisted-field change needs a new `schemaVersion` and one migration (`src/domains/project/migrations.ts`), and `docs/PROJECT_SCHEMA.md` updated. Current version: 15.
4. **Semantic connectors.** Arrows attach to component layers and follow them.
5. **Domain modules.** Put new logic in `src/domains/<domain>/`; do not grow `store.ts`, `CanvasOverlay.tsx` or `Timeline.tsx`.
6. **Renderer facts.** Top-level layers stack first-on-top, a group's children last-on-top. Layers carry per-side border widths and per-corner radii that override plain `strokeWidth` / `borderRadius` (the compiler's `baseLayer` sets all of them). Renders need `--public-dir=data` to find audio.
7. **Formats and themes.** Output format differences live in `frame.ts` (caption style, safe regions, overlay limits) and node layout in `compile.ts`; look differences live in `theme.ts`. Never branch on aspect ratio or theme elsewhere. Sketch distortion applies only to component bodies and connectors.
8. **Testing sweet spot.** Test non-trivial pure logic where a bug would be silent and costly (timing, migrations, cue parsing, file formats). Do not write a test per error message, add validation only after a real mistake, and check visuals with one render per change.

## Security and configuration

Never commit secrets, `data/` contents, generated exports, or
`data/assets/index.json` changes (it lists local audio). Do not commit or push
unless asked.

## Product boundaries

Not building: accounts, collaboration, hosting, billing, a marketplace, generic
social-video templates, cloud-vendor icon packs (licensing), or a general
Canva/CapCut/After Effects replacement. The editor is kept for inspection and
may be trimmed further.

## Source-of-truth docs

- `docs/2026-10-19-AI-AUTHORED-PIVOT.md` — plan, decisions, progress log
- `docs/PRODUCT_VISION.md` — product definition
- `docs/IMPLEMENTATION_ROADMAP.md` — phases (10-14 are the AI-authored pipeline)
- `docs/PROJECT_SCHEMA.md` — project schema and migrations
- `docs/LOCAL_TTS.md` — the Chatterbox voice worker
- `docs/CODEBASE_DISCOVERY.md`, `IMPLEMENTATION.md`, `docs/SCENE_FIRST_EDITOR.md` — background on the inherited editor and its manual-authoring design

If documents conflict, the newest explicit decision in the pivot doc wins and the
documents should be updated together.
