"""add discount_percent to promocodes, promocode fields to orders

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8
Create Date: 2026-06-29 15:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'd4e5f6a7b8c9'
down_revision: Union[str, Sequence[str], None] = 'c3d4e5f6a7b8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('promocodes', sa.Column('discount_percent', sa.Integer(), nullable=True, server_default='100'))
    op.add_column('orders', sa.Column('promocode_id', sa.Integer(), sa.ForeignKey('promocodes.id'), nullable=True))
    op.add_column('orders', sa.Column('promocode_code', sa.String(10), nullable=True))
    op.add_column('orders', sa.Column('discount_amount', sa.Numeric(10, 2), nullable=True, server_default='0'))
    op.add_column('orders', sa.Column('original_total', sa.Numeric(10, 2), nullable=True))


def downgrade() -> None:
    op.drop_column('orders', 'original_total')
    op.drop_column('orders', 'discount_amount')
    op.drop_column('orders', 'promocode_code')
    op.drop_column('orders', 'promocode_id')
    op.drop_column('promocodes', 'discount_percent')
