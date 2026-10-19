# Production acceptance: "How Caching Works"

Branch `feat/production-pipeline`. This documents what was produced, how it was
checked, what was wrong and fixed, and what is still unverified.

Result labels used below:

- **Measured**: a number obtained from the final files with a tool that does not share code with the pipeline's own checks (ffprobe, ffmpeg loudness, an analysis of the MP4's own audio track).
- **Automated check**: a check built into the pipeline. It passed, but it is the pipeline grading itself.
- **Observed**: I read rendered frames or frame sequences taken from the final MP4s. Subjective.
- **Not verified**: could not be checked in this environment.

## 1. Source

| | |
| --- | --- |
| Teaching script | `lessons/how-caching-works.script.md` |
| Lesson spec | `lessons/how-caching-works.lesson.json` (first draft written by `codex exec` from the script through `npm run produce -- --script ...`; corrected as described in section 5) |
| Theme | `dark-sketch` (primary); `clean-technical` comparison frames |
| Voice | Chatterbox, reference `baseVoice`, exaggeration 0.5, cfg 0.5 (cfg is not used as a speed control), pace governor 3.0 words/s |

## 2. Outputs

| Format | File |
| --- | --- |
| 16:9, 1920x1080 | `data/exports/acceptance/lesson_how-caching-works.mp4` (+ `.mp4.json` provenance) |
| 9:16, 1080x1920 | `data/exports/acceptance/lesson_how-caching-works-9x16.mp4` (+ `.mp4.json`) |
| Review frames taken from those MP4s (tracked) | `docs/acceptance/landscape-NN-<scene>.png`, `docs/acceptance/portrait-NN-<scene>.png` |
| Clean Technical comparison frames (tracked) | `docs/acceptance/clean-technical-*.png` |
| Contact sheets | `data/exports/stills/lesson_how-caching-works/contact-sheet.png`, `.../lesson_how-caching-works-9x16/contact-sheet.png` |

`data/` is local and git-ignored, so the MP4s are on the machine that ran the
pipeline, not in the repository. Reproduce them with
`npm run produce -- lessons/how-caching-works.lesson.json --aspect both --out data/exports/acceptance`
(the narration takes are cached, so this is a few minutes).

The frames in `docs/acceptance/` cover: intro (`01`), initial architecture
(`04`, `02`), cache hit (`06`), cache miss (`07`), stale data (`08`), TTL
(`09`), outcome (`10`), outro (`11`), with captions visible in each.

## 3. Technical results

### Measured (ffprobe, ffmpeg; run on the final files)

| | 16:9 | 9:16 |
| --- | --- | --- |
| Video | H.264 High, 1920x1080, 30 fps, yuv420p, tv range, bt709 | H.264 High, 1080x1920, 30 fps, yuv420p, tv range, bt709 |
| Audio | AAC-LC, 48 kHz, stereo | AAC-LC, 48 kHz, stereo |
| Duration | 101.78 s (video 101.73 s) | 101.78 s (video 101.73 s) |
| Size | 8.6 MB | 8.9 MB |
| Full decode (`ffmpeg -i f -f null -`) | no errors | no errors |
| Loudness (EBU R128) | -16.4 LUFS integrated, 3.6 LU range, true peak -4.0 dBFS | same |

Loudness was -21.8 LUFS before the narration was mastered (section 5); -16 LUFS
is the usual short-form target. Platform behaviour was not tested.

### Caption synchronisation (measured on the MP4's own audio track)

Method: extract the audio from the final 16:9 MP4 and compare caption times with
the waveform (a 10 ms RMS envelope), independent of the aligner that produced
the timing. 39 caption phrases, mean 6.4 words, longest 58 characters.

- 27 captions begin right after a pause, so the speech onset is measurable from the audio alone. The caption appears **23 to 130 ms before the first word (mean 82 ms)**; none appear late. About 60 ms of that lead is deliberate.
- 12 captions end in a pause. They stay **at most 0.32 s (mean 0.25 s)** after the speaker stops.
- No caption is on screen during 0.8 s or more of continuous silence.
- **100%** of the time the narrator is speaking has a caption showing.
- All 84.9 s of narrated words have **aligned (measured)** timing, none estimated.

Limit of this evidence: it validates caption starts after pauses and ends before
pauses, not every word in the middle of a phrase. Mid-phrase accuracy rests on
the aligner, which agreed with the waveform's speech onset to within 0.06 s and
offset to within 0.1 s on 29 clips.

### Automated checks (the pipeline's own; all passed on the final run)

- `validate`; audio checks (files present and readable, no silence or clipping, no stalled take, pace 1.4 to 4.2 words/s, loudness spread, manifest vs file vs project timeline); `lint` in both formats (0 findings); frame content inspection (every scene has content, caption text is visible in sampled phrase frames); ffprobe verification against the project.
- `npm run typecheck` (src, tools, server): clean. `npm run lint`: 0 errors, 91 warnings, all in inherited editor code; production, server, review and renderer-adjacent code has none except two deliberate per-field dependency lists in `src/remotion/Composition.tsx`. `npm test`: 40 files, 328 tests passed. `npm run build`: OK.

## 4. Narration

- Spoken a **sentence at a time**. Earlier the pipeline spoke cue-delimited chunks, which put a pitch reset and a fixed 0.18 s pause in the middle of sentences. Cues now take their time from the aligned words.
- The raw voice averaged **219 words per minute** (3.65 w/s; `cache-miss` 4.3 w/s), fast for technical content. Cfg does not fix this. Sentences above 3.0 w/s are slowed, pitch-preserving, by at most 20% (rubberband); almost every sentence hit the 80% floor, giving roughly 175 to 185 wpm overall.
- Sentences are joined with a 0.34 s pause (0.16 s after a clause split), edges trimmed, loudness mastered with a peak limiter.
- **Not verified:** I cannot listen to audio. Whether the voice sounds natural, how it pronounces "TTL" and "cache", and whether the slowed sentences sound processed are all unjudged. Please listen to both MP4s.

## 5. Defects found and corrected in this pass

Found by running things and reading the output, not from the earlier documentation:

| Defect | Found by | Fix |
| --- | --- | --- |
| Captions showed a whole scene's narration at once | review of the system | Aligned word timing; phrase captions per format; short fade |
| Cues split sentences into separate utterances | reading the narration code | Sentence-level speech, cue times from aligned words |
| Voice at 219 wpm | measuring aligned words | Per-sentence pace governor |
| Narration at -21.8 LUFS | ffmpeg ebur128 | Gain plus peak limiter to -16.4 LUFS |
| Cache **miss** diagram skipped the cache lookup that missed | technical review of the spec | Miss sequence now: ask cache, "Miss", query database, profile, save copy |
| "Hit or miss" was not a real reply; lookup scene was vague | technical review | Replaced with a three-step "lookup order" card |
| Cache **hit** did not show the database being left alone | technical review | Idle Database lane |
| Stale card did not say which value is where; TTL card did not show expiry | technical review | "Database: ... (updated)" / "Cache: ... (old copy)"; TTL card shows seconds and the reload |
| Doubled markers ("• 1. Ask...") | reading frames | Items reworded |
| 16:9 overlay text small for 1080p | reading frames | 1.3x overlay type scale, still auto-fit |
| Plain opening title | reading frames | Accent rule that draws in once |
| First scene empty for ~2.4 s with only a caption | frame sequence from the MP4 | Cue moved to the first words; new `blank-start` lint rule |
| Sequence panel a thin band in portrait | frames | Row spacing opens up to use spare room |
| Frame inspection crashed on draft renders | running it | Measures at the video's own scale |
| `scripts/` ignored by git; sample script not shipped | git status | Script moved beside the lessons |
| ffmpeg difference parser misread `4.8e-07` | an unexpected number | Exponent-aware parser (earlier pass) |
| Render progress hidden | no percentages in the log | Removed `--log=error` |
| `tsconfig` never checked `tools/` or `server/`; fresh clone failed typecheck | CI run | Included; ambient declaration for the untracked asset index |

New self-review that did not exist before: overlays vs captions and frame edges,
estimated text overflow, late reveals, zoom that pushes revealed components off
screen, caption phrase timing, blank starts, decoded-frame inspection, a contact
sheet, and the audio checks above.

## 6. Observed (frames and frame sequences from the final MP4s)

Read at scene beginnings, middles, cue transitions and ends, for both formats:

- Intro: title with a drawn-in accent rule, then a smooth cross-fade to the first scene.
- Architecture: the camera eases out as components are added; each component fades in on the word that introduces it; sketched outlines and connectors; emphasised components glow.
- Sequences: arrows draw on their cue, filled head for requests, dashed for responses; lifelines are dashed; in the hit scene the Database lane stays visibly unused.
- Cards and comparison: legible in both formats; the comparison stacks in portrait.
- Captions: one line in 16:9, up to two short lines in 9:16, clear of the diagram and kept above the bottom 15% of the frame. I did not test against any platform's actual interface overlay.
- Outro: dimmed diagram behind a short closing line.

## 7. Remaining quality limitations

- Narration naturalness and pronunciation: **not verified** (see section 4).
- The four earlier lessons (`load-balancer`, `message-queue`, `queue-vs-direct`, `request-response-sequence`) were rendered before this pass. Their MP4s in `data/exports/acceptance/` have whole-scene captions and the old narration. Re-running `npm run produce` on each regenerates narration with the new pipeline (several minutes of voice generation each); this was not done.
- The caching lesson's first draft needed technical corrections (section 5). Expect to review agent-authored specs for mechanism accuracy; the authoring guide now says what to look for.
- In portrait, short overlays (a two-line card) are small panels in a tall frame. They are legible, but the frame is not filled; larger portrait type was kept in check by line-fit limits.
- The transition between an overlay and the diagram is a brief cross-dissolve in which both are visible (about 0.4 s).
- Slowing speech to 80% is the floor; a scene the voice rushes more than that is still faster than 3 w/s. The audio check warns above 4.2 w/s.
- Sketch jitter is deterministic per layer, but sketched text is intentionally never used; only component bodies and connectors are sketched.
- The aligner needs a one-time 360 MB model download; without it captions fall back to estimated timing and say so.
- GitHub Actions: see the final status recorded in the pull of this branch; the run for the last commit is checked at the end of this pass.

## 8. Tests run

`npm run typecheck`, `npm run lint`, `npm test` (328 tests: narration recovery, sentence and cue model, caption phrasing and timing, audio analysis and checks, pace governor, pipeline restart and incremental regeneration, render arguments and probe checks, frame inspection against real generated video, lint rules, overlay and sequence geometry in both formats, review notes), and `npm run build`; plus the pipeline run itself on the caching lesson in both formats.
