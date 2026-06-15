"""add stage_progress_start and stage_started_at to price_imports

Revision ID: 017
Revises: 016
Create Date: 2026-06-15
"""
from alembic import op
import sqlalchemy as sa

revision = '017'
down_revision = '016'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('price_imports', sa.Column('stage_progress_start', sa.Integer(), nullable=True))
    op.add_column('price_imports', sa.Column('stage_started_at', sa.DateTime(), nullable=True))


def downgrade():
    op.drop_column('price_imports', 'stage_started_at')
    op.drop_column('price_imports', 'stage_progress_start')
