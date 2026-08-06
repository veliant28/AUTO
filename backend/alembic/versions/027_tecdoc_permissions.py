"""create tecdoc.view / tecdoc.batch permissions and default grants

Revision ID: 027
Revises: 026
Create Date: 2026-08-06
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '027'
down_revision: Union[str, Sequence[str], None] = '026'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# id 18/19 в частях БД могли быть вставлены вручную — здесь гарантируем строки.
PERMS = [
    ('tecdoc.view', 'Просмотр TecDoc', 'TecDoc'),
    ('tecdoc.batch', 'Пакетная обработка TecDoc', 'TecDoc'),
]


def upgrade() -> None:
    conn = op.get_bind()
    # id считаем скалярным подзапросом: при уже существующем codename вставки нет.
    # Значения — литералы (не параметры): INSERT..SELECT без FROM не выводит тип
    # параметра (text vs varchar) — ошибка AmbiguousParameter.
    for codename, description, group in PERMS:
        conn.execute(
            sa.text(
                "INSERT INTO permissions (id, codename, description, group_name) "
                "SELECT COALESCE((SELECT MAX(id) FROM permissions), 0) + 1, "
                f"'{codename}', '{description}', '{group}' "
                f"WHERE NOT EXISTS (SELECT 1 FROM permissions WHERE codename = '{codename}')"
            )
        )
    # tecdoc.view — все три staff-роли, tecdoc.batch — только admin (как в текущей БД)
    for role_name in ['operator', 'manager', 'admin']:
        conn.execute(
            sa.text(
                "INSERT INTO role_permissions (role_id, permission_id) "
                "SELECT r.id, p.id FROM roles r, permissions p "
                "WHERE r.name = :role_name AND p.codename = 'tecdoc.view' "
                "AND NOT EXISTS ("
                "  SELECT 1 FROM role_permissions x "
                "  WHERE x.role_id = r.id AND x.permission_id = p.id"
                ")"
            ),
            {"role_name": role_name},
        )
    conn.execute(
        sa.text(
            "INSERT INTO role_permissions (role_id, permission_id) "
            "SELECT r.id, p.id FROM roles r, permissions p "
            "WHERE r.name = 'admin' AND p.codename = 'tecdoc.batch' "
            "AND NOT EXISTS ("
            "  SELECT 1 FROM role_permissions x "
            "  WHERE x.role_id = r.id AND x.permission_id = p.id"
            ")"
        )
    )
    op.execute("SELECT setval('permissions_id_seq', (SELECT MAX(id) FROM permissions))")


def downgrade() -> None:
    conn = op.get_bind()
    # Убираем только выданные этой миграцией grants; строки permissions не трогаем —
    # они могли существовать до неё.
    for codename in ('tecdoc.view', 'tecdoc.batch'):
        roles = "('operator','manager','admin')"
        if codename == 'tecdoc.batch':
            roles = "('admin')"
        conn.execute(
            sa.text(
                f"DELETE FROM role_permissions WHERE role_id IN "
                f"(SELECT id FROM roles WHERE name IN {roles}) AND permission_id IN "
                f"(SELECT id FROM permissions WHERE codename = :cn)"
            ),
            {"cn": codename},
        )