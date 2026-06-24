"""add order_number to orders

Revision ID: 0e83660433d8
Revises: 270b6d847c2b
Create Date: 2026-06-24 15:09:03.288820

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '0e83660433d8'
down_revision: Union[str, Sequence[str], None] = '270b6d847c2b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('orders', sa.Column('order_number', sa.String(length=20), nullable=True))
    op.create_index(op.f('ix_orders_order_number'), 'orders', ['order_number'], unique=True)
    # Backfill existing orders
    op.execute("UPDATE orders SET order_number = 'ORD-' || LPAD(id::text, 10, '0') WHERE order_number IS NULL")


def downgrade() -> None:
    op.drop_index(op.f('ix_orders_order_number'), table_name='orders')
    op.drop_column('orders', 'order_number')
