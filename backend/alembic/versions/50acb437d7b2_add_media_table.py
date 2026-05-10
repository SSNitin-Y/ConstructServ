"""add media / conversation tables

Revision ID: 50acb437d7b2
Revises: bacb3a5e75a3
Create Date: 2026-01-04 19:57:19.728837

NOTE:
- media + jobs are already created in baseline (77080fa65f86).
- This migration should only create:
  - media_conversations
  - conversation_messages
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from sqlalchemy import inspect

# revision identifiers, used by Alembic.
revision: str = "50acb437d7b2"
down_revision: Union[str, Sequence[str], None] = "bacb3a5e75a3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = inspect(bind)

    existing_tables = set(insp.get_table_names(schema="public"))

    # -----
    # media_conversations
    # -----
    if "media_conversations" not in existing_tables:
        op.create_table(
            "media_conversations",
            sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column("media_id", postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column("user_id", sa.String(), nullable=False),
            sa.Column("job_id", sa.String(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
            sa.ForeignKeyConstraint(["media_id"], ["media.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("media_id", "user_id", "job_id", name="uq_media_conversations_media_user_job"),
        )

        op.create_index(op.f("ix_media_conversations_job_id"), "media_conversations", ["job_id"], unique=False)
        op.create_index(op.f("ix_media_conversations_media_id"), "media_conversations", ["media_id"], unique=False)
        op.create_index("ix_media_conversations_media_user", "media_conversations", ["media_id", "user_id"], unique=False)
        op.create_index(op.f("ix_media_conversations_user_id"), "media_conversations", ["user_id"], unique=False)

    # -----
    # conversation_messages
    # -----
    if "conversation_messages" not in existing_tables:
        op.create_table(
            "conversation_messages",
            sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column("conversation_id", postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column("user_id", sa.String(), nullable=False),
            sa.Column("role", sa.String(), nullable=False),
            sa.Column("content", sa.Text(), nullable=False),
            sa.Column("meta", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
            sa.ForeignKeyConstraint(["conversation_id"], ["media_conversations.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
        )

        op.create_index(op.f("ix_conversation_messages_conversation_id"), "conversation_messages", ["conversation_id"], unique=False)
        op.create_index("ix_conversation_messages_convo_created_at", "conversation_messages", ["conversation_id", "created_at"], unique=False)
        op.create_index(op.f("ix_conversation_messages_user_id"), "conversation_messages", ["user_id"], unique=False)


def downgrade() -> None:
    bind = op.get_bind()
    insp = inspect(bind)
    existing_tables = set(insp.get_table_names(schema="public"))

    # Drop conversation_messages first (depends on media_conversations)
    if "conversation_messages" in existing_tables:
        op.drop_index(op.f("ix_conversation_messages_user_id"), table_name="conversation_messages")
        op.drop_index("ix_conversation_messages_convo_created_at", table_name="conversation_messages")
        op.drop_index(op.f("ix_conversation_messages_conversation_id"), table_name="conversation_messages")
        op.drop_table("conversation_messages")

    # Drop media_conversations
    if "media_conversations" in existing_tables:
        op.drop_index(op.f("ix_media_conversations_user_id"), table_name="media_conversations")
        op.drop_index("ix_media_conversations_media_user", table_name="media_conversations")
        op.drop_index(op.f("ix_media_conversations_media_id"), table_name="media_conversations")
        op.drop_index(op.f("ix_media_conversations_job_id"), table_name="media_conversations")
        op.drop_table("media_conversations")
