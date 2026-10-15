"""Журнал заявок: уведомление в Telegram о просроченных заявках.

Раз в 5 минут проверяем открытые заявки с истёкшим сроком и, если по ним
ещё не уведомляли (overdue_notified_at пуст), пишем в Telegram-чат магазина.
В приложении просрочка видна мгновенно (WS + alerts), это — страховка для
тех, кто не держит админку открытой.
"""
import asyncio
import logging
from datetime import datetime

from app.core.db import SessionLocal
from app.models.requests import Request, RequestStatus
from app.services import requests_service as rs
from app.services import telegram_format
from app.services.notifications import send_telegram_notification
from app.workers import celery_app

logger = logging.getLogger(__name__)


@celery_app.task(name="notify_overdue_requests")
def notify_overdue_requests():
    """Telegram-уведомление о просроченных заявках (один раз на заявку)."""
    db = SessionLocal()
    try:
        now = datetime.utcnow()
        open_requests = (
            db.query(Request)
            .filter(
                Request.status.in_([RequestStatus.NEW, RequestStatus.IN_PROGRESS]),
                Request.overdue_notified_at.is_(None),
            )
            .all()
        )

        notified = 0
        for request in open_requests:
            deadline = rs.effective_deadline(request)
            if deadline is None or now < deadline:
                continue

            minutes_late = int((now - deadline).total_seconds() // 60)
            try:
                asyncio.run(
                    send_telegram_notification(
                        telegram_format.request_overdue(
                            number=request.number or f"REQ-{request.id:010d}",
                            title=request.title,
                            category=request.category.name if request.category else "—",
                            minutes_late=minutes_late,
                        )
                    )
                )
            except Exception:
                logger.warning("overdue request telegram failed", exc_info=True)

            request.overdue_notified_at = now
            rs.log_event(
                db,
                request,
                None,
                "overdue",
                f"срок истёк {minutes_late} мин назад — уведомление в Telegram",
            )
            notified += 1

        if notified:
            db.commit()
            logger.info("Notified about %s overdue requests", notified)
    finally:
        db.close()
