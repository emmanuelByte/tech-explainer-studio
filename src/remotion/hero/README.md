# Hero shot: How caching works (9:16, 30 s)

A hand-built reference shot that sets the visual bar before any of this goes into the
lesson compiler. Fictional app (Orbit) and illustrative numbers.

```bash
npx remotion studio src/remotion/hero/index.ts            # preview and scrub
npx remotion render src/remotion/hero/index.ts CachingHero out/caching-hero.mp4 --color-space=bt709
```

Fonts come from `@fontsource/ibm-plex-sans`, `@fontsource/kalam` and `@fontsource/jetbrains-mono` (dev dependencies).

## Narration (cue frames at 30 fps)

| Frame | Line |
| --- | --- |
| 0 | Your profile page takes 900 ms to load. |
| 100 | Almost all of it is one database query… |
| 180 | asked 40,000 times a minute. |
| 250 | Same question. Same answer. Every time. |
| 330 | So keep the answer in memory. |
| 400 | First request: a cache miss. Read the database… |
| 475 | …then save a copy in the cache. |
| 560 | Every request after that is a cache hit. |
| 650 | Page load: 900 ms → 40 ms. |
| 760 | But what happens when Ada changes her name? |

Numbers stay consistent on purpose: 94% hit rate × 40,000 reads/min leaves 2,400 reads/min on the database.

## Primitives this shot proves (library candidates)

| File | Component / action | State it carries |
| --- | --- | --- |
| `primitives/PhoneScreen.tsx` | `phoneScreen` | loading skeleton → loaded content |
| `primitives/Nodes.tsx` | `server`, `database`, `cache` | glow under pressure, stored key |
| `primitives/Meter.tsx` | `meter` | value with load/good colour scale |
| `primitives/Chip.tsx` | `chip`, action `send(from, to, payload)` | payload label, colour by role |
| `primitives/Connector.tsx` | `connector` | draw-in, active highlight |
| `primitives/Caption.tsx` | `caption` | one highlighted keyword per phrase |
| `primitives/Handwriting.tsx` | `annotation` | write-on reveal with underline |
| `CachingHero.tsx` | readout `bigNumber` | count, colour shift, "was" ghost |

Next step: express these as lesson-spec kinds/actions so the agent can author this shot from JSON.
