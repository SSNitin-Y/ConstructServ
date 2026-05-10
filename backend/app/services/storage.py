# backend/app/services/storage.py

from __future__ import annotations

from typing import Optional
from uuid import uuid4

from fastapi import HTTPException

from app.config import settings
from app.services import s3 as s3_impl
from google.auth import impersonated_credentials


_GCS_CLIENT = None


def _make_object_key(*, user_id: str, file_extension: str) -> str:
    ext = (file_extension or "").lstrip(".")
    if not ext:
        ext = "bin"
    return f"uploads/{user_id}/{uuid4()}.{ext}"


def _make_pdf_key(*, user_id: str, job_id: int) -> str:
    """
    Stable key for PDFs. Keeps UI/back-end consistent across providers.
    """
    return f"reports/{user_id}/jobs/{job_id}.pdf"


# -------------------------
# Optional GCS implementation
# -------------------------
def _require_gcs_libs():
    try:
        from google.cloud import storage  # type: ignore
        return storage
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=(
                "GCS storage provider selected but google-cloud-storage is not installed. "
                "Install it with: pip install google-cloud-storage\n"
                f"Original error: {e}"
            ),
        )


def _require_gcs_bucket() -> str:
    if not settings.GCS_BUCKET_NAME:
        raise HTTPException(
            status_code=500,
            detail="GCS_BUCKET_NAME is not set. Add it to backend/.env",
        )
    return settings.GCS_BUCKET_NAME


def _require_gcs_signer_service_account() -> str:
    """
    On Cloud Run, ADC credentials are token-only and cannot sign URLs with a private key.
    We sign via IAMCredentials by impersonating a service account (typically the runtime SA).
    """
    if not getattr(settings, "GCS_SIGNER_SERVICE_ACCOUNT", None):
        raise HTTPException(
            status_code=500,
            detail=(
                "GCS_SIGNER_SERVICE_ACCOUNT is not set. "
                "Set it to the Cloud Run runtime service account email (or a dedicated signer SA)."
            ),
        )
    return settings.GCS_SIGNER_SERVICE_ACCOUNT  # type: ignore[return-value]


def _gcs_client():
    """
    Returns a google.cloud.storage.Client configured with impersonated credentials
    so blob.generate_signed_url(version='v4', ...) can sign via IAMCredentials.
    """
    global _GCS_CLIENT
    storage = _require_gcs_libs()

    if _GCS_CLIENT is None:
        try:
            import google.auth
            from google.auth import impersonated_credentials
        except Exception as e:
            raise HTTPException(
                status_code=500,
                detail=(
                    "GCS signing requires google-auth-impersonated-credentials. "
                    "Add it to requirements.txt.\n"
                    f"Original error: {e}"
                ),
            )

        source_credentials, _project = google.auth.default()

        target_sa = _require_gcs_signer_service_account()

        # Scope used by storage client. Signed URL signing itself uses IAMCredentials (signBlob).
        target_scopes = ["https://www.googleapis.com/auth/devstorage.read_write"]

        signing_credentials = impersonated_credentials.Credentials(
            source_credentials=source_credentials,
            target_principal=target_sa,
            target_scopes=target_scopes,
            lifetime=3600,
        )

        _GCS_CLIENT = storage.Client(credentials=signing_credentials)

    return _GCS_CLIENT


def _gcs_bucket():
    bucket_name = _require_gcs_bucket()
    client = _gcs_client()
    return client.bucket(bucket_name)


def _gcs_generate_signed_put_url(object_key: str, content_type: Optional[str]) -> str:
    bucket = _gcs_bucket()
    blob = bucket.blob(object_key)
    return blob.generate_signed_url(
        version="v4",
        expiration=3600,
        method="PUT",
        content_type=content_type or "application/octet-stream",
    )


def _gcs_generate_signed_get_url(object_key: str) -> str:
    bucket = _gcs_bucket()
    blob = bucket.blob(object_key)
    return blob.generate_signed_url(
        version="v4",
        expiration=3600,
        method="GET",
    )


def _gcs_delete_object(object_key: str) -> None:
    bucket = _gcs_bucket()
    blob = bucket.blob(object_key)
    try:
        blob.delete()
    except Exception:
        return


def _gcs_download_bytes(object_key: str) -> bytes:
    bucket = _gcs_bucket()
    blob = bucket.blob(object_key)
    return blob.download_as_bytes()


def _gcs_upload_bytes(object_key: str, data: bytes, content_type: str) -> None:
    bucket = _gcs_bucket()
    blob = bucket.blob(object_key)
    blob.upload_from_string(data, content_type=content_type)


# -------------------------
# Public API
# -------------------------
def generate_upload_url(
    *,
    file_extension: str,
    user_id: str,
    content_type: Optional[str] = None,
) -> dict:
    """
    Returns same shape your UI expects:
      {"uploadUrl": "...", "s3Key": "uploads/..."}
    Keep the name "s3Key" for backward compatibility even if using GCS.
    """
    provider = (settings.STORAGE_PROVIDER or "s3").lower()

    if provider == "s3":
        return s3_impl.generate_presigned_url(file_extension=file_extension, user_id=user_id)

    if provider == "gcs":
        object_key = _make_object_key(user_id=user_id, file_extension=file_extension)
        upload_url = _gcs_generate_signed_put_url(object_key, content_type=content_type)
        return {"uploadUrl": upload_url, "s3Key": object_key}

    raise HTTPException(status_code=500, detail=f"Unsupported STORAGE_PROVIDER={provider}")


def generate_file_url(object_key: str) -> str:
    provider = (settings.STORAGE_PROVIDER or "s3").lower()

    if provider == "s3":
        return s3_impl.generate_presigned_get_url(object_key)

    if provider == "gcs":
        return _gcs_generate_signed_get_url(object_key)

    raise HTTPException(status_code=500, detail=f"Unsupported STORAGE_PROVIDER={provider}")


def delete_object(object_key: str) -> None:
    provider = (settings.STORAGE_PROVIDER or "s3").lower()

    if provider == "s3":
        return s3_impl.delete_s3_object(object_key)

    if provider == "gcs":
        return _gcs_delete_object(object_key)

    raise HTTPException(status_code=500, detail=f"Unsupported STORAGE_PROVIDER={provider}")


def download_bytes(object_key: str) -> bytes:
    provider = (settings.STORAGE_PROVIDER or "s3").lower()

    if provider == "s3":
        return s3_impl.download_bytes_from_s3(object_key)

    if provider == "gcs":
        return _gcs_download_bytes(object_key)

    raise HTTPException(status_code=500, detail=f"Unsupported STORAGE_PROVIDER={provider}")


def upload_bytes(*, object_key: str, data: bytes, content_type: str) -> None:
    """
    Used by workers to upload generated artifacts (PDFs).
    """
    provider = (settings.STORAGE_PROVIDER or "s3").lower()

    if provider == "s3":
        return s3_impl.upload_bytes_to_s3(object_key=object_key, data=data, content_type=content_type)

    if provider == "gcs":
        return _gcs_upload_bytes(object_key=object_key, data=data, content_type=content_type)

    raise HTTPException(status_code=500, detail=f"Unsupported STORAGE_PROVIDER={provider}")
