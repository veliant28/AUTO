"""Логика журнала заявок: видимость, сроки, события, алерты.

Заявки — внутренние тикеты сотрудников (то, что оператор или менеджер не
может сделать сам) плюс публичные заявки с витрины (регистрация B2B).
Видимость: админ — все заявки; менеджер и оператор — созданные ими или где
они назначены исполнителем; b2b/retail доступа к журналу не имеют (гейт по
правам requests.*).
"""
import asyncio
import logging
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple

from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.models import User
from app.models.requests import (
    Request,
    RequestCategory,
    RequestEvent,
    RequestStatus,
)

logger = logging.getLogger(__name__)

# Порог «срок истекает»: осталось не больше этой доли срока (и не больше минимума)
DUE_SOON_FRACTION = 0.2
DUE_SOON_MIN_MINUTES = 15


def now_utc() -> datetime:
    return datetime.utcnow()


def actor_name(user: Optional[User]) -> Optional[str]:
    """Имя актора для логов: «Фамилия Имя» → full_name → email."""
    if not user:
        return None
    return f"{user.last_name or ''} {user.first_name or ''}".strip() or user.full_name or user.email


def actor_group(user: Optional[User]) -> Optional[str]:
    return user.role.name if user and user.role else None


def contact_display_name(payload: Optional[dict]) -> str:
    """Контакт B2B-заявки одной строкой: «Фамилия Имя Отчество».

    Свежие заявки приходят тремя полями, старые хранят контакт одной строкой
    в `contact_name` — читаем оба варианта, чтобы журнал показывал и те, и те.
    """
    last, first = contact_name_parts(payload)
    middle = contact_middle_name(payload)
    return f"{last or ''} {first or ''} {middle or ''}".strip()


def contact_middle_name(payload: Optional[dict]) -> Optional[str]:
    """Отчество контакта B2B-заявки.

    У старых заявок контакт одной строкой «Фамилия Имя Отчество» — берём
    третье слово, если оно есть.
    """
    data = payload or {}
    middle = (data.get("contact_middle_name") or "").strip() or None
    if middle:
        return middle
    parts = (data.get("contact_name") or "").split()
    return parts[2] if len(parts) > 2 else None


def contact_name_parts(
    payload: Optional[dict],
) -> Tuple[Optional[str], Optional[str]]:
    """Фамилия и имя контакта B2B-заявки по отдельности.

    Новые заявки хранят их своими полями, старые — одной строкой
    «Фамилия Имя…» в `contact_name` (одно слово — имя).
    """
    data = payload or {}
    last = (data.get("contact_last_name") or "").strip() or None
    first = (data.get("contact_first_name") or "").strip() or None
    if last or first:
        return last, first
    parts = (data.get("contact_name") or "").split()
    if not parts:
        return None, None
    if len(parts) == 1:
        return None, parts[0]
    return parts[0], parts[1]


def visible_requests_query(db: Session, user: User):
    """Заявки, видимые пользователю: админ — все, остальные — свои."""
    q = db.query(Request)
    if user.role and user.role.name == "admin":
        return q
    return q.filter(
        or_(Request.created_by_id == user.id, Request.assignee_id == user.id)
    )


def can_create_in_category(category: RequestCategory, role_name: Optional[str]) -> bool:
    """Разрешена ли категория роли (allowed_roles пустой = всем сотрудникам)."""
    allowed = category.allowed_roles
    if not allowed:
        return True
    return role_name in allowed


def category_due_snapshot(
    category: RequestCategory, created_at: datetime
) -> Tuple[Optional[datetime], Optional[datetime]]:
    """Снимок сроков заявки: (срок реакции, срок решения) в naive UTC."""
    response_due = (
        created_at + timedelta(minutes=category.response_minutes)
        if category.response_minutes
        else None
    )
    due = (
        created_at + timedelta(minutes=category.resolve_minutes)
        if category.resolve_minutes
        else None
    )
    return response_due, due


def log_event(
    db: Session,
    request: Request,
    user: Optional[User],
    event_type: str,
    details: Optional[str] = None,
) -> RequestEvent:
    """Записать событие в таймлайн заявки (автор-снимок, как в логах заказов)."""
    event = RequestEvent(
        request_id=request.id,
        user_id=user.id if user else None,
        author_name=actor_name(user),
        author_group=actor_group(user),
        event_type=event_type,
        details=details,
        created_at=now_utc(),
    )
    db.add(event)
    return event


def effective_deadline(request: Request) -> Optional[datetime]:
    """Актуальный срок открытой заявки.

    Пока заявку не взяли в работу — срок реакции, после — срок решения
    (если он не задан, остаётся срок реакции).
    """
    if request.status == RequestStatus.NEW and request.response_due_at:
        return request.response_due_at
    return request.due_at or request.response_due_at


def _milestone_minutes(request: Request) -> Optional[int]:
    """Длительность текущей вехи — нужна для порога «скоро срок»."""
    category = request.category
    if not category:
        return None
    if request.status == RequestStatus.NEW:
        return category.response_minutes
    return category.resolve_minutes


def deadline_state(request: Request, now: Optional[datetime] = None) -> Dict:
    """Состояние срока: ok | due_soon | overdue (+ сколько минут осталось/просрочено)."""
    now = now or now_utc()
    deadline = effective_deadline(request)
    if deadline is None:
        return {"state": "ok", "minutes_left": None, "minutes_late": None}

    delta_minutes = int((deadline - now).total_seconds() // 60)
    if delta_minutes < 0:
        return {"state": "overdue", "minutes_left": None, "minutes_late": -delta_minutes}

    milestone = _milestone_minutes(request)
    threshold = DUE_SOON_MIN_MINUTES
    if milestone:
        threshold = max(DUE_SOON_MIN_MINUTES, int(milestone * DUE_SOON_FRACTION))

    state = "due_soon" if delta_minutes <= threshold else "ok"
    return {"state": state, "minutes_left": delta_minutes, "minutes_late": None}


def open_requests_for_alerts(db: Session, user: User) -> List[Request]:
    """Открытые заявки пользователя (по видимости) для алертов и подсветки."""
    return (
        visible_requests_query(db, user)
        .filter(Request.status.in_([RequestStatus.NEW, RequestStatus.IN_PROGRESS]))
        .filter(Request.due_at.isnot(None) | Request.response_due_at.isnot(None))
        .all()
    )


def notify_request_event(
    request: Request,
    event_type: str,
    db: Optional[Session] = None,
    actor_id: Optional[int] = None,
) -> None:
    """Пуш события журнала в WS-канал /ws/requests (fire-and-forget).

    Получатели — те, кто эту заявку видит: админы + автор + исполнитель
    (совпадает с видимостью журнала). Без db событие уходит всем подписчикам.
    """
    from app.services.ws_manager import manager as ws_manager

    event = {
        "type": event_type,
        "request_id": request.id,
        "number": request.number,
        "status": (
            request.status.value if hasattr(request.status, "value") else str(request.status)
        ),
        "created_by_id": request.created_by_id,
        "assignee_id": request.assignee_id,
        "actor_id": actor_id,
    }
    recipients = request_recipient_ids(db, request)

    async def _send() -> None:
        try:
            await ws_manager.broadcast_request_event(event, recipients)
        except Exception:
            logger.warning("request WS broadcast failed", exc_info=True)

    try:
        asyncio.ensure_future(_send())
    except Exception:
        logger.warning("request WS notify scheduling failed", exc_info=True)


def request_recipient_ids(
    db: Optional[Session], request: Request
) -> Optional[List[int]]:
    """Кому можно получить событие заявки: админы + автор + исполнитель."""
    if db is None:
        return None
    from app.models import Role

    try:
        admin_ids = [
            row[0]
            for row in db.query(User.id)
            .join(Role, User.role_id == Role.id)
            .filter(Role.name == "admin")
            .all()
        ]
    except Exception:
        logger.warning("request WS recipients lookup failed", exc_info=True)
        return None
    ids = set(admin_ids)
    if request.created_by_id:
        ids.add(request.created_by_id)
    if request.assignee_id:
        ids.add(request.assignee_id)
    return list(ids)
