---
name: studio-primitive
description: Adds a reusable visual component or action to the Tech Explainer Studio library (for example tokenCard, protocolLanes, kvTable lookup, browserWindow) in house style, with states, tests and a demo still, and updates the technique catalog. Use this whenever a storyboard needs something the lesson spec cannot express yet, when the user asks for a new component, state or animation, or when promoting a hero primitive into the spec.
---

# Studio primitive

A primitive is a permanent library piece that every future video can use. Build it
once, well, and generically. Never build a primitive for one video's exact content.

## Before building

1. Check it does not already exist: `TECHNICAL_COMPONENT_KINDS` (`src/types.ts`), the
   lesson-spec types in `src/domains/lesson-spec/`, `src/remotion/hero/primitives/`,
   and TECHNIQUES.md status.
2. Check Gate B approved it.
3. Write down its contract in one paragraph: what it shows, its props, its **named
   states** (for example a token: `issued`, `in-transit`, `stored`, `expired`,
   `stolen`), and the **actions** that move between states.

## Design rules

- Colours, type and spacing from `src/remotion/hero/theme.ts`. Colour carries meaning:
  blue request/action, teal healthy/cache/success, amber attention/latency, red
  failure/pressure/threat, paper-white for app UI.
- States are visually distinct without relying on colour alone (icon, outline, label).
- Motion is purposeful: spring entrance, eased travel, a brief emphasis on state
  change. No idle wobble.
- Works at portrait scale first; text ≥ 22 px at 1080 wide.
- Deterministic: a pure function of frame and props. No `Math.random`, no wall-clock.
- Original design only. Do not trace or imitate a reference creator's assets.

## Where it goes

Follow `AGENTS.md`: spec types and validation in `src/domains/lesson-spec/`, rendering
through the compiler and renderer, new logic in a domain module. For a new component
kind follow the "To add a component kind" steps in AGENTS.md. Persisted-field changes
need a schema version and migration. Reuse the hero primitive code where it fits
rather than writing a second version.

## Done means

- Spec can express it; `validate` rejects bad input with a clear message.
- A unit test for any non-trivial pure logic (timing, state transitions, layout maths).
- A demo still of every state, in 9:16, viewed by you before you call it done.
- `docs/visual-references/TECHNIQUES.md` status row updated to *library*.
- The video's `STATUS.md` primitives table updated (new vs reused).
- `npm run typecheck`, `npm run lint`, `npm test` pass.
