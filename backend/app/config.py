# backend/app/config.py

from __future__ import annotations

from dotenv import load_dotenv
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

load_dotenv()


class Settings(BaseSettings):
    """
    Unified settings for local + prod.

    Important:
    - We keep old module-level constants (AWS_BUCKET, etc.) so existing code
      doesn't break while we migrate slowly.
    """

    # --- Core ---
    ENV: str = Field(default="local", description="local|staging|prod")

    # Switches
    AI_PROVIDER: str = Field(default="ollama", description="ollama|gemini")
    STORAGE_PROVIDER: str = Field(default="s3", description="s3|gcs")

    # --- Database ---
    DATABASE_URL: str = Field(..., description="PostgreSQL database connection URL")

    # --- AWS / S3 (current) ---
    AWS_BUCKET: str | None = Field(default=None, description="S3 bucket name")
    AWS_REGION: str | None = Field(default=None, description="AWS region, e.g. us-east-1")

    # --- GCP / Vertex AI / Gemini (optional unless AI_PROVIDER=gemini) ---
    GOOGLE_CLOUD_PROJECT: str | None = Field(default=None, description="GCP Project ID")
    GOOGLE_CLOUD_REGION: str | None = Field(default="us-central1", description="GCP Region")
    GCS_BUCKET_NAME: str | None = Field(default=None, description="GCS bucket name")
    GCS_SIGNER_SERVICE_ACCOUNT: str | None = Field(
        default=None,
        description="Service account email used to sign GCS URLs via IAMCredentials (recommended on Cloud Run)",
    )

    # --- Cloud Tasks / Worker (optional; not used by local MVP yet) ---
    WORKER_BASE_URL: str | None = Field(default=None, description="Cloud Run worker base URL")
    CLOUD_TASKS_QUEUE_ID: str = Field(default="job-processing-queue", description="Cloud Tasks queue id")

    model_config = SettingsConfigDict(
        env_file=".env",
        extra="ignore",
        case_sensitive=True,
    )


settings = Settings()

# -------------------------------------------------------------------
# Backward-compatible module constants
# -------------------------------------------------------------------
ENV = settings.ENV
DATABASE_URL = settings.DATABASE_URL

AI_PROVIDER = settings.AI_PROVIDER
STORAGE_PROVIDER = settings.STORAGE_PROVIDER

AWS_BUCKET = settings.AWS_BUCKET
AWS_REGION = settings.AWS_REGION

GOOGLE_CLOUD_PROJECT = settings.GOOGLE_CLOUD_PROJECT
GOOGLE_CLOUD_REGION = settings.GOOGLE_CLOUD_REGION
GCS_BUCKET_NAME = settings.GCS_BUCKET_NAME
GCS_SIGNER_SERVICE_ACCOUNT = settings.GCS_SIGNER_SERVICE_ACCOUNT

WORKER_BASE_URL = settings.WORKER_BASE_URL
CLOUD_TASKS_QUEUE_ID = settings.CLOUD_TASKS_QUEUE_ID
