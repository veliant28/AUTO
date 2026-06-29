"""add nova poshta ref fields to users

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-06-29 13:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'b2c3d4e5f6a7'
down_revision: Union[str, Sequence[str], None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('users', sa.Column('delivery_city_ref', sa.String(), nullable=True))
    op.add_column('users', sa.Column('delivery_settlement_ref', sa.String(), nullable=True))
    op.add_column('users', sa.Column('delivery_city_label', sa.String(), nullable=True))
    op.add_column('users', sa.Column('delivery_warehouse_ref', sa.String(), nullable=True))
    op.add_column('users', sa.Column('delivery_warehouse_label', sa.String(), nullable=True))
    op.add_column('users', sa.Column('delivery_street_ref', sa.String(), nullable=True))
    op.add_column('users', sa.Column('delivery_street_label', sa.String(), nullable=True))
    op.add_column('users', sa.Column('delivery_house', sa.String(), nullable=True))
    op.add_column('users', sa.Column('delivery_apartment', sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column('users', 'delivery_apartment')
    op.drop_column('users', 'delivery_house')
    op.drop_column('users', 'delivery_street_label')
    op.drop_column('users', 'delivery_street_ref')
    op.drop_column('users', 'delivery_warehouse_label')
    op.drop_column('users', 'delivery_warehouse_ref')
    op.drop_column('users', 'delivery_city_label')
    op.drop_column('users', 'delivery_settlement_ref')
    op.drop_column('users', 'delivery_city_ref')
