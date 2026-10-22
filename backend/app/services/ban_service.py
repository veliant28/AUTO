"""Блокировка всех известных IP пользователя при бане.

При создании бана в ban_ips складываются все IP, которые мы знаем:
история визитов (client_ips), события защиты и прошлые баны. Проверка
активности идёт через BanRecord.is_active, поэтому после разбана история
IP сохраняется, но больше не блокирует.
"""
from typing import Iterable, Optional, Set

from sqlalchemy.orm import Session

from app.models.presence import ClientIp
from app.models.protection import BanIp, BanRecord, ProtectionEvent


def collect_known_ips(
    db: Session,
    user_id: Optional[int] = None,
    email: Optional[str] = None,
    fallback_ip: Optional[str] = None,
) -> Set[str]:
    """Все известные IP пользователя/email."""
    ips: Set[str] = set()
    if fallback_ip:
        ips.add(fallback_ip)

    if user_id:
        ips.update(
            ip
            for (ip,) in db.query(ClientIp.ip)
            .filter(ClientIp.client_key == f"u{user_id}")
            .all()
            if ip
        )
        ips.update(
            ip
            for (ip,) in db.query(ProtectionEvent.ip_address)
            .filter(
                ProtectionEvent.user_id == user_id,
                ProtectionEvent.ip_address.isnot(None),
            )
            .all()
            if ip
        )
        ips.update(
            ip
            for (ip,) in db.query(BanRecord.ip_address)
            .filter(
                BanRecord.user_id == user_id,
                BanRecord.ip_address.isnot(None),
            )
            .all()
            if ip
        )

    if email:
        ips.update(
            ip
            for (ip,) in db.query(ProtectionEvent.ip_address)
            .filter(
                ProtectionEvent.email == email,
                ProtectionEvent.ip_address.isnot(None),
            )
            .all()
            if ip
        )
        ips.update(
            ip
            for (ip,) in db.query(BanRecord.ip_address)
            .filter(
                BanRecord.email == email,
                BanRecord.ip_address.isnot(None),
            )
            .all()
            if ip
        )

    return ips


def add_ban_ips(db: Session, ban: BanRecord, ips: Iterable[str]) -> int:
    """Добавить IP к бану без дублей. Требует заполненный ban.id."""
    existing = {
        row[0]
        for row in db.query(BanIp.ip_address)
        .filter(BanIp.ban_id == ban.id)
        .all()
    }
    added = 0
    for ip in ips:
        if ip and ip not in existing:
            db.add(BanIp(ban_id=ban.id, ip_address=ip))
            existing.add(ip)
            added += 1
    return added


def record_ban_ip(db: Session, ban: BanRecord, ip: Optional[str]) -> bool:
    """Добавить один новый IP к бану. True — если IP был новым."""
    if not ip:
        return False
    exists = (
        db.query(BanIp.id)
        .filter(BanIp.ban_id == ban.id, BanIp.ip_address == ip)
        .first()
    )
    if exists:
        return False
    db.add(BanIp(ban_id=ban.id, ip_address=ip))
    return True


def find_active_ban_by_ip(db: Session, ip: Optional[str]) -> Optional[BanRecord]:
    """Активный бан по IP: основное поле BanRecord или список ban_ips."""
    if not ip:
        return None
    ban = (
        db.query(BanRecord)
        .filter(BanRecord.is_active == True, BanRecord.ip_address == ip)
        .first()
    )
    if ban:
        return ban
    return (
        db.query(BanRecord)
        .join(BanIp, BanIp.ban_id == BanRecord.id)
        .filter(BanRecord.is_active == True, BanIp.ip_address == ip)
        .first()
    )


def find_active_ban_by_user(
    db: Session, user_id: Optional[int]
) -> Optional[BanRecord]:
    if not user_id:
        return None
    return (
        db.query(BanRecord)
        .filter(BanRecord.is_active == True, BanRecord.user_id == user_id)
        .first()
    )


def collect_known_ips_for_ban(db: Session, ban: BanRecord) -> Set[str]:
    user = ban.user
    return collect_known_ips(
        db,
        user_id=ban.user_id or (user.id if user else None),
        email=ban.email or (user.email if user else None),
        fallback_ip=ban.ip_address,
    )


def sync_ban_ips(db: Session, ban: BanRecord) -> int:
    """Дополнить активный бан всеми известными IP (без commit)."""
    if not ban.is_active:
        return 0
    return add_ban_ips(db, ban, collect_known_ips_for_ban(db, ban))
