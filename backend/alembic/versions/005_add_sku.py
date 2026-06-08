"""add sku column to supplier_prices

Revision ID: 005
Revises: 004
Create Date: 2026-06-08

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
import random
import string


revision: str = '005'
down_revision: Union[str, None] = '004'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _generate_sku() -> str:
    brand = "SVOM"
    parts = []
    parts.append(''.join(random.choices(string.digits, k=random.randint(1, 3))))
    for i, letter in enumerate(brand):
        parts.append(letter)
        if i < len(brand) - 1:
            parts.append(''.join(random.choices(string.digits, k=random.randint(1, 3))))
    parts.append(''.join(random.choices(string.digits, k=random.randint(1, 3))))
    return ''.join(parts)


def upgrade() -> None:
    op.add_column('supplier_prices', sa.Column('sku', sa.String(), nullable=True))
    op.create_index('ix_supplier_prices_sku', 'supplier_prices', ['sku'], unique=True)

    conn = op.get_bind()
    ids = [row[0] for row in conn.execute(sa.text("SELECT id FROM supplier_prices WHERE sku IS NULL")).fetchall()]

    existing = set()
    for (sku,) in conn.execute(sa.text("SELECT sku FROM supplier_prices WHERE sku IS NOT NULL")).fetchall():
        existing.add(sku)

    for pid in ids:
        for _ in range(100):
            sku = _generate_sku()
            if sku not in existing:
                existing.add(sku)
                conn.execute(sa.text("UPDATE supplier_prices SET sku = :sku WHERE id = :id"), {"sku": sku, "id": pid})
                break


def downgrade() -> None:
    op.drop_index('ix_supplier_prices_sku', table_name='supplier_prices')
    op.drop_column('supplier_prices', 'sku')
