# app/schemas/job_schema.py
from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel


class JobCreate(BaseModel):
    """
    Payload for creating a new job.

    The frontend sends:
    - job_type: what kind of processing to run (e.g. "roof_report")
    - media_id: which media item this job is for
    """
    job_type: str
    media_id: UUID  # ✅ was str


class JobRead(BaseModel):
    id: int
    user_id: str
    job_type: str
    input_s3_key: str
    status: str

    output_json: Optional[str] = None
    pdf_s3_key: Optional[str] = None
    media_id: Optional[UUID] = None

    created_at: datetime
    updated_at: datetime

    has_pdf: bool = False  

    class Config:
        from_attributes = True
