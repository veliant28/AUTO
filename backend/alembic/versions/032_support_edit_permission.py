"""support.edit permission + chat message edited_at + roles group rename

Revision ID: 032
Revises: 031
Create Date: 2026-09-03
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '032'
down_revision: Union[str, Sequence[str], None] = '031'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()

    # Группа «Табель» → английское «Attendance», как у остальных групп на
    # странице ролей (названия групп в модалке показываются как есть)
    conn.execute(
        sa.text(
            "UPDATE permissions SET group_name = 'Attendance' "
            "WHERE group_name = 'Табель' AND codename IN ('attendance.view', 'attendance.edit')"
        )
    )

    # Право на редактирование сообщений чата поддержки
    conn.execute(
        sa.text(
            "INSERT INTO permissions (id, codename, description, group_name) "
            "SELECT COALESCE((SELECT MAX(id) FROM permissions), 0) + 1, "
            "'support.edit', 'Редактирование сообщений в чате поддержки', 'Support' "
            "WHERE NOT EXISTS (SELECT 1 FROM permissions WHERE codename = 'support.edit')"
        )
    )
    # По умолчанию — только администраторы
    conn.execute(
        sa.text(
            "INSERT INTO role_permissions (role_id, permission_id) "
            "SELECT r.id, p.id FROM roles r, permissions p "
            "WHERE r.name = 'admin' AND p.codename = 'support.edit' "
            "AND NOT EXISTS ("
            "  SELECT 1 FROM role_permissions x "
            "  WHERE x.role_id = r.id AND x.permission_id = p.id"
            ")"
        )
    )
    op.execute("SELECT setval('permissions_id_seq', (SELECT MAX(id) FROM permissions))")

    # Метка «сообщение изменено» (naive UTC, как остальные даты бэкенда)
    op.add_column('chat_messages', sa.Column('edited_at', sa.DateTime(), nullable=True))


def downgrade() -> None:
    conn = op.get_bind()
    conn.execute(
        sa.text(
            "DELETE FROM role_permissions WHERE role_id IN "
            "(SELECT id FROM roles WHERE name = 'admin') AND permission_id IN "
            "(SELECT id FROM permissions WHERE codename = 'support.edit')"
        )
    )
    conn.execute(
        sa.text("DELETE FROM permissions WHERE codename = 'support.edit'")
    )
    conn.execute(
        sa.text(
            "UPDATE permissions SET group_name = 'Табель' "
            "WHERE group_name = 'Attendance' AND codename IN ('attendance.view', 'attendance.edit')"
        )
    )
    op.execute("SELECT setval('permissions_id_seq', (SELECT MAX(id) FROM permissions))")

    op.drop_column('chat_messages', 'edited_at')
