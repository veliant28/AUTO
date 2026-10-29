"""requests: permission to assign an executor

Revision ID: 054
Revises: 053
Create Date: 2026-10-28
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "054"
down_revision: Union[str, Sequence[str], None] = "053"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


PERMISSION = (
    "requests.assign",
    "Назначение исполнителя заявки",
)
# По умолчанию право остаётся только у админа — как было до выделения
ROLES = ("admin",)


def upgrade() -> None:
    conn = op.get_bind()
    codename, description = PERMISSION

    conn.execute(
        sa.text(
            "INSERT INTO permissions (id, codename, description, group_name) "
            "SELECT COALESCE((SELECT MAX(id) FROM permissions), 0) + 1, "
            "CAST(:codename AS VARCHAR), CAST(:description AS VARCHAR), 'Заявки' "
            "WHERE NOT EXISTS ("
            "  SELECT 1 FROM permissions WHERE codename = CAST(:codename AS VARCHAR)"
            ")"
        ),
        {"codename": codename, "description": description},
    )

    for role_name in ROLES:
        conn.execute(
            sa.text(
                "INSERT INTO role_permissions (role_id, permission_id) "
                "SELECT r.id, p.id FROM roles r, permissions p "
                "WHERE r.name = CAST(:role_name AS VARCHAR) "
                "AND p.codename = CAST(:codename AS VARCHAR) "
                "AND NOT EXISTS ("
                "  SELECT 1 FROM role_permissions x "
                "  WHERE x.role_id = r.id AND x.permission_id = p.id"
                ")"
            ),
            {"role_name": role_name, "codename": codename},
        )

    op.execute("SELECT setval('permissions_id_seq', (SELECT MAX(id) FROM permissions))")


def downgrade() -> None:
    codename, _description = PERMISSION
    conn = op.get_bind()
    conn.execute(
        sa.text(
            "DELETE FROM role_permissions WHERE permission_id IN "
            "(SELECT id FROM permissions WHERE codename = :codename)"
        ),
        {"codename": codename},
    )
    conn.execute(
        sa.text("DELETE FROM permissions WHERE codename = :codename"),
        {"codename": codename},
    )
    op.execute("SELECT setval('permissions_id_seq', (SELECT MAX(id) FROM permissions))")
