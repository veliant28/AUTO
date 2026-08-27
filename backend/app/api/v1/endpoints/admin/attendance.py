"""Admin endpoints for work-time tracking (фиксация рабочего времени + табель)."""
import calendar
import logging
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.api.v1.deps import require_permission, require_role
from app.models import Role, User, SiteSettings
from app.models.attendance import AttendanceSession
from app.schemas.attendance_schemas import (
    AttendanceRecordItem,
    AttendanceRecordListResponse,
    AttendanceTodayItem,
    AttendanceTodayResponse,
    AttendanceTimesheetResponse,
    AttendanceTimesheetUser,
)

logger = logging.getLogger(__name__)

router = APIRouter()

# Авто-выход: конец смены из настроек + 15 минут
AUTO_CLOCKOUT_GRACE_MINUTES = 15

# Сотрудники сайта (кому в табеле считаются часы)
STAFF_ROLE_NAMES = ("admin", "manager", "operator")


def _get_settings(db: Session) -> SiteSettings:
    s = db.query(SiteSettings).first()
    if not s:
        s = SiteSettings()
        db.add(s)
        db.commit()
        db.refresh(s)
    return s


def _get_admin_tz(s: SiteSettings) -> ZoneInfo:
    tz_name = s.timezone or "Europe/Kiev"
    try:
        return ZoneInfo(tz_name)
    except Exception:
        return ZoneInfo("Europe/Kiev")


def _parse_hm(value: str, default: str = "09:00") -> Tuple[int, int]:
    try:
        h, m = (int(x) for x in str(value or default).split(":"))
        if not (0 <= h < 24 and 0 <= m < 60):
            raise ValueError
        return h, m
    except (ValueError, TypeError):
        h, m = (int(x) for x in default.split(":"))
        return h, m


def _today_str(tz: ZoneInfo) -> str:
    return datetime.now(tz).strftime("%Y-%m-%d")


def _parse_date(date_str: str) -> Tuple[int, int, int]:
    try:
        y, m, d = (int(x) for x in date_str.split("-"))
        datetime(y, m, d)
        return y, m, d
    except (ValueError, TypeError):
        raise HTTPException(400, "Invalid date, expected YYYY-MM-DD")


def _parse_month(month: str) -> Tuple[int, int]:
    try:
        y, m = (int(x) for x in month.split("-"))
        if not (1 <= m <= 12):
            raise ValueError
        return y, m
    except (ValueError, TypeError):
        raise HTTPException(400, "Invalid month, expected YYYY-MM")


def _work_window_utc(work_date: str, tz: ZoneInfo, s: SiteSettings) -> Tuple[datetime, datetime]:
    """[start, end) смены для даты work_date, в naive UTC. Конец <= начала → следующий день."""
    y, m, d = _parse_date(work_date)
    start_h, start_m = _parse_hm(s.work_start_time, "09:00")
    end_h, end_m = _parse_hm(s.work_end_time, "18:00")
    start_local = datetime(y, m, d, start_h, start_m, tzinfo=tz)
    end_local = datetime(y, m, d, end_h, end_m, tzinfo=tz)
    if end_local <= start_local:
        end_local += timedelta(days=1)
    start_utc = start_local.astimezone(ZoneInfo("UTC")).replace(tzinfo=None)
    end_utc = end_local.astimezone(ZoneInfo("UTC")).replace(tzinfo=None)
    return start_utc, end_utc


def _worked_minutes(
    clock_in: datetime,
    clock_out: datetime,
    start_utc: datetime,
    end_utc: datetime,
) -> int:
    """Отработанные минуты: пересечение [вход, выход] с рабочим окном из настроек."""
    eff_in = max(clock_in, start_utc)
    eff_out = min(clock_out, end_utc)
    if eff_out <= eff_in:
        return 0
    return int((eff_out - eff_in).total_seconds() // 60)


def _auto_close_open_sessions(db: Session, sessions: List[AttendanceSession], s: SiteSettings, tz: ZoneInfo, now_utc: datetime) -> None:
    """Ленивое авто-закрытие: вход есть, выхода нет, а конец смены + 15 мин уже прошёл."""
    changed = False
    for sess in sessions:
        if sess.clock_out_at is not None:
            continue
        try:
            _, end_utc = _work_window_utc(sess.work_date, tz, s)
        except HTTPException:
            continue
        close_at = end_utc + timedelta(minutes=AUTO_CLOCKOUT_GRACE_MINUTES)
        if now_utc >= close_at:
            sess.clock_out_at = close_at
            sess.auto_clock_out = True
            changed = True
    if changed:
        db.commit()


def _session_item(sess: AttendanceSession) -> AttendanceRecordItem:
    u = sess.user
    return AttendanceRecordItem(
        id=sess.id,
        user_id=sess.user_id,
        work_date=sess.work_date,
        clock_in_at=sess.clock_in_at.isoformat() if sess.clock_in_at else None,
        clock_out_at=sess.clock_out_at.isoformat() if sess.clock_out_at else None,
        auto_clock_out=bool(sess.auto_clock_out),
        full_name=u.full_name,
        first_name=u.first_name,
        last_name=u.last_name,
        email=u.email,
        phone=u.phone,
        role=u.role.name if u.role else "",
    )


def _today_item(sess: Optional[AttendanceSession]) -> Optional[AttendanceTodayItem]:
    if not sess:
        return None
    return AttendanceTodayItem(
        clock_in_at=sess.clock_in_at.isoformat() if sess.clock_in_at else None,
        clock_out_at=sess.clock_out_at.isoformat() if sess.clock_out_at else None,
        auto_clock_out=bool(sess.auto_clock_out),
    )


def _now_utc() -> datetime:
    return datetime.now(ZoneInfo("UTC")).replace(tzinfo=None)


def _today_sessions(db: Session, user_id: int, s: SiteSettings, tz: ZoneInfo) -> List[AttendanceSession]:
    today = _today_str(tz)
    sessions = (
        db.query(AttendanceSession)
        .filter(AttendanceSession.user_id == user_id, AttendanceSession.work_date == today)
        .order_by(AttendanceSession.clock_in_at)
        .all()
    )
    _auto_close_open_sessions(db, sessions, s, tz, _now_utc())
    return sessions


def _open_session(sessions: List[AttendanceSession]) -> Optional[AttendanceSession]:
    return next((s for s in sessions if s.clock_out_at is None), None)


# --------------------------------------------------------------------------
# Кнопка входа/выхода
# --------------------------------------------------------------------------

@router.get("/attendance/today", response_model=AttendanceTodayResponse)
async def get_today_attendance(
    current_user: User = Depends(require_role("admin", "manager", "operator")),
    db: Session = Depends(get_db),
):
    """Сессии текущего пользователя за сегодня + открытая сессия (для кнопки и guard'а)."""
    s = _get_settings(db)
    tz = _get_admin_tz(s)
    sessions = _today_sessions(db, current_user.id, s, tz)
    return AttendanceTodayResponse(
        sessions=[_today_item(x) for x in sessions if x],
        open_session=_today_item(_open_session(sessions)),
    )


@router.post("/attendance/clock-in", response_model=AttendanceTodayResponse)
async def clock_in(
    current_user: User = Depends(require_role("admin", "manager", "operator")),
    db: Session = Depends(get_db),
):
    """Зафиксировать вход: открыть новую сессию (идемпотентно при уже открытой)."""
    s = _get_settings(db)
    tz = _get_admin_tz(s)
    sessions = _today_sessions(db, current_user.id, s, tz)
    open_sess = _open_session(sessions)
    if open_sess is None:
        open_sess = AttendanceSession(
            user_id=current_user.id,
            work_date=_today_str(tz),
            clock_in_at=_now_utc(),
        )
        db.add(open_sess)
        db.commit()
        db.refresh(open_sess)
        sessions = _today_sessions(db, current_user.id, s, tz)
    return AttendanceTodayResponse(
        sessions=[_today_item(x) for x in sessions if x],
        open_session=_today_item(_open_session(sessions)),
    )


@router.post("/attendance/clock-out", response_model=AttendanceTodayResponse)
async def clock_out(
    current_user: User = Depends(require_role("admin", "manager", "operator")),
    db: Session = Depends(get_db),
):
    """Зафиксировать выход: закрыть открытую сессию за сегодня."""
    s = _get_settings(db)
    tz = _get_admin_tz(s)
    sessions = _today_sessions(db, current_user.id, s, tz)
    open_sess = _open_session(sessions)
    if open_sess is None:
        raise HTTPException(400, "No open attendance session for today")
    open_sess.clock_out_at = _now_utc()
    open_sess.auto_clock_out = False
    db.commit()
    sessions = _today_sessions(db, current_user.id, s, tz)
    return AttendanceTodayResponse(
        sessions=[_today_item(x) for x in sessions if x],
        open_session=_today_item(_open_session(sessions)),
    )


# --------------------------------------------------------------------------
# Таблица фиксации (по дням)
# --------------------------------------------------------------------------

@router.get("/attendance/records", response_model=AttendanceRecordListResponse)
async def list_attendance_records(
    date: str = Query("", max_length=10),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: User = Depends(require_permission("attendance.view")),
    db: Session = Depends(get_db),
):
    """Сессии фиксации за день (по умолчанию — сегодня в tz настроек), с пагинацией."""
    s = _get_settings(db)
    tz = _get_admin_tz(s)
    target = date or _today_str(tz)
    _parse_date(target)

    query = db.query(AttendanceSession).filter(AttendanceSession.work_date == target)
    total = query.count()
    sessions = query.order_by(AttendanceSession.clock_in_at).offset((page - 1) * page_size).limit(page_size).all()

    # Ленивое авто-закрытие на весь день (не только на текущую страницу)
    all_open = (
        db.query(AttendanceSession)
        .filter(AttendanceSession.work_date == target, AttendanceSession.clock_out_at.is_(None))
        .all()
    )
    _auto_close_open_sessions(db, all_open, s, tz, _now_utc())

    return AttendanceRecordListResponse(
        items=[_session_item(x) for x in sessions],
        total=total,
        page=page,
        page_size=page_size,
    )


# --------------------------------------------------------------------------
# Табель за месяц
# --------------------------------------------------------------------------

@router.get("/attendance/timesheet", response_model=AttendanceTimesheetResponse)
async def attendance_timesheet(
    month: str = Query("", max_length=7),
    user_id: int = Query(0, ge=0),
    current_user: User = Depends(require_permission("attendance.view")),
    db: Session = Depends(get_db),
):
    """Табель: отработанные часы всех сотрудников (или одного) за месяц.

    Часы дня = сумма пересечений всех сессий дня с рабочим окном из настроек.
    """
    s = _get_settings(db)
    tz = _get_admin_tz(s)
    y, m = _parse_month(month or datetime.now(tz).strftime("%Y-%m"))

    days: List[str] = []
    for day in range(1, calendar.monthrange(y, m)[1] + 1):
        days.append(f"{y:04d}-{m:02d}-{day:02d}")

    users_q = (
        db.query(User)
        .join(Role, User.role_id == Role.id)
        .filter(User.is_active.is_(True), Role.name.in_(STAFF_ROLE_NAMES))
        .order_by(User.id)
    )
    if user_id:
        users_q = users_q.filter(User.id == user_id)
    users = users_q.all()

    user_ids = [u.id for u in users]
    sessions = (
        db.query(AttendanceSession)
        .filter(
            AttendanceSession.user_id.in_(user_ids),
            AttendanceSession.work_date >= f"{y:04d}-{m:02d}-01",
            AttendanceSession.work_date <= days[-1],
        )
        .all()
    )
    _auto_close_open_sessions(db, sessions, s, tz, _now_utc())

    by_user: Dict[int, Dict[str, int]] = {uid: {} for uid in user_ids}
    totals: Dict[int, int] = {uid: 0 for uid in user_ids}
    for sess in sessions:
        if sess.clock_out_at is None:
            continue
        try:
            start_utc, end_utc = _work_window_utc(sess.work_date, tz, s)
        except HTTPException:
            continue
        minutes = _worked_minutes(sess.clock_in_at, sess.clock_out_at, start_utc, end_utc)
        if minutes > 0:
            by_user[sess.user_id][sess.work_date] = (
                by_user[sess.user_id].get(sess.work_date, 0) + minutes
            )
            totals[sess.user_id] += minutes

    staff_users = [
        AttendanceTimesheetUser(
            user_id=u.id,
            full_name=u.full_name,
            first_name=u.first_name,
            last_name=u.last_name,
            email=u.email,
            phone=u.phone,
            role=u.role.name if u.role else "",
            days=by_user.get(u.id, {}),
            total_minutes=totals.get(u.id, 0),
        )
        for u in users
    ]

    return AttendanceTimesheetResponse(
        month=f"{y:04d}-{m:02d}",
        work_start=s.work_start_time or "09:00",
        work_end=s.work_end_time or "18:00",
        days=days,
        users=staff_users,
    )
