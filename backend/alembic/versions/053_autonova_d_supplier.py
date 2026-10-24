"""add Autonova D supplier, client_id and retail_price

Revision ID: 053
Revises: 052
Create Date: 2026-10-24
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "053"
down_revision: Union[str, Sequence[str], None] = "052"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


AUTONOVA_SUPPLIER = "AUTONOVA-D"
AUTONOVA_DEV_URL = "https://api.autonovad.ua/dev"


def upgrade() -> None:
    op.add_column(
        "supplier_configs",
        sa.Column("client_id", sa.String(), nullable=True),
    )
    op.add_column(
        "supplier_prices",
        sa.Column("retail_price", sa.Numeric(10, 2), nullable=True),
    )

    conn = op.get_bind()
    conn.execute(
        sa.text(
            "INSERT INTO supplier_configs (supplier, login, api_url) "
            "VALUES (:supplier, '', :api_url) "
            "ON CONFLICT (supplier) DO NOTHING"
        ),
        {"supplier": AUTONOVA_SUPPLIER, "api_url": AUTONOVA_DEV_URL},
    )

    existing = conn.execute(
        sa.text("SELECT id FROM suppliers WHERE name = :name"),
        {"name": AUTONOVA_SUPPLIER},
    ).fetchone()
    if not existing:
        conn.execute(
            sa.text("INSERT INTO suppliers (name) VALUES (:name)"),
            {"name": AUTONOVA_SUPPLIER},
        )

    existing_schedule = conn.execute(
        sa.text("SELECT id FROM import_schedules WHERE supplier = :name"),
        {"name": AUTONOVA_SUPPLIER},
    ).fetchone()
    if not existing_schedule:
        conn.execute(
            sa.text(
                "INSERT INTO import_schedules (supplier, enabled, run_at_time) "
                "VALUES (:name, FALSE, '04:00')"
            ),
            {"name": AUTONOVA_SUPPLIER},
        )


def downgrade() -> None:
    conn = op.get_bind()
    conn.execute(
        sa.text("DELETE FROM import_schedules WHERE supplier = :name"),
        {"name": AUTONOVA_SUPPLIER},
    )
    conn.execute(
        sa.text("DELETE FROM supplier_configs WHERE supplier = :name"),
        {"name": AUTONOVA_SUPPLIER},
    )
    op.drop_column("supplier_prices", "retail_price")
    op.drop_column("supplier_configs", "client_id")
