"""Presence maintenance tasks: stale sessions, retention cleanup."""
import json
import logging
import redis
from datetime import datetime, timedelta
from sqlalchemy import delete
from app.core.db import SessionLocal
from app.core.config import settings
from app.models.presence import PresenceSession, ProductView, ClientIp
from app.models.cart import CartItem
from app.services import presence_service
from app.workers import celery_app

logger = logging.getLogger(__name__)


@celery_app.task(name="cleanup_stale_presence")
def cleanup_stale_presence():
    """Закрывает «зависшие» онлайн-сессии и чистит протухшие ключи Redis.

    Клиент закрыл вкладку/браузер без корректного WS-close — точный last_seen
    лежит в Redis (heartbeat), по нему и определяем уход (PRESENCE_GRACE_SECONDS).
    """
    grace = timedelta(seconds=presence_service.PRESENCE_GRACE_SECONDS)
    now = datetime.utcnow()

    r = redis.Redis(
        host=settings.REDIS_HOST,
        port=settings.REDIS_PORT,
        decode_responses=True,
    )
    try:
        raw = r.hgetall(presence_service.PRESENCE_ONLINE_KEY)
    except Exception as e:
        logger.error(f"Redis unavailable in cleanup_stale_presence: {e}")
        raw = {}

    payloads = {}
    for key, value in raw.items():
        try:
            payloads[key] = json.loads(value)
        except (json.JSONDecodeError, TypeError):
            continue

    db = SessionLocal()
    try:
        stale_redis = [
            k for k, p in payloads.items()
            if (presence_service.parse_iso(p.get("last_seen")) or now) < now - grace
        ]
        closed = 0
        for row in db.query(PresenceSession).filter(PresenceSession.is_online == True).all():
            key = presence_service.client_key(row.user_id, row.session_id)
            pl = payloads.get(key)
            last_seen = presence_service.parse_iso(pl.get("last_seen")) if pl else None
            if last_seen and last_seen > (row.last_seen or row.first_seen):
                row.last_seen = last_seen
            if (last_seen or row.last_seen or now) < now - grace:
                row.offline_at = last_seen or row.last_seen or now
                row.is_online = False
                closed += 1
        if stale_redis:
            r.hdel(presence_service.PRESENCE_ONLINE_KEY, *stale_redis)
        db.commit()
        logger.info(
            f"Presence cleanup: closed {closed} stale sessions, "
            f"removed {len(stale_redis)} stale redis keys"
        )
    except Exception as e:
        db.rollback()
        logger.error(f"Presence cleanup failed: {e}")
        raise
    finally:
        db.close()


@celery_app.task(name="cleanup_presence_logs")
def cleanup_presence_logs():
    """Удаляет старые сессии присутствия, просмотры товаров и анонимные корзины."""
    cutoff = datetime.utcnow() - timedelta(days=presence_service.PRESENCE_HISTORY_DAYS)
    cart_cutoff = datetime.utcnow() - timedelta(days=presence_service.ANON_CART_RETENTION_DAYS)
    ip_cutoff = datetime.utcnow() - timedelta(days=presence_service.CLIENT_IP_HISTORY_DAYS)

    db = SessionLocal()
    try:
        sessions = db.execute(
            delete(PresenceSession).where(PresenceSession.first_seen < cutoff)
        )
        views = db.execute(
            delete(ProductView).where(ProductView.viewed_at < cutoff)
        )
        carts = db.execute(
            delete(CartItem).where(
                CartItem.session_id.isnot(None),
                CartItem.created_at < cart_cutoff,
            )
        )
        ips = db.execute(
            delete(ClientIp).where(ClientIp.last_seen < ip_cutoff)
        )
        db.commit()
        logger.info(
            f"Presence log cleanup: sessions={sessions.rowcount}, "
            f"views={views.rowcount}, anon_carts={carts.rowcount}, "
            f"client_ips={ips.rowcount}"
        )
    except Exception as e:
        db.rollback()
        logger.error(f"Presence log cleanup failed: {e}")
        raise
    finally:
        db.close()
