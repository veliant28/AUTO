"""add_unique_index_on_parts_article_brand

Revision ID: 4843a6209a5a
Revises: f54307c2b051
Create Date: 2026-07-03 12:45:00.000000

"""
from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = '4843a6209a5a'
down_revision: Union[str, Sequence[str], None] = 'f54307c2b051'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS ix_parts_article_brand "
        "ON parts (article, COALESCE(brand, ''))"
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.execute(
        "DROP INDEX IF EXISTS ix_parts_article_brand"
    )
