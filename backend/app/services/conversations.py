# backend/app/services/conversations.py

from __future__ import annotations

from sqlalchemy.orm import Session
from sqlalchemy import select

from app.models.conversation import MediaConversation, ConversationMessage


def get_or_create_conversation(
    db: Session,
    *,
    media_id,
    user_id: str,
    job_id: str | None = None,
) -> MediaConversation:
    stmt = select(MediaConversation).where(
        MediaConversation.media_id == media_id,
        MediaConversation.user_id == user_id,
    )

    # ✅ IMPORTANT: NULL-safe comparison
    if job_id is None:
        stmt = stmt.where(MediaConversation.job_id.is_(None))
    else:
        stmt = stmt.where(MediaConversation.job_id == job_id)

    convo = db.execute(stmt).scalars().first()
    if convo:
        return convo

    convo = MediaConversation(media_id=media_id, user_id=user_id, job_id=job_id)
    db.add(convo)
    db.flush()  # assigns convo.id
    return convo


def add_message(
    db: Session,
    *,
    conversation_id,
    user_id: str,
    role: str,
    content: str,
    meta: dict | None = None,
) -> ConversationMessage:
    msg = ConversationMessage(
        conversation_id=conversation_id,
        user_id=user_id,
        role=role,
        content=content,
        meta=meta,
    )
    db.add(msg)
    db.flush()
    return msg


def list_messages(db: Session, *, conversation_id):
    stmt = (
        select(ConversationMessage)
        .where(ConversationMessage.conversation_id == conversation_id)
        .order_by(ConversationMessage.created_at.asc())
    )
    return db.execute(stmt).scalars().all()
