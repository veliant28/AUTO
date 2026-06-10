"""add pricing_apply_snapshots table

Revision ID: 013
Revises: 012
Create Date: 2026-06-10
"""
from alembic import op
import sqlalchemy as sa

revision = '013'
down_revision = '012'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'pricing_apply_snapshots',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('applied_at', sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column('general_margin', sa.Numeric(6, 2), nullable=True),
        sa.Column('category_margins', sa.Text(), nullable=True),
    )


def downgrade():
    op.drop_table('pricing_apply_snapshots')
