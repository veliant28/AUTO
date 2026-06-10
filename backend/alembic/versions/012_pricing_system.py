"""add price_rules, price_rule_history and supplier_offers.final_price

Revision ID: 012
Revises: 011
Create Date: 2026-06-10
"""
from alembic import op
import sqlalchemy as sa

revision = '012'
down_revision = '011'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'price_rules',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('type', sa.String(20), nullable=False, server_default='general'),
        sa.Column('category_id', sa.Integer(), sa.ForeignKey('part_categories.id'), nullable=True),
        sa.Column('margin_percent', sa.Numeric(6, 2), nullable=False, server_default='0'),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.text('TRUE')),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now()),
    )

    op.create_table(
        'price_rule_history',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('price_rule_id', sa.Integer(), sa.ForeignKey('price_rules.id', ondelete='CASCADE'), nullable=False),
        sa.Column('old_percent', sa.Numeric(6, 2), nullable=False),
        sa.Column('new_percent', sa.Numeric(6, 2), nullable=False),
        sa.Column('changed_at', sa.DateTime(), server_default=sa.func.now()),
    )

    op.add_column('supplier_offers', sa.Column('final_price', sa.Numeric(10, 2), nullable=True))
    op.create_index('ix_supplier_offers_final_price', 'supplier_offers', ['final_price'])
    
    # Auto-cleanup history older than 30 days via pg_cron (optional) or we'll handle in Celery


def downgrade():
    op.drop_index('ix_supplier_offers_final_price', table_name='supplier_offers')
    op.drop_column('supplier_offers', 'final_price')
    op.drop_table('price_rule_history')
    op.drop_table('price_rules')
