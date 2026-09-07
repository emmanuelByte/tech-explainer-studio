# Local reusable voice / TTS

## Why this exists

Tech Explainer Studio already supports imported narration and captions. The next useful helper is local speech synthesis so a creator can reuse a reference voice for new scripts without calling ElevenLabs or another hosted TTS provider on every generation.

This is intentionally an **optional helper**. Existing narration import, editing, timing, preview, and export must continue to work when the TTS service is not installed or running.

## Architecture

```text
script text
   |
   v
Tech Explainer Studio
   |
   | POST /api/tts/generate
   v
Vite local TTS proxy
   |
   | localhost only by default
   v
Chatterbox Python service
   |
   | reference voice clip
   v
WAV audio
   |
   v
existing /api/assets upload
   |
   v
normal audio asset -> narration layer
```

The generated speech is not a special TTS object. Once generated it is stored through the existing audio asset system and can be edited, timed, previewed and exported like any other narration file.

## Voice ownership boundary

Do not treat an ElevenLabs `voice_id` or generated MP3 as an exported ElevenLabs model. They are not the same thing.

For local generation, Chatterbox performs zero-shot voice cloning from a reference recording. Prefer a clean recording that you own or have explicit permission to use. If a hosted provider generated the reference audio, verify that its terms allow the intended downstream use before treating it as cloning material.

## Local service

The reference implementation lives in:

```text
tools/local-tts/
  server.py
  requirements.txt
  voices/
```

The current implementation uses Resemble AI's open-source Chatterbox package. Chatterbox is kept outside the Node dependency graph because PyTorch/TTS dependencies are large and platform-specific.

### 1. Create a Python environment

Python 3.11 is the safest baseline for the current Chatterbox package.

```bash
cd tools/local-tts
python3.11 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### 2. Add a reference voice

Put a clean reference clip in:

```text
tools/local-tts/voices/narrator.wav
```

Voice files are deliberately gitignored. Their file stem becomes the voice id, so `narrator.wav` is requested as `narrator`.

A short clean clip is preferable to a noisy long recording. Avoid music, multiple speakers, reverb and background noise.

### 3. Start the service

From `tools/local-tts`:

```bash
source .venv/bin/activate
python -m uvicorn server:app --host 127.0.0.1 --port 8123
```

Device selection is automatic:

- CUDA when available
- Apple MPS when available
- CPU otherwise

Override it with:

```bash
LOCAL_TTS_DEVICE=cpu python -m uvicorn server:app --host 127.0.0.1 --port 8123
```

You can also move the voice directory:

```bash
LOCAL_TTS_VOICE_DIR=/absolute/path/to/voices python -m uvicorn server:app --host 127.0.0.1 --port 8123
```

## Studio API

Vite exposes a narrow proxy rather than allowing the browser to call arbitrary local URLs.

### Health

```http
GET /api/tts/health
```

Example response:

```json
{
  "ok": true,
  "device": "mps",
  "modelLoaded": false,
  "voices": [
    { "id": "narrator", "fileName": "narrator.wav" }
  ]
}
```

### Generate

```http
POST /api/tts/generate
Content-Type: application/json
```

```json
{
  "text": "A dead letter queue stores messages that could not be processed successfully.",
  "voice": "narrator",
  "exaggeration": 0.5,
  "cfg_weight": 0.5
}
```

The response is `audio/wav`.

The upstream service URL defaults to:

```text
http://127.0.0.1:8123
```

Override the Vite proxy target with `LOCAL_TTS_URL` if necessary.

## Programmatic use inside the editor

`src/localTts.ts` provides the browser-side boundary.

```ts
import { generateAndStoreLocalSpeech } from './localTts'

const asset = await generateAndStoreLocalSpeech(
  {
    text: 'Have you ever wondered what happens when a message keeps failing?',
    voice: 'narrator',
  },
  'DLQ intro',
)
```

`asset` is a normal `AudioAsset`. Existing editor code can pick it exactly as if the user imported a WAV manually, then mark the resulting audio layer as `narration`.

## Failure policy

Local TTS is never required to open or edit a project.

If the Python service is stopped:

- `/api/tts/health` and `/api/tts/generate` return a useful `503`;
- existing audio assets remain available;
- imported narration still works;
- projects remain portable because generated WAV files are normal assets.

## Caching

Generated audio is already persisted in the local asset library. Do not regenerate unchanged speech needlessly.

A later optimization can add a deterministic cache key such as:

```text
sha256(model + voice fingerprint + text + exaggeration + cfg_weight)
```

This should be implemented only after the local generation workflow is proven. The asset store itself remains the canonical persisted copy used by projects.

## Position in the roadmap

Phase 6 (Narration + Captions) is already complete. Local TTS is a **Phase 6 follow-up / Phase 7 production helper**, not a prerequisite for narration.

Before the Phase 7 acceptance lesson is called complete, validate at least one scene using locally generated narration and confirm:

1. generated WAV is stored as a normal audio asset;
2. the layer can be marked as narration;
3. timing/captions still use the existing script source of truth;
4. preview and Remotion export play the generated audio correctly;
5. restarting without the Python TTS service does not break the saved project.

## Editor integration plan

### Current readiness

The local generation boundary and creator workflow are implemented. The Script
panel discovers reference voices, persists one base-voice choice, exposes voice
controls and generates the full script from one action. It calls the model per
segment for long-script reliability, then stores and sequences the resulting WAV
clips as one continuous narration. Real model validation remains pending until a
`baseVoice` recording is added to the local voices directory.

Keep local TTS optional. Opening, editing, previewing and exporting a project
must continue to work when the Python environment, model or reference voices
are unavailable.

### Recommended creator flow

The **Local base voice** section in the Script panel:

1. Show service status, active device and available reference voices.
2. Let the creator choose one voice and adjust exaggeration and guidance.
3. Provides **Generate Full Narration** for a serial batch across every script
   segment.
4. Stores each WAV through the existing asset service, then creates a normal audio
   layer with `audioRole: 'narration'` at the segment start frame.
5. On regeneration, replaces the linked layer source while preserving its
   timeline position, volume and mute state.

Service errors should appear in the Local voice section without blocking other
editor controls. When the service is offline, show the existing narration
import action as the available fallback.

### Project model and migration

Add an optional link and generation provenance to narration audio layers:

```ts
interface NarrationGeneration {
  provider: 'local-chatterbox'
  voiceId: string
  sourceText: string
  exaggeration: number
  cfgWeight: number
}

interface Layer {
  scriptSegmentId?: string
  narrationGeneration?: NarrationGeneration
}
```

Advance the project schema to version 12 and add an explicit migration. Existing
audio remains unchanged because both fields are optional. The stored WAV stays
the render source; generation metadata only supports regeneration and stale-text
warnings.

### Timing policy

Use each generated WAV duration for its narration layer and never change playback
speed automatically. Clips are placed sequentially with the configured pause.
Their measured ranges update linked segments and scenes, and the project duration
extends when the complete narration is longer than the current timeline.

If the script text changes after generation, compare it with
`narrationGeneration.sourceText` and mark the clip as stale. Do not regenerate
or discard audio automatically.

### Implementation slices

1. Verify one real Chatterbox generation on the target machine, then test
   reload, preview, caption timing and MP4 export with the generated asset.
2. Add explicit cancellation for a long multi-segment generation run.
3. Add deterministic generation caching after the real workflow is proven.

### Runtime guardrails

- Keep generation serialized; the service already enforces this with a lock.
- Limit request size in the Vite proxy as well as the Python model validation.
- Bind both services to loopback by default and keep voice files out of Git.
- Report model download/loading progress separately from speech generation.
- Provide a stop/restart path for the Python worker because local model memory
  usage can be substantial during repeated generations.
- Do not bundle PyTorch or model weights into the web application or Node
  dependency graph.

### Definition of done

The integration is complete when a creator can select a local reference voice,
generate one or all script segments, see narration clips aligned on the global
timeline, resolve timing overflow, reload the project, and export an MP4 with
matching narration and captions. The same project must still open and export
when the TTS service is stopped because its generated WAV files are already
stored as normal local assets.
