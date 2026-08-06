"""ensure monitor.view granted to operator/manager/admin by default

Revision ID: 026
Revises: 025
Create Date: 2026-08-06
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '026'
down_revision: Union[str, Sequence[str], None] = '025'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Роли, которым монитор и модалка клиента доступны по умолчанию
ASSIGN_ROLES = ['operator', 'manager', 'admin']


def upgrade() -> None:
    conn = op.get_bind()
    # Permission, если его ещё нет (в 024 id ролей хардкодились — здесь по имени).
    # id считаем скалярным подзапросом: при уже существующем codename вставки нет,
    # а агрегат по пустому набору (COALESCE(MAX..)+1) дал бы id=1 — конфликт.
    conn.execute(
        sa.text(
            "INSERT INTO permissions (id, codename, description, group_name) "
            "SELECT COALESCE((SELECT MAX(id) FROM permissions), 0) + 1, "
            "'monitor.view', 'Просмотр мониторинга клиентов', 'Monitor' "
            "WHERE NOT EXISTS (SELECT 1 FROM permissions WHERE codename = 'monitor.view')"
        )
    )
    for role_name in ASSIGN_ROLES:
        conn.execute(
            sa.text(
                "INSERT INTO role_permissions (role_id, permission_id) "
                "SELECT r.id, p.id FROM roles r, permissions p "
                "WHERE r.name = :role_name AND p.codename = 'monitor.view' "
                "AND NOT EXISTS ("
                "  SELECT 1 FROM role_permissions x "
                "  WHERE x.role_id = r.id AND x.permission_id = p.id"
                ")"
            ),
            {"role_name": role_name},
        )
    op.execute("SELECT setval('permissions_id_seq', (SELECT MAX(id) FROM permissions))")


def downgrade() -> None:
    conn = op.get_bind()
    for role_name in ASSIGN_ROLES:
        conn.execute(
            sa.text(
                "DELETE FROM role_permissions WHERE role_id IN "
                "(SELECT id FROM roles WHERE name = :role_name) AND permission_id IN "
                "(SELECT id FROM permissions WHERE codename = 'monitor.view')"
            ),
            {"role_name": role_name},
        )
    # Сам permission не удаляем — он мог быть создан не этой миграцией.
