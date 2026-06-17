"""add_order_change_log_and_updated_by

Revision ID: 56071044aa35
Revises: 019
Create Date: 2026-06-17 11:57:58.002856

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '56071044aa35'
down_revision: Union[str, Sequence[str], None] = '019'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('order_change_logs',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('order_id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=True),
        sa.Column('user_name', sa.String(), nullable=True),
        sa.Column('user_group', sa.String(), nullable=True),
        sa.Column('action', sa.String(), nullable=False),
        sa.Column('details', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['order_id'], ['orders.id'], ),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.add_column('orders', sa.Column('updated_by_user_id', sa.Integer(), nullable=True))
    op.add_column('orders', sa.Column('updated_by_name', sa.String(), nullable=True))
    op.add_column('orders', sa.Column('updated_by_group', sa.String(), nullable=True))
    op.add_column('orders', sa.Column('updated_at', sa.DateTime(), nullable=True))
    op.create_foreign_key(None, 'orders', 'users', ['updated_by_user_id'], ['id'])


def downgrade() -> None:
    op.drop_constraint(None, 'orders', type_='foreignkey')
    op.drop_column('orders', 'updated_at')
    op.drop_column('orders', 'updated_by_group')
    op.drop_column('orders', 'updated_by_name')
    op.drop_column('orders', 'updated_by_user_id')
    op.drop_table('order_change_logs')
