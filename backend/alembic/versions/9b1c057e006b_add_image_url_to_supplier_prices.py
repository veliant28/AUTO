"""add image_url to supplier_prices

Revision ID: 9b1c057e006b
Revises: 5cb5e78bf02c
Create Date: 2026-06-26 16:38:13.448336

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '9b1c057e006b'
down_revision: Union[str, Sequence[str], None] = '5cb5e78bf02c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('supplier_prices', sa.Column('image_url', sa.String(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('supplier_prices', 'image_url')
