"""add avatar_index to users

Revision ID: 018
Revises: 017
Create Date: 2026-06-15
"""
from alembic import op
import sqlalchemy as sa

revision = '018'
down_revision = '017'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('users', sa.Column('avatar_index', sa.Integer(), nullable=True))


def downgrade():
    op.drop_column('users', 'avatar_index')
