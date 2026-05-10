"""jobs_media_id_fk_cascade

Revision ID: 5360ca4e767e
Revises: 46ed42217497
Create Date: 2025-12-22

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "5360ca4e767e"
down_revision = "46ed42217497"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """
    Ensure jobs.media_id foreign key uses ON DELETE CASCADE.
    """
    conn = op.get_bind()

    fk_name = conn.execute(sa.text("""
        SELECT conname
        FROM pg_constraint c
        JOIN pg_class t ON c.conrelid = t.oid
        WHERE t.relname = 'jobs'
          AND c.contype = 'f'
          AND pg_get_constraintdef(c.oid) ILIKE '%FOREIGN KEY (media_id)%REFERENCES media%'
        LIMIT 1;
    """)).scalar()

    if fk_name:
        op.drop_constraint(fk_name, "jobs", type_="foreignkey")

    op.create_foreign_key(
        constraint_name="jobs_media_id_fkey",
        source_table="jobs",
        referent_table="media",
        local_cols=["media_id"],
        remote_cols=["id"],
        ondelete="CASCADE",
    )


def downgrade() -> None:
    op.drop_constraint("jobs_media_id_fkey", "jobs", type_="foreignkey")
    op.create_foreign_key(
        constraint_name="jobs_media_id_fkey",
        source_table="jobs",
        referent_table="media",
        local_cols=["media_id"],
        remote_cols=["id"],
        ondelete=None,
    )
