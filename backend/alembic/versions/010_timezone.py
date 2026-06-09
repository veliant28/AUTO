"""add timezone to site_settings

Revision ID: 010
Revises: 009
Create Date: 2026-06-09
"""
from alembic import op
import sqlalchemy as sa

revision = '010'
down_revision = '009'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('site_settings', sa.Column('timezone', sa.String(), nullable=False, server_default='Europe/Kiev'))


def downgrade():
    op.drop_column('site_settings', 'timezone')
