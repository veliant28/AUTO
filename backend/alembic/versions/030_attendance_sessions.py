"""attendance sessions: multiple clock in/out pairs per day

Revision ID: 030
Revises: 029
Create Date: 2026-08-27
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '030'
down_revision: Union[str, Sequence[str], None] = '029'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Сессии фиксации: одна пара вход/выход на строку, в день может быть несколько
    op.create_table(
        'attendance_sessions',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('work_date', sa.String(10), nullable=False),
        sa.Column('clock_in_at', sa.DateTime(), nullable=False),
        sa.Column('clock_out_at', sa.DateTime(), nullable=True),
        sa.Column('auto_clock_out', sa.Boolean(), nullable=False, server_default=sa.text('false')),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index('ix_attendance_sessions_user_id', 'attendance_sessions', ['user_id'])
    op.create_index('ix_attendance_sessions_work_date', 'attendance_sessions', ['work_date'])
    op.create_index('ix_attendance_sessions_user_date', 'attendance_sessions', ['user_id', 'work_date'])
    op.create_index('ix_attendance_sessions_open', 'attendance_sessions', ['clock_out_at'])

    # Переносим существующие записи (одна запись = одна сессия)
    op.execute(
        """
        INSERT INTO attendance_sessions
            (user_id, work_date, clock_in_at, clock_out_at, auto_clock_out, created_at, updated_at)
        SELECT user_id, work_date, clock_in_at, clock_out_at, auto_clock_out, created_at, updated_at
        FROM attendance_records
        """
    )

    op.drop_index('ix_attendance_records_user_id', table_name='attendance_records')
    op.drop_index('ix_attendance_records_work_date', table_name='attendance_records')
    op.drop_table('attendance_records')


def downgrade() -> None:
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

    # Восстанавливаем по одной (первой) сессии на пользователя в день
    op.execute(
        """
        INSERT INTO attendance_records
            (user_id, work_date, clock_in_at, clock_out_at, auto_clock_out, created_at, updated_at)
        SELECT DISTINCT ON (user_id, work_date) user_id, work_date, clock_in_at, clock_out_at,
               auto_clock_out, created_at, updated_at
        FROM attendance_sessions
        ORDER BY user_id, work_date, clock_in_at
        """
    )

    op.drop_index('ix_attendance_sessions_open', table_name='attendance_sessions')
    op.drop_index('ix_attendance_sessions_user_date', table_name='attendance_sessions')
    op.drop_index('ix_attendance_sessions_work_date', table_name='attendance_sessions')
    op.drop_index('ix_attendance_sessions_user_id', table_name='attendance_sessions')
    op.drop_table('attendance_sessions')
