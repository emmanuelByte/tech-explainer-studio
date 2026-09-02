# Dead Letter Queue Explainer — Production Plan

## Purpose

This document is the source of truth for producing the first **Dead Letter
Queue (DLQ)** explainer with Tech Explainer Studio. It turns the production
discussion into an executable test of the real workflow:

```text
topic -> script -> scenes -> assets -> narration -> timing
      -> editable diagrams -> animation -> captions -> render -> QA
```

This is a production experiment, not a replacement for the Load Balancer V1
acceptance lesson. The Load Balancer lesson still proves the editor's complete
V1 feature set. The DLQ video tests whether the evolving editor can support a
real messaging lesson and exposes missing product capabilities.

## Locked production decisions

- **Teaching topic:** What is a Dead Letter Queue?
- **Format:** vertical `9:16` video, with `1080 x 1920` as the target render.
- **Expected duration:** roughly 75–95 seconds. Narration duration, not a
  guessed scene total, determines the final timeline length.
- **Visual model:** one evolving architecture canvas, not thirteen unrelated
  illustrations.
- **Rendering rule:** technical diagrams are deterministic and editable.
- **AI rule:** generative video is optional and must not render architecture,
  labels, retry counts, or other information that must be exact.
- **Cost rule:** finish the deterministic version before deciding whether a
  paid/generated insert materially improves it.
- **Source of truth:** this file owns the approved narration and visual plan.
  A script change must be reflected in scene timing and captions.

## Toolchain

### Required for the first complete version

| Responsibility | Primary tool | Output |
| --- | --- | --- |
| Teaching plan, script, scene direction | ChatGPT | Approved Markdown/script text |
| Standard vector symbols | Existing Lucide integration | Editable SVG-based icon layers |
| Precise technical visuals | Custom SVG/layer groups in Tech Explainer Studio | Editable queue, message, DLQ and payload components |
| Narration | Google Cloud Text-to-Speech, initially used outside the editor | `narration.wav` or `narration.mp3` |
| Word/phrase timing | Google Speech-to-Text; local Whisper is the fallback | Timestamped transcript (`.json`) |
| Scene construction and animation | Tech Explainer Studio | Persisted `.motionproj`/project JSON |
| Preview and final render | Shared Remotion renderer through Tech Explainer Studio | `dlq-explainer.mp4` |
| Final media inspection | Manual playback plus `ffprobe` | QA checklist and verified media metadata |

Google TTS and Speech-to-Text are external inputs for this experiment. They do
not justify coupling the editor's core project model to Google. Narration,
timed words, captions, and generated media must enter the editor as normal,
portable project data.

### Optional enhancement tools

| Tool | Allowed use | Disallowed use |
| --- | --- | --- |
| Google Flow / Veo | A short hook, transition, or visual metaphor | Queue topology, labels, retry state, or the DLQ flow |
| Nano Banana | A raster illustration that cannot be expressed cleanly with existing vectors | Core reusable technical components |
| Lyria / Flow Music | A quiet background music bed after the narration mix works | Masking weak narration or distracting from the lesson |

The first approved render requires none of these optional tools.

## End-to-end execution plan

Every step has a concrete artifact and a gate. Do not move forward merely
because an activity was attempted.

| Step | Work | Tool(s) | Required output / gate | Status |
| --- | --- | --- | --- | --- |
| 1 | Define the lesson | ChatGPT | Topic, audience, format and teaching outcome are locked | Complete |
| 2 | Write narration | ChatGPT | Script below is approved without unresolved wording | Complete |
| 3 | Break narration into scenes | ChatGPT | Every sentence has a visual purpose and scene assignment | Complete |
| 4 | Plan assets | ChatGPT + repository component inventory | Reusable assets and state variations are listed | Pending |
| 5 | Establish visual rules | Tech Explainer Studio design system | Sizes, typography, colors, strokes and spacing are defined | Pending |
| 6 | Create/source assets | Lucide + editable layer groups/custom SVG | Each required asset can be inserted, edited and reused | Pending |
| 7 | Generate narration | Google Cloud TTS | Final audio uses the exact approved script | Pending |
| 8 | Extract timing | Google Speech-to-Text or Whisper | Transcript contains usable word/phrase timestamps and matches narration | Pending |
| 9 | Create the project | Tech Explainer Studio | `1080 x 1920` project with script and 13 scene ranges | Pending |
| 10 | Construct static scenes | Tech Explainer Studio | Full visual story reads correctly with animation disabled | Pending |
| 11 | Animate the explanation | Tech Explainer Studio | Reveals, message motion, failures, retries and DLQ transfer work | Pending |
| 12 | Synchronize timeline | Tech Explainer Studio | Visual events align with narration phrases | Pending |
| 13 | Add captions | Timed transcript + Tech Explainer Studio | Captions are derived from the same timed script | Pending |
| 14 | Add optional inserts/music | Flow/Veo and/or Lyria | Added only after an A/B review proves an improvement | Optional |
| 15 | Render | Tech Explainer Studio + Remotion | Valid vertical H.264 MP4 with complete audio | Pending |
| 16 | QA and publish | Manual playback + `ffprobe`; manual publishing initially | QA checklist passes; publication is a separate explicit action | Pending |

## Step 1 — Lesson definition

**Status: complete.**

- **Working title:** What Is a Dead Letter Queue?
- **Audience:** software/backend engineers who understand APIs but are new to
  message queues and event-driven systems.
- **Example:** a malformed `OrderCreated` event processed by a Payment Worker.
- **Core message:** a DLQ isolates messages that cannot be processed after the
  configured attempt limit, allowing healthy work to continue while engineers
  investigate the failures.

### Teaching outcome

After watching, a software engineer new to messaging should understand:

1. normal producer → queue → consumer processing;
2. why some messages repeatedly fail;
3. why infinite retries are harmful;
4. when a message is moved to a DLQ;
5. that DLQ messages require monitoring, investigation, and a deliberate
   reprocessing or discard decision.

The video must not imply that adding a DLQ alone solves failures. An unmonitored
DLQ is delayed data loss.

### Out of scope

- RabbitMQ, Kafka, or Amazon SQS configuration;
- retry delay and exponential-backoff implementation;
- retention-period configuration;
- automated redrive architecture; and
- vendor-specific terminology.

These deserve separate lessons. Adding them here would weaken the introductory
explanation.

## Step 2 — Approved narration script

**Status: complete.** This is the exact text to send to the narration tool.
Wording changes after audio generation require regenerated audio, timestamps,
scene boundaries, and captions.

> Imagine your application publishes a message to a queue.
>
> Normally, a consumer receives it, processes it successfully, and everything
> moves on.
>
> But what happens when one message keeps failing?
>
> Its payload may be malformed, a required field may be missing, or the
> consumer may contain a bug.
>
> The system can try again. But retrying forever wastes resources, floods your
> logs, and makes no progress.
>
> This is where a Dead Letter Queue, or DLQ, comes in.
>
> Once a message reaches the configured attempt limit, the messaging system
> removes it from the normal processing path and stores it in a separate queue.
>
> Healthy messages continue through the main queue while the failed message
> waits for investigation.
>
> Imagine an OrderCreated event reaches a payment worker with a missing order
> ID.
>
> The worker tries to process it three times, and all three attempts fail.
>
> Instead of retrying forever, the system sends that event to the DLQ.
>
> An engineer can inspect the event, find the cause, fix the producer or
> consumer, and then decide whether to reprocess or discard it.
>
> But a DLQ is not a solution by itself. If nobody monitors it, failed messages
> can sit there unnoticed.
>
> A Dead Letter Queue is a safety net: it isolates persistent failures,
> protects normal processing, and gives engineers a controlled way to recover.

### Script acceptance checks

- The normal path is explained before failure handling.
- The configured limit is presented as a system choice, not a universal value.
- The example uses three total processing attempts; it does not ambiguously say
  “three retries.”
- Inspection, reprocessing, safe discard, and monitoring are acknowledged.
- The script stays vendor-neutral and contains no setup instructions.

## Step 3 — Scene breakdown

**Status: complete.** Each narration beat below has one active visual purpose.
The generated narration timestamps will set exact frame boundaries later; the
scene numbers define narrative order, not guessed durations.

| Scene | Exact narration beat | Visual action | Implementation |
| --- | --- | --- | --- |
| 1 | “Imagine your application publishes a message to a queue.” | Reveal Producer, then one message, then Main Queue. Draw the path only as the narration introduces it. | Editable components and connector |
| 2 | “Normally, a consumer receives it…” | Reveal Consumer. Move the same message from Main Queue to Consumer and show a success state. | Editable components and keyframes |
| 3 | “But what happens when one message keeps failing?” | Send a new message along the established path. Consumer rejects it; the message changes to its failed state. | Message state and failure indicator |
| 4 | “Its payload may be malformed…” | Expand the failed message into a payload card. Highlight a missing required field and show the Consumer bug as an alternative cause. | Editable payload card and short labels |
| 5 | “The system can try again…” | Animate a loop from Consumer back to the processing path. Repeated motion and log marks demonstrate wasted work without inventing a fixed limit yet. | Semantic retry path and repeated keyframes |
| 6 | “This is where a Dead Letter Queue…” | Dim the retry motion and reveal the DLQ for the first time. Draw and label it deterministically. | Editable DLQ component |
| 7 | “Once a message reaches the configured attempt limit…” | Emphasize `MAX ATTEMPTS`, stop the retry loop, and move the failed message along the failure path into the DLQ. | Attached connector and moving message |
| 8 | “Healthy messages continue…” | Keep healthy messages flowing Main Queue → Consumer while the failed message remains isolated in the DLQ. | Parallel keyframes on the same canvas |
| 9 | “Imagine an OrderCreated event…” | Apply concrete labels to the existing architecture: Checkout Service, `OrderCreated`, Payment Worker. Show `orderId: missing`. | Existing components with editable labels |
| 10 | “The worker tries to process it three times…” | Run the same loop with `Attempt 1/3`, `Attempt 2/3`, and `Attempt 3/3`. Each attempt visibly fails. | Reused retry animation and text state |
| 11 | “Instead of retrying forever…” | Stop the loop after attempt three and move the same `OrderCreated` card into the DLQ. | Message keyframes and connector |
| 12 | “An engineer can inspect…” through “failed messages can sit there unnoticed.” | Reveal Inspect → Fix → Reprocess or Discard. Add a monitoring alert beside the DLQ and show the ignored-alert state briefly. | Lucide/custom vector actions; no generated video required |
| 13 | “A Dead Letter Queue is a safety net…” | Fit the completed topology, restore healthy flow, and reveal the three closing ideas: `ISOLATE`, `PROTECT`, `RECOVER`. | Camera hold and text reveal |

### Scene acceptance checks

- All thirteen scenes reuse one evolving architecture canvas.
- The same failed message persists through failure, attempts, and DLQ transfer.
- Scene 10 says `Attempt`, not `Retry`, so the total count is unambiguous.
- Scene 12 includes monitoring and a deliberate discard path, not automatic
  blind replay.
- Exact technical labels remain deterministic editor text; generative video is
  not part of any required scene.

## Canvas continuity

The video should grow one model in place:

```text
Producer -> Main Queue -> Consumer
                            |
                            +-- retry loop
                            |
                            +-- failed after max attempts -> DLQ
                                                            |
                                                            +-- inspect/fix/reprocess
```

Scene 9 applies concrete labels to the established model instead of cutting to
a second unrelated diagram. This reduces cognitive load and proves that the
technical components remain editable.

## Asset inventory

Do not create one flattened illustration per scene. Create reusable components
and semantic states.

| Asset/component | Source | Required states or behavior |
| --- | --- | --- |
| Producer / service | Existing technical component template, extended if needed | Generic label; Checkout Service label |
| Main Queue | Custom editable component group | Normal, active |
| Consumer / worker | Existing or custom editable component group | Generic label; Payment Worker label; processing/failure highlight |
| DLQ | Custom editable component group | Empty; contains failed message; emphasized |
| Message/event card | Custom editable component group | Healthy; failed; `OrderCreated` |
| Success indicator | Lucide or simple vector | Draw/fade in |
| Failure indicator | Lucide or simple vector | Pulse/flash without relying on color alone |
| Retry connector | Smart connector/path | Attached endpoints; progressive draw; reusable animation |
| Attempt counter | Text layer | `Attempt 1/3`, `Attempt 2/3`, `Attempt 3/3` |
| Malformed payload card | Custom editable component group | Invalid fields remain individually highlightable |
| Inspect action | Lucide/custom vector + label | Progressive reveal |
| Fix action | Lucide/custom vector + label | Progressive reveal |
| Reprocess action | Lucide/custom vector + label | Return arrow remains attached when components move |

Where practical, these belong to the vendor-neutral messaging component
library, not a video-specific asset folder. Queue, event, worker, retry, DLQ and
reprocess semantics will be reused in Kafka, RabbitMQ, SQS, idempotency and
poison-message lessons.

## Visual rules to lock in Step 5

Step 5 is intentionally still open, but it must produce exact tokens rather
than adjectives such as “clean” or “modern.” At minimum, lock:

- background, surface, primary text, muted text, healthy, warning, failure and
  focus colors;
- heading/body/caption font families, weights and minimum vertical-video sizes;
- component width/height, internal padding, corner radius and stroke width;
- connector width, arrowhead dimensions, port placement and routing defaults;
- horizontal/vertical spacing grid and safe areas for TikTok/Reels overlays;
- normal, active, failed and selected component states;
- caption line length, maximum line count, background treatment and screen
  position;
- deterministic sketch treatment, if used.

Color must reinforce meaning, not carry it alone. Failure also needs a symbol,
label, motion, or shape change.

## Current editor gaps exposed by this experiment

The repository is not yet capable of completing every step through the UI.
This experiment depends on roadmap work that is still in progress or planned:

- smart connector endpoint/style controls;
- progressive connector/path drawing and reusable reveal presets;
- an independent video-camera track;
- narration semantics, timed transcript import, and captions derived from the
  script;
- a broader vendor-neutral messaging component kit.

Do not bypass these gaps with video-specific hard-coded rendering. Either land
the reusable roadmap capability first or record the manual workaround clearly.

## Artifact layout

Runtime project data and imported media remain local and ignored by Git, as
required by `AGENTS.md`. The logical project artifact names are:

```text
dead-letter-queue/
  script.md
  narration.wav
  narration-timestamps.json
  dead-letter-queue.motionproj
  dlq-explainer.mp4
  qa.md
```

Only reusable source assets, templates, code, tests, and this production plan
belong in the repository. Do not commit generated narration, local project
data, API credentials, or rendered video unless repository policy is changed
explicitly.

## QA checklist

### Teaching and correctness

- The normal queue path is clear before failure behavior is introduced.
- The video says retries stop after a configured limit; it does not present
  three attempts as a universal rule.
- The failed message is visibly the same message throughout retry and transfer.
- Healthy messages continue independently after the failed message is moved.
- Investigation and reprocessing are shown as explicit operational work.
- The ending does not imply that DLQ contents can be ignored indefinitely.

### Visual and timing

- Labels are readable on a phone at normal playback size.
- No important content sits under common vertical-video UI safe areas.
- Progressive reveals follow the narration rather than preceding it.
- Attempt numbers, arrow direction and message state remain unambiguous.
- Captions match the spoken words and do not cover the active diagram.
- Preview and export agree on positions, connectors, timing and camera framing.

### Audio and export

- Narration uses the approved script exactly.
- Voice is clear and not clipped; optional music never competes with speech.
- The final file is `1080 x 1920`, has the intended frame rate, includes audio,
  and plays from beginning to end.
- No generated-media watermark, misspelled technical label, or hallucinated
  architecture appears.

## Definition of done

The experiment is complete when a creator can open the saved DLQ project and,
without editing source code:

1. change labels and message contents;
2. move Queue, Consumer, or DLQ while their connectors remain attached;
3. change retry/reveal timing;
4. adjust narration, captions, scene ranges and camera framing;
5. preview and export a correct vertical MP4; and
6. reuse the messaging components in another project.

Publishing is not part of completion unless it is separately requested.
