"""add service_params column to waybills

Revision ID: 5cd4c1fc3c2f
Revises: c89ef69bf26e
Create Date: 2026-06-21 16:06:01.917000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '5cd4c1fc3c2f'
down_revision: Union[str, Sequence[str], None] = 'c89ef69bf26e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add service_params JSON column to order_nova_poshta_waybills."""
    op.add_column(
        'order_nova_poshta_waybills',
        sa.Column('service_params', sa.JSON(), nullable=True),
    )


def downgrade() -> None:
    """Drop service_params column from order_nova_poshta_waybills."""
    op.drop_column('order_nova_poshta_waybills', 'service_params')
