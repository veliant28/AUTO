"""grant checkbox.view to operator by default (receipt buttons in OrderDetailModal)

Revision ID: 028
Revises: 027
Create Date: 2026-08-06
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '028'
down_revision: Union[str, Sequence[str], None] = '027'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Выдаём checkbox.view оператору (admin/manager уже имеют его по умолчанию)."""
    conn = op.get_bind()
    conn.execute(
        sa.text(
            "INSERT INTO role_permissions (role_id, permission_id) "
            "SELECT r.id, p.id FROM roles r, permissions p "
            "WHERE r.name = 'operator' AND p.codename = 'checkbox.view' "
            "AND NOT EXISTS ("
            "  SELECT 1 FROM role_permissions x "
            "  WHERE x.role_id = r.id AND x.permission_id = p.id"
            ")"
        )
    )


def downgrade() -> None:
    conn = op.get_bind()
    conn.execute(
        sa.text(
            "DELETE FROM role_permissions WHERE role_id IN "
            "(SELECT id FROM roles WHERE name = 'operator') AND permission_id IN "
            "(SELECT id FROM permissions WHERE codename = 'checkbox.view')"
        )
    )