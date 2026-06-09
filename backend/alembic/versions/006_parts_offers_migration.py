"""create Part + SupplierOffer from SupplierPrice data (idempotent)

Revision ID: 006
Revises: 005
Create Date: 2026-06-08

"""
from typing import Sequence, Union
from alembic import op
from sqlalchemy import text

revision: str = '006'
down_revision: Union[str, None] = '005'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()

    # ===== SCHEMA CHANGES (idempotent, raw SQL) =====
    conn.execute(text("ALTER TABLE parts ADD COLUMN IF NOT EXISTS brand VARCHAR"))
    conn.execute(text("ALTER TABLE parts ADD COLUMN IF NOT EXISTS sku VARCHAR"))
    conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS ix_parts_sku ON parts (sku)"))

    # Drop old article-only unique index, create composite (article, brand) unique index
    conn.execute(text("DROP INDEX IF EXISTS ix_parts_article"))
    conn.execute(text(
        "CREATE UNIQUE INDEX IF NOT EXISTS ix_parts_article_brand "
        "ON parts (article, COALESCE(brand, ''))"
    ))

    conn.execute(text("ALTER TABLE supplier_offers ADD COLUMN IF NOT EXISTS stock_regions JSON"))
    conn.execute(text("ALTER TABLE supplier_offers ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP"))

    conn.execute(text("ALTER TABLE supplier_offers DROP CONSTRAINT IF EXISTS uq_supplier_offers_part_supplier"))
    conn.execute(text("ALTER TABLE supplier_offers ADD CONSTRAINT uq_supplier_offers_part_supplier UNIQUE (part_id, supplier_id)"))

    conn.execute(text("ALTER TABLE supplier_prices ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP"))

    # ===== DATA CLEANUP (remove partial data from previous failed runs) =====
    conn.execute(text("DELETE FROM supplier_offers"))
    conn.execute(text("DELETE FROM parts"))
    conn.execute(text("DELETE FROM suppliers"))

    # ===== DATA MIGRATION =====

    # 1. Set updated_at for existing supplier_prices
    conn.execute(text("UPDATE supplier_prices SET updated_at = NOW() WHERE updated_at IS NULL"))

    # 2. Create supplier records
    for name in ('UTR', 'GPL'):
        conn.execute(text("INSERT INTO suppliers (name) VALUES (:n)"), {"n": name})

    # 3. Create Parts from distinct (article, brand) pairs
    conn.execute(text("""
        INSERT INTO parts (article, brand_id, name, brand, sku)
        SELECT DISTINCT ON (LOWER(article), LOWER(COALESCE(brand, '')))
            article,
            COALESCE(tecdoc_brand_id, 0),
            COALESCE(name, ''),
            COALESCE(brand, ''),
            sku
        FROM supplier_prices
        WHERE sku IS NOT NULL
        ORDER BY LOWER(article), LOWER(COALESCE(brand, '')), updated_at DESC NULLS LAST
    """))

    # 4. Create SupplierOffers (match by article AND brand)
    conn.execute(text("""
        INSERT INTO supplier_offers (part_id, supplier_id, price, currency, quantity, stock_regions, updated_at)
        SELECT DISTINCT ON (p.id, s.id)
            p.id,
            s.id,
            COALESCE(sp.price, 0),
            COALESCE(sp.currency, 'UAH'),
            COALESCE(sp.stock_total, 0),
            sp.stock_regions,
            COALESCE(sp.updated_at, NOW())
        FROM supplier_prices sp
        JOIN parts p
            ON LOWER(p.article) = LOWER(sp.article)
            AND LOWER(COALESCE(p.brand, '')) = LOWER(COALESCE(sp.brand, ''))
        JOIN suppliers s ON s.name = sp.supplier
        WHERE sp.sku IS NOT NULL
        ORDER BY p.id, s.id, sp.updated_at DESC NULLS LAST
    """))

    part_count = conn.execute(text("SELECT COUNT(*) FROM parts")).scalar()
    offer_count = conn.execute(text("SELECT COUNT(*) FROM supplier_offers")).scalar()
    print(f"Migration complete: {part_count} Parts, {offer_count} SupplierOffers")


def downgrade() -> None:
    conn = op.get_bind()
    conn.execute(text("DROP INDEX IF EXISTS ix_parts_article_brand"))
    conn.execute(text("DROP INDEX IF EXISTS ix_parts_sku"))
    conn.execute(text("ALTER TABLE parts DROP COLUMN IF EXISTS sku"))
    conn.execute(text("ALTER TABLE parts DROP COLUMN IF EXISTS brand"))
    conn.execute(text("ALTER TABLE supplier_offers DROP CONSTRAINT IF EXISTS uq_supplier_offers_part_supplier"))
    conn.execute(text("ALTER TABLE supplier_offers DROP COLUMN IF EXISTS updated_at"))
    conn.execute(text("ALTER TABLE supplier_offers DROP COLUMN IF EXISTS stock_regions"))
    conn.execute(text("ALTER TABLE supplier_prices DROP COLUMN IF EXISTS updated_at"))
    conn.execute(text("DELETE FROM supplier_offers"))
    conn.execute(text("DELETE FROM parts"))
