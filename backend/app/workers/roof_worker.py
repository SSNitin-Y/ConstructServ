from __future__ import annotations

import json
import os
import tempfile
from typing import Any

from sqlalchemy.orm import Session

from app.models.job import Job
from app.prompts.roof_prompts import ROOF_REPORT_AGG_PROMPT
from app.schemas.roof_report_schema import RoofReportResult
from app.services.ai import run_prompt
from app.services.ai_processing import analyze_roof_image
from app.services.pdf import render_roof_report_html, html_to_pdf_bytes
from app.services.storage import download_bytes, upload_bytes, _make_pdf_key


def _is_video_key(key: str) -> bool:
    ext = (key.rsplit(".", 1)[-1] or "").lower()
    return ext in {"mp4", "mov", "avi", "mkv", "webm"}


def _write_temp_file(data: bytes, suffix: str) -> str:
    fd, path = tempfile.mkstemp(suffix=suffix)
    os.close(fd)
    with open(path, "wb") as f:
        f.write(data)
    return path


def _extract_frame_to_jpg(video_path: str) -> str:
    """
    Extract a representative frame from video -> jpg.
    Requires: pip install opencv-python
    """
    try:
        import cv2  # type: ignore
    except Exception as e:
        raise RuntimeError(
            "Video uploaded but opencv-python is not installed. Install: pip install opencv-python"
        ) from e

    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise RuntimeError("Could not open video for frame extraction.")

    frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    target = frame_count // 2 if frame_count > 0 else 0
    if target > 0:
        cap.set(cv2.CAP_PROP_POS_FRAMES, target)

    ok, frame = cap.read()
    if not ok or frame is None:
        cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
        ok, frame = cap.read()

    cap.release()

    if not ok or frame is None:
        raise RuntimeError("Failed to read a frame from the video.")

    fd, jpg_path = tempfile.mkstemp(suffix=".jpg")
    os.close(fd)

    ok2 = cv2.imwrite(jpg_path, frame)
    if not ok2:
        raise RuntimeError("Failed to write extracted frame to jpg.")

    return jpg_path


def _strip_code_fences(s: str) -> str:
    """
    Gemini sometimes returns JSON wrapped in ```json ... ```
    Pydantic model_validate_json() needs raw JSON only.
    """
    if not s:
        return s
    out = s.strip()

    if out.startswith("```"):
        first_newline = out.find("\n")
        if first_newline != -1:
            out = out[first_newline + 1 :]
        if out.endswith("```"):
            out = out[: -3]
        out = out.strip()

    out = out.replace("```json", "").replace("```", "").strip()
    return out


def process_roof_job(db: Session, job: Job) -> RoofReportResult:
    """
    Option A rule:
      ✅ completed means: analysis + PDF done
      ❌ if PDF fails: job becomes failed (output_json includes pdf_error)
    """
    media_bytes = download_bytes(job.input_s3_key)

    key = job.input_s3_key or ""
    suffix = "." + key.rsplit(".", 1)[-1] if "." in key else ".bin"

    local_path = _write_temp_file(media_bytes, suffix=suffix)
    extracted_jpg: str | None = None

    try:
        # Ensure we give Gemini an image path
        image_path = local_path
        if _is_video_key(key):
            extracted_jpg = _extract_frame_to_jpg(local_path)
            image_path = extracted_jpg

        # 1) Gemini vision -> dict
        vision_data: dict[str, Any] = analyze_roof_image(image_path)
        issues = vision_data.get("issues", [])
        if not isinstance(issues, list):
            issues = [str(issues)]

        # 2) Gemini text aggregation
        issues_json = json.dumps(issues, ensure_ascii=False)
        prompt = ROOF_REPORT_AGG_PROMPT.replace("{issues_json_here}", issues_json)

        llm_reply = run_prompt(prompt)
        llm_reply = _strip_code_fences(llm_reply)

        report_data = RoofReportResult.model_validate_json(llm_reply)

        # Save analysis result first (but do NOT mark completed yet)
        job.output_json = report_data.model_dump_json()
        db.add(job)
        db.commit()
        db.refresh(job)

        # 3) PDF generation (mandatory for "completed")
        report_dict = json.loads(job.output_json) if job.output_json else {}
        html = render_roof_report_html(
            job_id=job.id,
            media_id=str(job.media_id) if job.media_id else None,
            report=report_dict,
            created_at_iso=str(job.created_at) if job.created_at else None,
        )
        pdf_bytes = html_to_pdf_bytes(html)

        pdf_key = _make_pdf_key(user_id=job.user_id, job_id=job.id)
        upload_bytes(object_key=pdf_key, data=pdf_bytes, content_type="application/pdf")

        # ✅ Only now mark job completed
        job.pdf_s3_key = pdf_key
        job.status = "completed"
        db.add(job)
        db.commit()
        db.refresh(job)

        print("✅ Roof job completed (analysis + PDF):", job.id)
        return report_data

    except Exception as e:
        # If PDF fails or anything fails, job is failed
        try:
            existing = json.loads(job.output_json) if job.output_json else {}
            if not isinstance(existing, dict):
                existing = {"report": existing}
        except Exception:
            existing = {}

        existing["error"] = str(e)
        # If analysis succeeded but PDF failed, output_json likely already has report; keep it + add pdf_error hint
        if job.output_json:
            existing.setdefault("pdf_error", str(e))

        job.status = "failed"
        job.pdf_s3_key = None
        job.output_json = json.dumps(existing, ensure_ascii=False)

        db.add(job)
        db.commit()
        db.refresh(job)
        raise

    finally:
        try:
            os.remove(local_path)
        except Exception:
            pass
        if extracted_jpg:
            try:
                os.remove(extracted_jpg)
            except Exception:
                pass
