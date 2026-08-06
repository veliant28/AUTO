"""Presence service: online state in Redis + persistent sessions in Postgres.

Ключ клиента: "u{user_id}" для зарегистрированных, "s{session_id}" для анонимов.
WS-сообщения (heartbeat) не проходят через ProtectionMiddleware, поэтому лимиты
не тратятся; проверка бана выполняется в самом WS-эндпоинте через check_ban().
"""
import json
import logging
import uuid
from datetime import datetime, timedelta
from typing import Dict, List, Optional

from sqlalchemy.orm import Session

from app.core.redis_client import redis_client
from app.models.presence import PresenceSession
from app.models.protection import BanRecord

logger = logging.getLogger(__name__)

# Redis: hash "presence:online" {client_key -> payload JSON}
PRESENCE_ONLINE_KEY = "presence:online"
# TTL хэша в целом (обновляется каждым heartbeat) — страховка на случай
# полной остановки трафика; точную чистку делает celery-задача.
PRESENCE_TTL_SECONDS = 90
# Порог «оффлайн» — клиент считается ушедшим, если heartbeat молчит дольше.
PRESENCE_GRACE_SECONDS = 90
# Сколько храним историю присутствия и просмотров.
PRESENCE_HISTORY_DAYS = 90
# Сколько храним анонимные корзины.
ANON_CART_RETENTION_DAYS = 30
# Лимит имён в один час графика (дальше фронт показывает "+N").
CHART_NAMES_LIMIT = 20
# Группы в фиксированном порядке (последняя — анонимы).
GROUPS = ["retail", "b2b", "operator", "manager", "admin", "anon"]
REGISTERED_GROUPS = GROUPS[:-1]


def client_key(user_id: Optional[int], session_id: Optional[str]) -> Optional[str]:
    if user_id:
        return f"u{user_id}"
    if session_id:
        return f"s{session_id}"
    return None


def client_key_parts(key: str) -> tuple:
    """("u"|"s", value) из ключа вида u5 / sabc123."""
    return key[0], key[1:]


def _payload(user_id: Optional[int], session_id: Optional[str], ip: Optional[str]) -> dict:
    now = datetime.utcnow().isoformat()
    return {
        "conn_id": uuid.uuid4().hex,
        "user_id": user_id,
        "session_id": session_id,
        "ip": ip,
        "first_seen": now,
        "last_seen": now,
    }


async def mark_online(user_id: Optional[int], session_id: Optional[str], ip: Optional[str]) -> Optional[tuple]:
    """Регистрирует присутствие, возвращает (client_key, conn_id)."""
    key = client_key(user_id, session_id)
    if not key:
        return None
    r = await redis_client.get_client()
    payload = _payload(user_id, session_id, ip)
    await r.hset(PRESENCE_ONLINE_KEY, key, json.dumps(payload))
    await r.expire(PRESENCE_ONLINE_KEY, PRESENCE_TTL_SECONDS)
    return key, payload["conn_id"]


async def touch(key: str, user_id: Optional[int], session_id: Optional[str], ip: Optional[str]) -> None:
    """Обновить last_seen. Если ключ пропал (гонка HDEL/HSET при реконнекте)
    или протух — восстанавливаем: соединение живо, присутствие должно жить."""
    r = await redis_client.get_client()
    raw = await r.hget(PRESENCE_ONLINE_KEY, key)
    now = datetime.utcnow().isoformat()
    if raw is not None:
        try:
            payload = json.loads(raw)
        except (json.JSONDecodeError, TypeError):
            payload = {}
        payload["last_seen"] = now
        await r.hset(PRESENCE_ONLINE_KEY, key, json.dumps(payload))
    else:
        payload = _payload(user_id, session_id, ip)
        payload["last_seen"] = now
        await r.hset(PRESENCE_ONLINE_KEY, key, json.dumps(payload))
    await r.expire(PRESENCE_ONLINE_KEY, PRESENCE_TTL_SECONDS)


async def mark_offline(key: str, conn_id: Optional[str] = None) -> None:
    """Снять присутствие. Если conn_id указан и в Redis уже запись другого
    (нового) соединения того же клиента — не удаляем её."""
    r = await redis_client.get_client()
    if conn_id:
        raw = await r.hget(PRESENCE_ONLINE_KEY, key)
        if raw is not None:
            try:
                payload = json.loads(raw)
            except (json.JSONDecodeError, TypeError):
                payload = {}
            if payload.get("conn_id") != conn_id:
                return
    await r.hdel(PRESENCE_ONLINE_KEY, key)


async def get_online_payloads() -> List[dict]:
    """Все онлайн-клиенты: [{client_key, user_id, session_id, ip, first_seen, last_seen}]."""
    r = await redis_client.get_client()
    raw = await r.hgetall(PRESENCE_ONLINE_KEY)
    result = []
    for key, value in raw.items():
        try:
            payload = json.loads(value)
        except (json.JSONDecodeError, TypeError):
            continue
        payload["client_key"] = key
        result.append(payload)
    return result


async def get_online_keys() -> set:
    r = await redis_client.get_client()
    keys = await r.hkeys(PRESENCE_ONLINE_KEY)
    return set(keys)


def create_session(db: Session, user_id: Optional[int], session_id: Optional[str], ip: Optional[str]) -> PresenceSession:
    row = PresenceSession(
        user_id=user_id,
        session_id=session_id if user_id is None else None,
        ip=ip,
        first_seen=datetime.utcnow(),
        last_seen=datetime.utcnow(),
        offline_at=None,
        is_online=True,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def close_session(db: Session, session_id_row: int) -> None:
    row = db.query(PresenceSession).filter(PresenceSession.id == session_id_row).first()
    if not row or not row.is_online:
        return
    row.offline_at = datetime.utcnow()
    row.is_online = False
    db.commit()


def check_ban(db: Session, ip: Optional[str], user_id: Optional[int]) -> Optional[BanRecord]:
    """Активный бан по IP или user_id (как в ProtectionMiddleware)."""
    if ip:
        ban = db.query(BanRecord).filter(
            BanRecord.is_active == True,
            BanRecord.ip_address == ip,
        ).first()
        if ban:
            return ban
    if user_id:
        ban = db.query(BanRecord).filter(
            BanRecord.is_active == True,
            BanRecord.user_id == user_id,
        ).first()
        if ban:
            return ban
    return None


def parse_iso(value: str) -> Optional[datetime]:
    try:
        return datetime.fromisoformat(value)
    except (ValueError, TypeError):
        return None
