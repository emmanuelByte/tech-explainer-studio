# Plan: Video editing — trim, split, speed, freeze (Figma-style)

## Goal

Non-destruktivní střih video vrstev:
- **Trim** — vybrat výsek zdroje
- **Split** — rozdělit video na více segmentů
- **Speed** — zrychlit / zpomalit segment (0.25× – 4×)
- **Freeze frame** — podržet jeden frame jako stillshot
- **Transparent gaps** — mezi segmenty může být průhledná mezera

UX je co nejjednodušší: ovládání přímo v timeline + segment editor v pravém panelu. Žádný velký modal editor, žádný razor tool jako separátní mód.

## Core model: video segments

Video vrstva drží **uspořádané pole segmentů**. Každý segment mapuje rozsah na composition timeline na rozsah ve zdrojovém souboru.

```ts
interface VideoSegment {
  id: string
  // Where on the composition timeline this segment is visible
  timelineStartFrame: number   // inclusive
  timelineEndFrame: number     // exclusive
  // Which portion of the source file plays during that timeline range
  sourceStartFrame: number     // inclusive (in source's frame space)
  sourceEndFrame: number       // exclusive
}
```

Frames (ne sekundy) v obou prostorech — integer math, žádný float drift. Source frame space je `sourceTimeSeconds * compositionFps` (composition fps, ne native fps zdroje).

**Speed je derived**, ne stored:

```
speed = (sourceEndFrame - sourceStartFrame) / (timelineEndFrame - timelineStartFrame)
```

| Operace | Stored as | Speed (computed) |
|---------|-----------|------------------|
| Trim only | 1 segment with custom source/timeline ranges | 1.0 |
| Split | 2+ segmenty, druhý začíná tam, kde první skončí | každý vlastní |
| Speed 2× | `sourceEnd - sourceStart = 2 × timeline duration` | 2.0 |
| Speed 0.5× slow-mo | `sourceEnd - sourceStart = 0.5 × timeline duration` | 0.5 |
| Freeze frame | `sourceEndFrame === sourceStartFrame` | 0 |
| Transparent gap | mezera mezi `prev.timelineEnd` a `next.timelineStart` | n/a |

Tahle abstrakce sjednocuje všechny operace: jen čteme/zapisujeme čtyři frame čísla.

## Layer model change

V `src/types.ts`:

```ts
interface Layer {
  // ... existing fields
  videoSegments?: VideoSegment[]   // ordered by timelineStartFrame, non-overlapping, gaps allowed
  sourceDurationFrames?: number    // detected via video.duration * fps on metadata load
}
```

`startFrame` a `endFrame` na video layeru zůstávají, ale jsou **derived envelope**:
```
layer.startFrame = min(seg.timelineStartFrame)
layer.endFrame   = max(seg.timelineEndFrame)
```

Existující kód, který používá `startFrame`/`endFrame` (timeline range, layer ordering, selection bounds) funguje beze změny.

## Backward compatibility — normalize on load

Při načtení projektu i při importu videa **explicitně vytvořit jeden segment** (žádný runtime fallback):

```ts
function normalizeVideoLayer(layer, sourceDurationFrames) {
  if (layer.type !== 'video') return layer
  if (layer.videoSegments?.length) return layer
  const start = layer.startFrame ?? 0
  const end = layer.endFrame ?? (start + (sourceDurationFrames ?? 0))
  return {
    ...layer,
    videoSegments: [{
      id: makeId(),
      timelineStartFrame: start,
      timelineEndFrame: end,
      sourceStartFrame: 0,
      sourceEndFrame: Math.min(sourceDurationFrames ?? (end - start), end - start),
    }],
  }
}
```

Volá se v `projectStorage.readProject` při loadu, a v `addVideoLayer`/`replaceVideoSource` při importu. Jediný zdroj pravdy: store vždy obsahuje materializované segmenty.

## Render path

V `src/remotion/Composition.tsx`:

```ts
function activeSegmentAt(layer, frame): VideoSegment | null {
  return layer.videoSegments?.find(
    (s) => frame >= s.timelineStartFrame && frame < s.timelineEndFrame
  ) ?? null
}

function sourceTimeAt(seg, frame, fps) {
  const timelineDur = seg.timelineEndFrame - seg.timelineStartFrame
  const sourceDur = seg.sourceEndFrame - seg.sourceStartFrame
  const t = (frame - seg.timelineStartFrame) / timelineDur   // 0..1 progress in segment
  return (seg.sourceStartFrame + t * sourceDur) / fps
}
```

`TimelineSyncedVideo`:
1. Najde aktivní segment podle current frame.
2. Pokud žádný → return `null` (nevykresluje se, transparentní mezera).
3. Pokud freeze (`sourceEndFrame === sourceStartFrame`) → seek na `sourceStartFrame / fps` jednou, dál stojí.
4. Jinak → `video.currentTime = sourceTimeAt(seg, frame, fps)` per render frame.

FPS poznámka: source frame space používá composition fps. Pokud má zdroj jiný native fps, `video.currentTime` nás stejně dostane na správný čas v sekundách — browser interpoluje frame display sám. Žádná zvláštní logika.

`onLoadedMetadata` zapíše `sourceDurationFrames = video.duration * fps` do store přes `setLayerSourceDuration(id, durationFrames)`.

## Store actions

V `src/store.ts`:

```ts
setLayerSourceDuration(id, durationFrames)       // metadata write-back
splitVideoAt(layerId, frame)                     // rozdělí aktivní segment v daném frame
removeVideoSegment(layerId, segmentId)           // smaže segment; mezera zůstane
duplicateVideoSegment(layerId, segmentId)        // vloží kopii hned za originál
setSegmentTimelineRange(layerId, segmentId, startFrame, endFrame, opts?)
setSegmentSourceRange(layerId, segmentId, sourceStartFrame, sourceEndFrame)
moveVideoSegment(layerId, segmentId, deltaFrames)   // posun po timeline, source unchanged
setSegmentSpeed(layerId, segmentId, speed)       // upraví sourceEnd aby seděla rychlost (sourceStart fixed)
freezeSegment(layerId, segmentId)                // sourceEnd = sourceStart
resetVideoCut(layerId)                           // vrátí na jeden segment přes celý zdroj
```

`setSegmentTimelineRange` má volitelný `opts.preserveSpeed` (default false). Při dragu pravého handle držíme source start fixed a posouváme jen timeline end (změní se rychlost). S preserveSpeed=true se škáluje i source range (slip).

Invariant po každé akci: segmenty sortované podle `timelineStartFrame`, žádný overlap, gaps allowed. `sourceStart ≤ sourceEnd`, `timelineStart < timelineEnd`, oba clamped do `[0, sourceDurationFrames]`.

`splitVideoAt(layerId, frame)`:
1. Najdi segment obsahující frame.
2. Vypočti `sourceCut = sourceStart + speed × (frame - timelineStart)`.
3. Nahraď segment dvěma: `[timelineStart..frame, sourceStart..sourceCut]` a `[frame..timelineEnd, sourceCut..sourceEnd]`.

## Persistence

Segmenty se ukládají do `MotionProject` jako další pole na layeru. Žádná migrace souborů — staré soubory bez `videoSegments` se normalizují při loadu (viz výše). Save je no-op pro starý formát; po jakékoli editaci se uloží už s `videoSegments`.

## UX: Timeline

Video layer řádek se vykresluje jako **jeden řádek s více segment bary** uvnitř, oddělenými 2px průhlednými mezerami (segmenty s timeline gap mají větší mezeru = vidíš že tam je díra).

```
Layer "Intro.mp4"
[──Segment 1──][❄  ][──S2 (2×)──]    [──S3──]
                                  ↑
                            transparent gap
```

Pro každý segment:
- **Body** — vyplněn layer color, hover světle, vybraný segment má modrý outline
- **Speed badge** (top-right corner): `❄` pro freeze, `0.5×` / `2×` / `0.25×` pro non-1 speed; nic pro 1×
- **Left handle** (3px sloupek na levém okraji) — drag = mění timeline start (source unchanged → změna speed)
- **Right handle** — drag = mění timeline end (source unchanged → změna speed)
- **Body drag** — posouvá celý segment po timeline (source unchanged)
- **Alt/Option + handle drag** — **slip**: source in/out se posouvá zároveň s timeline → speed unchanged, mění se který výsek se přehrává
- **Click** — vybere segment (i video layer), playhead skočí na `timelineStart`

**Right-click na segment** → context menu:
- Split at playhead (`Ctrl+B`)
- Freeze frame (`Shift+F`) — nastaví `sourceEnd = sourceStart` pro tento segment
- Set speed → submenu s presets: 0.25× / 0.5× / 1× / 2× / 4× / Custom…
- Duplicate segment
- Delete segment
- Reset source trim — vrátí source na 0..min(sourceDuration, timelineDuration), tj. realtime od začátku

## UX: Right panel "Segment" section

V Style panelu při vybraném video layeru se objeví sekce **Segment**. Edituje **aktivní segment** = segment pod playhead (nebo nejbližší pokud playhead je v gapu).

Layout (Figma-style, ~200px tall):

```
SEGMENT                                     2 of 3
─────────────────────────────────────────────────
Source                          9.42s · 282f
┌─────────────────────────────────────────────┐
│ ░░░░░░░██████████████████████░░░░░░░░░░░░░ │   visual trim bar
└─────────────────────────────────────────────┘
                                  3.20s shown
IN   [▮ 2.00 s]      OUT  [▮ 5.20 s]

SPEED   1.00 ×
[━━━━━●━━━━━━━━━━━━━]                          slider
[ 0.25× ] [ 0.5× ] [ 1× ] [ 2× ] [ 4× ] [❄ Freeze]

[Split at playhead]  [Delete]  [Reset cut]
```

- **Trim bar** — celá šířka reprezentuje `sourceDurationFrames`. Plný obdélník = source range `[sourceStartFrame, sourceEndFrame]`. Mimo = ztlumený. 2 handles s drag-to-edit.
- **In/Out NumFields** (z `_panelKit`) — sekundy s drag-to-scrub, unit "s"
- **Speed slider** — `.figma-range`, range 0.1× – 4×, snap stops na 0.25/0.5/1/2/4
- **Speed chips** — quick presets; aktivní zvýrazněn `var(--accent-bg)`. **Freeze** chip nastaví freeze stav (`sourceEnd = sourceStart`)
- **Action buttons** vespod — ghost styling jako "Use playhead" v Motion panelu

Pokud playhead v gapu → sekce ukáže: `No segment at this frame` + tlačítko "Insert segment here" (vytvoří 1s segment pokrývající playhead, source od 0).

## Keyboard shortcuts

V `useKeyboardShortcuts.ts`:
- `Ctrl/Cmd+B` — split at playhead (jen pokud je vybraný video layer)
- `Shift+F` — freeze frame na aktivním segmentu
- `Delete` na vybraném segmentu (segment selection state) → odstraní segment, ne layer

## Edge cases

1. **Drag handle přes neighbour segment** — clamping zastaví na hranici. Pro přepsání: `Reset cut` nebo smaž neighbour ručně.
2. **Source overflow** (speed × timeline > available source) — input clamping na maxSourceRange. Při dragu se handle zastaví.
3. **Segment delete** → mezera v timeline (transparent). Žádný auto-close. Pokud neexistuje žádný segment, layer zůstane viditelný v Layer panelu a v Style panel sekci se nabídne `Re-import` nebo `Reset cut`.
4. **Move layer celý** — drag z body LayersPanel/Timeline shiftne všechny segmenty stejně.
5. **Source duration ještě neznámá** — UI ukazuje "Loading metadata…", trim bar je disabled. Split/freeze fungují (operují nad existujícím rozsahem).
6. **Composition fps ≠ source native fps** — žádný problém, source frame space = composition fps × seconds. Browser sám interpoluje display.
7. **Import nového source na existující layer** — `replaceVideoSource` zavolá `normalizeVideoLayer` a přepíše segmenty (jedna mat. segmentace). User před tím dostane confirm dialog (existing segments will be reset).

## Files to touch

### Model + render
- `src/types.ts` — `VideoSegment`, `videoSegments?`, `sourceDurationFrames?`
- `src/store.ts` — všechny segment akce + `normalizeVideoLayer` helper
- `src/projectStorage.ts` — normalize on `readProject`
- `src/remotion/Composition.tsx` — `activeSegmentAt`, `sourceTimeAt`, render gating, metadata write-back

### UI
- `src/components/Timeline.tsx` — render per-segment bars + handles + alt-drag (slip) + right-click context menu
- `src/components/panels/StylePanel.tsx` — nový `SegmentControls` subcomponent (trim bar + speed slider/chips + action buttons)
- `src/hooks/useKeyboardShortcuts.ts` — Ctrl+B, Shift+F, Delete on segment

### i18n
- `src/i18n.ts` — `segment.*` keys (EN + CS) — **shared** (oba autoři přidávají jen své klíče, ne mažou cizí)

---

## Work split: Codex (data/store) ↔ Claude (UI/visual)

Práci si rozdělíme tak, aby šla dělat paralelně. **Jasný interface kontrakt** mezi vrstvami (typy + store akce) musí existovat předtím, než kdokoli začne psát kód — pak může každý fungovat samostatně.

### Step 0 — Shared interface (oba musí odsouhlasit, pak commit zvlášť před prací)

Tohle musí být v hlavní větvi **dřív** než kdokoli začne stranou. Krátký PR od **Codexe**:

**File: `src/types.ts`** (Codex commitne):
```ts
export interface VideoSegment {
  id: string
  timelineStartFrame: number
  timelineEndFrame: number
  sourceStartFrame: number
  sourceEndFrame: number
}

// Add to existing Layer interface:
interface Layer {
  // ...existing fields
  videoSegments?: VideoSegment[]
  sourceDurationFrames?: number
}
```

**File: `src/store.ts`** (Codex commitne signatury — implementace může být `throw new Error('TODO')` pro Claude-only akce):
```ts
// Read-only helpers exposed via store or separate module — Claude uses these.
selectActiveSegment(layerId: string, frame: number): VideoSegment | null
selectSegmentSpeed(segment: VideoSegment): number   // derived helper

// Mutations — Codex implements:
setLayerSourceDuration(layerId, durationFrames): void
splitVideoAt(layerId, frame): void
removeVideoSegment(layerId, segmentId): void
duplicateVideoSegment(layerId, segmentId): void
setSegmentTimelineRange(layerId, segmentId, startFrame, endFrame, opts?: { preserveSpeed?: boolean }): void
setSegmentSourceRange(layerId, segmentId, sourceStartFrame, sourceEndFrame): void
moveVideoSegment(layerId, segmentId, deltaFrames): void
setSegmentSpeed(layerId, segmentId, speed): void
freezeSegment(layerId, segmentId): void
resetVideoCut(layerId): void
```

Po Step 0 oba pracují paralelně, žádné konflikty v souborech.

---

### Codex — **Data layer + render**

Vlastní soubory (žádné touch z Claudovy strany):

- **`src/types.ts`** — `VideoSegment` interface + extend `Layer`
- **`src/store.ts`** — implementace všech segment akcí + `normalizeVideoLayer` helper + invariant validation
- **`src/projectStorage.ts`** — `normalizeVideoLayer` aplikováno na všech video layers při `readProject`; po prvním edit save už pojede s `videoSegments` v JSONu
- **`src/remotion/Composition.tsx`** — `TimelineSyncedVideo` upravit:
  - Použít `selectActiveSegment(layerId, frame)`
  - Když `null` → return `null` (transparentní mezera)
  - Když freeze (`sourceEnd === sourceStart`) → seek na `sourceStart/fps` jen jednou
  - Jinak → `video.currentTime = sourceTimeAt(seg, frame, fps)` per frame
  - `onLoadedMetadata` → `setLayerSourceDuration(layerId, video.duration * fps)`

Codex testovací odpovědnost:
- Backward compat normalize on load (test plan #8)
- Save + reload trip (test plan #7)
- Different fps source (test plan #9)
- Export render (test plan #10 — pokud relevant)

---

### Claude — **UI + interactions**

Vlastní soubory (žádné touch z Codexovy strany kromě types/store, které jsou už hotové):

- **`src/components/panels/StylePanel.tsx`** — nový subcomponent `SegmentControls`:
  - Trim bar (visual horizontal bar with two draggable handles) — vlastní SVG/div widget
  - In/Out NumFields (drag-to-scrub, sekundy)
  - Speed slider + chip presets (`0.25×` `0.5×` `1×` `2×` `4×` `❄ Freeze`)
  - Action buttons: Split at playhead, Delete, Reset cut
  - "Segment N of M" header text
  - "No segment at this frame" empty state s "Insert here" tlačítkem
  - Volá: `selectActiveSegment`, `setSegmentSourceRange`, `setSegmentSpeed`, `freezeSegment`, `splitVideoAt`, `removeVideoSegment`, `resetVideoCut`

- **`src/components/Timeline.tsx`** — per-segment rendering:
  - Render N barů místo jednoho podle `videoSegments`
  - Speed badge v rohu (`❄` / `2×` / `0.5×` / nic pro 1×)
  - Left/right handle draggable → `setSegmentTimelineRange`
  - Body drag → `moveVideoSegment`
  - **Alt/Option + handle drag** = slip → `setSegmentTimelineRange` s `preserveSpeed: true` + `setSegmentSourceRange` (move both together)
  - Click → select layer + playhead jump na `timelineStartFrame`
  - Right-click context menu: Split, Freeze, Speed submenu, Duplicate, Delete, Reset

- **`src/hooks/useKeyboardShortcuts.ts`** — `Ctrl/Cmd+B` (split at playhead), `Shift+F` (freeze current segment), `Delete` (na segmentu odstraní segment, ne layer — vyžaduje track aktivního segmentu v UI state)

Claude testovací odpovědnost:
- Trim handles (test plan #1)
- Split + visible gap (test plan #2)
- Delete middle segment (test plan #3)
- Speed presets (test plan #4)
- Freeze frame UI (test plan #5)
- Alt+drag slip (test plan #6)

---

### Shared — `src/i18n.ts`

Oba přidávají vlastní klíče, žádné kolize:

**Codex přidává (data-side keys):**
```ts
errors.videoNoSegments
errors.sourceNotLoaded
```

**Claude přidává (UI labels):**
```ts
segment.title           // "Segment"
segment.indexOf         // "{{n}} of {{m}}"
segment.source          // "Source"
segment.in              // "In"
segment.out             // "Out"
segment.speed           // "Speed"
segment.freeze          // "Freeze"
segment.splitAtPlayhead // "Split at playhead"
segment.delete          // "Delete segment"
segment.reset           // "Reset cut"
segment.duplicate       // "Duplicate"
segment.noSegmentHere   // "No segment at this frame"
segment.insertHere      // "Insert segment here"
segment.slipHint        // "Alt+drag handle to slip source"
```

Merge konflikty v i18n se řeší normálním git mergem — sortované alfabeticky.

---

### Dependencies / handoff order

1. **Step 0** (Codex, ~30 min) — types + store signatures (mutations stub, selectors with real logic). Commit & merge.
2. **Paralelní práce** — Codex implementuje mutace + render path; Claude staví UI proti stub store. Žádný blocker.
3. **Integration meeting point** — když má Codex hotovou mutaci, Claude jeho funkci v UI rovnou používá (už ji volá). Žádná koordinace per-akce.
4. **Final merge** — když mají oba hotovo, jeden velký rebase + integration test pass (test plan).

**Edge case:** pokud Claude potřebuje data, která Codex zapomněl exposnout (např. layer level helper), Claude buď doplní vlastní lokální derive v UI souborech, NEBO commitne malou PR do `src/store.ts` jen s tím selectorem — tehdy Codex review.

---

## Test plan

1. **Trim only** — import video, posuň trim handle, ověř že timeline pozice zůstává, ale obsah videa se ořízne.
2. **Split + gap** — split at playhead, posuň druhý segment vpravo → ověř transparent gap (background prosvítá) při scrubu v gapu.
3. **Delete middle segment** — split na 3 segmenty, smaž prostřední → ověř gap.
4. **Speed 2×** — set speed presetem, ověř že video hraje 2× rychleji a po skončení segmentu skočí na další.
5. **Freeze frame** — Shift+F na segmentu → ověř že frame je hold, neaktualizuje se přes timeline.
6. **Slip (Alt+drag)** — Alt+drag handle → speed unchanged, source posune.
7. **Save + reload** — uložit projekt, reload, ověř že `videoSegments` zůstaly v JSON a vše hraje stejně.
8. **Backward compat** — načti starý projekt bez `videoSegments` → ověř že normalize vytvořil 1 segment a hraje jako dřív.
9. **Different fps source** — import 24fps video do 60fps composition → ověř seek + speed funguje (přepnout playback rate).
10. **Export render** — render přes Remotion CLI (později, pokud relevant) → ověř že segmenty se respektují i mimo Player.

## Out of scope (later if needed)

- ❌ Audio waveform / per-frame thumbnails na timeline barech
- ❌ Acceleration curves (variable speed v jednom segmentu)
- ❌ Crossfade mezi segmenty
- ❌ Destructive export (renderování nového MP4 souboru jako jednoho klipu — projekt zůstane non-destruktivní)
- ❌ Split layer na dva separátní layers (zůstaneme u segments inside one layer)

## Implementation order

Jeden PR, jeden coherent feature — segmenty jsou natolik provázané, že phased rollout by znamenal víc throwaway kódu než zisku:

1. Types + normalize helper + projectStorage hook (~50 lines)
2. Store actions + invariant normalization (~150 lines)
3. Composition render path + metadata write-back (~40 lines)
4. StylePanel `SegmentControls` (trim bar + speed + chips + buttons) (~200 lines)
5. Timeline per-segment rendering + handles + context menu (~250 lines)
6. Keyboard shortcuts (~20 lines)
7. i18n keys (~60 lines × 2 languages)
8. Manual test pass through scenarios above

Total: ~800 lines + ~30 modified.

## Decision points already made

- **Field naming** — `timelineStart/EndFrame` + `sourceStart/EndFrame` (verbose ale jasné). Codex naming wins.
- **Frames vs seconds** — frames as canonical unit (no float drift, matches composition fps). Seconds jen v UI displayi.
- **Speed = derived** — neukládáme, počítáme z source/timeline ratio. Mín state, žádná desync.
- **Gaps = transparent** — žádný auto-fill, žádný black frame, prostě se segment nevykreslí.
- **Playhead-driven panel** — Style panel vždy edituje segment pod playhead. Žádný separátní "segment selection" state.
- **Backward compat = normalize on load** — žádný runtime fallback, single source of truth ve store.

## Open question

Click na segment v timeline = vybere video layer + skočí playhead na `timelineStart` segmentu (playhead-driven panel pak ukáže ten segment). Žádný separátní segment-selected state. Souhlasíš?

Pokud ano, dej **"jdi do toho"** a implementuju.
