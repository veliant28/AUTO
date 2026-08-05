"""add monitor.view permission

Revision ID: 024
Revises: 023
Create Date: 2026-08-05
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '024'
down_revision: Union[str, Sequence[str], None] = '023'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# Role IDs: 3 = operator, 4 = manager, 5 = admin
ASSIGN_ROLES = [3, 4, 5]


def upgrade() -> None:
    conn = op.get_bind()
    # Id не хардкодим — в БД пермишены могли добавляться вручную через админку,
    # поэтому берём следующий свободный.
    conn.execute(
        sa.text(
            "INSERT INTO permissions (id, codename, description, group_name) "
            "SELECT COALESCE(MAX(id), 0) + 1, 'monitor.view', "
            "'Просмотр мониторинга клиентов', 'Monitor' FROM permissions "
            "WHERE NOT EXISTS (SELECT 1 FROM permissions WHERE codename = 'monitor.view')"
        )
    )
    for role_id in ASSIGN_ROLES:
        conn.execute(
            sa.text(
                "INSERT INTO role_permissions (role_id, permission_id) "
                "SELECT :role_id, p.id FROM permissions p "
                "WHERE p.codename = 'monitor.view' "
                "AND NOT EXISTS ("
                "  SELECT 1 FROM role_permissions x "
                "  WHERE x.role_id = :role_id2 AND x.permission_id = p.id"
                ")"
            ),
            {"role_id": role_id, "role_id2": role_id},
        )
    op.execute("SELECT setval('permissions_id_seq', (SELECT MAX(id) FROM permissions))")


def downgrade() -> None:
    conn = op.get_bind()
    for role_id in ASSIGN_ROLES:
        conn.execute(
            sa.text(
                "DELETE FROM role_permissions WHERE role_id = :role_id AND permission_id IN "
                "(SELECT id FROM permissions WHERE codename = 'monitor.view')"
            ),
            {"role_id": role_id},
        )
    conn.execute(
        sa.text("DELETE FROM permissions WHERE codename = 'monitor.view'")
    )
    op.execute("SELECT setval('permissions_id_seq', (SELECT MAX(id) FROM permissions))")
