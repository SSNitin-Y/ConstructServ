# app/models/media.py

import uuid
from sqlalchemy import Column, String, DateTime, Date
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.db import Base


class Media(Base):
    """
    SQLAlchemy model for the 'media' table.

    Represents one uploaded file in the media library.
    """
    __tablename__ = "media"

    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )

    # Owner of this media (Firebase uid)
    user_id = Column(String, nullable=False, index=True)

    # File info
    filename = Column(String, nullable=False)
    media_type = Column(String, nullable=False)   # "image" | "video"
    status = Column(String, nullable=False, default="uploading")  # uploading/processing/ready/failed

    created_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )

    thumbnail_url = Column(String, nullable=True)

    # S3 key where the file is stored
    s3_key = Column(String, nullable=False)

    # -----------------------------
    # NEW: Analysis metadata (MVP)
    # -----------------------------
    analysis_type = Column(String, nullable=True)  # e.g. "roof_report"
    notes = Column(String, nullable=True)
    location = Column(String, nullable=True)
    capture_date = Column(Date, nullable=True)  # date the media was captured (user-provided)


    jobs = relationship(
        "Job",
        back_populates="media",
        passive_deletes=True,
    )