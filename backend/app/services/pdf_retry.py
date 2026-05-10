from __future__ import annotations

import json
from typing import Any, Dict

from sqlalchemy.orm import Session

from app.models.job import Job
from app.services.pdf import render_roof_report_html, html_to_pdf_bytes
from app.services.storage import upload_bytes, _make_pdf_key


def regenerate_job_pdf(db: Session, job: Job) -> str:
    """
    Regenerate and upload the PDF for a job.
    Returns the new pdf_s3_key.

    Requirements:
    - job.output_json must exist and be valid JSON (report data)
    - currently supports roof_report jobs
    """
    if job.job_type != "roof_report":
        raise ValueError(f"retry-pdf not supported for job_type={job.job_type}")

    if not job.output_json:
        raise ValueError("No analysis output_json found. Run analysis first before retrying PDF.")

    try:
        report_dict: Dict[str, Any] = json.loads(job.output_json)
        if not isinstance(report_dict, dict):
            report_dict = {"report": report_dict}
    except Exception as e:
        raise ValueError(f"output_json is not valid JSON: {e}")

    html = render_roof_report_html(
        job_id=job.id,
        media_id=str(job.media_id) if job.media_id else None,
        report=report_dict,
        created_at_iso=str(job.created_at) if job.created_at else None,
    )
    pdf_bytes = html_to_pdf_bytes(html)

    pdf_key = _make_pdf_key(user_id=job.user_id, job_id=job.id)
    upload_bytes(object_key=pdf_key, data=pdf_bytes, content_type="application/pdf")

    # Update job fields
    job.pdf_s3_key = pdf_key
    job.status = "completed"  # Option A: completed == analysis + pdf
    db.add(job)
    db.commit()
    db.refresh(job)

    return pdf_key
