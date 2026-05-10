"""add conversations tables

Revision ID: bacb3a5e75a3
Revises: 5360ca4e767e
Create Date: 2025-12-22 04:12:40.343386

"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "bacb3a5e75a3"
down_revision = "5360ca4e767e"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "media_conversations",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("media_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("media.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.String(), nullable=False),
        sa.Column("job_id", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_media_conversations_media_id", "media_conversations", ["media_id"])
    op.create_index("ix_media_conversations_user_id", "media_conversations", ["user_id"])
    op.create_index("ix_media_conversations_job_id", "media_conversations", ["job_id"])
    op.create_index("ix_media_conversations_media_user", "media_conversations", ["media_id", "user_id"])

    op.create_table(
        "conversation_messages",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("conversation_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("media_conversations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.String(), nullable=False),
        sa.Column("role", sa.String(), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("meta", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_conversation_messages_conversation_id", "conversation_messages", ["conversation_id"])
    op.create_index("ix_conversation_messages_user_id", "conversation_messages", ["user_id"])


def downgrade():
    op.drop_index("ix_conversation_messages_user_id", table_name="conversation_messages")
    op.drop_index("ix_conversation_messages_conversation_id", table_name="conversation_messages")
    op.drop_table("conversation_messages")

    op.drop_index("ix_media_conversations_media_user", table_name="media_conversations")
    op.drop_index("ix_media_conversations_job_id", table_name="media_conversations")
    op.drop_index("ix_media_conversations_user_id", table_name="media_conversations")
    op.drop_index("ix_media_conversations_media_id", table_name="media_conversations")
    op.drop_table("media_conversations")
