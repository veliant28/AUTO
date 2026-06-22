"""add third_person_ref column to waybills

Revision ID: 760e9bbe7a53
Revises: 5cd4c1fc3c2f
Create Date: 2026-06-22 12:09:04.536178

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '760e9bbe7a53'
down_revision: Union[str, Sequence[str], None] = '5cd4c1fc3c2f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add third_person_ref column to order_nova_poshta_waybills."""
    op.add_column('order_nova_poshta_waybills', sa.Column('third_person_ref', sa.String(length=36), nullable=True))


def downgrade() -> None:
    """Remove third_person_ref column."""
    op.drop_column('order_nova_poshta_waybills', 'third_person_ref')
