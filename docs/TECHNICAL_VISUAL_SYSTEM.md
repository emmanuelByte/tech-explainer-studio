# Technical visual system

This document locks the default visual grammar for technical explainers. The
values are implemented in
`src/domains/technical-components/visualSystem.ts`; this file explains how to
use them. Code is the source of truth when a value differs.

The first target is a `1080 x 1920` vertical video. Components remain editable,
so creators can resize them for other formats, but the default sizes below are
chosen for phone readability.

## Color roles

Color communicates runtime meaning, not component category. A normal server,
queue, client, and worker therefore share the same neutral treatment.

| Role | Value | Use |
| --- | --- | --- |
| Canvas | `#0B1020` | Default project background |
| Surface | `#151C2F` | Normal component card |
| Muted surface | `#1E293B` | Secondary cards and payload sections |
| Primary text | `#F8FAFC` | Labels and important copy |
| Muted text | `#94A3B8` | Supporting copy |
| Neutral line | `#CBD5E1` | Normal component outlines and connectors |
| Healthy | `#34D399` | Successful processing only |
| Warning | `#FBBF24` | Retry limits, alerts, and DLQ emphasis |
| Failure | `#FB7185` | Rejected or malformed messages |
| Focus | `#60A5FA` | The concept currently being explained |
| Editor selection | `#38BDF8` | Editor-only selection and port affordances |

Failure, warning, health, and active states must also use a symbol or motion.
Color alone is not an acceptable state indicator.

## Typography

Inter is the deterministic default because it is already supported by the
editor and renderer. A handwritten heading font is deferred until font loading
can be guaranteed in both preview and export.

| Role | Size | Weight | Line height |
| --- | ---: | ---: | ---: |
| Heading | `72 px` | `800` | `1.1` |
| Body | `42 px` | `500` | `1.3` |
| Component label | `36 px` | `700` | `1.1` |
| Connector label | `28 px` | `600` | `1.15` |
| Caption | `52 px` | `700` | `1.15` |

These are minimum defaults for the vertical format. Do not shrink labels to
make a diagram fit; simplify or reframe the diagram instead.

## Component geometry

All vendor-neutral technical components use one geometry contract:

| Property | Value |
| --- | ---: |
| Group | `280 x 200 px` |
| Body | `264 x 144 px`, centered at `y = -20` |
| Artwork box | `220 x 120 px`, centered at `y = -20` |
| Label box | `264 x 44 px`, centered at `y = 78` |
| Internal padding | `16 px` |
| Corner radius | `20 px` |
| Stroke | `4 px` |
| Horizontal gap | `96 px` |
| Vertical gap | `64 px` |
| Base spacing grid | `8 px` |

The component group owns connector ports at the midpoint of its left, right,
top, and bottom edges. Labels remain separate text layers, SVG artwork remains
an editable image layer, and state symbols remain editable shape/path layers.

## Component states

| State | Surface | Stroke | Required secondary signal |
| --- | --- | --- | --- |
| Normal | `#151C2F` | `#CBD5E1` | None |
| Active | `#172554` | `#60A5FA` | Pulse ring or focus motion |
| Healthy | `#052E2B` | `#34D399` | Check mark |
| Warning | `#422006` | `#FBBF24` | Warning triangle |
| Failed | `#3F121B` | `#FB7185` | Failure X |

A newly inserted DLQ uses the warning treatment. Other components start in the
normal state. `TechnicalComponentOptions.visualState` can create active,
healthy, warning, or failed variants as normal editable layers. A creator-facing
state switcher is not implemented yet.

Selection is not a persisted presentation state. Its cyan outline and port
handles are editor affordances and must never appear in an exported video.

## Connectors

- Default route: `straight`.
- Default ports: source `right`, target `left`.
- Default color: `#CBD5E1`.
- Default stroke: `4 px`.
- Retry path: `#FBBF24`.
- Failure path: `#FB7185`.
- Arrow marker: `10 x 10` view box, reference point `(9, 5)`, marker size
  `7 x 7` stroke units.
- Label: `28 px`, weight `600`, offset `16 px` above the path midpoint.

Use orthogonal routing when a retry or failure branch would cross the main
flow. Connector geometry remains semantic and attached to component ports.

## Vertical safe area

The default `1080 x 1920` composition reserves a conservative overlay-safe
area. Platform chrome varies, so this is a production rule, not a guarantee
for every application version.

| Edge | Reserved space |
| --- | ---: |
| Top | `160 px` |
| Right | `180 px` |
| Bottom | `300 px` |
| Left | `72 px` |

Technical component auto-placement respects these bounds on portrait canvases.
Landscape canvases use a `64 px` inset on every edge.

## Captions

- Maximum two lines.
- Target maximum `32` characters per line before reflow.
- `52 px` Inter, weight `700`, line height `1.15`.
- Background: `rgba(11,16,32,0.88)`.
- Padding: `36 px` horizontal and `24 px` vertical.
- Radius: `20 px`.
- Bottom offset: `340 px`, above the reserved platform-control area.

Caption rendering is still a later roadmap capability. These values prevent
that implementation from inventing a second visual system.

## Sketch treatment

Sketch rendering is disabled by default until a shared deterministic renderer
exists. When implemented, it must use the layer id as its seed, roughness
`0.75`, bowing `0.35`, and one stroke pass. Random per-frame perturbation is
forbidden because preview and export would jitter or disagree.

## Current enforcement

- New projects use the locked canvas background.
- Every technical component template uses the same size, surface, typography,
  stroke, and editable-layer structure.
- Component state styles and non-color indicators are generated from one typed
  module.
- New connectors and the Load Balancer topology use the shared connector
  defaults.
- Auto-placement uses current canvas dimensions and portrait safe areas rather
  than fixed landscape coordinates.
- Remotion connector labels and arrowheads consume the same tokens.

Safe-area guides, the state switcher, caption rendering, and deterministic
sketch rendering remain separate reusable editor capabilities. They must not be
hard-coded only for the DLQ video.
