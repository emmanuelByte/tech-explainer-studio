# Production pipeline: script to MP4

One command takes a lesson spec (or a plain teaching script) to a verified MP4
in 16:9, 9:16 or both.

```text
Teaching script
   | optional: an AI agent writes the spec (docs/AUTHORING_GUIDE.md)
   v
Lesson spec  lessons/<id>.lesson.json          the source of truth
   v validate -> narrate -> build -> lint -> stills -> render -> verify
MP4 + provenance sidecar                        data/exports/<project id>.mp4(.json)
   v human review at /review/<project id>, notes, AI revision, export
```

## The command

```bash
# From a spec (deterministic; no AI involved):
npm run produce -- lessons/message-queue.lesson.json --aspect both

# From a plain script (an agent CLI authors the spec, then the same pipeline runs):
npm run produce -- --script lessons/how-caching-works.script.md --aspect both
```

| Option | Meaning |
| --- | --- |
| `--aspect 16:9\|9:16\|both` | Native 1920x1080 and/or 1080x1920. Portrait gets the project id `lesson_<id>-9x16`, so both can exist and be reviewed side by side. Default `16:9`. |
| `--theme dark-sketch\|clean-technical` | Overrides the spec's `theme` (default `dark-sketch`). |
| `--quality draft\|standard\|high` | `draft` is half size, for checking timing. `standard` and `high` are native size (CRF 18 / 14). |
| `--voice`, `--exaggeration`, `--cfg`, `--worker` | Chatterbox settings (`baseVoice`, 0.5, 0.5, `http://127.0.0.1:8123`). |
| `--narration none` | Silent video with placeholder timing. Needs no voice worker or audio; this is what CI uses. |
| `--out <path>` | An `.mp4` (one aspect) or a directory. Default `data/exports/`. |
| `--no-stills` | Skip the per-scene frames. |
| `--force` | Redo every stage. |
| `--allow-lint-errors` | Render even when lint reports layout errors. |
| `--script <file>`, `--author codex\|claude\|"<cmd>"`, `--spec <file>` | Author the spec from a plain script first (default agent `codex`). |

## What each stage does

1. **validate** the spec (structure, references, limits, cycles).
2. **narrate** with the local Chatterbox worker. Only phrases whose text changed are spoken again; audio and the manifest are committed atomically and superseded audio is removed only after the new manifest is saved.
3. **build** the project JSON for the chosen aspect and theme (`data/projects/<project id>.json`).
4. **lint** the layout, in that aspect. Errors stop the run before the slow stages.
5. **stills**: one frame per scene in `data/exports/stills/<project id>/`. Look at them.
6. **render** with Remotion to H.264 (bt709, yuv420p) and AAC.
7. **verify** with ffprobe: size, frame rate, codec, pixel format, duration (within a frame of the project) and an audio track when narrated. A sidecar `<file>.mp4.json` records the settings and fingerprints.

## Restarting and reuse

Each stage stores a fingerprint of its inputs in `data/production/<lesson>.json`.
A re-run skips a stage whose fingerprint and output are unchanged:

- after a crash, running the same command resumes at the failed stage;
- changing only `--theme`, `--aspect` or `--quality` reuses the narration (audio depends only on narration text and voice settings);
- changing narration text, or the voice, invalidates narration and everything after it;
- editing the compiler or renderer sources invalidates build/render.

A missing output (a deleted MP4) is regenerated. `--force` ignores all fingerprints.

## Plain script to video

`--script` hands the script and `docs/AUTHORING_GUIDE.md` to an agent CLI
(`codex exec` by default), which writes `lessons/<script name>.lesson.json`.
The pipeline then validates and lints the spec in both formats and returns any
problems to the agent, up to three attempts. Nothing in this repository turns
text into slides by itself: without an agent, write the spec by hand or let any
agent follow the guide, then run `produce` on the JSON. No paid API is required
(Codex and Claude CLIs are optional; Chatterbox runs locally).

## Review and revision

```bash
npm run dev                                   # human: /review/<project id>, leave notes per scene
npm run lesson -- notes lessons/x.lesson.json # agent: pending notes with stable scene ids
npm run lesson -- revise lessons/x.lesson.json --patch fix.json --notes note_a --summary "..."
npm run produce -- lessons/x.lesson.json --aspect both --quality draft   # rebuilds only what changed
npm run lesson -- compare lessons/x.lesson.json --scene queue            # before | after image + difference
npm run lesson -- notes lessons/x.lesson.json --verify note_a --evidence "Scene 'queue' now shows ..."
```

Notes move `pending -> applied -> verified`, one id at a time. `revise` applies a
semantic patch (`src/domains/lesson-spec/patch.ts`) only to the scenes the named
notes cover (`--allow-scenes`, `--allow-global` widen it deliberately), and keeps
the previous spec in `data/production/history/` and the previous stills for
`compare`. `--verify` is refused until something was rendered after the
correction; the agent must look at the new frames first. The human sees the
statuses in the review screen, and a "New version" button when the build changes.

## Failure messages

A failed run names the stage, the cause and the next step, and states that
finished stages are saved. Typical ones: voice worker not running (with the
exact start command), spec invalid (with paths), lint errors (listed), Remotion
or ffprobe errors (with the tail of their output).
