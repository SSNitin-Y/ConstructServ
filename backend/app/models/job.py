# app/models/job.py
from sqlalchemy import Column, Integer, String, Text, DateTime, func, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.db import Base


class Job(Base):
    __tablename__ = "jobs"

    id = Column(Integer, primary_key=True, index=True)

    # Owner of the job (Firebase UID)
    user_id = Column(String, index=True, nullable=False)

    # Link back to the media row this job is about
    # Nullable=True so existing rows (if any) don't break
    media_id = Column(
        UUID(as_uuid=True),
        ForeignKey("media.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    
    media = relationship(
        "Media", 
        back_populates="jobs", 
        passive_deletes=True
    )


    # What kind of job this is (e.g. "roof_report")
    job_type = Column(String, nullable=False)  # "roof_report" / "image" / "video" / etc.

    # The S3 key of the input file this job will process
    input_s3_key = Column(String, nullable=False)

    # Job status lifecycle: pending / processing / completed / failed
    status = Column(String, nullable=False, default="pending")

    # Optional JSON blob with structured AI results
    output_json = Column(Text, nullable=True)

    # Optional S3 key pointing to a generated PDF report
    pdf_s3_key = Column(String, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )
