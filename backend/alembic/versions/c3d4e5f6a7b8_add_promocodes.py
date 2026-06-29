"""add promocodes table

Revision ID: c3d4e5f6a7b8
Revises: b2c3d4e5f6a7
Create Date: 2026-06-29 14:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'c3d4e5f6a7b8'
down_revision: Union[str, Sequence[str], None] = 'b2c3d4e5f6a7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('promocodes',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('code', sa.String(length=10), nullable=False),
        sa.Column('type', sa.String(), nullable=False),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=True),
        sa.Column('reason', sa.String(), nullable=False),
        sa.Column('issued_by_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('expires_at', sa.DateTime(), nullable=False),
        sa.Column('used_at', sa.DateTime(), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_promocodes_code', 'promocodes', ['code'], unique=True)
    op.create_index('idx_promocode_created', 'promocodes', ['created_at'])
    op.create_index('idx_promocode_user', 'promocodes', ['user_id'])
    op.create_index('idx_promocode_issued_by', 'promocodes', ['issued_by_id'])


def downgrade() -> None:
    op.drop_index('idx_promocode_issued_by')
    op.drop_index('idx_promocode_user')
    op.drop_index('idx_promocode_created')
    op.drop_index('ix_promocodes_code')
    op.drop_table('promocodes')
