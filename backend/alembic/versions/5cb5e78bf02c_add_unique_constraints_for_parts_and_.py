"""add unique constraints for parts and supplier_offers

Revision ID: 5cb5e78bf02c
Revises: 0effb110f9a6
Create Date: 2026-06-26 15:38:35.444295

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '5cb5e78bf02c'
down_revision: Union[str, Sequence[str], None] = '0effb110f9a6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_parts_article_brand "
        "ON parts (article, COALESCE(brand, ''))"
    )
    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_supplier_offers_part_supplier "
        "ON supplier_offers (part_id, supplier_id)"
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.execute("DROP INDEX IF EXISTS uq_parts_article_brand")
    op.execute("DROP INDEX IF EXISTS uq_supplier_offers_part_supplier")
