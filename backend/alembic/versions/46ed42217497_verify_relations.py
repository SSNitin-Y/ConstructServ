"""verify relations

Revision ID: 46ed42217497
Revises: 77080fa65f86
Create Date: 2025-12-20 14:44:56.830024

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "46ed42217497"
down_revision: Union[str, Sequence[str], None] = "77080fa65f86"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""

    # 1) Ensure jobs.user_id is NOT NULL
    op.alter_column(
        "jobs",
        "user_id",
        existing_type=sa.VARCHAR(),
        nullable=False,
    )

    # 2) Index rename fix:
    # Older DBs might have idx_jobs_media_id.
    # Fresh DB baseline creates ix_jobs_media_id already.
    conn = op.get_bind()

    idx_exists = conn.execute(sa.text("""
        SELECT 1
        FROM pg_indexes
        WHERE schemaname = 'public'
          AND tablename = 'jobs'
          AND indexname = 'idx_jobs_media_id'
        LIMIT 1;
    """)).scalar()

    if idx_exists:
        op.drop_index("idx_jobs_media_id", table_name="jobs")

    ix_exists = conn.execute(sa.text("""
        SELECT 1
        FROM pg_indexes
        WHERE schemaname = 'public'
          AND tablename = 'jobs'
          AND indexname = 'ix_jobs_media_id'
        LIMIT 1;
    """)).scalar()

    if not ix_exists:
        op.create_index("ix_jobs_media_id", "jobs", ["media_id"], unique=False)

    # 3) media column type normalization (harmless on fresh DB, helpful on older DBs)
    op.alter_column("media", "analysis_type", existing_type=sa.TEXT(), type_=sa.String(), existing_nullable=True)
    op.alter_column("media", "notes", existing_type=sa.TEXT(), type_=sa.String(), existing_nullable=True)
    op.alter_column("media", "location", existing_type=sa.TEXT(), type_=sa.String(), existing_nullable=True)


def downgrade() -> None:
    """Downgrade schema."""

    # Revert media columns back to TEXT
    op.alter_column("media", "location", existing_type=sa.String(), type_=sa.TEXT(), existing_nullable=True)
    op.alter_column("media", "notes", existing_type=sa.String(), type_=sa.TEXT(), existing_nullable=True)
    op.alter_column("media", "analysis_type", existing_type=sa.String(), type_=sa.TEXT(), existing_nullable=True)

    # Index downgrade: drop ix if exists, create idx if missing
    conn = op.get_bind()

    ix_exists = conn.execute(sa.text("""
        SELECT 1
        FROM pg_indexes
        WHERE schemaname = 'public'
          AND tablename = 'jobs'
          AND indexname = 'ix_jobs_media_id'
        LIMIT 1;
    """)).scalar()
    if ix_exists:
        op.drop_index("ix_jobs_media_id", table_name="jobs")

    idx_exists = conn.execute(sa.text("""
        SELECT 1
        FROM pg_indexes
        WHERE schemaname = 'public'
          AND tablename = 'jobs'
          AND indexname = 'idx_jobs_media_id'
        LIMIT 1;
    """)).scalar()
    if not idx_exists:
        op.create_index("idx_jobs_media_id", "jobs", ["media_id"], unique=False)

    # Allow jobs.user_id nullable again
    op.alter_column(
        "jobs",
        "user_id",
        existing_type=sa.VARCHAR(),
        nullable=True,
    )
