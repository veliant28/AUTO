"""add tecdoc_article to parts

Revision ID: 11bdf36d2f09
Revises: 9b1c057e006b
Create Date: 2026-06-26 19:18:39.361037

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '11bdf36d2f09'
down_revision: Union[str, Sequence[str], None] = '9b1c057e006b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('parts', sa.Column('tecdoc_article', sa.String(), nullable=True))
    op.create_index(op.f('ix_parts_tecdoc_article'), 'parts', ['tecdoc_article'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f('ix_parts_tecdoc_article'), table_name='parts')
    op.drop_column('parts', 'tecdoc_article')
