"""Автоназначение исполнителей заявкам по фиксации рабочего времени.

Правила (согласованы с заказчиком):
- Кандидаты — сотрудники, которые зафиксировали вход и ещё НЕ зафиксировали
  выход: смена, закрытая вручную кнопкой или автофиксацией, не подходит.
  Из подходящих берём того, кто зафиксировался на вход позже всех.
- Роль кандидата должна позволять брать заявки этой категории: список
  «Кто может брать в работу» из настроек категории; если он пуст — право
  requests.process; для B2B-заявок по умолчанию — администраторы.
- День выбираем начиная с дня создания заявки: если в этот день подходящих
  нет (никто не фиксировался или все уже вышли), смотрим следующий день и
  так далее — до текущего.
- Пробуем, пока срок заявки не истёк: после просрочки система не назначает —
  заявку берут вручную или админ выбирает исполнителя через селект.
- Если фиксация выключена в настройках (ни одна роль не отслеживается),
  система не назначает никого — только вручную.
"""
import logging
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Set, Tuple
from zoneinfo import ZoneInfo

from sqlalchemy.orm import Session, joinedload

from app.models.requests import (
    CATEGORY_B2B_REGISTRATION,
    Request,
    RequestStatus,
)
from app.models.role import Permission, Role, RolePermission
from app.models.settings import SiteSettings
from app.models.attendance import AttendanceSession
from app.models.users import User
from app.services import requests_service as rs

logger = logging.getLogger(__name__)

# Сколько дней назад от создания заявки вообще имеет смысл искать фиксации
MAX_DAYS_LOOKBACK = 120
# Роли, для которых включена фиксация (по настройкам)
TRACK_FLAGS = (("admin", "track_admin"), ("manager", "track_manager"), ("operator", "track_operator"))


def _tz(settings: SiteSettings) -> ZoneInfo:
    try:
        return ZoneInfo(settings.timezone or "Europe/Kiev")
    except Exception:
        return ZoneInfo("Europe/Kiev")


def _local_day(moment: datetime, tz: ZoneInfo) -> str:
    """День (YYYY-MM-DD) в часовом поясе настроек по моменту naive UTC."""
    return (
        moment.replace(tzinfo=ZoneInfo("UTC")).astimezone(tz).date().isoformat()
    )


def _local_time(moment: datetime, tz: ZoneInfo) -> str:
    return moment.replace(tzinfo=ZoneInfo("UTC")).astimezone(tz).strftime("%H:%M")


def _tracked_roles(settings: SiteSettings) -> Set[str]:
    return {role for role, flag in TRACK_FLAGS if getattr(settings, flag, False)}


def _roles_with_process(db: Session) -> Set[str]:
    """Названия ролей, у которых есть право requests.process."""
    rows = (
        db.query(Role.name)
        .join(RolePermission, RolePermission.role_id == Role.id)
        .join(Permission, Permission.id == RolePermission.permission_id)
        .filter(Permission.codename == "requests.process")
        .all()
    )
    return {name for (name,) in rows}


def _allowed_take_roles(request: Request, process_roles: Set[str]) -> Set[str]:
    """Роли, которым можно брать заявки этой категории."""
    category = request.category
    take_roles = (category.take_roles if category else None) or []
    if take_roles:
        return set(take_roles)
    # B2B-заявки по умолчанию уходят администраторам
    if category and category.code == CATEGORY_B2B_REGISTRATION:
        return {"admin"}
    return process_roles


def _open_sessions_by_day(
    db: Session,
    first_day: str,
    last_day: str,
) -> Dict[str, List[Tuple[User, datetime]]]:
    """Открытые сессии фиксации (вход был, выхода нет) по дням: день → [(user, вход)]."""
    rows = (
        db.query(AttendanceSession, User)
        .join(User, User.id == AttendanceSession.user_id)
        .options(joinedload(User.role))
        .filter(
            AttendanceSession.work_date >= first_day,
            AttendanceSession.work_date <= last_day,
            AttendanceSession.clock_out_at.is_(None),
        )
        .order_by(AttendanceSession.work_date.asc(), AttendanceSession.clock_in_at.desc())
        .all()
    )
    by_day: Dict[str, List[Tuple[User, datetime]]] = {}
    for session, user in rows:
        by_day.setdefault(session.work_date, []).append((user, session.clock_in_at))
    return by_day


def _pick_assignee(
    db: Session,
    request: Request,
    by_day: Dict[str, List[Tuple[User, datetime]]],
    tracked: Set[str],
    process_roles: Set[str],
    tz: ZoneInfo,
    today: str,
) -> Optional[Tuple[User, datetime]]:
    """Кто последним зафиксировался на вход (по дням от дня создания заявки)."""
    allowed = _allowed_take_roles(request, process_roles)
    created = request.created_at or rs.now_utc()
    start_day = _local_day(created, tz)
    start = datetime.strptime(start_day, "%Y-%m-%d").date()
    end = datetime.strptime(today, "%Y-%m-%d").date()
    if (end - start).days > MAX_DAYS_LOOKBACK:
        start = end - timedelta(days=MAX_DAYS_LOOKBACK)

    day = start
    while day <= end:
        day_str = day.isoformat()
        for user, clock_in in by_day.get(day_str, []):
            role_name = user.role.name if user.role else None
            if not role_name or role_name not in tracked:
                continue
            if allowed and role_name not in allowed:
                continue
            if not user.is_active:
                continue
            return user, clock_in
        day += timedelta(days=1)
    return None


def autoassign_open_requests(db: Session) -> int:
    """Назначить исполнителей открытым заявкам. Возвращает число назначений."""
    settings = db.query(SiteSettings).first()
    if not settings:
        return 0
    tracked = _tracked_roles(settings)
    if not tracked:
        # Фиксация выключена — автоназначение невозможно
        return 0

    now = rs.now_utc()
    tz = _tz(settings)
    today = _local_day(now, tz)

    open_requests = (
        db.query(Request)
        .options(joinedload(Request.category))
        .filter(
            Request.assignee_id.is_(None),
            Request.status.in_([RequestStatus.NEW, RequestStatus.IN_PROGRESS]),
        )
        .all()
    )
    if not open_requests:
        return 0

    # Срок не истёк — только такие заявки берёт система
    candidates = []
    earliest_day = today
    for request in open_requests:
        deadline = rs.effective_deadline(request)
        if deadline is not None and now >= deadline:
            continue
        candidates.append(request)
        day = _local_day(request.created_at or now, tz)
        if day < earliest_day:
            earliest_day = day
    if not candidates:
        return 0

    by_day = _open_sessions_by_day(db, earliest_day, today)
    process_roles = _roles_with_process(db)

    assigned = 0
    for request in candidates:
        picked = _pick_assignee(db, request, by_day, tracked, process_roles, tz, today)
        if not picked:
            continue
        user, clock_in = picked
        request.assignee_id = user.id
        request.updated_at = now
        rs.log_event(
            db,
            request,
            None,
            "assigned",
            f"исполнитель назначен системой: {rs.actor_name(user)} "
            f"(фиксация входа в {_local_time(clock_in, tz)})",
        )
        assigned += 1

    if assigned:
        db.commit()
        # Обновить открытые админки (как при ручном назначении)
        for request in candidates:
            if request.assignee_id:
                try:
                    rs.notify_request_event(
                        request, "request_updated", db, request.assignee_id
                    )
                except Exception:
                    logger.warning("autoassign notify failed", exc_info=True)
        logger.info("Auto-assigned %s requests", assigned)

    return assigned
