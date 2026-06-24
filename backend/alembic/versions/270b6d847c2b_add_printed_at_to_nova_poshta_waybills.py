"""add printed_at to nova_poshta_waybills

Revision ID: 270b6d847c2b
Revises: 9787d25996a1
Create Date: 2026-06-24 13:27:50.686145

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '270b6d847c2b'
down_revision: Union[str, Sequence[str], None] = '9787d25996a1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('order_nova_poshta_waybills', sa.Column('printed_at', sa.DateTime(), nullable=True))


def downgrade() -> None:
    op.drop_column('order_nova_poshta_waybills', 'printed_at')
