# backend/app/api/ai.py

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Depends
from app.schemas.ai_schema import PromptRequest, PromptResponse
from app.api.auth_middleware import get_current_user
from app.config import settings

# ✅ Use the env-switched entrypoint (AI_PROVIDER=gemini/ollama)
from app.services.ai import run_prompt

router = APIRouter(prefix="/ai", tags=["ai"])


@router.post("/prompt", response_model=PromptResponse)
def prompt_gpt(payload: PromptRequest, user=Depends(get_current_user)):
    try:
        user_question = payload.prompt
        context_lines: list[str] = []

        if payload.media_id:
            context_lines.append(f"Media ID: {payload.media_id}")
        if payload.job_id is not None:
            context_lines.append(f"Job ID: {payload.job_id}")
        if payload.report_summary:
            context_lines.append("Latest job summary:")
            context_lines.append(payload.report_summary)

        final_prompt = user_question
        if context_lines:
            context_block = "\n".join(context_lines)
            final_prompt = (
                "You are Rukmer GPT, an assistant that analyzes aerial media, "
                "AI job outputs, and reports for operators.\n\n"
                "Context:\n"
                f"{context_block}\n\n"
                "User question:\n"
                f"{user_question}"
            )

        provider = (settings.AI_PROVIDER or "ollama").lower()

        # ✅ IMPORTANT:
        # Do NOT default to llama3 when provider=gemini.
        # If model is not provided, pass None so services.ai can apply its own gemini default.
        model_for_call = payload.model if payload.model else None

        reply = run_prompt(
            prompt=final_prompt,
            model=model_for_call,
            system=payload.system,
        )

        # For UI display only (not used for calling):
        effective_model = payload.model or ("gemini-2.0-flash" if provider == "gemini" else "llama3")

        return PromptResponse(model=effective_model, reply=reply)

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
