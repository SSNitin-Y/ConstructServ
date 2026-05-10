# app/services/s3.py

from __future__ import annotations

from uuid import uuid4

import boto3
from botocore.config import Config
from fastapi import HTTPException

from app.config import settings

_s3_config = Config(signature_version="s3v4")
_s3_client = None


def _get_s3_client():
    global _s3_client

    if _s3_client is not None:
        return _s3_client

    if not settings.AWS_REGION:
        raise HTTPException(
            status_code=500,
            detail="AWS_REGION is not set. Add it to backend/.env",
        )

    _s3_client = boto3.client("s3", region_name=settings.AWS_REGION, config=_s3_config)
    return _s3_client


def _require_bucket() -> str:
    if not settings.AWS_BUCKET:
        raise HTTPException(
            status_code=500,
            detail="AWS_BUCKET is not set. Add it to backend/.env",
        )
    return settings.AWS_BUCKET


# ✅ Backwards-compatible export: supports s3_client.get_object(...)
class _LazyS3Client:
    def __getattr__(self, name: str):
        client = _get_s3_client()
        return getattr(client, name)


s3_client = _LazyS3Client()


def generate_presigned_url(file_extension: str, user_id: str) -> dict:
    if not file_extension:
        raise HTTPException(status_code=400, detail="File extension is required")

    bucket = _require_bucket()
    client = _get_s3_client()

    key = f"uploads/{user_id}/{uuid4()}.{file_extension}"

    try:
        upload_url = client.generate_presigned_url(
            ClientMethod="put_object",
            Params={"Bucket": bucket, "Key": key},
            ExpiresIn=3600,
            HttpMethod="PUT",
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to generate S3 presigned URL: {e}",
        )

    return {"uploadUrl": upload_url, "s3Key": key}


def generate_presigned_get_url(s3_key: str, expires_in: int = 3600) -> str:
    if not s3_key:
        raise HTTPException(status_code=400, detail="S3 key is required for preview URL")

    bucket = _require_bucket()
    client = _get_s3_client()

    try:
        url = client.generate_presigned_url(
            ClientMethod="get_object",
            Params={"Bucket": bucket, "Key": s3_key},
            ExpiresIn=expires_in,
            HttpMethod="GET",
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to generate S3 presigned GET URL: {e}",
        )

    return url


def delete_s3_object(s3_key: str) -> None:
    if not s3_key:
        return

    bucket = _require_bucket()
    client = _get_s3_client()

    try:
        client.delete_object(Bucket=bucket, Key=s3_key)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete S3 object: {e}")


def download_bytes_from_s3(s3_key: str) -> bytes:
    if not s3_key:
        raise HTTPException(status_code=400, detail="s3_key is required")

    bucket = _require_bucket()
    client = _get_s3_client()

    obj = client.get_object(Bucket=bucket, Key=s3_key)
    return obj["Body"].read()


def upload_bytes_to_s3(*, object_key: str, data: bytes, content_type: str) -> None:
    """
    Worker helper: upload bytes to S3 (used for PDFs).
    """
    bucket = _require_bucket()
    client = _get_s3_client()
    client.put_object(Bucket=bucket, Key=object_key, Body=data, ContentType=content_type)
