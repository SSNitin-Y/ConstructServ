# backend/scripts/process_pending_jobs.py

from __future__ import annotations

import json
import traceback
from typing import Optional

from sqlalchemy.orm import Session

from app.db import SessionLocal
from app.models.job import Job
from app.models.media import Media
from app.workers.roof_worker import process_roof_job


def _claim_next_pending_job(db: Session) -> Optional[Job]:
    """
    Claim one pending job using row-level locking.
    IMPORTANT: must be called inside a transaction.
    """
    job = (
        db.query(Job)
        .filter(Job.status == "pending")
        .order_by(Job.created_at.asc())
        .with_for_update(skip_locked=True)
        .first()
    )
    if not job:
        return None

    job.status = "processing"
    db.add(job)
    return job


def _mark_media_status(db: Session, media_id, status: str) -> None:
    if not media_id:
        return
    media = db.query(Media).filter(Media.id == media_id).first()
    if media is not None:
        media.status = status
        db.add(media)


def process_pending_jobs(verbose: bool = True) -> int:
    processed_count = 0

    # Optional safety limits for Cloud Run
    max_per_tick = int(os.getenv("JOB_MAX_PER_TICK", "25"))

    while processed_count < max_per_tick:
        # Use a fresh session per job to avoid stale connections / identity map bloat
        db = SessionLocal()

        try:
            # 1) Claim a job (transactional)
            job: Optional[Job] = None
            with db.begin():
                job = _claim_next_pending_job(db)
                if not job:
                    break

                # Mark media as processing early
                _mark_media_status(db, job.media_id, "processing")

            # job is claimed + committed now, lock released
            processed_count += 1

            if verbose:
                print(
                    f"\n- Processing job id={job.id}, type={job.job_type}, input={job.input_s3_key}"
                )

            # 2) Process job
            try:
                if job.job_type == "roof_report":
                    process_roof_job(db=db, job=job)
                else:
                    raise RuntimeError(f"Unsupported job_type={job.job_type}")

                # Ensure we have latest status written by worker
                db.refresh(job)

                # Option A: media is ready only if job completed
                final_media_status = "ready" if job.status == "completed" else "failed"
                with db.begin():
                    _mark_media_status(db, job.media_id, final_media_status)

                if verbose:
                    if job.status == "completed":
                        print(f"  -> Job {job.id} completed ✅")
                        if job.pdf_s3_key:
                            print(f"  -> PDF key: {job.pdf_s3_key}")
                    else:
                        print(f"  -> Job {job.id} ended as {job.status}")

            except Exception as e:
                if verbose:
                    print(f"  !! Error processing job {job.id}: {e}")
                    print(traceback.format_exc())

                db.rollback()

                # Reload and mark failed (new transaction)
                with db.begin():
                    job2 = db.query(Job).filter(Job.id == job.id).first()
                    if job2 is not None:
                        job2.status = "failed"
                        try:
                            existing = json.loads(job2.output_json) if job2.output_json else {}
                            if not isinstance(existing, dict):
                                existing = {"report": existing}
                        except Exception:
                            existing = {}
                        existing["error"] = str(e)
                        job2.output_json = json.dumps(existing, ensure_ascii=False)
                        job2.pdf_s3_key = None
                        db.add(job2)

                    _mark_media_status(db, job.media_id, "failed")

        finally:
            db.close()

    if verbose:
        if processed_count == 0:
            print("No pending jobs found.")
        else:
            print("\nDone processing all pending jobs (this tick).")

    return processed_count


if __name__ == "__main__":
    process_pending_jobs(verbose=True)
