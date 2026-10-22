from sqlalchemy import (
    Column, Integer, String, Boolean, Text, DateTime, ForeignKey, Index,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship
from .vehicles import Base
from datetime import datetime


class BanRecord(Base):
    __tablename__ = "ban_records"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    email = Column(String, nullable=True)
    ip_address = Column(String, nullable=True)
    reason = Column(Text, nullable=False)
    banned_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    banned_at = Column(DateTime, default=datetime.utcnow)
    unbanned_at = Column(DateTime, nullable=True)
    is_active = Column(Boolean, default=True, index=True)
    block_count = Column(Integer, default=1)
    ban_type = Column(String, default="manual")  # manual / auto

    __table_args__ = (
        Index("idx_ban_email_active", "email", "is_active"),
        Index("idx_ban_user_active", "user_id", "is_active"),
    )

    user = relationship("User", foreign_keys=[user_id], backref="ban_records")
    banned_by = relationship("User", foreign_keys=[banned_by_id])
    ips = relationship(
        "BanIp", back_populates="ban", cascade="all, delete-orphan"
    )


class BanIp(Base):
    """IP-адреса, заблокированные конкретным баном.

    При бане сюда попадают все известные IP пользователя (история визитов,
    события защиты, прошлые баны). Новые IP забаненного аккаунта добавляются
    при попытке входа/запроса. Проверка блокировки идёт только по активным
    банам (BanRecord.is_active), поэтому история IP сохраняется после разбана.
    """

    __tablename__ = "ban_ips"

    id = Column(Integer, primary_key=True, autoincrement=True)
    ban_id = Column(
        Integer,
        ForeignKey("ban_records.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    ip_address = Column(String, nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("ban_id", "ip_address", name="uq_ban_ips_ban_ip"),
    )

    ban = relationship("BanRecord", back_populates="ips")


class ProtectionEvent(Base):
    __tablename__ = "protection_events"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    email = Column(String, nullable=True)
    ip_address = Column(String, nullable=True)
    event_type = Column(String, nullable=False, index=True)
    description = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

    __table_args__ = (
        Index("idx_event_user", "user_id", "event_type"),
        Index("idx_event_created", "created_at"),
    )

    user = relationship("User", backref="protection_events")


class Whitelist(Base):
    __tablename__ = "whitelist"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    email = Column(String, unique=True, nullable=True)
    ip_address = Column(String, unique=True, nullable=True)
    reason = Column(Text, nullable=True)
    added_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    added_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", foreign_keys=[user_id], backref="whitelist_entries")
    added_by = relationship("User", foreign_keys=[added_by_id])
