# Authoring guide: from a teaching script to a lesson spec

This is the brief an AI agent (Codex, Claude, a person) follows to turn a plain
teaching script into `lessons/<id>.lesson.json`. The spec says *what* the
lesson shows; the compiler decides positions, camera, timing and rendering.
Never write coordinates or layer data.

## Process

1. Read the script and decide the lesson's teaching arc: what the viewer should
   understand at the end, and the smallest diagram that supports it.
2. Choose components (nodes) and connections (edges). Prefer 3 to 7 components.
3. Split the script into scenes of one idea each. A scene is one or two
   sentences of narration (aim for 15 to 40 words; at most 45).
4. In each scene, reveal the components/edges the sentence is about, or show an
   overlay (card, bullets, comparison, sequence). Pin reveals to the words that
   introduce them with `[[id]]` cues.
5. Validate: `npm run lesson -- validate lessons/<id>.lesson.json`. Fix every issue.
6. Lint both formats and fix errors:
   `npm run lesson -- lint lessons/<id>.lesson.json --aspect 16:9` and `--aspect 9:16`.

Do not turn the script into slides by keyword matching. Rewrite narration so it
is spoken English, explain each idea once, and make the picture carry the
structure the words describe.

## Spec shape

```json
{
  "version": 1,
  "id": "kebab-case-slug",
  "title": "How X Works",
  "theme": "dark-sketch",
  "intro": { "subtitle": "One line", "seconds": 3 },
  "outro": { "text": "One-sentence takeaway", "seconds": 3 },
  "nodes": [{ "id": "client", "kind": "client", "label": "Clients" }],
  "edges": [{ "id": "client-lb", "from": "client", "to": "lb", "label": "requests", "style": "solid" }],
  "scenes": [
    { "id": "problem", "title": "The problem", "narration": "[[client]]Every time you open a site...", "reveal": ["client"] }
  ]
}
```

- `id`, node/edge/scene ids: lowercase slug (`a-z0-9_-`), unique. Node and edge ids share one namespace.
- `kind` is one of: `client`, `load-balancer`, `server`, `database`, `cache`, `queue`, `cdn`, `api-gateway`, `object-storage`, `worker`.
- Labels: at most 16 characters. Graph: acyclic, at most five columns deep; at most 7 components on screen at once.
- `theme`: `dark-sketch` (default, preferred) or `clean-technical`.
- Do not set `canvas` or `durationSeconds`: the output format is chosen when producing, and narration audio sets every duration.

## Scenes

Each scene has `id`, `title`, `narration`, and any of:

- `reveal`: node/edge ids shown in this scene, in order. An edge can only be revealed after both its nodes. Every node and edge must be revealed by some scene.
- `hide`: ids to remove (already revealed).
- `emphasize`: node ids that glow for the scene. `flow`: edge ids with travelling dots.
- `focus`: node ids the camera frames (default: everything revealed so far).
- One overlay at most per scene (the diagram is dimmed behind it):
  - `card`: `{ id, title?, lines[<=8, each <=60 chars] }`, code or a request. Cues `[[<card id>.<n>]]` (n from 1).
  - `bullets`: `{ id, title, items[1..6, each <=72 chars], tone?: neutral|positive|negative }`. Cues `[[<id>.<n>]]`.
  - `comparison`: `{ id, left: { title, lines[<=6] }, right: {...} }`. Cues `[[<id>.left.<n>]]`, `[[<id>.right.<n>]]`.
  - `sequence`: `{ id, participants[2..5: { id, label<=20 }], messages[1..8: { id, from, to, label<=56, kind: sync|async|response }] }`. Cues `[[<sequence id>.<message id>]]`. Use it for ordered request/response interactions: `sync` filled arrow, `async` open arrow, `response` dashed return.

## Narration cues

`[[id]]` placed before a phrase makes that element appear when the voice reaches
the phrase. Valid cue ids in a scene: its `reveal`/`hide` ids, its overlay's
line/message ids, `emphasize:<node>` and `flow:<edge>`. Each cue at most once.
Changing narration text means re-running narration (`produce` does it).

## Quality bar

- Every scene changes something on screen; no scene only repeats the previous one.
- Narration is at most about 3 words per second of scene; do not cram.
- Show structure with components and edges; use an overlay for detail, not for everything.
- Read the rendered stills (`data/exports/stills/<project id>/`) in both formats before calling it done.
