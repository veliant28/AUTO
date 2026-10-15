"""Автоматизации одобрения заявок — по коду категории.

- b2b_registration: создаёт пользователя с ролью b2b (случайный пароль) или
  повышает существующего; готовит письмо клиенту с решением.
- timesheet_manual: применяет часы в табеле (та же запись, что ручная правка,
  с записью в историю правок).
- ban_unban: применяет бан или разбан через механизмы защиты.

Автоматизация выполняется в момент одобрения админом; ошибки применения
показываются админу (AutomationError), заявка при этом не закрывается.
"""
import logging
import secrets
from dataclasses import dataclass, field
from datetime import datetime
from decimal import Decimal
from typing import List, Optional, Tuple

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.security import get_password_hash
from app.models import Role, User
from app.models.attendance import TimesheetOverride, TimesheetOverrideLog
from app.models.protection import BanRecord, ProtectionEvent, Whitelist
from app.models.requests import (
    CATEGORY_B2B_REGISTRATION,
    CATEGORY_BAN_UNBAN,
    CATEGORY_TIMESHEET_MANUAL,
    Request,
)

logger = logging.getLogger(__name__)


class AutomationError(Exception):
    """Автоматизация не смогла примениться — причина показывается админу."""


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
    return AutomationResult()


# ── B2B-регистрация ─────────────────────────────────────────────────────────

def _split_name(value: Optional[str]) -> Tuple[Optional[str], Optional[str]]:
    """«Фамилия Имя …» → (last_name, first_name); одно слово — имя."""
    parts = (value or "").split()
    if not parts:
        return None, None
    if len(parts) == 1:
        return None, parts[0]
    return parts[0], parts[1]


def _approve_b2b(db: Session, request: Request, actor: User) -> AutomationResult:
    from app.models.settings import SiteSettings
    from app.services.email_service import (
        branding_from_settings,
        build_b2b_approved_html,
        normalize_locale,
    )

    payload = request.payload or {}
    email = (payload.get("email") or "").strip().lower()
    if not email:
        raise AutomationError("В заявке нет email клиента")

    locale = normalize_locale(payload.get("locale"))
    contact_name = (payload.get("contact_name") or "").strip() or email
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
        last_name, first_name = _split_name(contact_name)
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

    if action not in ("ban", "unban"):
        raise AutomationError("Не указано действие: ban или unban")

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

        db.add(
            BanRecord(
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
