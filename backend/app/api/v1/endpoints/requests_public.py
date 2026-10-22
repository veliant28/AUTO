"""Публичные заявки с витрины: регистрация B2B-клиента.

Пользователь по заявке не создаётся: она попадает в журнал админки, решение
принимает администратор (одобрение/отклонение), письмо уходит клиенту.
"""
import asyncio
import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.models.requests import (
    CATEGORY_B2B_REGISTRATION,
    Request,
    RequestCategory,
    RequestComment,
    RequestStatus,
)
from app.schemas.requests_schemas import B2BApplicationIn, B2BApplicationResponse
from app.services import requests_service as rs


def _trigger_autoassign() -> None:
    """Попробовать сразу назначить исполнителя по фиксации (не критично при сбое)."""
    try:
        from app.workers.tasks.request_tasks import autoassign_requests

        autoassign_requests.delay()
    except Exception:
        pass
from app.services import telegram_format
from app.services.email_service import normalize_locale
from app.services.notifications import send_telegram_notification

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/b2b-application", response_model=B2BApplicationResponse)
async def submit_b2b_application(
    data: B2BApplicationIn,
    db: Session = Depends(get_db),
):
    """Приём заявки на B2B-регистрацию с витрины (для гостя или клиента)."""
    category = (
        db.query(RequestCategory)
        .filter(RequestCategory.code == CATEGORY_B2B_REGISTRATION)
        .first()
    )
    if not category or not category.is_active:
        raise HTTPException(400, "Приём B2B-заявок временно недоступен")

    comment_text = (data.comment or "").strip()
    payload = {
        "company": data.company.strip(),
        "edrpou": (data.edrpou or "").strip() or None,
        "contact_last_name": (data.contact_last_name or "").strip() or None,
        "contact_first_name": (data.contact_first_name or "").strip() or None,
        "contact_middle_name": (data.contact_middle_name or "").strip() or None,
        "phone": data.phone.strip(),
        "email": str(data.email).strip().lower(),
        "city": (data.city or "").strip() or None,
        "locale": normalize_locale(data.locale),
    }
    legacy_contact = (data.contact_name or "").strip()
    if legacy_contact:
        # Заявка от старой сборки витрины — контакт пришёл одной строкой
        payload["contact_name"] = legacy_contact

    now = rs.now_utc()
    response_due, due = rs.category_due_snapshot(category, now)
    request = Request(
        category_id=category.id,
        status=RequestStatus.NEW,
        description=None,
        payload=payload,
        created_by_id=None,
        response_due_at=response_due,
        due_at=due,
        created_at=now,
        updated_at=now,
    )
    db.add(request)
    db.flush()
    request.number = f"REQ-{request.id:010d}"
    if comment_text:
        # Комментарий клиента — обычный комментарий заявки (правая колонка)
        db.add(
            RequestComment(
                request_id=request.id,
                user_id=None,
                author_name=rs.contact_display_name(payload) or "Клиент",
                author_group=None,
                text=comment_text,
                created_at=now,
            )
        )
    rs.log_event(db, request, None, "created", "заявка с витрины (B2B-регистрация)")
    db.commit()
    db.refresh(request)

    # Телеграм-уведомление магазину и мгновенное событие в журнале админки
    try:
        asyncio.ensure_future(
            send_telegram_notification(
                telegram_format.new_request(
                    number=request.number,
                    category=category.name,
                    author=payload["email"],
                )
            )
        )
    except Exception:
        logger.warning("B2B request telegram notify failed", exc_info=True)
    rs.notify_request_event(request, "request_created", db)

    _trigger_autoassign()

    return B2BApplicationResponse(request_number=request.number)
