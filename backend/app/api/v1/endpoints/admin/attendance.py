"""Admin endpoints for work-time tracking (фиксация рабочего времени + табель)."""
import calendar
import logging
from datetime import datetime
from typing import Dict, List, Optional, Tuple
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.api.v1.deps import require_permission, require_role
from app.models import Role, User, SiteSettings
from app.models.attendance import (
    AttendanceSession,
    TimesheetOverride,
    TimesheetOverrideLog,
)
from app.schemas.attendance_schemas import (
    AttendanceClosedSessionItem,
    AttendanceRecordItem,
    AttendanceRecordListResponse,
    AttendanceStuckSessionItem,
    AttendanceTodayItem,
    AttendanceTodayResponse,
    AttendanceTimesheetResponse,
    AttendanceTimesheetUser,
    TimesheetActorInfo,
    TimesheetManualEntryIn,
    TimesheetManualHistoryItem,
    TimesheetManualHistoryResponse,
    TimesheetManualUpdateIn,
)
from app.services.attendance_rules import (
    compute_auto_close_at_utc,
    compute_window_utc,
    session_auto_close_at,
    session_window,
    snapshot_for_date,
)

logger = logging.getLogger(__name__)

router = APIRouter()

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
    """[start, end) смены для даты work_date, в naive UTC (окно из настроек).

    Тонкая обёртка над app.services.attendance_rules — API-ошибка на мусорную
    дату сохраняется; сама логика окна живёт в сервисе.
    """
    try:
        return compute_window_utc(work_date, tz, s)
    except ValueError:
        raise HTTPException(400, "Invalid date, expected YYYY-MM-DD")


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


def _auto_close_moment(work_date: str, tz: ZoneInfo, s: SiteSettings) -> datetime:
    """Момент (naive UTC), после которого открытая сессия авто-закрывается.

    Тонкая обёртка над app.services.attendance_rules (логика: явное время
    автофиксации или легаси «конец смены + 15 минут»).
    """
    try:
        return compute_auto_close_at_utc(work_date, tz, s)
    except ValueError:
        raise HTTPException(400, "Invalid date, expected YYYY-MM-DD")


def _auto_close_open_sessions(db: Session, sessions: List[AttendanceSession], s: SiteSettings, tz: ZoneInfo, now_utc: datetime) -> None:
    """Ленивое авто-закрытие: вход есть, выхода нет, а время авто-выхода прошло.

    Время выхода ставим по факту (момент закрытия). Часы в табеле всё равно
    обрезаются до рабочего окна из настроек и появляются после закрытия.
    """
    changed = False
    for sess in sessions:
        if sess.clock_out_at is not None:
            continue
        try:
            # Дедлайн сессии: снимок, если есть; иначе — текущие настройки
            close_at = session_auto_close_at(sess, tz, s)
        except ValueError:
            continue
        if now_utc >= close_at:
            sess.clock_out_at = now_utc
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


def _stuck_item(sess: AttendanceSession) -> AttendanceStuckSessionItem:
    return AttendanceStuckSessionItem(
        id=sess.id,
        work_date=sess.work_date,
        clock_in_at=sess.clock_in_at.isoformat() if sess.clock_in_at else None,
        auto_clock_out=bool(sess.auto_clock_out),
    )


def _closed_item(sess: AttendanceSession) -> AttendanceClosedSessionItem:
    return AttendanceClosedSessionItem(
        work_date=sess.work_date,
        clock_in_at=sess.clock_in_at.isoformat() if sess.clock_in_at else None,
        clock_out_at=sess.clock_out_at.isoformat() if sess.clock_out_at else None,
        auto_clock_out=bool(sess.auto_clock_out),
    )


def _today_response(
    sessions: List[AttendanceSession],
    stuck: List[AttendanceSession],
    closed: Optional[List[AttendanceSession]] = None,
) -> AttendanceTodayResponse:
    return AttendanceTodayResponse(
        sessions=[_today_item(x) for x in sessions if x],
        open_session=_today_item(_open_session(sessions)),
        stuck_sessions=[_stuck_item(x) for x in stuck],
        closed_sessions=[_closed_item(x) for x in (closed or [])],
    )


def _visible_staff_query(db: Session, current_user: User):
    """Видимые в табеле сотрудники по роли текущего пользователя.

    Админ — весь штат (admin/manager/operator), менеджер — менеджеры и
    операторы, остальные — только себя.
    """
    q = (
        db.query(User)
        .join(Role, User.role_id == Role.id)
        .filter(User.is_active.is_(True))
    )
    if current_user.role.name == "admin":
        return q.filter(Role.name.in_(STAFF_ROLE_NAMES))
    if current_user.role.name == "manager":
        return q.filter(Role.name.in_(("manager", "operator")))
    return q.filter(User.id == current_user.id)


def _actor_item(u: Optional[User], user_id: int) -> TimesheetActorInfo:
    """Информация об участнике правки; при удалённом пользователе — только id."""
    if u is None:
        return TimesheetActorInfo(user_id=user_id)
    return TimesheetActorInfo(
        user_id=u.id,
        full_name=u.full_name,
        first_name=u.first_name,
        last_name=u.last_name,
        email=u.email,
        phone=u.phone,
        role=u.role.name if u.role else "",
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


def _stuck_open_sessions(db: Session, user_id: int, tz: ZoneInfo) -> List[AttendanceSession]:
    """Открытые сессии пользователя за прошлые дни («залипшие» хвосты)."""
    return (
        db.query(AttendanceSession)
        .filter(
            AttendanceSession.user_id == user_id,
            AttendanceSession.clock_out_at.is_(None),
            AttendanceSession.work_date < _today_str(tz),
        )
        .order_by(AttendanceSession.clock_in_at)
        .all()
    )


# --------------------------------------------------------------------------
# Кнопка входа/выхода
# --------------------------------------------------------------------------

@router.get("/attendance/today", response_model=AttendanceTodayResponse)
async def get_today_attendance(
    current_user: User = Depends(require_role("admin", "manager", "operator")),
    db: Session = Depends(get_db),
):
    """Сессии текущего пользователя за сегодня + открытая сессия (для кнопки и guard'а).

    Залипшие сессии прошлых дней отдаём отдельным списком и здесь не
    закрываем: сотрудник должен успеть нажать «Выход» вручную.
    """
    s = _get_settings(db)
    tz = _get_admin_tz(s)
    sessions = _today_sessions(db, current_user.id, s, tz)
    stuck = _stuck_open_sessions(db, current_user.id, tz)
    return _today_response(sessions, stuck)


@router.post("/attendance/clock-in", response_model=AttendanceTodayResponse)
async def clock_in(
    current_user: User = Depends(require_role("admin", "manager", "operator")),
    db: Session = Depends(get_db),
):
    """Зафиксировать вход: открыть новую сессию (идемпотентно при уже открытой).

    В новую сессию кладём снимок правил (окно смены и дедлайн авто-фиксации):
    последующие правки настроек не меняют расчёт этой сессии.
    """
    s = _get_settings(db)
    tz = _get_admin_tz(s)
    sessions = _today_sessions(db, current_user.id, s, tz)
    open_sess = _open_session(sessions)
    if open_sess is None:
        work_date = _today_str(tz)
        start_utc, end_utc, auto_close_utc = snapshot_for_date(work_date, tz, s)
        open_sess = AttendanceSession(
            user_id=current_user.id,
            work_date=work_date,
            clock_in_at=_now_utc(),
            work_start_at=start_utc,
            work_end_at=end_utc,
            auto_close_at=auto_close_utc,
        )
        db.add(open_sess)
        db.commit()
        db.refresh(open_sess)
        sessions = _today_sessions(db, current_user.id, s, tz)
    stuck = _stuck_open_sessions(db, current_user.id, tz)
    return _today_response(sessions, stuck)


@router.post("/attendance/clock-out", response_model=AttendanceTodayResponse)
async def clock_out(
    current_user: User = Depends(require_role("admin", "manager", "operator")),
    db: Session = Depends(get_db),
):
    """Зафиксировать выход: закрыть все открытые сессии — сегодняшнюю и залипшие.

    Идемпотентно: если открытых уже нет (авто-выход сработал раньше), отвечаем
    200 с пустым closed_sessions — не ошибкой. Время выхода — фактический
    момент закрытия. Залипшие сессии прошлых дней помечаем auto_clock_out=True
    (закрыты не в момент ухода); часы от этого не зависят — обрезаются окном.
    """
    s = _get_settings(db)
    tz = _get_admin_tz(s)
    today = _today_str(tz)
    now_utc = _now_utc()
    open_sessions = (
        db.query(AttendanceSession)
        .filter(
            AttendanceSession.user_id == current_user.id,
            AttendanceSession.clock_out_at.is_(None),
        )
        .order_by(AttendanceSession.clock_in_at)
        .all()
    )
    closed: List[AttendanceSession] = []
    for sess in open_sessions:
        sess.clock_out_at = now_utc
        sess.auto_clock_out = sess.work_date < today
        closed.append(sess)
    if closed:
        db.commit()
    sessions = _today_sessions(db, current_user.id, s, tz)
    stuck = _stuck_open_sessions(db, current_user.id, tz)
    return _today_response(sessions, stuck, closed=closed)


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

    # Видимость табеля по роли: админ — все, менеджер — менеджеры и операторы,
    # оператор — только себя
    users_q = _visible_staff_query(db, current_user)
    if user_id:
        users_q = users_q.filter(User.id == user_id)
    users = users_q.order_by(User.id).all()

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
            # Окно сессии: снимок, если есть; иначе — текущие настройки
            start_utc, end_utc = session_window(sess, tz, s)
        except ValueError:
            continue
        minutes = _worked_minutes(sess.clock_in_at, sess.clock_out_at, start_utc, end_utc)
        if minutes > 0:
            by_user[sess.user_id][sess.work_date] = (
                by_user[sess.user_id].get(sess.work_date, 0) + minutes
            )

    # Авторасчёт из сессий — сохраняем до применения ручных правок
    auto_by_user: Dict[int, Dict[str, int]] = {
        uid: dict(by_user[uid]) for uid in user_ids
    }

    # Ручные правки администрации: значение дня = правка, если она есть.
    # Сессии/фиксация в эту таблицу не пишут, поэтому ручные часы не затираются.
    overrides = (
        db.query(TimesheetOverride)
        .filter(
            TimesheetOverride.user_id.in_(user_ids),
            TimesheetOverride.work_date >= f"{y:04d}-{m:02d}-01",
            TimesheetOverride.work_date <= days[-1],
        )
        .all()
    )
    manual_days: Dict[int, Dict[str, int]] = {uid: {} for uid in user_ids}
    for ov in overrides:
        by_user[ov.user_id][ov.work_date] = ov.minutes
        manual_days[ov.user_id][ov.work_date] = ov.minutes

    totals: Dict[int, int] = {
        uid: sum(by_user[uid].values()) for uid in user_ids
    }

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
            manual_days=manual_days.get(u.id, {}),
            auto_days=auto_by_user.get(u.id, {}),
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


# --------------------------------------------------------------------------
# Ручное редактирование табеля (только для администраторов)
# --------------------------------------------------------------------------

@router.put("/attendance/timesheet/manual")
async def update_timesheet_manual(
    body: TimesheetManualUpdateIn,
    current_user: User = Depends(require_permission("attendance.edit")),
    db: Session = Depends(get_db),
):
    """Вручную проставить часы дня в табеле.

    minutes=None в записи = сбросить правку (день снова считается из сессий).
    Правки хранятся отдельно от сессий фиксации — авто-фиксация их не трогает.
    Каждое реальное изменение фиксируется в timesheet_override_log.
    """
    if not body.entries:
        return {"ok": True, "changed": 0}

    # Последняя запись по (user, date) выигрывает; даты валидируем
    entries: Dict[Tuple[int, str], TimesheetManualEntryIn] = {}
    for e in body.entries:
        _parse_date(e.work_date)
        entries[(e.user_id, e.work_date)] = e

    # Целевые сотрудники должны быть активными и видимыми текущему пользователю
    target_ids = {uid for uid, _ in entries}
    visible_ids = {
        u.id
        for u in _visible_staff_query(db, current_user)
        .filter(User.id.in_(target_ids))
        .all()
    }
    for uid, _ in entries:
        if uid not in visible_ids:
            raise HTTPException(
                400, f"User {uid} is not in the visible staff or is inactive"
            )

    now_utc = _now_utc()
    changed = 0
    for (uid, work_date), e in entries.items():
        ov = (
            db.query(TimesheetOverride)
            .filter_by(user_id=uid, work_date=work_date)
            .first()
        )
        before = ov.minutes if ov else None
        after = e.minutes
        if after == before:
            continue  # значения не изменились — ничего не пишем
        if after is None:
            db.delete(ov)
        elif ov is None:
            db.add(
                TimesheetOverride(
                    user_id=uid,
                    work_date=work_date,
                    minutes=after,
                    updated_by_id=current_user.id,
                    updated_at=now_utc,
                )
            )
        else:
            ov.minutes = after
            ov.updated_by_id = current_user.id
            ov.updated_at = now_utc
        db.add(
            TimesheetOverrideLog(
                user_id=uid,
                work_date=work_date,
                minutes_before=before,
                minutes_after=after,
                changed_by_id=current_user.id,
                changed_at=now_utc,
            )
        )
        changed += 1

    db.commit()
    return {"ok": True, "changed": changed}


@router.get("/attendance/timesheet/manual-history", response_model=TimesheetManualHistoryResponse)
async def timesheet_manual_history(
    month: str = Query("", max_length=7),
    user_id: int = Query(0, ge=0),
    current_user: User = Depends(require_permission("attendance.edit")),
    db: Session = Depends(get_db),
):
    """История ручных правок табеля за месяц (кто, когда, что было → стало).

    user_id — опциональный фильтр по сотруднику, чьи часы правили.
    """
    s = _get_settings(db)
    tz = _get_admin_tz(s)
    y, m = _parse_month(month or datetime.now(tz).strftime("%Y-%m"))
    days_in_month = calendar.monthrange(y, m)[1]

    logs_q = db.query(TimesheetOverrideLog).filter(
        TimesheetOverrideLog.work_date >= f"{y:04d}-{m:02d}-01",
        TimesheetOverrideLog.work_date <= f"{y:04d}-{m:02d}-{days_in_month:02d}",
    )
    if user_id:
        logs_q = logs_q.filter(TimesheetOverrideLog.user_id == user_id)
    logs = (
        logs_q.order_by(TimesheetOverrideLog.changed_at.desc(), TimesheetOverrideLog.id.desc())
        .limit(500)
        .all()
    )

    user_ids = {log.user_id for log in logs} | {log.changed_by_id for log in logs}
    users = {
        u.id: u
        for u in db.query(User).filter(User.id.in_(user_ids)).all()
    } if user_ids else {}

    return TimesheetManualHistoryResponse(
        month=f"{y:04d}-{m:02d}",
        items=[
            TimesheetManualHistoryItem(
                id=log.id,
                work_date=log.work_date,
                minutes_before=log.minutes_before,
                minutes_after=log.minutes_after,
                changed_at=log.changed_at.isoformat(),
                employee=_actor_item(users.get(log.user_id), log.user_id),
                changed_by=_actor_item(users.get(log.changed_by_id), log.changed_by_id),
            )
            for log in logs
        ],
    )
