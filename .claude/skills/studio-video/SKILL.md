---
name: studio-video
description: Runs the Tech Explainer Studio pipeline for ONE explainer video at a time, from topic to approved render, with approval gates and a status file. Use this whenever the user asks to make, recreate, benchmark, continue or check on an explainer video or lesson ("do the next video", "recreate the KodeKloud auth video", "where are we on TCP/TLS", "start video 3"), even if they don't say "pipeline". It coordinates the studio-script, studio-storyboard, studio-primitive and studio-review skills.
---

# Studio video: one video at a time

This is the conductor. It decides which stage a video is in, runs that stage with
the right skill, and stops at every gate for the user. **Work on exactly one video
at a time.** Never start the next video until the user has signed off the current
one; parallel half-finished videos are what this process exists to prevent.

## Before anything else

Read, in this order: `AGENTS.md`, `src/remotion/hero/README.md` (the house style and
the approved visual bar), `docs/visual-references/TECHNIQUES.md` (techniques from all
seven references, equal weight), `docs/2026-10-22-VISUAL-REFERENCE-BENCHMARK.md`.
Watch or scrub the hero (`npm run hero:studio`) if you have not this session.

## Find the current video

Each video has a folder `docs/videos/<nn>-<slug>/` with a `STATUS.md`
(template: `references/status-template.md`). The benchmark queue and the section
of each reference to target are in `references/benchmark-queue.md`.

- If the user names a video, use it.
- Otherwise open the newest `STATUS.md` that is not `done`. Resume it.
- Only if every video is `done` and the user asks for the next one, take the next
  entry from the queue and create its folder and `STATUS.md`.

Say in one line which video and stage you are on before doing work.

## Stages and gates

| # | Stage | Skill | Ends with |
| --- | --- | --- | --- |
| 1 | Script | `studio-script` | **Gate A:** user approves narration word for word |
| 2 | Storyboard | `studio-storyboard` | **Gate B:** user approves the beat plan and the list of new primitives |
| 3 | Primitives | `studio-primitive` | every primitive the storyboard marks *build* exists in the library |
| 4 | Build and render | spec + `npm run produce` | 9:16 render (16:9 only if asked) |
| 5 | Review | `studio-review` | scorecard, side-by-side, metrics; **Gate C:** user signs off or sends notes |

At a gate: show the artefact, ask one clear question, and stop. Do not continue on
silence. Record the approval (date, and the user's words if short) in `STATUS.md`.
Notes after Gate C loop back to the earliest stage they affect; narration changes
always go back through Gate A.

## Rules that apply at every stage

- **Original work.** Recreate a reference's *topic and techniques*, never its
  narration, layout, logos, characters or app designs. Fictional apps and cast only.
- **House style.** Tokens and type come from `src/remotion/hero/theme.ts`.
- **Library, not one-offs.** Anything visual that does not exist becomes a reusable
  component or action (stage 3). Do not hand-code a shot for one video.
- **Spec is the source of truth.** Never hand-edit `data/projects/lesson_*.json`.
- **Teach correctly.** A beautiful wrong mechanism is a failed video.
- **Be honest in the review.** Gaps are the useful output of a benchmark.

## Keep STATUS.md current

Update it at the end of every stage: stage, gate decisions, files produced, new vs
reused primitives, open problems. It is how the next session (or another agent)
resumes without asking the user to repeat themselves.

## Commits

Follow `AGENTS.md`: do not commit or push unless the user asks. When asked, use one
commit per stage, message prefixed with the video slug.
