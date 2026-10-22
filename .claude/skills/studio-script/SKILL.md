---
name: studio-script
description: Writes and fact-checks the narration for a Tech Explainer Studio video in Emmanuel's narrative style, then stops for word-for-word approval. Use this whenever a video needs a script, a narration draft, a hook, a rewrite of narration, or a fact-check of a teaching claim, including when the studio-video skill reaches the script stage. Never use it to change narration that is already approved without asking.
---

# Studio script

The script decides whether the video is elementary or sharp. Visuals cannot rescue
a script that only defines terms. Write it the way Emmanuel writes his articles: a
real problem with stakes, a mechanism you can see, and a lesson worth keeping.

## If narration is already approved

Use it verbatim (see `docs/AUTHORING_GUIDE.md`). Do not polish it. If it contains a
technical error, flag it and propose a fix; change nothing until the user agrees.

## The story contract

Every script, whatever the topic:

1. **Hook in the first 3 seconds** with a concrete situation and a number or a
   question the viewer cares about. Not a definition. Not "In this video".
   - Weak: "A cache is a small, fast store."
   - Strong: "Your profile page takes 900 milliseconds. Almost all of it is one query."
2. **One running scenario.** A fictional app and named cast that persist through the
   whole video (for example Orbit and Ada). Every concept happens *to* them.
3. **Show the mechanism in order.** What is sent, by whom, to whom, what changes.
4. **At least one detail an experienced engineer would nod at** (a failure mode, a
   trade-off, an edge case), not only the happy path.
5. **Numbers stay consistent** across the script. Mark illustrative ones as such in
   the fact-check notes.
6. **Payoff**, then optionally a one-line cliffhanger that sets up a next episode.

## Writing for the voice and the captions

- Short spoken sentences. About 2.5–3 words per second of screen time.
- Every sentence must have something to *show*; if you cannot picture the shot, cut
  or rewrite the line.
- Break into caption phrases of 3–8 words, and pick **one keyword per phrase** to
  highlight. Write it as `{keyword}` in the script.
- Spell out what TTS mispronounces (say "T T L" if needed, note it).

## Originality

When the topic comes from a reference video, write from the underlying mechanism,
not from their narration. Do not reuse their sentences, structure of jokes, examples
or character names. Your own fictional app and cast.

## Fact-check (required before showing the user)

List every technical claim, and for each: correct / simplified-but-fine /
needs-source. Search for anything not certain (protocol details, token lifetimes,
defaults, numbers that look real). Prefer RFCs, official docs and vendor docs. If a
simplification could teach something false, fix the line.

## Output: `lessons/<id>.script.md`

```markdown
# <title>
Target: 9:16, <n> s, reference topic: <...> (original script)

## Narration
| # | Phrase (with {keyword}) | Approx s | What we see |
| 1 | Your profile page takes {900 ms}. | 0–3 | page load counter climbing |

## Fact-check
| Claim | Verdict | Source / note |

## Numbers used
<list, with which are illustrative>
```

## Gate A

Show the narration table and the fact-check summary. Ask: "Approve this narration
word for word, or send changes?" Then stop. Record the outcome in the video's
`STATUS.md`. After approval the words are frozen.
