# MotionEditor

Lokální motion editor postavený na Reactu, Vite, Zustandu a Remotion Playeru. Projekty se teď ukládají do `localStorage`, včetně vrstev, keyframů, timeline, panelů, viewportu, historie verzí a náhledů projektů.

## Funkce

- Home screen s projekty, vyhledáváním, řazením, importem/exportem a světlým/tmavým režimem.
- Editor s canvasem, vrstvami, timeline, keyframy, easingem, version history a autosave.
- Vnořené vrstvy a skupiny, drag/drop parenting, multi-selection, časování vrstev a per-property keyframy.
- Pravý panel ve stylu Figma: transformace, sizing, layout, styl, efekty, timing a motion presety.
- Textové motion presety včetně typewriter, pop/fall/rise/spin znaků.
- AI modal pro úpravy vybraných vrstev nebo vytvoření nové vrstvy.
- i18next překlady pro angličtinu a češtinu.

## Instalace

```bash
npm install
```

## Vývoj

```bash
npm run dev
```

Vite obvykle běží na `http://127.0.0.1:3000/` nebo dalším volném portu.

## Build

```bash
npm run build
```

Náhled produkčního buildu:

```bash
npm run preview
```

## AI konfigurace

AI pomocník čte lokální konfigurační soubor `ai.config.local.json`. Tento soubor je v `.gitignore`, aby se API klíč nikdy nedostal do repozitáře ani do browser bundlu.

1. Zkopírujte ukázku:

```bash
cp ai.config.example.json ai.config.local.json
```

2. Doplňte model a API klíč:

```json
{
  "model": "gpt-4.1-mini",
  "apiKey": "sk-..."
}
```

3. Restartujte dev server.

Frontend volá lokální endpoint `/api/ai-assist`, který je implementovaný ve Vite dev serveru. Pro produkční nasazení je lepší přesunout tuto část na skutečný backend, aby správa klíčů, rate limiting a audit nebyly svázané s dev serverem.

## Překlady

Překlady jsou v [src/i18n.ts](/Users/tomaslachmann/Desktop/work/video-editor/src/i18n.ts). Aplikace podporuje:

- `en` - English
- `cs` - Čeština

Jazyk se přepíná v nastavení přes ikonu ozubeného kola. Volba se ukládá do `localStorage` pod klíčem `motion-editor:language`.

## Ukládání projektů

Aktuální storage je browserový `localStorage`:

- `projects:index` - seznam projektů pro Home screen
- `project:{id}` - kompletní JSON projektu
- `project:{id}:history` - ruční snapshoty historie
- `motion-editor:language` - jazyk UI

Projekt obsahuje canvas, vrstvy, keyframy, guides, timeline stav a editor viewport. Náhled projektu se generuje z aktuálního canvasu a ukládá se do indexu.

## Export

V editoru otevřete `Export MP4`. Modal zobrazí Remotion CLI příkaz pro render aktuální kompozice:

```bash
npx remotion render src/remotion/index.ts EditorComposition out/video.mp4
```

Příkaz v modalu doplní aktuální šířku, výšku a rozsah snímků.

## Next.js poznámka

Next.js by dával smysl, pokud chcete projekty ukládat mimo `localStorage`, například do JSON souborů, databáze nebo cloud storage. Současný Vite setup je jednodušší pro čistě lokální editor, ale nemá trvalý Node server. Pokud další krok bude file-based ukládání projektů, migrace na Next.js nebo malý samostatný Node backend bude praktičtější než rozšiřovat Vite dev server.
