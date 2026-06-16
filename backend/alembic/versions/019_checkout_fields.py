"""add checkout fields to orders

Revision ID: 019
Revises: 018
Create Date: 2026-06-16
"""
from alembic import op
import sqlalchemy as sa

revision = '019'
down_revision = '018'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('orders', sa.Column('last_name', sa.String(), nullable=True))
    op.add_column('orders', sa.Column('first_name', sa.String(), nullable=True))
    op.add_column('orders', sa.Column('middle_name', sa.String(), nullable=True))
    op.add_column('orders', sa.Column('delivery_type', sa.String(), nullable=True))
    op.add_column('orders', sa.Column('delivery_city', sa.String(), nullable=True))
    op.add_column('orders', sa.Column('delivery_warehouse', sa.String(), nullable=True))
    op.add_column('orders', sa.Column('payment_method', sa.String(), nullable=True))
    op.alter_column('orders', 'phone', type_=sa.String(), nullable=False)
    op.alter_column('orders', 'address', type_=sa.Text(), nullable=True)


def downgrade():
    op.drop_column('orders', 'payment_method')
    op.drop_column('orders', 'delivery_warehouse')
    op.drop_column('orders', 'delivery_city')
    op.drop_column('orders', 'delivery_type')
    op.drop_column('orders', 'middle_name')
    op.drop_column('orders', 'first_name')
    op.drop_column('orders', 'last_name')
    op.alter_column('orders', 'phone', type_=sa.String(), nullable=True)
    op.alter_column('orders', 'address', type_=sa.Text(), nullable=True)
