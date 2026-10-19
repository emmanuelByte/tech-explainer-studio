# Tech Explainer Studio

Tech Explainer Studio turns a short lesson description into a narrated, animated
technical explainer video (system design, architecture, how-things-work). It is
**AI-authored and human-reviewed**: an AI writes a *lesson spec*, a compiler
builds a normal editable project from it, and you preview the result, leave
notes, and export an MP4. Everything runs locally.

It is built on the [MotionEditor](https://github.com/tomaslachmann/motion-editor)
foundation (React, Vite, Remotion) and keeps its editor, but the editor is no
longer the main workflow.

```text
lesson spec (JSON) -> validate -> narrate (local voice) -> build -> lint -> stills
                                                                      |
                              you: preview, leave notes, export  <----+
```

## The workflow

The AI edits `lessons/<name>.lesson.json` and runs:

```bash
# One command for the whole chain, 16:9 and 9:16, resumable (docs/PRODUCTION_PIPELINE.md):
npm run produce -- lessons/load-balancer.lesson.json --aspect both
npm run produce -- --script lessons/how-caching-works.script.md --aspect both   # an agent authors the spec first

# Or step by step:
npm run lesson -- validate lessons/load-balancer.lesson.json
npm run lesson -- narrate  lessons/load-balancer.lesson.json   # needs the voice worker (below)
npm run lesson -- build    lessons/load-balancer.lesson.json   # writes data/projects/lesson_<id>.json
npm run lesson -- lint     lessons/load-balancer.lesson.json   # layout and pacing checks
npm run lesson -- stills   lessons/load-balancer.lesson.json   # one PNG per scene, to look at
npm run lesson -- notes    lessons/load-balancer.lesson.json   # review notes (resolve one id at a time: --apply / --verify)
npm run lesson -- patch    lessons/load-balancer.lesson.json changes.json  # preview a stable-id patch
npm run lesson -- patch    lessons/load-balancer.lesson.json changes.json --write  # apply it to the spec
```

You open **`http://localhost:3005/review/lesson_<id>`** (start the app with
`npm run dev`): play the video with sound, jump between scenes, write notes for
the AI at any moment, and click **Export MP4**. The review screen never writes
the project. The legacy editor (`/editor/...`) cannot overwrite or delete a lesson
project either: the server refuses saves and deletes for `lesson_*` projects (HTTP 409),
so opening one there is harmless but nothing you change in it is kept. Change the spec.

### The lesson spec

A lesson is components (`nodes`), connections (`edges`) and `scenes`. The
compiler decides positions, timing, camera and captions; the spec never contains
pixel coordinates.

```json
{
  "version": 1,
  "id": "load-balancer",
  "title": "How a Load Balancer Works",
  "nodes": [
    { "id": "clients", "kind": "client", "label": "Clients" },
    { "id": "lb", "kind": "load-balancer", "label": "Load Balancer" }
  ],
  "edges": [{ "id": "clients-lb", "from": "clients", "to": "lb", "label": "requests" }],
  "scenes": [
    {
      "id": "solution",
      "title": "Add a load balancer",
      "narration": "[[lb]]A load balancer sits in front, [[clients-lb]]and receives every request first.",
      "reveal": ["lb", "clients-lb"]
    }
  ]
}
```

- **Kinds:** `client`, `load-balancer`, `server`, `database`, `cache`, `queue`,
  `cdn`, `api-gateway`, `object-storage`, `worker` (labels up to 16 characters;
  graphs up to five columns deep in 16:9; in 9:16 ranks stack top to bottom with at most
  three components per row, so depth is not limited by width).
- **Top-level cards:** `intro` adds a silent title card using `title` and an
  optional `subtitle`; `outro` shows `text` over a dimmed final diagram. Each
  can set `seconds` (1–10; default 3); titles and subtitles are limited to 60
  characters.
- **Scene fields:** `reveal` (show nodes/edges), `hide` (remove earlier ones),
  `focus` (camera framing), `emphasize` (glow and subtly enlarge revealed
  nodes), `flow` (travelling dots on revealed edges), `card` (a code/request
  panel over a dimmed diagram: up to 8 lines, revealed one by one),
  `comparison` (two titled, dimmed-diagram panels: up to 6 lines per side),
  `bullets` (a titled progressive takeaway/definition/recap card), and
  `sequence` (participants plus request/response messages with lifelines),
  and `durationSeconds` (only until narrated). A scene uses either `card` or
  another overlay block.
- **Cues:** `[[id]]` in `narration` makes that element appear exactly when the
  words after it begin; card lines use `[[<card id>.<line number>]]` and
  comparison lines use `[[<comparison id>.<left|right>.<line number>]]`.
  Bullet cues are `[[<bullet id>.<line number>]]`; sequence message cues are
  `[[<sequence id>.<message id>]]`.
  `[[emphasize:<node id>]]` and `[[flow:<edge id>]]` defer those effects to
  the words immediately after the cue.
- **Theme:** [theme.ts](src/domains/lesson-spec/theme.ts) is the single visual
  system for compiled lessons: colours, component palette, typography, spacing,
  motion timing and sketch defaults. Adjust it to restyle every generated lesson
  without adding pixel values to a spec.
- **Review patches:** `lesson patch` updates existing `lesson`, `scenes`,
  `nodes`, or `edges` by stable ID and validates the resulting spec. It previews
  by default; `--write` is required to update the source spec. For example:

  ```json
  {
    "version": 1,
    "lessonId": "load-balancer",
    "scenes": { "solution": { "title": "Route every request" } }
  }
  ```
- Spec types and rules: [src/domains/lesson-spec/](src/domains/lesson-spec/).
  Plan, decisions and progress log:
  [docs/2026-10-19-AI-AUTHORED-PIVOT.md](docs/2026-10-19-AI-AUTHORED-PIVOT.md).

## Run locally

Requirements: Node.js and npm.

```bash
npm install
npm run dev        # http://localhost:3005
```

Projects, assets, narration, review notes and exports are local files under
`data/`, which is ignored by Git. Asset storage creates its empty index on first
use, so a clean clone never needs generated narration metadata checked in.

### Voice (Chatterbox)

Narration uses a local Chatterbox worker on port `8123` with your `baseVoice.wav`
reference. Start it from a second terminal:

```bash
cd tools/local-tts
HF_HOME="$PWD/.cache" .venv/bin/python -m uvicorn server:app --host 127.0.0.1 --port 8123
```

The first run downloads about 2.1 GB of model weights. One-time install, health
checks and troubleshooting: [docs/LOCAL_TTS.md](docs/LOCAL_TTS.md).

## Exporting video

Use **Export MP4** on the review screen (or the editor's export dialog). Export
runs a Remotion job through `/api/exports` with progress, cancel and
reveal-in-Finder, and writes to `data/exports`. MP4 (H.264) and WebM (VP9) at
standard, high (2x) or ultra (3x) scale are supported.

## The editor (secondary)

The original MotionEditor-based editor is still available at `/editor/<id>` for
inspecting or hand-tuning a manual project: layers and groups, keyframes and easing,
semantic connectors, deterministic sketch/draw-on, a separate video camera,
narration and captions, a Story/Scene workspace, and a reusable library. It is
not required for the lesson workflow and may be trimmed further. AI-authored
`lesson_*` projects are deliberately write-protected there; revise the lesson
spec and rebuild instead.

## Local backend

The Vite dev server mounts local JSON/file APIs:

- `/api/projects` — project JSON and history in `data/projects`
- `/api/assets` — images and audio in `data/assets` (narration clips are registered here)
- `/api/library` — reusable design/animation items in `data/library`
- `/api/exports` — Remotion export jobs, output in `data/exports`
- `/api/reviews` — review notes in `data/reviews`
- `/api/tts` — proxy to the local voice worker

This is intentionally local-only: no database, no accounts, no hosted service.
Project files carry a `schemaVersion` and are migrated on load; see
[docs/PROJECT_SCHEMA.md](docs/PROJECT_SCHEMA.md).

## Scripts

```bash
npm run dev          # app on :3005
npm run lesson -- …  # the lesson workflow above
npm run build        # production build
npm run lint
npm test
npm run typecheck   # src, tools and server
```

## Attribution and license

Tech Explainer Studio is derived from [MotionEditor by Tomas Lachmann](https://github.com/tomaslachmann/motion-editor). It is distributed under the [MIT License](LICENSE); see [NOTICE](NOTICE) for the preserved upstream attribution.
