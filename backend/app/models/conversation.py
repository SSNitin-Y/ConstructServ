# backend/app/models/conversation.py

from __future__ import annotations

import uuid

from sqlalchemy import Column, DateTime, ForeignKey, Index, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.db import Base


class MediaConversation(Base):
    __tablename__ = "media_conversations"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    media_id = Column(
        UUID(as_uuid=True),
        ForeignKey("media.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    user_id = Column(String, nullable=False, index=True)

    # Optional: allow future “per job run” threads without schema redesign
    # Use string so you can later switch job IDs (int/uuid) without migration pain.
    job_id = Column(String, nullable=True, index=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    messages = relationship(
        "ConversationMessage",
        back_populates="conversation",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="ConversationMessage.created_at.asc()",
    )

    __table_args__ = (
        # Useful composite index for “get convo by media + user”
        Index("ix_media_conversations_media_user", "media_id", "user_id"),
        # Prevent duplicates for the same tuple
        # NOTE: Postgres treats NULLs as distinct, so multiple (media_id,user_id,NULL) can exist.
        # If you want true uniqueness when job_id is NULL, we can enforce via a partial unique index in a migration.
        UniqueConstraint("media_id", "user_id", "job_id", name="uq_media_conversations_media_user_job"),
    )


class ConversationMessage(Base):
    __tablename__ = "conversation_messages"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    conversation_id = Column(
        UUID(as_uuid=True),
        ForeignKey("media_conversations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    user_id = Column(String, nullable=False, index=True)

    # role: user | assistant | system | tool
    role = Column(String, nullable=False)

    content = Column(Text, nullable=False)

    # extra metadata: model, job_id_used, tool_calls, citations, error flags, etc.
    meta = Column(JSONB, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    conversation = relationship("MediaConversation", back_populates="messages")

    __table_args__ = (
        # helpful for ordering/filtering messages per conversation
        Index("ix_conversation_messages_convo_created_at", "conversation_id", "created_at"),
    )
