"""Журнал заявок: фоновые задачи по срокам и авто-закрытию.

Раз в 5 минут проверяем открытые заявки с истёкшим сроком и, если по ним
ещё не уведомляли (overdue_notified_at пуст), пишем в Telegram-чат магазина.
Раз в час закрываем заявки, по которым решение принято 7 дней назад.
В приложении просрочка видна мгновенно (WS + alerts), это — страховка для
тех, кто не держит админку открытой.
"""
import asyncio
import logging
from datetime import datetime, timedelta

from app.core.db import SessionLocal
from app.models.requests import Request, RequestStatus
from app.services import requests_service as rs
from app.services import telegram_format
from app.services.notifications import send_telegram_notification
from app.workers import celery_app

logger = logging.getLogger(__name__)

# Через сколько дней после решения заявка закрывается автоматически
AUTO_CLOSE_AFTER_DAYS = 7


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


@celery_app.task(name="auto_close_requests")
def auto_close_requests():
    """Закрыть заявки, по которым решение принято 7 дней назад."""
    db = SessionLocal()
    try:
        now = datetime.utcnow()
        cutoff = now - timedelta(days=AUTO_CLOSE_AFTER_DAYS)
        decided_requests = (
            db.query(Request)
            .filter(
                Request.status.in_([RequestStatus.RESOLVED, RequestStatus.REJECTED]),
                Request.resolved_at.isnot(None),
                Request.resolved_at <= cutoff,
            )
            .all()
        )

        for request in decided_requests:
            request.status = RequestStatus.CLOSED
            request.updated_at = now
            rs.log_event(
                db,
                request,
                None,
                "closed",
                f"закрыта автоматически спустя {AUTO_CLOSE_AFTER_DAYS} дней после решения",
            )

        if decided_requests:
            db.commit()
            logger.info("Auto-closed %s requests", len(decided_requests))
    finally:
        db.close()


@celery_app.task(name="autoassign_requests")
def autoassign_requests():
    """Автоназначение исполнителей открытым заявкам по фиксации входа.

    Кандидаты — на смене (вход зафиксирован, выхода нет), роль позволяет
    брать заявки категории; берём последнего, кто зафиксировался. Работает,
    пока не истёк срок заявки; при выключенной фиксации не назначает никого.
    """
    db = SessionLocal()
    try:
        from app.services.request_autoassign import autoassign_open_requests

        assigned = autoassign_open_requests(db)
        if assigned:
            logger.info("Auto-assigned assignees for %s requests", assigned)
    finally:
        db.close()
