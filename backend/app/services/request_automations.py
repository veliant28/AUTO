"""Автоматизации одобрения заявок — по коду категории.

- b2b_registration: создаёт пользователя с ролью b2b (случайный пароль) или
  повышает существующего; готовит письмо клиенту с решением.
- timesheet_manual: применяет часы в табеле (та же запись, что ручная правка,
  с записью в историю правок).
- ban_unban: применяет бан или разбан через механизмы защиты.
- pricing_change: меняет общую наценку или наценку одной категории и ставит
  в очередь применение наценки (та же задача, что на странице «Цена»).

Автоматизация выполняется в момент одобрения админом; ошибки применения
показываются админу (AutomationError), заявка при этом не закрывается.
"""
import logging
import secrets
from dataclasses import dataclass, field
from datetime import datetime
from decimal import Decimal, InvalidOperation
from typing import List, Optional, Tuple

from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.core.security import get_password_hash
from app.core.order_rules import can_delete_order, can_edit_order
from app.models import Order, OrderChangeLog, Role, User
from app.models.attendance import TimesheetOverride, TimesheetOverrideLog
from app.models.protection import BanRecord, ProtectionEvent, Whitelist
from app.services.ban_service import add_ban_ips, collect_known_ips
from app.services.order_service import delete_order_cascade
from app.services.permission_service import user_has_permission
from app.models.requests import (
    CATEGORY_B2B_REGISTRATION,
    CATEGORY_BAN_UNBAN,
    CATEGORY_ORDER_DELETE,
    CATEGORY_ORDER_FINAL_STATUS,
    CATEGORY_PRICING_CHANGE,
    CATEGORY_TIMESHEET_MANUAL,
    Request,
)

logger = logging.getLogger(__name__)


class AutomationError(Exception):
    """Автоматизация не смогла примениться — причина показывается админу."""


class ProtectedUserError(AutomationError):
    """Действие запрещено для защищённой учётной записи (администратор)."""


@dataclass
class AutomationResult:
    """Результат: строки событий + необязательное письмо клиенту."""

    events: List[str] = field(default_factory=list)
    # (to_email, subject, html)
    email: Optional[Tuple[str, str, str]] = None


def apply_approval(db: Session, request: Request, actor: User) -> AutomationResult:
    """Применить автоматизацию одобренной заявки (по коду категории)."""
    code = request.category.code if request.category else None
    if code == CATEGORY_B2B_REGISTRATION:
        return _approve_b2b(db, request, actor)
    if code == CATEGORY_TIMESHEET_MANUAL:
        return _approve_timesheet(db, request, actor)
    if code == CATEGORY_BAN_UNBAN:
        return _approve_ban_unban(db, request, actor)
    if code == CATEGORY_ORDER_FINAL_STATUS:
        return _approve_order_change(db, request, actor)
    if code == CATEGORY_ORDER_DELETE:
        return _approve_order_delete(db, request, actor)
    if code == CATEGORY_PRICING_CHANGE:
        return _approve_pricing_change(db, request, actor)
    return AutomationResult()


# ── B2B-регистрация ─────────────────────────────────────────────────────────

def _approve_b2b(db: Session, request: Request, actor: User) -> AutomationResult:
    from app.models.settings import SiteSettings
    from app.services.email_service import (
        branding_from_settings,
        build_b2b_approved_html,
        normalize_locale,
    )
    from app.services.requests_service import (
        contact_display_name,
        contact_name_parts,
    )

    payload = request.payload or {}
    email = (payload.get("email") or "").strip().lower()
    if not email:
        raise AutomationError("В заявке нет email клиента")

    locale = normalize_locale(payload.get("locale"))
    contact_name = contact_display_name(payload) or email
    phone = (payload.get("phone") or "").strip() or None

    b2b_role = db.query(Role).filter(Role.name == "b2b").first()
    if not b2b_role:
        raise AutomationError("Роль b2b не найдена в системе")

    settings = db.query(SiteSettings).first()
    branding = branding_from_settings(settings)

    result = AutomationResult()
    user = db.query(User).filter(func.lower(User.email) == email).first()
    if user:
        old_role = user.role.name if user.role else None
        user.role_id = b2b_role.id
        if phone and not user.phone:
            user.phone = phone
        result.events.append(
            f"клиент {user.email} повышен до B2B (прежняя роль: {old_role or '—'})"
        )
        password = None
    else:
        password = secrets.token_urlsafe(9)
        last_name, first_name = contact_name_parts(payload)
        user = User(
            email=email,
            password_hash=get_password_hash(password),
            full_name=contact_name,
            first_name=first_name,
            last_name=last_name,
            phone=phone,
            is_active=True,
            role_id=b2b_role.id,
            created_at=datetime.utcnow().isoformat(),
        )
        db.add(user)
        db.flush()
        result.events.append(f"создан пользователь {email} с ролью B2B")

    html = build_b2b_approved_html(
        branding, locale, contact_name, login=email, password=password
    )
    subject = {
        "ru": "Заявка на B2B одобрена",
        "ua": "Заявку на B2B схвалено",
        "en": "Your B2B application is approved",
    }[locale]
    result.email = (email, subject, html)
    return result


# ── Правка часов в табеле ───────────────────────────────────────────────────

def _approve_timesheet(db: Session, request: Request, actor: User) -> AutomationResult:
    payload = request.payload or {}
    user_id = payload.get("user_id")
    work_date = (payload.get("work_date") or "").strip()
    minutes = payload.get("minutes")

    if not user_id or not work_date or minutes is None:
        raise AutomationError("В заявке нет сотрудника, даты или часов")
    try:
        datetime.strptime(work_date, "%Y-%m-%d")
    except ValueError:
        raise AutomationError("Некорректная дата (ожидается YYYY-MM-DD)")
    try:
        minutes = int(minutes)
    except (TypeError, ValueError):
        raise AutomationError("Часы должны быть числом")
    if minutes < 0 or minutes > 1440:
        raise AutomationError("Часы должны быть от 0 до 1440 минут")

    target = db.query(User).filter(User.id == user_id).first()
    if not target:
        raise AutomationError("Сотрудник не найден")

    now = datetime.utcnow()
    ov = (
        db.query(TimesheetOverride)
        .filter_by(user_id=user_id, work_date=work_date)
        .first()
    )
    before = ov.minutes if ov else None
    if ov is None:
        ov = TimesheetOverride(
            user_id=user_id,
            work_date=work_date,
            minutes=minutes,
            updated_by_id=actor.id,
            updated_at=now,
        )
        db.add(ov)
    else:
        ov.minutes = minutes
        ov.updated_by_id = actor.id
        ov.updated_at = now

    db.add(
        TimesheetOverrideLog(
            user_id=user_id,
            work_date=work_date,
            minutes_before=before,
            minutes_after=minutes,
            changed_by_id=actor.id,
            is_automated=True,
            changed_at=now,
        )
    )

    hours = f"{minutes // 60}ч {minutes % 60:02d}м"
    return AutomationResult(
        events=[
            f"часы применены в табеле: {target.email or target.id}, {work_date} — {hours}"
            + (f" (было: {before} мин)" if before is not None else "")
        ]
    )


# ── Бан / разбан ────────────────────────────────────────────────────────────

def _approve_ban_unban(db: Session, request: Request, actor: User) -> AutomationResult:
    payload = request.payload or {}
    action = (payload.get("action") or "").strip().lower()
    reason = (payload.get("reason") or "").strip()
    user_id = payload.get("user_id")
    email = (payload.get("email") or "").strip() or None

    if action not in ("ban", "unban", "whitelist"):
        raise AutomationError("Не указано действие: ban, unban или whitelist")

    user = None
    if user_id:
        user = db.query(User).filter(User.id == user_id).first()
    if user is None and email:
        user = db.query(User).filter(User.email == email).first()
    if user is None and not email and not user_id:
        raise AutomationError("В заявке нет клиента (user_id или email)")

    email = email or (user.email if user else None)
    user_id = user.id if user else None
    now = datetime.utcnow()

    if action == "ban":
        # Администратора нельзя блокировать ни через заявку, ни через API
        if user and user.role and user.role.name == "admin":
            raise ProtectedUserError("Нельзя заблокировать администратора")
        if user and user.id == actor.id:
            raise ProtectedUserError("Нельзя заблокировать самого себя")
        if not reason:
            raise AutomationError("Для бана нужна причина")

        whitelist_q = db.query(Whitelist)
        if user_id:
            whitelist_q = whitelist_q.filter(Whitelist.user_id == user_id)
        else:
            whitelist_q = whitelist_q.filter(Whitelist.email == email)
        if whitelist_q.first():
            raise AutomationError("Клиент в белом списке — бан невозможен")

        active = (
            db.query(BanRecord)
            .filter(BanRecord.is_active == True, BanRecord.user_id == user_id)
            .first()
            if user_id
            else None
        )
        if active:
            raise AutomationError("Клиент уже забанен")

        last_ban = (
            db.query(BanRecord)
            .filter(BanRecord.user_id == user_id)
            .order_by(BanRecord.banned_at.desc())
            .first()
            if user_id
            else None
        )
        block_count = (last_ban.block_count + 1) if last_ban else 1

        last_ip = None
        if email:
            last_event = (
                db.query(ProtectionEvent.ip_address)
                .filter(ProtectionEvent.email == email, ProtectionEvent.ip_address.isnot(None))
                .order_by(ProtectionEvent.created_at.desc())
                .first()
            )
            if last_event:
                last_ip = last_event[0]

        ban = BanRecord(
            user_id=user_id,
            email=email,
            ip_address=last_ip,
            reason=reason,
            banned_by_id=actor.id,
            banned_at=now,
            is_active=True,
            block_count=block_count,
            ban_type="manual",
        )
        db.add(ban)
        db.flush()
        # Блокируем все известные IP клиента, а не только последний
        add_ban_ips(
            db,
            ban,
            collect_known_ips(
                db, user_id=user_id, email=email, fallback_ip=last_ip
            ),
        )
        if user:
            user.is_active = False
        db.add(
            ProtectionEvent(
                user_id=user_id,
                email=email,
                ip_address=last_ip,
                event_type="manual_ban",
                description=f"Banned by approved request. Reason: {reason}",
                created_at=now,
            )
        )
        return AutomationResult(
            events=[f"применён бан: {email or user_id} — {reason}"]
        )

    if action == "whitelist":
        # Разбанить, если активный бан есть, и добавить в белый список
        ban_conditions = []
        if user_id:
            ban_conditions.append(BanRecord.user_id == user_id)
        if email:
            ban_conditions.append(BanRecord.email == email)
        active_bans = (
            db.query(BanRecord)
            .filter(BanRecord.is_active == True, or_(*ban_conditions))
            .all()
            if ban_conditions
            else []
        )
        for ban in active_bans:
            ban.is_active = False
            ban.unbanned_at = now
        if user:
            user.is_active = True

        wl_conditions = []
        if user_id:
            wl_conditions.append(Whitelist.user_id == user_id)
        if email:
            wl_conditions.append(Whitelist.email == email)
        existing_wl = (
            db.query(Whitelist).filter(or_(*wl_conditions)).first()
            if wl_conditions
            else None
        )
        if not existing_wl:
            db.add(
                Whitelist(
                    user_id=user_id,
                    email=email,
                    reason=reason or None,
                    added_by_id=actor.id,
                    added_at=now,
                )
            )

        db.add(
            ProtectionEvent(
                user_id=user_id,
                email=email,
                ip_address=(payload.get("last_ip") or "").strip() or None,
                event_type="manual_whitelist",
                description="Added to whitelist by approved request"
                + (f". Reason: {reason}" if reason else ""),
                created_at=now,
            )
        )

        events = []
        if active_bans:
            events.append(f"применён разбан: {email or user_id}")
        if existing_wl:
            events.append(f"уже в белом списке: {email or user_id}")
        else:
            events.append(f"добавлен в белый список: {email or user_id}")
        return AutomationResult(events=events)

    # unban
    ban_q = db.query(BanRecord).filter(BanRecord.is_active == True)
    if user_id:
        ban_q = ban_q.filter(BanRecord.user_id == user_id)
    else:
        ban_q = ban_q.filter(BanRecord.email == email)
    ban = ban_q.order_by(BanRecord.banned_at.desc()).first()
    if not ban:
        raise AutomationError("Активный бан не найден")

    ban.is_active = False
    ban.unbanned_at = now
    if ban.user_id:
        banned_user = db.query(User).filter(User.id == ban.user_id).first()
        if banned_user:
            banned_user.is_active = True
    db.add(
        ProtectionEvent(
            user_id=ban.user_id,
            email=ban.email,
            event_type="manual_unban",
            description="Unbanned by approved request",
            created_at=now,
        )
    )
    return AutomationResult(events=[f"применён разбан: {ban.email or ban.user_id}"])


# ── Изменение заказа ────────────────────────────────────────────────────────

_ORDER_CHANGE_LABELS = {
    "phone": "телефон",
    "last_name": "фамилия",
    "first_name": "имя",
    "middle_name": "отчество",
    "delivery_type": "доставка",
    "delivery_city": "город",
    "delivery_warehouse": "отделение",
    "delivery_street_label": "улица",
    "delivery_house": "дом",
    "delivery_apartment": "квартира",
}

_ORDER_CHANGE_FIELDS = [
    "phone",
    "last_name",
    "first_name",
    "middle_name",
    "delivery_type",
    "delivery_city",
    "delivery_warehouse",
    "delivery_city_ref",
    "delivery_settlement_ref",
    "delivery_city_label",
    "delivery_warehouse_ref",
    "delivery_warehouse_label",
    "delivery_street_ref",
    "delivery_street_label",
    "delivery_house",
    "delivery_apartment",
]


def _format_percent(value: Decimal) -> str:
    return format(value.normalize(), "f")


def _approve_pricing_change(
    db: Session, request: Request, actor: User
) -> AutomationResult:
    """Применить наценку из заявки: общую или одной категории.

    Для категории 0% означает снятие персональной наценки — товары категории
    снова используют общую наценку (как при сохранении таблицы на странице
    «Цена»). После изменения правила запускается та же задача применения,
    что и по кнопке на странице «Цена».
    """
    from app.models.parts import PartCategory
    from app.models.pricing import PriceRuleHistory
    from app.services.pricing_service import (
        get_or_create_category_rule,
        get_or_create_general_rule,
        update_rule,
    )

    payload = request.payload or {}
    target = payload.get("pricing_target")
    if target not in ("general", "category"):
        raise AutomationError("не выбрана общая наценка или категория")

    raw_margin = payload.get("margin_percent")
    if raw_margin is None or isinstance(raw_margin, bool):
        raise AutomationError("не указана наценка")
    try:
        margin = Decimal(str(raw_margin))
    except (InvalidOperation, TypeError, ValueError):
        raise AutomationError("некорректная наценка")
    if not margin.is_finite() or margin < 0 or margin > 100:
        raise AutomationError("наценка должна быть от 0 до 100%")

    if target == "general":
        rule = get_or_create_general_rule(db)
        target_name = "Общая наценка"
        old_margin = rule.margin_percent or Decimal(0)
        rule.is_active = True
        update_rule(db, rule, margin)
        db.commit()
    else:
        try:
            category_id = int(payload.get("pricing_category_id"))
        except (TypeError, ValueError):
            raise AutomationError("не выбрана категория")
        category = (
            db.query(PartCategory)
            .filter(PartCategory.id == category_id)
            .first()
        )
        if not category:
            raise AutomationError("категория не найдена")

        target_name = category.name
        rule = get_or_create_category_rule(db, category.id)
        old_margin = rule.margin_percent or Decimal(0)
        if margin == 0:
            if rule.margin_percent != 0:
                db.add(
                    PriceRuleHistory(
                        price_rule_id=rule.id,
                        old_percent=rule.margin_percent,
                        new_percent=Decimal(0),
                    )
                )
            rule.margin_percent = Decimal(0)
            rule.is_active = False
            db.commit()
        else:
            rule.is_active = True
            update_rule(db, rule, margin)
            db.commit()

    events = [
        f"наценка «{target_name}»: "
        f"{_format_percent(old_margin)}% → {_format_percent(margin)}%",
    ]
    try:
        from app.workers.tasks.pricing_tasks import apply_margins_task

        task = apply_margins_task.delay()
        events.append(
            f"применение наценки поставлено в очередь (задача {task.id})"
        )
    except Exception as exc:  # брокер недоступен — решение не откатываем
        logger.error(
            "Failed to enqueue pricing apply after request %s: %s",
            request.id,
            exc,
        )
        events.append(
            "не удалось поставить применение наценки в очередь — "
            "примените вручную на странице «Цена»"
        )

    return AutomationResult(events=events)


def _approve_order_change(
    db: Session, request: Request, actor: User
) -> AutomationResult:
    """Применить изменения получателя и доставки из одобренной заявки."""
    payload = request.payload or {}
    raw_order_id = payload.get("order_id")
    if not raw_order_id:
        raise AutomationError("В заявке не выбран заказ")
    try:
        order_id = int(raw_order_id)
    except (TypeError, ValueError):
        raise AutomationError("Некорректный номер заказа")

    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise AutomationError("Заказ не найден")

    if not user_has_permission(db, actor, "orders.edit_status"):
        raise AutomationError("Нет прав на изменение заказа")

    if not can_edit_order(order, actor):
        raise AutomationError(
            "Заказ в этом статусе может изменить только администратор"
        )

    now = datetime.utcnow()
    changes = []
    for field in _ORDER_CHANGE_FIELDS:
        if field not in payload:
            continue
        old = getattr(order, field, None)
        new = payload.get(field)
        if (old or "") != (new or ""):
            label = _ORDER_CHANGE_LABELS.get(field)
            if label:
                changes.append(f"{label}: {old or '—'} → {new or '—'}")
        setattr(order, field, new)

    # Изменение сделала автоматизация — в истории и хедере будет «Система»
    order.updated_by_user_id = None
    order.updated_by_name = None
    order.updated_by_group = "system"
    order.updated_at = now

    request_label = request.number or f"#{request.id}"
    details = "; ".join(changes) if changes else "данные не изменились"
    db.add(
        OrderChangeLog(
            order_id=order.id,
            user_id=None,
            user_name=None,
            user_group="system",
            action="edit",
            details=f"Изменение по заявке {request_label}: {details}",
            created_at=now,
        )
    )
    return AutomationResult(
        events=[
            f"изменён заказ {order.order_number or order.id} "
            f"по заявке {request_label}: {details}"
        ]
    )


# ── Удаление заказа ─────────────────────────────────────────────────────────

def _approve_order_delete(
    db: Session, request: Request, actor: User
) -> AutomationResult:
    """Удалить заказ по одобренной заявке (права orders.delete)."""
    payload = request.payload or {}
    raw_order_id = payload.get("order_id")
    if not raw_order_id:
        raise AutomationError("В заявке не выбран заказ")
    try:
        order_id = int(raw_order_id)
    except (TypeError, ValueError):
        raise AutomationError("Некорректный номер заказа")

    reason = (request.description or "").strip()
    if not reason:
        raise AutomationError("Укажите причину удаления заказа")

    if not user_has_permission(db, actor, "orders.delete"):
        raise AutomationError("Нет прав на удаление заказа")

    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise AutomationError("Заказ не найден")

    if not can_delete_order(order, actor):
        raise AutomationError(
            "Заказ в этом статусе может удалить только администратор"
        )

    order_label = order.order_number or f"#{order.id}"
    request_label = request.number or f"#{request.id}"
    delete_order_cascade(db, order)
    return AutomationResult(
        events=[
            f"удалён заказ {order_label} по заявке {request_label}: {reason}"
        ]
    )
