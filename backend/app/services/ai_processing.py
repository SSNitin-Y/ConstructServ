# app/services/ai_processing.py

from __future__ import annotations

import json
import os
from typing import Any, Optional

from app.config import settings


def _vertex_available() -> bool:
    # Only “available” if env suggests it can work
    return bool(settings.GOOGLE_CLOUD_PROJECT and settings.GOOGLE_CLOUD_REGION)


_VERTEX_INITIALIZED = False


def _init_vertex() -> None:
    """
    Deterministic Vertex init:
    - Always uses GOOGLE_APPLICATION_CREDENTIALS (service account JSON)
    - Always uses cloud-platform scope (prevents invalid_scope refresh issues)
    - Prints identity for debugging
    """
    global _VERTEX_INITIALIZED
    if _VERTEX_INITIALIZED:
        return

    import vertexai  # type: ignore
    from google.oauth2 import service_account  # type: ignore

    key_path: Optional[str] = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
    if not key_path:
        raise RuntimeError(
            "GOOGLE_APPLICATION_CREDENTIALS is not set. "
            "Set it to your service account json path."
        )

    creds = service_account.Credentials.from_service_account_file(
        key_path,
        scopes=["https://www.googleapis.com/auth/cloud-platform"],
    )

    # Debug identity (safe to print the email; don't print the key)
    print("VERTEX AUTH DEBUG credential_type=ServiceAccountCredentials")
    print("VERTEX AUTH DEBUG service_account_email=", creds.service_account_email)
    print("VERTEX AUTH DEBUG vertex_project=", settings.GOOGLE_CLOUD_PROJECT)
    print("VERTEX AUTH DEBUG vertex_region=", settings.GOOGLE_CLOUD_REGION)

    vertexai.init(
        project=settings.GOOGLE_CLOUD_PROJECT,
        location=settings.GOOGLE_CLOUD_REGION,
        credentials=creds,
    )

    _VERTEX_INITIALIZED = True


def gemini_text(prompt: str, model_name: str = "gemini-2.0-flash") -> str:
    """
    Text-only Gemini call for /ai/prompt.
    Returns plain text.
    """
    if not _vertex_available():
        raise RuntimeError(
            "Gemini is not configured. Set GOOGLE_CLOUD_PROJECT and GOOGLE_CLOUD_REGION "
            "and ensure GOOGLE_APPLICATION_CREDENTIALS is set."
        )

    _init_vertex()

    from vertexai.generative_models import GenerativeModel  # type: ignore

    model = GenerativeModel(model_name)
    resp = model.generate_content(prompt)
    return getattr(resp, "text", "") or ""


def analyze_roof_image(
    local_image_path: str,
    model_name: str = "gemini-2.0-flash",
) -> dict[str, Any]:
    """
    Image -> JSON for worker pipelines.
    Returns a dict (already parsed).
    """
    if not _vertex_available():
        raise RuntimeError(
            "Gemini is not configured. Set GOOGLE_CLOUD_PROJECT and GOOGLE_CLOUD_REGION "
            "and ensure GOOGLE_APPLICATION_CREDENTIALS is set."
        )

    _init_vertex()

    from vertexai.generative_models import (  # type: ignore
        GenerativeModel,
        Part,
        SafetySetting,
    )

    with open(local_image_path, "rb") as f:
        image_data = f.read()

    # NOTE: if you support PNG too, you can detect mime dynamically
    image_part = Part.from_data(mime_type="image/jpeg", data=image_data)

    prompt = """
You are an expert roofer. Analyze this image carefully.
Provide a raw JSON response (no markdown) with the following fields:
- summary: A short professional summary of the roof condition.
- damage_score: A number from 0-10 (0=perfect, 10=severe).
- issues: A list of strings describing specific defects (e.g. "missing shingles", "moss growth").
- lifespan_estimate: A string estimate (e.g. "5-7 years").
"""

    safety_config = [
        SafetySetting(
            category=SafetySetting.HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
            threshold=SafetySetting.HarmBlockThreshold.BLOCK_ONLY_HIGH,
        ),
    ]

    try:
        model = GenerativeModel(model_name)
        resp = model.generate_content(
            [image_part, prompt],
            safety_settings=safety_config,
            generation_config={"response_mime_type": "application/json"},
        )
        txt = (getattr(resp, "text", "") or "").strip()
        txt = txt.replace("```json", "").replace("```", "").strip()
        return json.loads(txt)
    except Exception as e:
        # Worker-safe fallback dict (never crash the worker)
        return {
            "summary": f"Error analyzing image with Gemini: {e}",
            "damage_score": 0,
            "issues": ["Analysis Error"],
            "lifespan_estimate": "Unknown",
        }
