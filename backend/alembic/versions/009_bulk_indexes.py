"""add unique indexes for bulk upsert

Revision ID: 009
Revises: 008
Create Date: 2026-06-09
"""
from alembic import op
import sqlalchemy as sa

revision = '009'
down_revision = '008'
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()
    # Deduplicate supplier_prices: keep latest row per (supplier, article)
    conn.execute(sa.text("""
        DELETE FROM supplier_prices WHERE id NOT IN (
            SELECT id FROM (
                SELECT DISTINCT ON (supplier, article) id
                FROM supplier_prices
                ORDER BY supplier, article, updated_at DESC NULLS LAST
            ) AS kept
        )
    """))
    op.create_unique_constraint(
        'uq_supplier_prices_supplier_article',
        'supplier_prices',
        ['supplier', 'article'],
    )
    op.create_unique_constraint(
        'uq_parts_article_brand',
        'parts',
        ['article', 'brand'],
    )


def downgrade():
    op.drop_constraint('uq_parts_article_brand', 'parts')
    op.drop_constraint('uq_supplier_prices_supplier_article', 'supplier_prices')
