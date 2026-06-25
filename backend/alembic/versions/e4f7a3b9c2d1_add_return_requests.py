"""add return requests tables and first_delivered_at

Revision ID: e4f7a3b9c2d1
Revises: dc3a5f8e4b91
Create Date: 2026-06-25

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = 'e4f7a3b9c2d1'
down_revision: Union[str, Sequence[str], None] = 'dc3a5f8e4b91'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create return_requests table - use sa.Enum with create_type=True (default)
    op.create_table(
        'return_requests',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('return_number', sa.String(20), nullable=False),
        sa.Column('order_id', sa.Integer(), sa.ForeignKey('orders.id'), nullable=False),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('status', sa.Enum('PENDING', 'APPROVED', 'REJECTED', 'COMPLETED', name='returnstatus', create_type=True), nullable=False, server_default='PENDING'),
        sa.Column('total_refund', sa.Numeric(10, 2), nullable=False, server_default='0'),
        sa.Column('admin_notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now()),
        sa.Column('approved_at', sa.DateTime(), nullable=True),
        sa.Column('completed_at', sa.DateTime(), nullable=True),
        sa.Column('approved_by_user_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_return_requests_return_number'), 'return_requests', ['return_number'], unique=True)
    op.create_index(op.f('ix_return_requests_order_id'), 'return_requests', ['order_id'])
    op.create_index(op.f('ix_return_requests_user_id'), 'return_requests', ['user_id'])
    op.create_index(op.f('ix_return_requests_status'), 'return_requests', ['status'])

    # Create return_items table
    op.create_table(
        'return_items',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('return_request_id', sa.Integer(), sa.ForeignKey('return_requests.id'), nullable=False),
        sa.Column('part_id', sa.Integer(), sa.ForeignKey('parts.id'), nullable=False),
        sa.Column('article', sa.String(), nullable=False),
        sa.Column('part_name', sa.String(), nullable=False),
        sa.Column('brand', sa.String(), nullable=True),
        sa.Column('quantity', sa.Integer(), nullable=False),
        sa.Column('price', sa.Numeric(10, 2), nullable=False),
        sa.Column('total', sa.Numeric(10, 2), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_return_items_return_request_id'), 'return_items', ['return_request_id'])

    # Add first_delivered_at to orders
    op.add_column('orders', sa.Column('first_delivered_at', sa.DateTime(), nullable=True))


def downgrade() -> None:
    op.drop_column('orders', 'first_delivered_at')
    op.drop_table('return_items')
    op.drop_table('return_requests')
    op.execute('DROP TYPE IF EXISTS returnstatus')
