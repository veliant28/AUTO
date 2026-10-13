"""attendance sessions: snapshot of work window and auto clock-out deadline

Revision ID: 035
Revises: 034
Create Date: 2026-10-13
"""
from datetime import datetime, timedelta
from typing import Sequence, Union
from zoneinfo import ZoneInfo

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '035'
down_revision: Union[str, Sequence[str], None] = '034'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Логика дублируется внутри миграции осознанно: старые миграции не должны
# зависеть от кода приложения, который со временем меняется.
GRACE_MINUTES = 15
DEFAULT_START = (9, 0)
DEFAULT_END = (18, 0)


def _parse_hm(value, default):
    try:
        h, m = (int(x) for x in str(value or "").split(":"))
        if not (0 <= h < 24 and 0 <= m < 60):
            raise ValueError
        return h, m
    except (ValueError, TypeError):
        return default


def _parse_auto_hm(value):
    raw = str(value or "").strip()
    if not raw:
        return None
    try:
        h, m = (int(x) for x in raw.split(":"))
        if not (0 <= h < 24 and 0 <= m < 60):
            raise ValueError
        return h, m
    except (ValueError, TypeError):
        return None


def _snapshot(work_date: str, tz: ZoneInfo, start_hm, end_hm, auto_hm):
    """Окно смены и дедлайн авто-фиксации для даты, naive UTC."""
    try:
        y, m, d = (int(x) for x in str(work_date).split("-"))
        datetime(y, m, d)
    except (ValueError, TypeError):
        return None

    start_h, start_m = _parse_hm(start_hm, DEFAULT_START)
    end_h, end_m = _parse_hm(end_hm, DEFAULT_END)
    start_local = datetime(y, m, d, start_h, start_m, tzinfo=tz)
    end_local = datetime(y, m, d, end_h, end_m, tzinfo=tz)
    if end_local <= start_local:
        end_local += timedelta(days=1)

    if auto_hm is None:
        deadline_local = end_local + timedelta(minutes=GRACE_MINUTES)
    else:
        deadline_local = datetime(y, m, d, auto_hm[0], auto_hm[1], tzinfo=tz)
        while deadline_local <= start_local:
            deadline_local += timedelta(days=1)

    utc = ZoneInfo("UTC")
    return (
        start_local.astimezone(utc).replace(tzinfo=None),
        end_local.astimezone(utc).replace(tzinfo=None),
        deadline_local.astimezone(utc).replace(tzinfo=None),
    )


def upgrade() -> None:
    # Снимок правил на момент входа; NULL = строка без снимка (старые записи),
    # для них расчёт идёт по текущим настройкам.
    op.add_column('attendance_sessions', sa.Column('work_start_at', sa.DateTime(), nullable=True))
    op.add_column('attendance_sessions', sa.Column('work_end_at', sa.DateTime(), nullable=True))
    op.add_column('attendance_sessions', sa.Column('auto_close_at', sa.DateTime(), nullable=True))

    conn = op.get_bind()
    row = conn.execute(sa.text(
        "SELECT timezone, work_start_time, work_end_time, work_auto_clockout_time "
        "FROM site_settings LIMIT 1"
    )).fetchone()
    if not row:
        return

    tz_name, start_hm, end_hm, auto_raw = row
    try:
        tz = ZoneInfo(tz_name or "Europe/Kiev")
    except Exception:
        tz = ZoneInfo("Europe/Kiev")
    auto_hm = _parse_auto_hm(auto_raw)

    sessions = conn.execute(sa.text(
        "SELECT id, work_date FROM attendance_sessions"
    )).fetchall()
    for sess_id, work_date in sessions:
        snap = _snapshot(work_date, tz, start_hm, end_hm, auto_hm)
        if snap is None:
            continue
        conn.execute(
            sa.text(
                "UPDATE attendance_sessions SET work_start_at = :s, "
                "work_end_at = :e, auto_close_at = :a WHERE id = :i"
            ),
            {"s": snap[0], "e": snap[1], "a": snap[2], "i": sess_id},
        )


def downgrade() -> None:
    op.drop_column('attendance_sessions', 'auto_close_at')
    op.drop_column('attendance_sessions', 'work_end_at')
    op.drop_column('attendance_sessions', 'work_start_at')
