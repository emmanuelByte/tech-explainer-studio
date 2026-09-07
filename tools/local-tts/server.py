from __future__ import annotations

import io
import os
from pathlib import Path
from threading import Lock

import torch
import torchaudio as ta
from fastapi import FastAPI, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, Field
from chatterbox.tts import ChatterboxTTS

BASE_DIR = Path(__file__).resolve().parent
VOICE_DIR = Path(os.environ.get("LOCAL_TTS_VOICE_DIR", BASE_DIR / "voices")).resolve()
SUPPORTED_VOICE_EXTENSIONS = {".wav", ".mp3", ".m4a", ".flac", ".ogg"}

app = FastAPI(title="Tech Explainer Studio Local TTS")
_model: ChatterboxTTS | None = None
_model_lock = Lock()


class GenerateRequest(BaseModel):
    text: str = Field(min_length=1, max_length=5000)
    voice: str = Field(min_length=1, max_length=100)
    exaggeration: float | None = Field(default=None, ge=0.0, le=2.0)
    cfg_weight: float | None = Field(default=None, ge=0.0, le=1.0)


def detect_device() -> str:
    requested = os.environ.get("LOCAL_TTS_DEVICE", "auto").strip().lower()
    if requested != "auto":
        return requested
    if torch.cuda.is_available():
        return "cuda"
    if torch.backends.mps.is_available():
        return "mps"
    return "cpu"


def list_voice_files() -> list[Path]:
    if not VOICE_DIR.exists():
        return []
    return sorted(
        file
        for file in VOICE_DIR.iterdir()
        if file.is_file() and file.suffix.lower() in SUPPORTED_VOICE_EXTENSIONS
    )


def resolve_voice(voice_id: str) -> Path:
    if not voice_id.replace("-", "").replace("_", "").isalnum():
        raise HTTPException(status_code=400, detail="Invalid voice id.")

    matches = [file for file in list_voice_files() if file.stem == voice_id]
    if not matches:
        raise HTTPException(
            status_code=404,
            detail=f"Voice '{voice_id}' was not found in {VOICE_DIR}.",
        )
    return matches[0]


def get_model() -> ChatterboxTTS:
    global _model
    if _model is None:
        with _model_lock:
            if _model is None:
                _model = ChatterboxTTS.from_pretrained(device=detect_device())
    return _model


@app.get("/health")
def health():
    return {
        "ok": True,
        "device": detect_device(),
        "modelLoaded": _model is not None,
        "voices": [
            {"id": file.stem, "fileName": file.name}
            for file in list_voice_files()
        ],
    }


@app.post("/generate")
def generate(request: GenerateRequest):
    reference = resolve_voice(request.voice)
    model = get_model()

    kwargs: dict[str, float | str] = {
        "audio_prompt_path": str(reference),
    }
    if request.exaggeration is not None:
        kwargs["exaggeration"] = request.exaggeration
    if request.cfg_weight is not None:
        kwargs["cfg_weight"] = request.cfg_weight

    try:
        wav = model.generate(request.text, **kwargs)
        buffer = io.BytesIO()
        ta.save(buffer, wav, model.sr, format="wav")
        audio = buffer.getvalue()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Speech generation failed: {exc}") from exc

    return Response(
        content=audio,
        media_type="audio/wav",
        headers={
            "Cache-Control": "no-store",
            "X-Local-TTS-Voice": request.voice,
            "X-Local-TTS-Device": detect_device(),
        },
    )
