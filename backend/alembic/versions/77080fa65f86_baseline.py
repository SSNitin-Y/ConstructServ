"""baseline

Revision ID: 77080fa65f86
Revises:
Create Date: 2025-12-20 14:38:30.695637

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = "77080fa65f86"
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # -----
    # media
    # -----
    op.create_table(
        "media",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("user_id", sa.String(), nullable=False),
        sa.Column("filename", sa.String(), nullable=False),
        sa.Column("media_type", sa.String(), nullable=False),
        sa.Column("status", sa.String(), nullable=False, server_default="uploading"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("thumbnail_url", sa.String(), nullable=True),
        sa.Column("s3_key", sa.String(), nullable=False),
        sa.Column("analysis_type", sa.String(), nullable=True),
        sa.Column("notes", sa.String(), nullable=True),
        sa.Column("location", sa.String(), nullable=True),
        sa.Column("capture_date", sa.Date(), nullable=True),
    )
    op.create_index(op.f("ix_media_user_id"), "media", ["user_id"], unique=False)

    # -----
    # jobs
    # -----
    op.create_table(
        "jobs",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("user_id", sa.String(), nullable=False),
        sa.Column("media_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("job_type", sa.String(), nullable=False),
        sa.Column("input_s3_key", sa.String(), nullable=False),
        sa.Column("status", sa.String(), nullable=False, server_default="pending"),
        sa.Column("output_json", sa.Text(), nullable=True),
        sa.Column("pdf_s3_key", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(
            ["media_id"],
            ["media.id"],
            name="jobs_media_id_fkey",
            ondelete="CASCADE",
        ),
    )
    op.create_index(op.f("ix_jobs_user_id"), "jobs", ["user_id"], unique=False)
    op.create_index(op.f("ix_jobs_media_id"), "jobs", ["media_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_jobs_media_id"), table_name="jobs")
    op.drop_index(op.f("ix_jobs_user_id"), table_name="jobs")
    op.drop_table("jobs")

    op.drop_index(op.f("ix_media_user_id"), table_name="media")
    op.drop_table("media")
