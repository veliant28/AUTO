"""remove supplier article, refactor parts and supplier_prices

Revision ID: 100
Revises: 9498e8297b2e
Create Date: 2026-06-27

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = '100'
down_revision: str = '9498e8297b2e'
branch_labels = None
depends_on = None


def upgrade():
    # 1. Delete all existing product data (order preserved for FK safety)
    op.execute("DELETE FROM part_applicability")
    op.execute("DELETE FROM cart_items")
    op.execute("DELETE FROM favorites")
    op.execute("DELETE FROM order_items")
    op.execute("DELETE FROM return_items")
    op.execute("DELETE FROM supplier_offers")
    op.execute("DELETE FROM parts")

    # 2. Drop columns from parts
    op.execute("DROP INDEX IF EXISTS idx_part_supplier_article_brand")
    op.drop_column("parts", "supplier_article")
    op.drop_column("parts", "tecdoc_article")

    # 3. Add matched_at to parts
    op.add_column(
        "parts",
        sa.Column("matched_at", sa.DateTime(), nullable=True),
    )

    # 4. Transform supplier_prices: drop old article, rename tecdoc_article -> article
    op.drop_constraint("uq_supplier_prices_supplier_article", "supplier_prices", type_="unique")
    op.drop_column("supplier_prices", "article")
    op.alter_column("supplier_prices", "tecdoc_article",
                    new_column_name="article",
                    existing_type=sa.String(),
                    nullable=True)
    # Remove rows without article (can't be imported without manufacturer article)
    op.execute("DELETE FROM supplier_prices WHERE article IS NULL OR article = ''")
    op.alter_column("supplier_prices", "article",
                    existing_type=sa.String(),
                    nullable=False)
    # Remove duplicate (supplier, article) pairs — keep the row with highest id
    op.execute("""
        DELETE FROM supplier_prices sp1 USING (
            SELECT supplier, article, MAX(id) AS max_id
            FROM supplier_prices
            GROUP BY supplier, article
            HAVING COUNT(*) > 1
        ) sp2
        WHERE sp1.supplier = sp2.supplier
          AND sp1.article = sp2.article
          AND sp1.id < sp2.max_id
    """)
    op.create_index(op.f("ix_supplier_prices_article"), "supplier_prices", ["article"])
    op.create_unique_constraint("uq_supplier_prices_supplier_article",
                                "supplier_prices",
                                ["supplier", "article"])


def downgrade():
    # Reverse: restore columns (data cannot be recovered)
    op.drop_constraint("uq_supplier_prices_supplier_article", "supplier_prices", type_="unique")
    op.drop_index(op.f("ix_supplier_prices_article"), table_name="supplier_prices")
    op.alter_column("supplier_prices", "article",
                    new_column_name="tecdoc_article",
                    existing_type=sa.String(),
                    nullable=True)
    op.add_column(
        "supplier_prices",
        sa.Column("article", sa.String(), nullable=False),
    )
    op.create_unique_constraint("uq_supplier_prices_supplier_article",
                                "supplier_prices",
                                ["supplier", "article"])

    op.drop_column("parts", "matched_at")
    op.add_column(
        "parts",
        sa.Column("tecdoc_article", sa.String(), nullable=True, index=True),
    )
    op.add_column(
        "parts",
        sa.Column("supplier_article", sa.String(), nullable=True, index=True),
    )
    op.create_index("idx_part_supplier_article_brand", "parts", ["supplier_article", "brand"])
