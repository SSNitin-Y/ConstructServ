# app/api/jobs.py
import json

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.auth_middleware import get_current_user
from app.db import get_db
from app.models.job import Job
from app.models.media import Media
from app.schemas.job_schema import JobCreate, JobRead
from app.workers.roof_worker import process_roof_job
from app.services.pdf_retry import regenerate_job_pdf
# ✅ Use unified storage (S3 OR GCS)
from app.services.storage import generate_upload_url, generate_file_url

router = APIRouter(prefix="/jobs", tags=["jobs"])


class PdfUrlResponse(BaseModel):
  url: str


def _job_to_read(j: Job) -> JobRead:
  """
  Convert SQLAlchemy Job -> JobRead, and compute has_pdf.
  This prevents frontend from calling /pdf-url when no pdf_s3_key exists.
  """
  return JobRead(
      id=j.id,
      user_id=j.user_id,
      media_id=str(j.media_id) if j.media_id else None,
      job_type=j.job_type,
      input_s3_key=j.input_s3_key,
      status=j.status,
      output_json=j.output_json,
      pdf_s3_key=j.pdf_s3_key,
      created_at=j.created_at,
      updated_at=j.updated_at,
      has_pdf=bool(j.pdf_s3_key) and not str(j.pdf_s3_key).startswith("error:"),
  )


@router.get("/presign")
def get_presigned_url(
  file_type: str,
  user: Dict[str, Any] = Depends(get_current_user),
):
  """
  Generate a presigned upload URL for uploading a file.
  Works with S3 or GCS depending on STORAGE_PROVIDER.
  Example:
    GET /jobs/presign?file_type=jpg
  """
  if not file_type:
    raise HTTPException(status_code=400, detail="file_type is required")

  uid = user["uid"]
  result = generate_upload_url(file_extension=file_type, user_id=uid)
  return result


@router.get("", response_model=List[JobRead])
def list_jobs(
  db: Session = Depends(get_db),
  user: Dict[str, Any] = Depends(get_current_user),
):
  """
  List all jobs for the current user.
  """
  uid = user["uid"]

  jobs = (
      db.query(Job)
      .filter(Job.user_id == uid)
      .order_by(Job.created_at.desc())
      .all()
  )
  return [_job_to_read(j) for j in jobs]


@router.post("", response_model=JobRead, status_code=status.HTTP_201_CREATED)
def create_job(
  payload: JobCreate,
  db: Session = Depends(get_db),
  user: Dict[str, Any] = Depends(get_current_user),
):
  """
  Create a new job record for an existing media item.
  """
  uid = user["uid"]

  media: Optional[Media] = (
      db.query(Media)
      .filter(Media.id == payload.media_id, Media.user_id == uid)
      .first()
  )
  if not media:
    raise HTTPException(status_code=404, detail="Media not found for this user")

  job = Job(
      user_id=uid,
      media_id=media.id,
      job_type=payload.job_type,
      input_s3_key=media.s3_key,
      status="pending",
  )
  db.add(job)
  db.commit()
  db.refresh(job)
  return _job_to_read(job)


@router.get("/{job_id}", response_model=JobRead)
def get_job(
  job_id: int,
  db: Session = Depends(get_db),
  user: Dict[str, Any] = Depends(get_current_user),
):
  """
  Fetch a single job by ID.
  """
  uid = user["uid"]

  job = db.query(Job).filter(Job.id == job_id, Job.user_id == uid).first()
  if not job:
    raise HTTPException(status_code=404, detail="Job not found")
  return _job_to_read(job)


@router.post("/{job_id}/process")
def process_job(
  job_id: int,
  db: Session = Depends(get_db),
  user: Dict[str, Any] = Depends(get_current_user),
):
  """
  Process a job (currently only supports 'roof_report').

  Note: This endpoint is mainly for manual testing.
  Your normal flow uses the background worker.
  """
  uid = user["uid"]

  job = db.query(Job).filter(Job.id == job_id, Job.user_id == uid).first()
  if not job:
    raise HTTPException(status_code=404, detail="Job not found")

  if job.job_type != "roof_report":
    raise HTTPException(status_code=400, detail="Unsupported job_type for this processor")

  job.status = "processing"
  db.add(job)
  db.commit()
  db.refresh(job)

  report = process_roof_job(db=db, job=job)
  return {
      "job_id": job.id,
      "status": job.status,
      "report": report.model_dump(),
  }


@router.delete("/{job_id}")
def delete_job(
  job_id: int,
  db: Session = Depends(get_db),
  user: Dict[str, Any] = Depends(get_current_user),
):
  """
  Delete a single job owned by the current user.
  Does NOT delete the linked media.
  """
  uid = user["uid"]

  job = db.query(Job).filter(Job.id == job_id, Job.user_id == uid).first()
  if not job:
    raise HTTPException(status_code=404, detail="Job not found")

  db.delete(job)
  db.commit()
  return {"deleted": True, "job_id": job_id}


@router.get("/{job_id}/pdf-url", response_model=PdfUrlResponse)
def get_job_pdf_url(
  job_id: int,
  db: Session = Depends(get_db),
  user: Dict[str, Any] = Depends(get_current_user),
) -> PdfUrlResponse:
  uid = user["uid"]

  job = db.query(Job).filter(Job.id == job_id, Job.user_id == uid).first()
  if not job:
    raise HTTPException(status_code=404, detail="Job not found")

  if not job.pdf_s3_key:
    raise HTTPException(status_code=404, detail="PDF not available for this job yet")

  if isinstance(job.pdf_s3_key, str) and job.pdf_s3_key.startswith("error:"):
    raise HTTPException(status_code=500, detail=f"PDF generation failed: {job.pdf_s3_key}")

  url = generate_file_url(job.pdf_s3_key)
  return PdfUrlResponse(url=url)


@router.post("/{job_id}/retry-pdf", response_model=JobRead)
def retry_pdf(
    job_id: int,
    db: Session = Depends(get_db),
    user: Dict[str, Any] = Depends(get_current_user),
) -> JobRead:
    """
    Regenerate ONLY the PDF for a job (analysis must already exist).

    Option A rules:
    - completed means PDF exists
    - if PDF regen fails -> job failed
    """
    uid = user["uid"]

    job = db.query(Job).filter(Job.id == job_id, Job.user_id == uid).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    # Must have analysis results
    if not job.output_json:
        raise HTTPException(status_code=400, detail="No analysis output_json found for this job")

    # Mark processing while retry runs
    job.status = "processing"
    db.add(job)
    db.commit()
    db.refresh(job)

    try:
        # This function should:
        # - generate PDF from output_json
        # - upload it
        # - set job.pdf_s3_key
        # - set job.status="completed"
        pdf_key = regenerate_job_pdf(db=db, job=job)

        # regenerate_job_pdf already commits, but refreshing is fine
        db.refresh(job)
        return _job_to_read(job)

    except ValueError as e:
        job.status = "failed"
        db.add(job)
        db.commit()
        raise HTTPException(status_code=400, detail=str(e))

    except Exception as e:
        job.status = "failed"

        # store error in output_json (non-destructive)
        try:
            report_dict = json.loads(job.output_json) if job.output_json else {}
            if not isinstance(report_dict, dict):
                report_dict = {"report": report_dict}
        except Exception:
            report_dict = {}

        report_dict["pdf_error"] = str(e)
        job.output_json = json.dumps(report_dict, ensure_ascii=False)

        # keep pdf_s3_key as None so has_pdf remains false
        job.pdf_s3_key = None

        db.add(job)
        db.commit()
        raise HTTPException(status_code=500, detail=f"PDF retry failed: {e}")
