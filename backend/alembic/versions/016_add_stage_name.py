"""add stage_name column to price_imports

Revision ID: 016
Revises: 015
Create Date: 2026-06-14
"""
from alembic import op
import sqlalchemy as sa

revision = '016'
down_revision = '015'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('price_imports', sa.Column('stage_name', sa.String(), nullable=True))


def downgrade():
    op.drop_column('price_imports', 'stage_name')
