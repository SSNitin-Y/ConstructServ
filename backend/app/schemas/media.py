# app/schemas/media.py

from datetime import datetime, date
from typing import Literal, Dict, Optional
from pydantic import BaseModel

MediaType = Literal["image", "video"]
MediaStatus = Literal["uploading", "processing", "ready", "failed"]

AiStatus = Literal["none", "running", "ready", "failed"]


class MediaListItem(BaseModel):
    id: str
    filename: str
    media_type: MediaType
    status: MediaStatus
    created_at: datetime
    thumbnail_url: str | None = None

    # persisted analysis metadata
    analysis_type: Optional[str] = None
    notes: Optional[str] = None
    location: Optional[str] = None
    capture_date: Optional[date] = None

    # ✅ NEW: ai status fields for library consistency
    ai_status: Optional[AiStatus] = None
    latest_job_id: Optional[int] = None
    latest_job_status: Optional[str] = None
    latest_job_type: Optional[str] = None


class MediaListResponse(BaseModel):
    items: list[MediaListItem]


class MediaDetailResponse(MediaListItem):
    pass


class MediaUploadIntentRequest(BaseModel):
    filename: str
    media_type: MediaType
    content_type: Optional[str] = None
    size_bytes: Optional[int] = None

    # persisted analysis metadata
    analysis_type: Optional[str] = None
    notes: Optional[str] = None
    location: Optional[str] = None
    capture_date: Optional[date] = None


class MediaUploadIntentResponse(BaseModel):
    media: MediaListItem
    upload_url: str
    upload_method: Literal["PUT", "POST"]
    upload_headers: Optional[Dict[str, str]] = None
    upload_fields: Optional[Dict[str, str]] = None


class MediaFileUrlResponse(BaseModel):
    url: str

