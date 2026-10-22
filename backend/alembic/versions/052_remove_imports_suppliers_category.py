"""requests: remove imports_suppliers category

Revision ID: 052
Revises: 051
Create Date: 2026-10-22
"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = '052'
down_revision: Union[str, Sequence[str], None] = '051'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        "DELETE FROM request_categories WHERE code = 'imports_suppliers'"
    )


def downgrade() -> None:
    op.execute(
        "INSERT INTO request_categories "
        "(id, name, code, allowed_roles, response_minutes, resolve_minutes, "
        "is_active, sort_order, created_at) "
        "VALUES (9, 'Поставщики и импорт', 'imports_suppliers', "
        "NULL, 240, 1440, true, 90, now()) "
        "ON CONFLICT (code) DO NOTHING"
    )
