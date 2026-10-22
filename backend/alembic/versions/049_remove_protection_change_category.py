"""requests: remove protection_change category

Revision ID: 049
Revises: 048
Create Date: 2026-10-22
"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = '049'
down_revision: Union[str, Sequence[str], None] = '048'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        "DELETE FROM request_categories WHERE code = 'protection_change'"
    )


def downgrade() -> None:
    op.execute(
        "INSERT INTO request_categories "
        "(id, name, code, allowed_roles, response_minutes, resolve_minutes, "
        "is_active, sort_order, created_at) "
        "VALUES (10, 'Изменение защиты (белый список)', 'protection_change', "
        "NULL, 60, 480, true, 100, now()) "
        "ON CONFLICT (code) DO NOTHING"
    )
