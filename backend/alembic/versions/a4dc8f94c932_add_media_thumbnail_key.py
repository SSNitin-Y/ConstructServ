"""add media.thumbnail_key

Revision ID: a4dc8f94c932
Revises: 50acb437d7b2
Create Date: 2026-01-12 17:42:56.555378

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a4dc8f94c932'
down_revision: Union[str, Sequence[str], None] = '50acb437d7b2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("media", sa.Column("thumbnail_key", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("media", "thumbnail_key")