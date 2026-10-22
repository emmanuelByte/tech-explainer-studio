---
name: studio-storyboard
description: Turns approved narration into a beat-by-beat visual storyboard for a Tech Explainer Studio video, choosing techniques from all seven references and listing which library primitives exist and which must be built. Use this after narration is approved, whenever the user asks what a video will look like, for a shot list or beat plan, or when deciding which primitives a video needs.
---

# Studio storyboard

The storyboard is where the video stops being a slideshow. For every beat, decide
what the viewer *sees change*, and which library piece makes that change.

## Inputs

Approved `lessons/<id>.script.md`, `docs/visual-references/TECHNIQUES.md`, the hero
(`src/remotion/hero/`), the reference frames for this topic, and the current list of
component kinds (`TECHNICAL_COMPONENT_KINDS` in `src/types.ts`) plus library pieces
already built.

## Composition rules (house style)

- **Portrait first** (1080×1920). Recompose for 16:9 only if asked.
- **One persistent stage.** Decide the stage layout once: where the app, services
  and data live. Beats change state *on* that stage. Text cards are the exception:
  at most 20% of runtime.
- **Visible state change at least every 6–8 s**, and one in the first 3 s.
- **Cause before effect.** A tap sends a request; the request arrives; the state
  changes; the UI reflects it.
- **The cued element is the one being spoken about.** If the narration says "the
  cache", the thing that moves or lights up is the cache.
- **Chapter headings** (handwritten, top of frame) when the video has sections.
- Legible at phone size: labels ≥ 22 px at 1080 wide, keep the caption zone clear.

## Pick techniques from all references equally

For each beat, choose the technique that teaches it best from TECHNIQUES.md, whichever
video it comes from, and credit it in the storyboard. Render it in house style; never
copy the source's look.

## Output: `docs/videos/<nn>-<slug>/storyboard.md`

```markdown
# Storyboard: <title>

## Stage layout (portrait)
<ASCII sketch of the persistent stage: positions of app, services, data, caption zone>

## Beats
| # | Time | Phrase | Before → after (what changes) | Technique (source) | Primitive | Status |
| 1 | 0–3 s | Your profile page takes {900 ms}. | counter 0 → 900, skeleton loading | big number (hero) | bigNumber | exists |

## New primitives needed
| Primitive | Why this video needs it | States | Reused later by |

## Capability gaps
<anything the engine cannot do yet and the smallest extension that would fix it>
```

## Gate B

Show the stage sketch, the beat table and the new-primitive list. Ask: "Approve this
storyboard and these new primitives?" Then stop and record the result in `STATUS.md`.
Keep the new-primitive list as short as the teaching allows; each one is permanent.
