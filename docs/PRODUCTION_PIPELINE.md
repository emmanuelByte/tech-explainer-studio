# Production pipeline: script to MP4

One command takes a lesson spec (or a plain teaching script) to a verified,
captioned, narrated MP4 in 16:9, 9:16 or both.

```text
Teaching script
   | optional: an AI agent writes the spec (docs/AUTHORING_GUIDE.md)
   v
Lesson spec  lessons/<id>.lesson.json            the source of truth
   v validate -> narrate -> audio checks -> build -> lint -> stills -> render -> verify -> inspect
MP4 + provenance sidecar                          data/exports/<project id>.mp4(.json)
   v human review at /review/<project id>, notes, AI revision, export
```

## Prerequisites (once per machine)

| Needed | For | How |
| --- | --- | --- |
| Node 22+ and `npm ci` | everything | `npm ci` |
| `ffmpeg` and `ffprobe` on `PATH` | verification, inspection, pace control, contact sheets | `brew install ffmpeg` (rubberband makes slowed speech sound better; `atempo` is the fallback) |
| Python 3.11 venv in `tools/local-tts/.venv` with Chatterbox | narration | `docs/LOCAL_TTS.md` |
| A reference voice `tools/local-tts/voices/baseVoice.wav` | narration | `docs/LOCAL_TTS.md` |
| The caption aligner model (about 360 MB, free) | measured caption and cue timing | downloaded automatically on the first narration into `tools/local-tts/.cache`; needs network that once |
| Chrome for Remotion | rendering | downloaded automatically on the first render |
| `codex` or `claude` CLI (optional) | `--script` authoring | install and sign in; not needed if you write the spec yourself |

No paid API is required anywhere. Without the voice worker use `--narration none`.

## Start the voice worker (for narrated output)

```bash
cd tools/local-tts && HF_HOME="$PWD/.cache" .venv/bin/python -m uvicorn server:app --host 127.0.0.1 --port 8123
curl -s http://127.0.0.1:8123/health     # {"ok":true,"modelLoaded":true,...}
```

## Produce a video

```bash
# From a plain teaching script (an agent writes the spec, then the same pipeline runs):
npm run produce -- --script lessons/how-caching-works.script.md --aspect both
# From a spec (deterministic; no AI involved):
npm run produce -- lessons/how-caching-works.lesson.json --aspect both
```

| Option | Meaning |
| --- | --- |
| `--aspect 16:9\|9:16\|both` | Native 1920x1080 and/or 1080x1920. Portrait gets the project id `lesson_<id>-9x16`. Default `16:9`. |
| `--theme dark-sketch\|clean-technical` | Overrides the spec's `theme` (default `dark-sketch`). |
| `--quality draft\|standard\|high` | `draft` is half size, for checking timing. `standard` and `high` are native size (CRF 18 / 14). |
| `--voice`, `--exaggeration`, `--cfg`, `--worker` | Chatterbox settings (`baseVoice`, 0.5, 0.5, `http://127.0.0.1:8123`). `--cfg` does **not** reliably control speed. |
| `--pace <words/s>` | Sentences spoken faster than this are slowed (at most to 80%) without changing pitch. Default 3.0, about 180 words per minute. |
| `--narration none` | Silent video with estimated caption timing. Needs no worker; this is what CI uses. |
| `--out <path>` | An `.mp4` (one aspect) or a directory. Default `data/exports/`. |
| `--no-stills` | Skip the per-scene frames and contact sheet. |
| `--force` | Redo every stage. |
| `--allow-lint-errors` | Render even when lint reports layout errors. |
| `--script <file>`, `--author codex\|claude\|"<cmd>"`, `--spec <file>` | Author the spec from a plain script first (default agent `codex`). |

## What each stage does

1. **validate** the spec (structure, references, limits, cycles).
2. **narrate** with Chatterbox, one **sentence** at a time (a sentence keeps its natural intonation; cues no longer cut speech). Each sentence is trimmed, slowed if the voice rushed it, joined with a sentence-aware pause, and brought to one loudness. Every sentence is then forced-aligned to its audio (`tools/local-tts/align.py`), so each spoken word has a measured time. Cue times come from those words. Audio and manifest are committed atomically.
3. **audio checks** on the files and manifest: missing, corrupt or silent audio, clipping, stalled speech, words-per-second pace, loudness spread, and manifest versus file versus project timeline. Errors stop the run. These measure the signal; they cannot hear pronunciation (see "What still needs a human").
4. **build** the project JSON for the aspect and theme (`data/projects/<project id>.json`).
5. **lint** the layout in that aspect: components and overlays against captions and the frame, text that would overflow its box, reveals that land too late, components pushed off screen by zoom, caption phrase timing, pacing. Errors stop the run.
6. **stills**: one frame per scene in `data/exports/stills/<project id>/`, plus `contact-sheet.png` (every scene on one image). **Look at the contact sheet and stills**; they are written for a person or agent to read and are not analysed.
7. **render** with Remotion to H.264 (bt709, yuv420p) and AAC.
8. **verify** with ffprobe: size, frame rate, codec, pixel format, duration within a frame of the project, and an audio track when narrated. A sidecar `<file>.mp4.json` records the settings and fingerprints.
9. **inspect** the decoded video: a frame from the middle of every scene must show content (not blank) and frames inside caption phrases must show caption text. It does not judge composition.

## Captions

Captions are short phrases, not whole scenes. The aligned words are grouped at
sentence ends, commas, the speaker's own pauses and a per-format length limit
(about one line in 16:9, two short lines in 9:16). Phrases never break inside a
token such as `POST /checkout` or `profile:42` and avoid ending on "the", "of"
and similar. A phrase appears about 60 ms before its first word and stays at most
0.3 s after its last. Timing is marked **aligned** (measured) or **estimated**
(letter-count spread, used for silent builds and when the aligner is unavailable);
`lesson audio` and the pipeline log say which.

## Restarting and reuse

Each stage stores a fingerprint of its inputs in `data/production/<lesson>.json`.
A re-run skips a stage whose fingerprint and output are unchanged:

- after a crash, running the same command resumes at the failed stage;
- changing only `--theme`, `--aspect` or `--quality` reuses the narration;
- changing narration text, the voice or `--pace` invalidates narration and everything after it (unchanged sentences come from the take cache, so only new sentences are spoken);
- editing the compiler or renderer sources invalidates build/render.

A missing output (a deleted MP4) is regenerated. `--force` ignores all fingerprints.

## Review and revision

```bash
npm run dev                                   # human: /review/<project id>, notes per scene
npm run lesson -- notes lessons/x.lesson.json # agent: pending notes with stable scene ids
npm run lesson -- revise lessons/x.lesson.json --patch fix.json --notes note_a --summary "..."
npm run produce -- lessons/x.lesson.json --aspect both --quality draft   # rebuilds only what changed
npm run lesson -- compare lessons/x.lesson.json --scene queue            # before | after image + difference
npm run lesson -- notes lessons/x.lesson.json --verify note_a --evidence "Scene 'queue' now shows ..."
```

Notes move `pending -> applied -> verified`, one id at a time. `revise` applies a
semantic patch only to the scenes the named notes cover, keeps the previous spec
in `data/production/history/` and the previous stills for `compare`. `--verify`
is refused until something was rendered after the correction; look at the new
frames first. The review screen shows the statuses and a "New version" button.

## Where things are written

| What | Where |
| --- | --- |
| Final videos | `data/exports/<project id>.mp4` (or `--out`), with `<file>.mp4.json` |
| Per-scene frames and contact sheet | `data/exports/stills/<project id>/` |
| Built project | `data/projects/<project id>.json` |
| Narration audio and manifest | `data/assets/files/`, `data/narration/<lesson>.json`; per-sentence take and alignment cache in `data/narration/cache/` |
| Stage fingerprints | `data/production/<lesson>.json` |
| Review notes, before/after images | `data/reviews/` |

`data/` is local and git-ignored. Nothing there is deleted by the pipeline except superseded narration audio and stale stills.

## Troubleshooting

| Symptom | Cause and fix |
| --- | --- |
| `The voice worker is not reachable` | Start the worker (above), or use `--narration none`. |
| `(aligner skipped ...)` / words "estimated" | The Python venv or the model download is missing; captions fall back to estimated timing. Fix `tools/local-tts/.venv` (see the prerequisites), then delete `data/narration/<lesson>.json` and run again: the spoken takes are cached, so only the alignment is redone. |
| `could not slow a rushed sentence` | ffmpeg missing or lacks the filter; the sentence is used unslowed and the pace check will warn. |
| `[audio] ERROR ... clipping / silent / timeline` | A bad take. Run `produce --force`; if it repeats, reword the scene it names. |
| `[audio] WARNING ... pace` | Speech faster than 4.2 or slower than 1.4 words per second even after pacing: shorten or split the scene. |
| `[lint] ERROR overlay-collision / caption-collision` | Too much on screen for that format: reduce `reveal`s in the scene, shorten overlay lines, or set `focus`. |
| `Stopped at stage "inspect"` | A scene rendered blank or captions did not draw. Open the contact sheet; `--force` re-renders. |
| `Stopped at stage "render"` | Read the Remotion text printed under it; completed stages are saved, re-run the same command. |
| Fresh clone cannot render | Fixed: the empty asset list Remotion imports is created on demand. Run `npm ci` first. |

## What still needs a human

Automated checks measure level, silence, clipping, pace, timing, layout geometry
and frame content. They cannot judge: how natural or well-pronounced the voice
is (especially acronyms and product names), whether the diagram teaches the
idea, whether motion feels right, or whether captions are pleasant to read.
Listen to the MP4 and read the contact sheet before approving.
