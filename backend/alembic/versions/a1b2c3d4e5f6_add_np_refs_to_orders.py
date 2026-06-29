"""add nova poshta ref fields to orders

Revision ID: a1b2c3d4e5f6
Revises: c767e944ee9e
Create Date: 2026-06-29 12:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, Sequence[str], None] = '100'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('orders', sa.Column('delivery_city_ref', sa.String(), nullable=True))
    op.add_column('orders', sa.Column('delivery_settlement_ref', sa.String(), nullable=True))
    op.add_column('orders', sa.Column('delivery_city_label', sa.String(), nullable=True))
    op.add_column('orders', sa.Column('delivery_warehouse_ref', sa.String(), nullable=True))
    op.add_column('orders', sa.Column('delivery_warehouse_label', sa.String(), nullable=True))
    op.add_column('orders', sa.Column('delivery_street_ref', sa.String(), nullable=True))
    op.add_column('orders', sa.Column('delivery_street_label', sa.String(), nullable=True))
    op.add_column('orders', sa.Column('delivery_house', sa.String(), nullable=True))
    op.add_column('orders', sa.Column('delivery_apartment', sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column('orders', 'delivery_apartment')
    op.drop_column('orders', 'delivery_house')
    op.drop_column('orders', 'delivery_street_label')
    op.drop_column('orders', 'delivery_street_ref')
    op.drop_column('orders', 'delivery_warehouse_label')
    op.drop_column('orders', 'delivery_warehouse_ref')
    op.drop_column('orders', 'delivery_city_label')
    op.drop_column('orders', 'delivery_settlement_ref')
    op.drop_column('orders', 'delivery_city_ref')
