# backend/app/api/conversations.py

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from uuid import UUID

from app.db import get_db
from app.api.auth_middleware import get_current_user
from app.schemas.conversation_schema import ConversationOut, AskRequest, AskResponse
from app.services.conversations import get_or_create_conversation, add_message

# ✅ Use the env-switched entrypoint (AI_PROVIDER=gemini/ollama)
from app.services.ai import run_prompt
from app.config import settings

router = APIRouter(prefix="/media", tags=["conversations"])


@router.get("/{media_id}/conversation", response_model=ConversationOut)
def get_conversation(
    media_id: UUID,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    uid = user.get("uid") if isinstance(user, dict) else getattr(user, "uid", None)
    if not uid:
        raise HTTPException(status_code=401, detail="Unauthorized")

    convo = get_or_create_conversation(
        db,
        media_id=media_id,
        user_id=str(uid),
        job_id=None,
    )

    # Ensure messages loaded for response_model serialization
    _ = convo.messages

    # NOTE: No need to commit on GET unless your get_or_create does inserts.
    # Keeping commit is OK; it won’t hurt correctness.
    db.commit()
    db.refresh(convo)
    return convo


@router.post("/{media_id}/conversation/ask", response_model=AskResponse)
def ask_in_conversation(
    media_id: UUID,
    payload: AskRequest,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    uid = user.get("uid") if isinstance(user, dict) else getattr(user, "uid", None)
    if not uid:
        raise HTTPException(status_code=401, detail="Unauthorized")

    convo = get_or_create_conversation(
        db,
        media_id=media_id,
        user_id=str(uid),
        job_id=payload.job_id,
    )

    # Persist user message first
    user_msg = add_message(
        db,
        conversation_id=convo.id,
        user_id=str(uid),
        role="user",
        content=payload.prompt,
        meta={"job_id": payload.job_id} if payload.job_id else None,
    )

    provider = (settings.AI_PROVIDER or "ollama").lower()

    # ✅ IMPORTANT:
    # - Do NOT default model here, because services.ai.DEFAULT_MODEL is llama3.
    # - If provider=gemini and model is None, services.ai will use gemini default internally.
    model_for_call = payload.model if payload.model else None

    try:
        reply = run_prompt(
            prompt=payload.prompt,
            model=model_for_call,
            system=payload.system,
        )
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

    # For metadata/UI tracing: record model string only if explicitly provided,
    # otherwise record provider default in a friendly way (optional).
    meta = {}
    if payload.job_id:
        meta["job_id"] = payload.job_id
    if payload.model:
        meta["model"] = payload.model
    else:
        # purely informational; does not affect model choice
        meta["model"] = "gemini-2.0-flash" if provider == "gemini" else "llama3"

    assistant_msg = add_message(
        db,
        conversation_id=convo.id,
        user_id=str(uid),
        role="assistant",
        content=reply,
        meta=meta or None,
    )

    db.commit()
    db.refresh(user_msg)
    db.refresh(assistant_msg)

    return AskResponse(
        conversation_id=convo.id,
        user_message=user_msg,
        assistant_message=assistant_msg,
    )
