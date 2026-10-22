---
name: studio-review
description: Reviews a rendered Tech Explainer Studio video against the reference video and the visual benchmark, producing a side-by-side sheet, a scored review and reuse metrics, then stops for the user's sign-off. Use this whenever a video or clip has been rendered, when the user asks how good a video is, to compare with a reference, or to check quality before publishing.
---

# Studio review

A benchmark is only useful if the review is honest. The point is to find the gaps.

## 1. Look at it properly

- Extract frames across the whole video, not just a few hand-picked moments:
  `npm run lesson -- stills <spec> --aspect 9:16`, plus frames from the MP4 at the
  moments of every state change (before / during / after). Read them all.
- Check the cue/narration agreement beat by beat: is the thing that changes the thing
  being said?
- Watch for the classic failures: text-card slideshow, dead empty frame, tiny labels,
  overlapping chips or badges, a state change nobody can see, a wrong mechanism.

## 2. Side-by-side with the reference

```bash
python3 .claude/skills/studio-review/scripts/side_by_side.py \
  --ours data/exports/stills/<project id>/ \
  --ref docs/visual-references/extra-six/<nn>-<slug>/ \
  --out docs/videos/<nn>-<slug>/side-by-side.webp
```

Reference frames are for comparison in our own docs only, never for publication.

## 3. Score (1–5 each, with one sentence of evidence)

| Dimension | 5 looks like |
| --- | --- |
| Hook | concrete problem and number/question within 3 s |
| Teaching accuracy | mechanism correct, in the right order, edge case shown |
| State-driven visuals | every beat changes visible state; cause before effect |
| Continuity | one stage, same cast and app throughout |
| Legibility (phone) | everything readable at phone size, nothing collides |
| Motion and pacing | purposeful motion, holds long enough, no dead air |
| Captions and type | keyword highlight lands on the spoken word; clean hierarchy |
| Against the reference | honest: worse / equal / better, and why |

## 4. Metrics

Primitives reused vs new, agent sessions, and human minutes (ask the user).

## Output: `docs/videos/<nn>-<slug>/review.md`

Scores, evidence, the top three gaps ranked by impact, and for each gap whether the
fix is script, storyboard, primitive, or engine.

## Gate C

Show the side-by-side, the scores and the top gaps. Ask: "Sign off this video, or send
notes?" Stop. Record the answer in `STATUS.md`. Do not start the next video yourself.
