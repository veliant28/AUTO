"""timesheet manual edits: overrides table + attendance.edit permission

Revision ID: 031
Revises: 030
Create Date: 2026-09-03
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '031'
down_revision: Union[str, Sequence[str], None] = '030'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Ручные правки часов в табеле (отдельно от сессий фиксации — авто-фиксация
    # их не затирает; значение дня = правка, если есть, иначе авторасчёт)
    op.create_table(
        'timesheet_overrides',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('work_date', sa.String(10), nullable=False),
        sa.Column('minutes', sa.Integer(), nullable=False),
        sa.Column('updated_by_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint('user_id', 'work_date', name='uq_timesheet_override_user_date'),
    )
    op.create_index('ix_timesheet_overrides_user_id', 'timesheet_overrides', ['user_id'])
    op.create_index('ix_timesheet_overrides_work_date', 'timesheet_overrides', ['work_date'])

    # История правок: кто из администраторов, когда, что было → стало
    op.create_table(
        'timesheet_override_log',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('work_date', sa.String(10), nullable=False),
        sa.Column('minutes_before', sa.Integer(), nullable=True),
        sa.Column('minutes_after', sa.Integer(), nullable=True),
        sa.Column('changed_by_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('changed_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index('ix_timesheet_override_log_user_id', 'timesheet_override_log', ['user_id'])
    op.create_index('ix_timesheet_override_log_work_date', 'timesheet_override_log', ['work_date'])
    op.create_index('ix_timesheet_override_log_changed_at', 'timesheet_override_log', ['changed_at'])

    conn = op.get_bind()
    # Страница ролей: просмотр и редактирование табеля в одной группе «Табель»
    conn.execute(
        sa.text("UPDATE permissions SET group_name = 'Табель' WHERE codename = 'attendance.view'")
    )
    conn.execute(
        sa.text(
            "INSERT INTO permissions (id, codename, description, group_name) "
            "SELECT COALESCE((SELECT MAX(id) FROM permissions), 0) + 1, "
            "'attendance.edit', 'Редактирование табеля: ручное проставление часов', 'Табель' "
            "WHERE NOT EXISTS (SELECT 1 FROM permissions WHERE codename = 'attendance.edit')"
        )
    )
    # Редактирование по умолчанию — только администраторы (просмотр уже у всех staff-ролей)
    conn.execute(
        sa.text(
            "INSERT INTO role_permissions (role_id, permission_id) "
            "SELECT r.id, p.id FROM roles r, permissions p "
            "WHERE r.name = 'admin' AND p.codename = 'attendance.edit' "
            "AND NOT EXISTS ("
            "  SELECT 1 FROM role_permissions x "
            "  WHERE x.role_id = r.id AND x.permission_id = p.id"
            ")"
        )
    )
    op.execute("SELECT setval('permissions_id_seq', (SELECT MAX(id) FROM permissions))")


def downgrade() -> None:
    conn = op.get_bind()
    conn.execute(
        sa.text(
            "DELETE FROM role_permissions WHERE role_id IN "
            "(SELECT id FROM roles WHERE name = 'admin') AND permission_id IN "
            "(SELECT id FROM permissions WHERE codename = 'attendance.edit')"
        )
    )
    conn.execute(
        sa.text("DELETE FROM permissions WHERE codename = 'attendance.edit'")
    )
    conn.execute(
        sa.text("UPDATE permissions SET group_name = 'Attendance' WHERE codename = 'attendance.view'")
    )
    op.execute("SELECT setval('permissions_id_seq', (SELECT MAX(id) FROM permissions))")

    op.drop_index('ix_timesheet_override_log_changed_at', table_name='timesheet_override_log')
    op.drop_index('ix_timesheet_override_log_work_date', table_name='timesheet_override_log')
    op.drop_index('ix_timesheet_override_log_user_id', table_name='timesheet_override_log')
    op.drop_table('timesheet_override_log')

    op.drop_index('ix_timesheet_overrides_work_date', table_name='timesheet_overrides')
    op.drop_index('ix_timesheet_overrides_user_id', table_name='timesheet_overrides')
    op.drop_table('timesheet_overrides')
