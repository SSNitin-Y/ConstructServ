# app/services/ai.py

from __future__ import annotations

import base64
from typing import Optional

from app.config import settings

DEFAULT_MODEL = "llama3"
VISION_MODEL = "llava"


def _ollama_client():
    """
    Lazy import so backend doesn’t crash if ollama isn’t installed.
    """
    try:
        import ollama  # type: ignore
        return ollama
    except Exception:
        return None


def run_prompt(prompt: str, model: str | None = None, system: str | None = None) -> str:
    """
    Unified text prompt.
    Provider chosen by env var:
      AI_PROVIDER=ollama (default)
      AI_PROVIDER=gemini
    """
    provider = (settings.AI_PROVIDER or "ollama").lower()
    model_name = model or DEFAULT_MODEL

    if provider == "gemini":
        try:
            from app.services.ai_processing import gemini_text
            # system is ignored for now (can be added later)
            return gemini_text(prompt, model_name if model else "gemini-2.0-flash")
        except Exception as e:
            return (
                f"[Rukmer GPT fallback reply. Gemini not available: {e}]\n\n"
                f"You asked:\n{prompt}"
            )

    # Default: Ollama
    ollama = _ollama_client()
    if ollama is None:
        return (
            f"[Stubbed Rukmer GPT reply using model '{model_name}'. "
            f"Ollama is not installed/running yet.]\n\n"
            f"You asked:\n{prompt}"
        )

    messages = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})

    response = ollama.chat(model=model_name, messages=messages)
    return response["message"]["content"]


def run_vision(image_bytes: bytes, prompt: str, model: str | None = None) -> str:
    """
    Ollama vision model (llava) for local pipelines.
    (Gemini vision analysis lives in ai_processing.py and should be used by workers.)
    """
    ollama = _ollama_client()
    if ollama is None:
        raise RuntimeError(
            "Ollama is not installed/running. Install `pip install ollama` and run Ollama server."
        )

    model_name = model or VISION_MODEL
    image_b64 = base64.b64encode(image_bytes).decode("utf-8")

    messages = [{"role": "user", "content": prompt, "images": [image_b64]}]
    response = ollama.chat(model=model_name, messages=messages)
    return response["message"]["content"]
