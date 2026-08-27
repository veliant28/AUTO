"""work-time tracking: settings + attendance_records + attendance.view

Revision ID: 029
Revises: 028
Create Date: 2026-08-27
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '029'
down_revision: Union[str, Sequence[str], None] = '028'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# Role IDs: 3 = operator, 4 = manager, 5 = admin
ASSIGN_ROLES = [3, 4, 5]


def upgrade() -> None:
    # Настройки рабочего времени персонала
    op.add_column('site_settings', sa.Column('work_start_time', sa.String(), nullable=False, server_default='09:00'))
    op.add_column('site_settings', sa.Column('work_end_time', sa.String(), nullable=False, server_default='18:00'))
    op.add_column('site_settings', sa.Column('track_admin', sa.Boolean(), nullable=False, server_default=sa.text('false')))
    op.add_column('site_settings', sa.Column('track_manager', sa.Boolean(), nullable=False, server_default=sa.text('false')))
    op.add_column('site_settings', sa.Column('track_operator', sa.Boolean(), nullable=False, server_default=sa.text('false')))

    # Фиксация входа/выхода: одна запись на пользователя в день (дата в tz настроек)
    op.create_table(
        'attendance_records',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('work_date', sa.String(10), nullable=False),
        sa.Column('clock_in_at', sa.DateTime(), nullable=False),
        sa.Column('clock_out_at', sa.DateTime(), nullable=True),
        sa.Column('auto_clock_out', sa.Boolean(), nullable=False, server_default=sa.text('false')),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint('user_id', 'work_date', name='uq_attendance_user_date'),
    )
    op.create_index('ix_attendance_records_user_id', 'attendance_records', ['user_id'])
    op.create_index('ix_attendance_records_work_date', 'attendance_records', ['work_date'])

    # Пермишен на просмотр фиксации и табеля
    conn = op.get_bind()
    conn.execute(
        sa.text(
            "INSERT INTO permissions (id, codename, description, group_name) "
            "SELECT COALESCE(MAX(id), 0) + 1, 'attendance.view', "
            "'Просмотр фиксации рабочего времени', 'Attendance' FROM permissions "
            "WHERE NOT EXISTS (SELECT 1 FROM permissions WHERE codename = 'attendance.view')"
        )
    )
    for role_id in ASSIGN_ROLES:
        conn.execute(
            sa.text(
                "INSERT INTO role_permissions (role_id, permission_id) "
                "SELECT :role_id, p.id FROM permissions p "
                "WHERE p.codename = 'attendance.view' "
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
                "(SELECT id FROM permissions WHERE codename = 'attendance.view')"
            ),
            {"role_id": role_id},
        )
    conn.execute(
        sa.text("DELETE FROM permissions WHERE codename = 'attendance.view'")
    )
    op.execute("SELECT setval('permissions_id_seq', (SELECT MAX(id) FROM permissions))")

    op.drop_index('ix_attendance_records_work_date', table_name='attendance_records')
    op.drop_index('ix_attendance_records_user_id', table_name='attendance_records')
    op.drop_table('attendance_records')

    op.drop_column('site_settings', 'track_operator')
    op.drop_column('site_settings', 'track_manager')
    op.drop_column('site_settings', 'track_admin')
    op.drop_column('site_settings', 'work_end_time')
    op.drop_column('site_settings', 'work_start_time')
