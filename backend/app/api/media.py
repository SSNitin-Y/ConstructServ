# backend/app/api/media.py

import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.schemas.media import (
    MediaListItem,
    MediaListResponse,
    MediaDetailResponse,
    MediaUploadIntentRequest,
    MediaUploadIntentResponse,
    MediaFileUrlResponse,
)
from app.schemas.job_schema import JobRead

from app.api.auth_middleware import get_current_user
from app.services.storage import (
    generate_upload_url,
    generate_file_url,
    delete_object,
)
from app.db import get_db
from app.models.media import Media
from app.models.job import Job

router = APIRouter(prefix="/media", tags=["media"])
logger = logging.getLogger(__name__)


def compute_ai_status_from_job_status(job_status: Optional[str]) -> str:
    if not job_status:
        return "none"
    s = job_status.lower()
    if s in ("pending", "processing"):
        return "running"
    if s == "completed":
        return "ready"
    if s == "failed":
        return "failed"
    return "running"


def media_model_to_schema(
    model: Media,
    *,
    ai_status: Optional[str] = None,
    latest_job_id: Optional[int] = None,
    latest_job_status: Optional[str] = None,
    latest_job_type: Optional[str] = None,
) -> MediaListItem:
    """
    NOTE:
    - Frontend library page expects `thumbnail_url` to show previews.
    - We keep the DB column `thumbnail_url` as-is, but if it's NULL and we have
      an object key (`s3_key`), we generate a signed GET URL dynamically.
    - This works for both S3 and GCS because `generate_file_url()` routes based
      on STORAGE_PROVIDER and we kept the key name `s3_key` stable.
    """
    signed_preview_url: Optional[str] = None
    try:
        if getattr(model, "thumbnail_url", None):
            signed_preview_url = model.thumbnail_url
        else:
            object_key = getattr(model, "s3_key", None)
            if object_key:
                signed_preview_url = generate_file_url(object_key)
    except Exception:
        # Never fail the whole list response if URL signing fails for one row.
        signed_preview_url = getattr(model, "thumbnail_url", None)

    return MediaListItem(
        id=str(model.id),
        filename=model.filename,
        media_type=model.media_type,  # type: ignore[arg-type]
        status=model.status,          # type: ignore[arg-type]
        created_at=model.created_at,
        thumbnail_url=signed_preview_url,

        analysis_type=getattr(model, "analysis_type", None),
        notes=getattr(model, "notes", None),
        location=getattr(model, "location", None),
        capture_date=getattr(model, "capture_date", None),

        ai_status=ai_status,
        latest_job_id=latest_job_id,
        latest_job_status=latest_job_status,
        latest_job_type=latest_job_type,
    )


@router.get("", response_model=MediaListResponse)
async def list_media(
    page: int = 1,
    page_size: int = 20,
    include_ai: int = Query(0, description="Set to 1 to include ai_status + latest job fields"),
    user: Dict[str, Any] = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> MediaListResponse:
    uid = user["uid"]

    query = (
        db.query(Media)
        .filter(Media.user_id == uid)
        .order_by(Media.created_at.desc())
    )

    offset = (page - 1) * page_size
    rows: List[Media] = query.offset(offset).limit(page_size).all()

    if not include_ai:
        items = [media_model_to_schema(m) for m in rows]
        return MediaListResponse(items=items)

    media_ids = [m.id for m in rows if m.id]
    latest_by_media: dict[str, Job] = {}

    if media_ids:
        latest_jobs: List[Job] = (
            db.query(Job)
            .filter(Job.user_id == uid, Job.media_id.in_(media_ids))
            .order_by(Job.media_id, Job.created_at.desc())
            .distinct(Job.media_id)
            .all()
        )
        for j in latest_jobs:
            if j.media_id is not None:
                latest_by_media[str(j.media_id)] = j

    items: List[MediaListItem] = []
    for m in rows:
        j = latest_by_media.get(str(m.id))
        ai_status = compute_ai_status_from_job_status(j.status if j else None)
        items.append(
            media_model_to_schema(
                m,
                ai_status=ai_status,
                latest_job_id=j.id if j else None,
                latest_job_status=j.status if j else None,
                latest_job_type=j.job_type if j else None,
            )
        )

    return MediaListResponse(items=items)


@router.get("/{media_id}", response_model=MediaDetailResponse)
async def get_media(
    media_id: str,
    user: Dict[str, Any] = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> MediaDetailResponse:
    uid = user["uid"]

    media: Media | None = (
        db.query(Media)
        .filter(Media.id == media_id, Media.user_id == uid)
        .first()
    )
    if not media:
        raise HTTPException(status_code=404, detail="Media not found")

    return MediaDetailResponse(**media_model_to_schema(media).model_dump())


@router.get("/{media_id}/file-url", response_model=MediaFileUrlResponse)
async def get_media_file_url(
    media_id: str,
    user: Dict[str, Any] = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> MediaFileUrlResponse:
    uid = user["uid"]

    media: Media | None = (
        db.query(Media)
        .filter(Media.id == media_id, Media.user_id == uid)
        .first()
    )
    if not media:
        raise HTTPException(status_code=404, detail="Media not found")

    if not media.s3_key:
        raise HTTPException(status_code=400, detail="Media has no storage key")

    url = generate_file_url(media.s3_key)
    return MediaFileUrlResponse(url=url)


@router.post("/upload-intent", response_model=MediaUploadIntentResponse)
async def create_upload_intent(
    payload: MediaUploadIntentRequest,
    user: Dict[str, Any] = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> MediaUploadIntentResponse:
    uid = user.get("uid")
    if not uid:
        raise HTTPException(status_code=401, detail="Missing user uid")

    try:
        logger.info(
            "upload-intent start uid=%s filename=%s content_type=%s media_type=%s",
            uid,
            payload.filename,
            payload.content_type,
            payload.media_type,
        )

        _, dot, ext = payload.filename.rpartition(".")
        file_extension = ext if dot else ""

        presign = generate_upload_url(
            file_extension=file_extension,
            user_id=uid,
            content_type=payload.content_type,
        )

        if not isinstance(presign, dict):
            logger.error("generate_upload_url returned non-dict: %r", presign)
            raise HTTPException(status_code=500, detail="upload-intent signing failed")

        upload_url = presign.get("uploadUrl")
        storage_key = presign.get("s3Key")  # keep name stable

        if not upload_url or not storage_key:
            logger.error("generate_upload_url missing keys: %r", presign)
            raise HTTPException(status_code=500, detail="upload-intent signing failed")

        now = datetime.now(timezone.utc)

        media = Media(
            user_id=uid,
            filename=payload.filename,
            media_type=payload.media_type,
            status="uploading",
            created_at=now,
            thumbnail_url=None,
            s3_key=storage_key,

            analysis_type=payload.analysis_type,
            notes=payload.notes,
            location=payload.location,
            capture_date=payload.capture_date,
        )

        db.add(media)
        db.commit()
        db.refresh(media)

        media_schema = media_model_to_schema(media)

        upload_headers: Dict[str, str] | None = None
        if payload.content_type:
            upload_headers = {"Content-Type": payload.content_type}

        logger.info("upload-intent success uid=%s media_id=%s key=%s", uid, media.id, storage_key)

        return MediaUploadIntentResponse(
            media=media_schema,
            upload_url=upload_url,
            upload_method="PUT",
            upload_headers=upload_headers,
            upload_fields=None,
        )

    except HTTPException:
        raise
    except Exception:
        logger.exception(
            "upload-intent failed uid=%s filename=%s",
            uid,
            getattr(payload, "filename", None),
        )
        raise HTTPException(status_code=500, detail="upload-intent failed; see backend logs")


@router.patch("/{media_id}/mark-ready", response_model=MediaDetailResponse)
async def mark_media_ready(
    media_id: str,
    user: Dict[str, Any] = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> MediaDetailResponse:
    uid = user["uid"]

    media: Media | None = (
        db.query(Media)
        .filter(Media.id == media_id, Media.user_id == uid)
        .first()
    )
    if not media:
        raise HTTPException(status_code=404, detail="Media not found")

    media.status = "processing"
    db.add(media)
    db.commit()
    db.refresh(media)

    return MediaDetailResponse(**media_model_to_schema(media).model_dump())


@router.get("/{media_id}/jobs", response_model=list[JobRead])
async def list_jobs_for_media(
    media_id: str,
    user: Dict[str, Any] = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[JobRead]:
    uid = user["uid"]

    jobs = (
        db.query(Job)
        .filter(Job.user_id == uid, Job.media_id == media_id)
        .order_by(Job.created_at.desc())
        .all()
    )
    return jobs


@router.delete("/{media_id}")
async def delete_media(
    media_id: str,
    user: Dict[str, Any] = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    uid = user["uid"]

    media: Media | None = (
        db.query(Media)
        .filter(Media.id == media_id, Media.user_id == uid)
        .first()
    )
    if not media:
        raise HTTPException(status_code=404, detail="Media not found")

    db.query(Job).filter(Job.user_id == uid, Job.media_id == media.id).delete(
        synchronize_session=False
    )

    if media.s3_key:
        delete_object(media.s3_key)

    db.delete(media)
    db.commit()

    return {"deleted": True, "media_id": str(media_id)}


class BulkDeleteRequest(BaseModel):
    media_ids: list[str]


@router.post("/bulk-delete")
async def bulk_delete_media(
    payload: BulkDeleteRequest,
    user: Dict[str, Any] = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    uid = user["uid"]
    ids = [m for m in payload.media_ids if m]

    if not ids:
        return {"deleted_ids": [], "count": 0}

    medias: list[Media] = (
        db.query(Media)
        .filter(Media.user_id == uid, Media.id.in_(ids))
        .all()
    )

    deleted_ids: list[str] = []

    for media in medias:
        db.query(Job).filter(Job.user_id == uid, Job.media_id == media.id).delete(
            synchronize_session=False
        )

        if media.s3_key:
            delete_object(media.s3_key)

        deleted_ids.append(str(media.id))
        db.delete(media)

    db.commit()

    return {"deleted_ids": deleted_ids, "count": len(deleted_ids)}
