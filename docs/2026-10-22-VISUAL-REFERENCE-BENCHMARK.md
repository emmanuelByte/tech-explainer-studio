# Visual Reference Benchmark — Application-Driven Technical Motion Graphics (2026-10-22)

**Status:** Approved target visual direction; discovery and acceptance brief, **not an implemented feature or an approved production script**.

**Source:** A user-provided reference MP4 in the Engineering Explained conversation: *“Replication vs Partitioning vs Sharding: When to Use Each”* (CodewithIddris). Inspected visual contact sheets and technical metadata on 2026-10-22. Approx. 9m 38.5s, 576×1024, 24 fps, H.264/AAC. The reference itself is **not in GitHub**: a future coding agent must receive it separately if frame-level comparison is required. Do not put someone else's video, watermark, branding, or recognizable app assets in the repository or published output.

> **Decision:** This is the project's concrete visual benchmark. Keep our existing local, deterministic, AI-authored/human-reviewed pipeline, but raise the result from generic whiteboard/diagram slides to **polished, application-driven technical motion graphics**. A coherent fictional application, its user-visible state, and the corresponding backend mechanism must evolve together. This refines the visual goal, **not** the previously approved implementation architecture or the script-approval gate.

## What the reference actually demonstrates

The following are observations from the provided video's sampled frames, rather than claims about its creator's production tools or its audio quality.

| Approx. reference time | Observed visual | Teaching mechanism |
| --- | --- | --- |
| 0:00–0:25 | Deep navy background, cursive illuminated headings, restrained category labels | Introduce three concepts with visual hierarchy and progressive reveal |
| 0:30–0:55 | White “GearShop” shopping interface, product cards, live traffic/dashboard chart | Establish an identifiable application and real user operations |
| 1:00–2:10 | Queries, blue primary database, green replicas, read-load bars, failed primary/promotion | Connect UI traffic to database reads, replication, load distribution and failover |
| 2:15–3:10 | Order history, indexes, query pressure and replicas | Bridge customer-facing screens to database internals |
| 3:15–4:55 | Order table, date-based partitions, table/query views, archive and range/list/hash labels | Visualize how rows are organized and selected by the query |
| 5:00–6:15 | Side-by-side replication/partitioning diagrams, capacity indicators and clustered shards | Contrast different scaling concerns |
| 6:20–7:20 | Three differently colored shard cylinders, shard-key callout, customer cards routed to shards | Show distribution by key, including user-visible outcome |
| 7:20–8:40 | Skewed traffic bars, interrelated order/payment datasets, per-shard partitions/replicas | Explain tradeoffs, skew, and architecture combinations |
| 8:45–end | Handwritten decision prompts, recommendations, minimal branded outro | Help the viewer decide when a technique is appropriate |

### Reproduce these qualities, not these specific assets

1. **Running application example.** Use one original fictional product or service across the lesson. Revisit believable app screens (product list, checkout, dashboard, order list, status, metric), with changing state rather than isolated mockups.
2. **UI-to-backend causality.** When a user acts, show the request, the responsible service/database, then the visible result. An architecture diagram should explain a mechanism, not merely name boxes.
3. **Composed technical visuals.** Crisp 2D/2.5D-feeling database cylinders, neatly attached connectors, table rows, service nodes, data packets, counters and charts. Small semantic palette: dark navy canvas, blue primary/action, teal secondary/replica, amber highlight/shard, red failure/pressure. These are roles, not mandatory exact hex values.
4. **Choreographed progression.** Reveal, route, highlight, pan/zoom, pause for comprehension, then transform the current visual state. Show outcomes of operations (replica promotion, overload, rerouting, shard choice), rather than repeatedly wiping the screen.
5. **Typographic hierarchy.** Handwritten/cursive annotations for short conceptual emphasis; crisp readable UI, labels, table/code text and compact narration captions. Do not render all interface text in handwriting.
6. **Narration-directed motion.** The correct visual change occurs when the corresponding words are spoken; preserve enough hold time for the viewer to see the result.
7. **Purposeful sound.** Narration is primary. If music or SFX is used, keep it subtle, non-distracting and licensed. Reference music/SFX and pronunciation were **not** analyzed; do not claim audio parity.
8. **Recomposed aspect ratios.** Both 1080×1920 and 1920×1080 are first-class. Rearrange camera, UI and infrastructure for each; simple crops or giant scaled-down app screens fail the bar.

## Current engine versus reference (as documented on `main`)

| Capability | Current state | Gap to benchmark |
| --- | --- | --- |
| Remotion preview/export, deterministic layer model, 9:16 and 16:9 | Documented implemented | Reuse |
| Chatterbox narration, forced-aligned word/phrase cues, captions | Documented implemented | Test audible quality, cues and scene pacing on the candidate |
| Node/edge diagrams, progressive reveals, hide, flow dots, glow/emphasis | Documented implemented | Add stateful examples only where current primitives cannot express the outcome |
| Camera pan/zoom, themed dark-sketch and clean-technical | Documented implemented | Upgrade composition and polish, not a new engine |
| Code/request, bullets, comparison and sequence overlays | Documented implemented | Current overlays dim diagrams and are too restrictive for some mixed UI/diagram compositions |
| Application mock screens, forms, changing lists/metrics, animated tables/charts | No first-class lesson-spec primitives described in README/authoring guide | Add a narrowly scoped, declarative way to author and animate these **only after a concrete shot fails with current primitives** |
| Multi-object choreography spanning app UI and backend state | Partially expressible with cues, but not a reusable semantic interaction | Define reusable events/scene actions if validated by the acceptance shot |
| Layered polished visual assets and hand-written annotations | Current SVG/sketch kit is functional, not proof of benchmark visual fidelity | Improve only assets needed by the pilot |
| Animation/sound aesthetics | Existing automated checks cover signal, geometry and content, not actual teaching impact | Human watches full motion/audio in review, plus targeted frame sequences |

These are **documentation-based capability assessments**, not a new runtime/code audit. Do not label a gap as implemented until a rendered example demonstrates it.

## Standard for every approved lesson

### Teaching/storyboard gate: human + ChatGPT

- Agree on the learning objective, real-world problem, scenario, mechanism, tradeoff, and key takeaway.
- Draft the **exact narration**, using accessible language and technically accurate mechanisms.
- Develop a shot-by-shot storyboard showing **what changes on screen** for each narration beat. Include UI state, backend state, semantic focus and transition where relevant.
- Obtain **explicit user approval of the narration** before production. No coding-agent rewrite of approved narration, no auto-changing it to fit a layout. Proposed changes require approval.
- A draft storyboard may describe richer visuals than the present `lesson.json` supports. This is a capability gap to resolve, not permission to quietly substitute a generic card.

### Implementation/production gate: coding agent

- Read `README.md`, `AGENTS.md`, `docs/PRODUCTION_PIPELINE.md`, `docs/AUTHORING_GUIDE.md`, this document and any approved script.
- Start with the existing scene spec/compiler/renderer. Confirm the smallest representative composition that the existing engine can or cannot render.
- Extend in a narrow domain module only for demonstrated missing primitives. Preserve stable IDs, determinism, editability through spec revisions, migrations where needed, preview/export parity, and both formats.
- Do not initiate a generalized editor rewrite, swap the engine, create generic AI-video generation, or add cloud services/paid tools just to achieve one shot.
- Produce low-resolution review renders and inspect **sequences**, not just a still from each scene. Then render native portrait and landscape after visual and technical review.
- Check narration, captions, UI state, connectors, camera, transitions, overlays, collision, aspect safety, semantic correctness and measured duration.

## First acceptance pilot: “How a Load Balancer Works”

**Pilot scope:** One original **60–90 second** segment from the existing lesson, authored only after the narration and storyboard are approved. Use an original fictional order or shopping application; do not replicate GearShop branding or reproduce the reference frames.

**Proposed narrative progression (illustrative shots, not pre-approved voiceover):**

1. User taps a product or checkout action; app interface reacts.
2. Request reaches a single server; increasing load creates a visible slow/error state.
3. Introduce a load balancer and multiple service instances. Route distinguishable requests.
4. Show a server becoming unhealthy, then health-check detection and traffic being routed to healthy instances. Do not depict instantaneous detection without a reason.
5. UI response recovers; finish with the role and limits of the load balancer.

**Review acceptance checklist:**

- The viewer can infer **why** the architecture was introduced and can follow each request from UI to server to UI result.
- Every meaningful state change occurs near the narration phrase that introduces it, and the changed state remains visible long enough to understand.
- UI screens, diagrams and motion are visually coherent across cuts; no unexplained teleporting requests, orphan connectors or silent state changes.
- UI interactions and counters are legible in 9:16; 16:9 is recomposed, not simply the portrait screenshot stretched.
- Handwritten accents are restrained and do not impair legibility; captions don't overlap important cards.
- Audio passes pipeline checks and human listen-through; captions match approved narration; no unsupported technical claims.
- The output looks like a *single designed explanation*, not a slideshow of unrelated cards.
- The human reviews a draft and approves/rejects against this checklist before publishing.

**A pass on current machine-readable lint is not the visual acceptance result.** Evaluate at least one full moving draft and a set of before/during/after frames for each important mechanism.

## Delivery priorities and boundaries

1. Preserve this benchmark and keep publishing lessons as the goal.
2. Complete the approved script + storyboard for the pilot.
3. Make one representative UI-to-architecture shot using existing primitives; record the exact failure or deficiency.
4. Add only the reusable UI/diagram primitives needed to pass that shot, then carry the sequence through both formats.
5. Recheck the benchmark before considering a broader asset library or motion system.

**Out of scope for this discovery:** coding a new feature, declaring benchmark parity, revising an approved script, generating an MP4, or committing third-party video/assets.

**Related documents:** [Product Vision](PRODUCT_VISION.md), [Authoring Guide](AUTHORING_GUIDE.md), [Production Pipeline](PRODUCTION_PIPELINE.md), [Implementation Roadmap](IMPLEMENTATION_ROADMAP.md), [AI-authored pivot](2026-10-19-AI-AUTHORED-PIVOT.md).
