"""Admin endpoints for the requests journal (журнал заявок)."""
import logging
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import String, func, or_
from sqlalchemy.orm import Session, joinedload

from app.core.db import get_db
from app.api.v1.deps import require_permission
from app.models import Permission, RolePermission, User
from app.models.requests import (
    CATEGORY_B2B_REGISTRATION,
    CATEGORY_BAN_UNBAN,
    CATEGORY_TIMESHEET_MANUAL,
    Request,
    RequestCategory,
    RequestComment,
    RequestEvent,
    RequestStatus,
)
from app.schemas.requests_schemas import (
    RequestActorInfo,
    RequestAlertItem,
    RequestAlertsResponse,
    RequestAssignIn,
    RequestCategorySchema,
    RequestCategoryUpdateIn,
    RequestCommentIn,
    RequestCommentSchema,
    RequestCreateIn,
    RequestDecisionIn,
    RequestDetailResponse,
    RequestEventSchema,
    RequestListItem,
    RequestListResponse,
    RequestStatusIn,
)
from app.services import requests_service as rs
from app.services.request_automations import AutomationError, apply_approval

logger = logging.getLogger(__name__)

router = APIRouter()

# Категории с автоматизацией: закрываются только через одобрение/отклонение
AUTOMATED_CATEGORY_CODES = (
    CATEGORY_B2B_REGISTRATION,
    CATEGORY_TIMESHEET_MANUAL,
    CATEGORY_BAN_UNBAN,
)


def _status_value(value) -> str:
    return value.value if hasattr(value, "value") else str(value)


def _actor_info(u: Optional[User]) -> Optional[RequestActorInfo]:
    if u is None:
        return None
    return RequestActorInfo(
        user_id=u.id,
        full_name=u.full_name,
        first_name=u.first_name,
        last_name=u.last_name,
        email=u.email,
        role=u.role.name if u.role else None,
    )


def _visible_or_404(db: Session, user: User, request_id: int) -> Request:
    """Заявка по id, видимая текущему пользователю (иначе 404)."""
    r = (
        rs.visible_requests_query(db, user)
        .options(
            joinedload(Request.category),
            joinedload(Request.created_by),
            joinedload(Request.assignee),
            joinedload(Request.resolved_by),
            joinedload(Request.comments),
            joinedload(Request.events),
        )
        .filter(Request.id == request_id)
        .first()
    )
    if not r:
        raise HTTPException(404, "Заявка не найдена")
    return r


def _user_can_view_requests(db: Session, user_id: int) -> bool:
    """Может ли пользователь видеть журнал (право requests.view у его роли)."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        return False
    return bool(
        db.query(RolePermission)
        .join(Permission)
        .filter(
            RolePermission.role_id == user.role_id,
            Permission.codename == "requests.view",
        )
        .first()
    )


def _list_item(r: Request, now: Optional[datetime] = None) -> RequestListItem:
    state = rs.deadline_state(r, now)
    return RequestListItem(
        id=r.id,
        number=r.number or f"REQ-{r.id:010d}",
        category_id=r.category_id,
        category_name=r.category.name if r.category else "",
        category_code=r.category.code if r.category else "",
        status=_status_value(r.status),
        title=r.title,
        created_at=r.created_at,
        created_by=_actor_info(r.created_by),
        assignee=_actor_info(r.assignee),
        deadline=rs.effective_deadline(r),
        deadline_state=state["state"],
        minutes_left=state["minutes_left"],
        minutes_late=state["minutes_late"],
    )


def _alert_item(r: Request, now: datetime) -> RequestAlertItem:
    state = rs.deadline_state(r, now)
    return RequestAlertItem(
        id=r.id,
        number=r.number or f"REQ-{r.id:010d}",
        title=r.title,
        category_name=r.category.name if r.category else "",
        status=_status_value(r.status),
        deadline=rs.effective_deadline(r),
        minutes_left=state["minutes_left"],
        minutes_late=state["minutes_late"],
    )


def _detail(r: Request) -> RequestDetailResponse:
    state = rs.deadline_state(r)
    return RequestDetailResponse(
        id=r.id,
        number=r.number or f"REQ-{r.id:010d}",
        category=RequestCategorySchema.model_validate(r.category),
        status=_status_value(r.status),
        title=r.title,
        description=r.description,
        payload=r.payload,
        created_at=r.created_at,
        updated_at=r.updated_at,
        created_by=_actor_info(r.created_by),
        assignee=_actor_info(r.assignee),
        resolved_by=_actor_info(r.resolved_by),
        response_due_at=r.response_due_at,
        due_at=r.due_at,
        resolved_at=r.resolved_at,
        deadline=rs.effective_deadline(r),
        deadline_state=state["state"],
        minutes_left=state["minutes_left"],
        minutes_late=state["minutes_late"],
        comments=[RequestCommentSchema.model_validate(c) for c in r.comments],
        events=[RequestEventSchema.model_validate(e) for e in r.events],
    )


def _get_category(db: Session, data: RequestCreateIn) -> RequestCategory:
    category = None
    if data.category_id:
        category = db.query(RequestCategory).filter(RequestCategory.id == data.category_id).first()
    elif data.category_code:
        category = (
            db.query(RequestCategory)
            .filter(RequestCategory.code == data.category_code)
            .first()
        )
    if not category:
        raise HTTPException(400, "Категория заявки не найдена")
    if not category.is_active:
        raise HTTPException(400, "Категория заявки отключена")
    return category


def _check_category_role(category: RequestCategory, user: User) -> None:
    role_name = user.role.name if user.role else None
    if not rs.can_create_in_category(category, role_name):
        raise HTTPException(403, "Эта категория заявок недоступна для вашей роли")


def _validate_status(status: str) -> RequestStatus:
    try:
        return RequestStatus(status)
    except ValueError:
        raise HTTPException(400, "Некорректный статус заявки")


def _ensure_editable(request: Request) -> None:
    """Закрытая заявка доступна только для чтения."""
    if request.status == RequestStatus.CLOSED:
        raise HTTPException(400, "Заявка закрыта и недоступна для изменений")


# --------------------------------------------------------------------------
# Категории
# --------------------------------------------------------------------------

@router.get("/requests/categories", response_model=List[RequestCategorySchema])
def list_request_categories(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("requests.view")),
):
    """Категории заявок (со сроками и ролями создания)."""
    categories = (
        db.query(RequestCategory)
        .order_by(RequestCategory.sort_order, RequestCategory.id)
        .all()
    )
    return [RequestCategorySchema.model_validate(c) for c in categories]


@router.patch("/requests/categories/{category_id}", response_model=RequestCategorySchema)
def update_request_category(
    category_id: int,
    data: RequestCategoryUpdateIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("requests.manage")),
):
    """Правка категории: название, сроки, роли создания, вкл/выкл."""
    category = db.query(RequestCategory).filter(RequestCategory.id == category_id).first()
    if not category:
        raise HTTPException(404, "Категория не найдена")

    if data.name is not None:
        category.name = data.name.strip()
    if data.response_minutes is not None:
        category.response_minutes = data.response_minutes or None
    if data.resolve_minutes is not None:
        category.resolve_minutes = data.resolve_minutes or None
    if data.is_active is not None:
        category.is_active = data.is_active
    if data.allowed_roles is not None:
        roles = [r for r in data.allowed_roles if r]
        category.allowed_roles = roles or None
    if data.take_roles is not None:
        take_roles = [r for r in data.take_roles if r]
        category.take_roles = take_roles or None
    if data.sort_order is not None:
        category.sort_order = data.sort_order

    db.commit()
    db.refresh(category)
    return RequestCategorySchema.model_validate(category)


# --------------------------------------------------------------------------
# Алерты по срокам
# --------------------------------------------------------------------------

@router.get("/requests/alerts", response_model=RequestAlertsResponse)
def request_alerts(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("requests.view")),
):
    """Заявки со сроком на исходе (due_soon) и просроченные (overdue)."""
    now = rs.now_utc()
    due_soon: List[RequestAlertItem] = []
    overdue: List[RequestAlertItem] = []
    for r in rs.open_requests_for_alerts(db, current_user):
        state = rs.deadline_state(r, now)["state"]
        if state == "overdue":
            overdue.append(_alert_item(r, now))
        elif state == "due_soon":
            due_soon.append(_alert_item(r, now))
    overdue.sort(key=lambda i: -(i.minutes_late or 0))
    due_soon.sort(key=lambda i: i.minutes_left or 0)
    return RequestAlertsResponse(due_soon=due_soon, overdue=overdue)


# --------------------------------------------------------------------------
# Список и деталь
# --------------------------------------------------------------------------

@router.get("/requests", response_model=RequestListResponse)
def list_requests(
    category_id: int = Query(0, ge=0),
    status: str = Query("", max_length=20),
    search: str = Query("", max_length=100),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=1000),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("requests.view")),
):
    """Журнал заявок: видимость по роли, фильтры, счётчики статусов."""
    now = rs.now_utc()

    def _apply_filters(q):
        if category_id:
            q = q.filter(Request.category_id == category_id)
        if search:
            like = f"%{search}%"
            q = q.filter(
                or_(
                    Request.number.ilike(like),
                    Request.title.ilike(like),
                    Request.description.ilike(like),
                    # поиск по данным заявки (email/компания B2B-анкеты и т.п.)
                    func.cast(Request.payload, String).ilike(like),
                )
            )
        return q

    counts_q = _apply_filters(rs.visible_requests_query(db, current_user))
    counts = {s.value: 0 for s in RequestStatus}
    for value, cnt in (
        counts_q.with_entities(Request.status, func.count(Request.id))
        .group_by(Request.status)
        .all()
    ):
        counts[_status_value(value)] = int(cnt)

    total_all = sum(counts.values())
    # «Выполнено»: решённые + закрытые после решения — прогресс не падает,
    # когда заявка переходит из RESOLVED в автоматический CLOSED
    done = counts.get("resolved", 0) + counts.get("closed", 0)
    progress = round(done * 100 / total_all) if total_all else 0

    q = _apply_filters(
        rs.visible_requests_query(db, current_user).options(
            joinedload(Request.category),
            joinedload(Request.created_by),
            joinedload(Request.assignee),
        )
    )
    if status:
        q = q.filter(Request.status == _validate_status(status))
    total = q.count()
    items = (
        q.order_by(Request.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    return RequestListResponse(
        items=[_list_item(r, now) for r in items],
        total=total,
        page=page,
        page_size=page_size,
        counts=counts,
        progress=progress,
    )


@router.get("/requests/assignees")
def list_request_assignees(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("requests.view")),
):
    """Сотрудники, которым можно назначить заявку (staff с доступом к журналу)."""
    from app.models import Role

    rows = (
        db.query(User)
        .join(Role, User.role_id == Role.id)
        .filter(
            Role.name.in_(["admin", "manager", "operator"]),
            User.is_active == True,  # noqa: E712
        )
        .order_by(User.id)
        .all()
    )
    return [
        {
            "id": u.id,
            "name": rs.actor_name(u) or u.email,
            "email": u.email,
            "role": u.role.name if u.role else None,
        }
        for u in rows
    ]


@router.get("/requests/{request_id}", response_model=RequestDetailResponse)
def get_request(
    request_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("requests.view")),
):
    """Деталь заявки: данные, комментарии, таймлайн событий."""
    return _detail(_visible_or_404(db, current_user, request_id))


# --------------------------------------------------------------------------
# Создание, комментарии, обработка
# --------------------------------------------------------------------------

@router.post("/requests", response_model=RequestDetailResponse)
async def create_request(
    data: RequestCreateIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("requests.create")),
):
    """Создать заявку от имени сотрудника (по категории и данным)."""
    category = _get_category(db, data)
    _check_category_role(category, current_user)

    assignee = None
    if data.assignee_id:
        assignee = db.query(User).filter(User.id == data.assignee_id).first()
        if not assignee or not _user_can_view_requests(db, assignee.id):
            raise HTTPException(400, "Исполнитель не имеет доступа к журналу")

    now = rs.now_utc()
    response_due, due = rs.category_due_snapshot(category, now)
    request = Request(
        category_id=category.id,
        status=RequestStatus.NEW,
        title=data.title.strip(),
        description=(data.description or "").strip() or None,
        payload=data.payload or None,
        created_by_id=current_user.id,
        assignee_id=assignee.id if assignee else None,
        response_due_at=response_due,
        due_at=due,
        created_at=now,
        updated_at=now,
    )
    db.add(request)
    db.flush()
    request.number = f"REQ-{request.id:010d}"
    rs.log_event(db, request, current_user, "created", f"категория: {category.name}")
    db.commit()
    db.refresh(request)

    rs.notify_request_event(request, "request_created", db, current_user.id)
    return _detail(_visible_or_404(db, current_user, request.id))


@router.post("/requests/{request_id}/comment", response_model=RequestDetailResponse)
async def comment_request(
    request_id: int,
    data: RequestCommentIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("requests.comment")),
):
    """Добавить комментарий к заявке."""
    request = _visible_or_404(db, current_user, request_id)
    _ensure_editable(request)
    db.add(
        RequestComment(
            request_id=request.id,
            user_id=current_user.id,
            author_name=rs.actor_name(current_user),
            author_group=rs.actor_group(current_user),
            text=data.text.strip(),
            created_at=rs.now_utc(),
        )
    )
    request.updated_at = rs.now_utc()
    db.commit()
    rs.notify_request_event(request, "request_comment", db, current_user.id)
    return _detail(_visible_or_404(db, current_user, request.id))


@router.post("/requests/{request_id}/take", response_model=RequestDetailResponse)
async def take_request(
    request_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("requests.process")),
):
    """Взять заявку в работу: исполнитель — текущий пользователь, статус — в работе."""
    request = _visible_or_404(db, current_user, request_id)
    if request.status in (
        RequestStatus.RESOLVED,
        RequestStatus.REJECTED,
        RequestStatus.CLOSED,
    ):
        raise HTTPException(400, "Заявка уже закрыта")
    # Доступ по категории: брать заявку могут только роли из её настроек
    # (пустой список — любой сотрудник с правом requests.process)
    take_roles = request.category.take_roles if request.category else None
    role_name = current_user.role.name if current_user.role else None
    if take_roles and role_name not in take_roles:
        raise HTTPException(403, "Ваша роль не может брать заявки этой категории")
    was_status = _status_value(request.status)
    request.assignee_id = current_user.id
    request.status = RequestStatus.IN_PROGRESS
    request.updated_at = rs.now_utc()
    rs.log_event(
        db,
        request,
        current_user,
        "taken",
        f"взята в работу (статус: {was_status} → in_progress)",
    )
    db.commit()
    rs.notify_request_event(request, "request_updated", db, current_user.id)
    return _detail(_visible_or_404(db, current_user, request.id))


@router.post("/requests/{request_id}/assign", response_model=RequestDetailResponse)
async def assign_request(
    request_id: int,
    data: RequestAssignIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("requests.process")),
):
    """Назначить исполнителя заявки (или снять, assignee_id=null)."""
    request = _visible_or_404(db, current_user, request_id)
    _ensure_editable(request)

    if data.assignee_id is None:
        request.assignee_id = None
        rs.log_event(db, request, current_user, "assigned", "исполнитель снят")
    else:
        assignee = db.query(User).filter(User.id == data.assignee_id).first()
        if not assignee:
            raise HTTPException(404, "Сотрудник не найден")
        if not _user_can_view_requests(db, assignee.id):
            raise HTTPException(400, "Сотрудник не имеет доступа к журналу")
        request.assignee_id = assignee.id
        rs.log_event(
            db,
            request,
            current_user,
            "assigned",
            f"исполнитель: {assignee.full_name or assignee.email}",
        )
    request.updated_at = rs.now_utc()
    db.commit()
    rs.notify_request_event(request, "request_updated", db, current_user.id)
    return _detail(_visible_or_404(db, current_user, request.id))


@router.post("/requests/{request_id}/status", response_model=RequestDetailResponse)
async def change_request_status(
    request_id: int,
    data: RequestStatusIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("requests.process")),
):
    """Смена статуса вручную: в работе / вернуть в новые.

    Закрытие (решена/отклонена) ручных категорий — тоже здесь; для
    автоматизированных категорий закрытие только через одобрение/отклонение.
    """
    request = _visible_or_404(db, current_user, request_id)
    new_status = _validate_status(data.status)

    _ensure_editable(request)
    if new_status == RequestStatus.CLOSED:
        raise HTTPException(400, "Заявка закрывается автоматически")

    category_code = request.category.code if request.category else None
    if new_status in (RequestStatus.RESOLVED, RequestStatus.REJECTED) and category_code in AUTOMATED_CATEGORY_CODES:
        raise HTTPException(
            400, "Эту заявку закрывает только одобрение или отклонение администратором"
        )

    was_status = _status_value(request.status)
    request.status = new_status
    request.updated_at = rs.now_utc()
    if new_status in (RequestStatus.RESOLVED, RequestStatus.REJECTED):
        request.resolved_at = rs.now_utc()
        request.resolved_by_id = current_user.id
    else:
        request.resolved_at = None
        request.resolved_by_id = None
    rs.log_event(
        db, request, current_user, "status_changed", f"статус: {was_status} → {new_status.value}"
    )
    db.commit()
    rs.notify_request_event(request, "request_updated", db, current_user.id)
    return _detail(_visible_or_404(db, current_user, request.id))


async def _decide(
    db: Session,
    current_user: User,
    request_id: int,
    approve: bool,
    data: RequestDecisionIn,
) -> RequestDetailResponse:
    """Общее для одобрения и отклонения: автоматизация, письмо, события."""
    from app.models.settings import SiteSettings
    from app.services.email_service import (
        branding_from_settings,
        build_b2b_rejected_html,
        normalize_locale,
        send_brand_email,
    )

    request = _visible_or_404(db, current_user, request_id)
    if request.status in (
        RequestStatus.RESOLVED,
        RequestStatus.REJECTED,
        RequestStatus.CLOSED,
    ):
        raise HTTPException(400, "Заявка уже закрыта")

    note = (data.note or "").strip()
    result = None
    email_tuple = None
    if approve:
        try:
            result = apply_approval(db, request, current_user)
        except AutomationError as e:
            raise HTTPException(400, f"Автоматизация не применилась: {e}")
        if result and result.email:
            email_tuple = result.email
    else:
        # Отклонение B2B-заявки — письмо клиенту об отказе
        category_code = request.category.code if request.category else None
        payload = request.payload or {}
        client_email = (payload.get("email") or "").strip().lower()
        if category_code == CATEGORY_B2B_REGISTRATION and client_email:
            locale = normalize_locale(payload.get("locale"))
            branding = branding_from_settings(db.query(SiteSettings).first())
            html = build_b2b_rejected_html(
                branding,
                locale,
                rs.contact_display_name(payload) or client_email,
                note or None,
            )
            subject = {
                "ru": "Заявка на B2B отклонена",
                "ua": "Заявку на B2B відхилено",
                "en": "Your B2B application was rejected",
            }[locale]
            email_tuple = (client_email, subject, html)

    now = rs.now_utc()
    request.status = RequestStatus.RESOLVED if approve else RequestStatus.REJECTED
    request.resolved_at = now
    request.resolved_by_id = current_user.id
    request.updated_at = now

    if result and result.events:
        for line in result.events:
            rs.log_event(db, request, None, "automation", line)

    if note:
        db.add(
            RequestComment(
                request_id=request.id,
                user_id=current_user.id,
                author_name=rs.actor_name(current_user),
                author_group=rs.actor_group(current_user),
                text=note,
                created_at=now,
            )
        )

    rs.log_event(
        db,
        request,
        current_user,
        "approved" if approve else "rejected",
        note or None,
    )
    db.commit()

    # Письмо клиенту — после фиксации решения (не откатывает решение при ошибке)
    if email_tuple:
        to_email, subject, html = email_tuple
        try:
            sent = await send_brand_email(db, to_email=to_email, subject=subject, html=html)
            rs.log_event(
                db,
                request,
                None,
                "email_sent" if sent else "email_skipped",
                f"письмо на {to_email}" + ("" if sent else " (Resend не настроен)"),
            )
        except Exception as e:
            logger.error("Failed to send request decision email to %s: %s", to_email, e)
            rs.log_event(db, request, None, "email_error", f"ошибка отправки на {to_email}")
        db.commit()

    rs.notify_request_event(request, "request_updated", db, current_user.id)
    return _detail(_visible_or_404(db, current_user, request.id))


@router.post("/requests/{request_id}/approve", response_model=RequestDetailResponse)
async def approve_request(
    request_id: int,
    data: RequestDecisionIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("requests.manage")),
):
    """Одобрить заявку: применить автоматизацию категории и написать клиенту."""
    return await _decide(db, current_user, request_id, approve=True, data=data)


@router.post("/requests/{request_id}/reject", response_model=RequestDetailResponse)
async def reject_request(
    request_id: int,
    data: RequestDecisionIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("requests.manage")),
):
    """Отклонить заявку (для автоматизированных категорий — с письмом клиенту)."""
    return await _decide(db, current_user, request_id, approve=False, data=data)


@router.delete("/requests/{request_id}")
def delete_request(
    request_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("requests.delete")),
):
    """Удалить заявку вместе с комментариями и событиями (только админ)."""
    request = _visible_or_404(db, current_user, request_id)
    number = request.number
    db.query(RequestComment).filter(RequestComment.request_id == request.id).delete()
    db.query(RequestEvent).filter(RequestEvent.request_id == request.id).delete()
    db.delete(request)
    db.commit()
    return {"ok": True, "deleted": number}
