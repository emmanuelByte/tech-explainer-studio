# Product Vision

> **Direction update (2026-10-19):** this project is now **AI-authored, human-reviewed**.
> Claude writes a lesson spec (`lessons/*.lesson.json`) and builds, narrates, lints and
> renders it with `npm run lesson`; the human previews at `/review/<project id>` and exports.
> Statements below that call the product "manual-first" or say AI "must never be the only
> path" are **superseded**. See `docs/2026-10-19-AI-AUTHORED-PIVOT.md` for the plan, the
> decisions and the progress log.

## What we are building

**Tech Explainer Studio** creates technical education videos, especially software engineering and system-design explainers, from a short lesson description.

An AI writes a **lesson spec** (components, connections, scenes, narration), a deterministic compiler builds it into a normal project with layout, animation, camera, narration and captions, and the AI renders stills to check its own work. The human **previews, leaves notes, and exports**. The product is **AI-authored and human-reviewed**.

## Primary user workflow

```text
Human gives a topic or script
  -> AI writes the lesson spec
  -> validate -> narrate (local voice) -> build -> lint -> render stills
  -> AI looks at the stills and fixes problems
  -> human previews, leaves notes, exports MP4
  -> AI applies the notes to the spec and rebuilds
```

The spec is the source of truth: changes go through the spec, never by hand-editing a generated project. Every build is still an ordinary project that the editor can open for inspection.

## The experience we are aiming for

The visual style should make it easy to create videos inspired by high-quality technical whiteboard/sketch lessons:

- minimal background, often dark
- handwritten/sketch-like headings where appropriate
- progressive reveal rather than dumping an entire diagram at once
- architecture diagrams that remain readable while the explanation evolves
- arrows and request/data-flow animation
- semantic use of a small number of colors
- narration-synchronized visual changes
- camera pan and zoom to focus attention
- good output in both 16:9 and 9:16

The value is the combination of **AI speed + structured, reviewable output**: the AI does the authoring, but it works with technical primitives, a deterministic compiler and measurable checks, so results are consistent and fixable.

## Why this product should exist

General-purpose editors are flexible but slow for architecture lessons. Generic AI video tools are fast but give weak control over diagrams and timing, and their output cannot be fixed precisely.

Tech Explainer Studio gets the speed without losing the control: the AI works in a small, typed vocabulary of system components, connectors, reveals, cues, cards and camera framing, so every result is deterministic, checkable (lint, stills) and correctable through review notes.

## Core product capabilities

### Script and scenes

- Paste a complete script into the project.
- Edit the script inside the project.
- Split the script into editable scene ranges.
- Reorder, merge and resize scene timing.
- Click a scene to seek the timeline.
- Preserve one global timeline so narration, transitions and persistent elements can cross scene boundaries.

### Technical diagram authoring

Provide reusable editable technical components such as:

- user/client/browser/mobile
- DNS/CDN
- reverse proxy/API gateway/load balancer
- application server/service/worker
- SQL/NoSQL databases
- Redis/cache
- queue/Kafka/pub-sub/event bus
- object storage
- search engine
- observability components

Components should be editable layer groups, not flattened stickers.

### Smart connectors

Connections are central to system-design videos.

A connector must know which components it connects. Moving a server must not require manually redrawing every arrow attached to it.

Support at least:

- straight connectors
- orthogonal connectors
- bezier connectors
- arrowheads
- labels
- line styles
- progressive draw animation

Later we can add data-flow indicators such as moving dots or pulses.

### Whiteboard animation

Provide progressive draw-on and reveal behavior for:

- arrows
- paths
- boxes
- diagrams
- labels/headings

The visual effect must be deterministic across preview and export.

### Sketch style

Offer a restrained hand-drawn visual treatment suitable for technical teaching. The style should improve the explanation, not turn every database into a trembling doodle.

### Camera

**Implemented in V1:** camera state is persisted separately from workspace
navigation and is shared by canvas preview, full-screen playback and export.

Add a persisted video-camera track independent of the editor viewport.

Creators should be able to:

- focus selected layers
- fit the current architecture
- create camera keyframes
- animate pan/zoom
- hold framing
- preview the exact camera motion that exports

### Narration and captions

**Implemented in V1:** imported audio has semantic roles, narration is
highlighted on the timeline, script segment timing can be edited or aligned to
scenes, and captions use those timed segments in preview and export. A creator
can also select one reusable local base voice and generate the full script as a
continuous narration sequence. Automatic forced speech alignment remains future
work.

- Import narration audio.
- Mark an audio layer as narration.
- Align scene boundaries to narration.
- Associate timed script segments with the narration.
- Render captions from the same timed script data.

Narration is generated with the local Chatterbox voice. Timing comes from measuring the generated audio, and inline cues (`[[id]]`) pin each reveal to the words it accompanies.

## First acceptance lesson: Load Balancer

The Load Balancer lesson is our canonical V1 validation.

The AI must be able to produce a lesson from a spec with a progression like:

```text
Scene 1
User -> Single Server

Scene 2
More users -> overloaded server

Scene 3
Introduce Load Balancer

            Load Balancer
          /       |       \
       App 1    App 2    App 3

Scene 4
Camera focuses on Load Balancer

Scene 5
Requests animate across connectors

Scene 6
One app server fails and the healthy path is emphasized
```

The human must be able to preview it, leave notes against any moment, and export the final video. Any change (labels, icons, scene timing, reveal timing, camera framing, narration wording) must be achievable by editing the spec and rebuilding, with no source-code edits. The editor remains available for inspection.

## Product boundaries

### We are building

- a local-first technical explainer editor
- a strong system-design diagram workflow
- reusable technical visual primitives
- narration-aware scene authoring
- deterministic preview/export

### We are not building in V1

- Canva
- CapCut
- After Effects
- a generic social-video editor
- collaborative cloud editing
- asset marketplace
- giant template catalog
- prompt-to-final-video black box

Staying narrow is an advantage. The product should be better than generic editors at one job: **turning a technical lesson into a clear, animated, editable visual explanation**.
