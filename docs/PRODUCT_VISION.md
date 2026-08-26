# Product Vision

## What we are building

**Tech Explainer Studio** is a focused visual editor for creating technical education videos, especially software engineering and system-design explainers.

The creator should be able to paste a teaching script, split it into scenes, visually build each scene, add and freely edit diagrams/icons/text/arrows, animate them on a timeline, synchronize narration, move a virtual camera, and export a polished video.

The product is intentionally **manual-first and AI-assisted**, not AI-controlled.

## Primary user workflow

```text
Paste script
  -> split into scenes
  -> build diagrams on canvas
  -> add technical components
  -> connect components with smart arrows
  -> animate progressive reveals and data flow
  -> add narration
  -> align scene timing and captions
  -> animate camera pan/zoom
  -> preview
  -> export MP4/WebM
```

Every generated or assisted result must remain editable using normal editor controls.

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

This is not about automatically generating a final video from a title. The value is the combination of **fast technical authoring + deep editability**.

## Why this product should exist

General-purpose editors are flexible but slow for architecture lessons. Automatic AI explainer tools are fast but give weak control over diagrams and timing.

Tech Explainer Studio should sit between those extremes:

```text
General editor                        Automatic AI video
maximum control                        minimum authoring effort
slow technical authoring               weak editability
        \                               /
         \                             /
          Tech Explainer Studio
          technical primitives
          reusable system components
          editable scenes
          smart connectors
          timeline + narration
          camera + whiteboard reveals
```

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

Add a persisted video-camera track independent of the editor viewport.

Creators should be able to:

- focus selected layers
- fit the current architecture
- create camera keyframes
- animate pan/zoom
- hold framing
- preview the exact camera motion that exports

### Narration and captions

- Import narration audio.
- Mark an audio layer as narration.
- Align scene boundaries to narration.
- Associate timed script segments with the narration.
- Render captions from the same timed script data.

TTS and automatic alignment can be added later but must not be required to use the editor.

## First acceptance lesson: Load Balancer

The Load Balancer lesson is our canonical V1 validation.

A creator must be able to produce a lesson with a progression like:

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

While building it, the creator must be able to freely:

- move/resize elements
- swap icons
- edit labels
- reroute connectors
- alter scene timing
- change animation timing
- change camera framing
- change narration placement
- export the final video

If any of those require source-code edits, V1 is not finished.

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
