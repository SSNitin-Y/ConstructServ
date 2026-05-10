# backend/app/schemas/conversation_schema.py

from pydantic import BaseModel, Field
from typing import Any, Literal, Optional
from uuid import UUID
from datetime import datetime


Role = Literal["user", "assistant", "system", "tool"]


class MessageOut(BaseModel):
    id: UUID
    role: Role
    content: str
    meta: Optional[dict[str, Any]] = None
    created_at: datetime

    class Config:
        from_attributes = True


class ConversationOut(BaseModel):
    id: UUID
    media_id: UUID
    created_at: datetime
    messages: list[MessageOut]

    class Config:
        from_attributes = True


class AskRequest(BaseModel):
    prompt: str = Field(..., min_length=1)
    model: Optional[str] = None
    system: Optional[str] = None

    # Optional: if you want to attach extra context
    report_summary: Optional[str] = None
    job_id: Optional[str] = None


class AskResponse(BaseModel):
    conversation_id: UUID
    user_message: MessageOut
    assistant_message: MessageOut
