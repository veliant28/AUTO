from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Index, UniqueConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from .vehicles import Base


class ClientIp(Base):
    """IP-адреса клиента (ключ u{user_id} / s{session_id}).

    Один заход на сайт (WS-коннект) = +1 к visits. Хранится долго (2 года),
    в отличие от presence_sessions (ретеншн 90 дней).
    """

    __tablename__ = "client_ips"

    id = Column(Integer, primary_key=True, autoincrement=True)
    client_key = Column(String(80), nullable=False, index=True)
    ip = Column(String(64), nullable=False)
    first_seen = Column(DateTime, nullable=False, default=func.now())
    last_seen = Column(DateTime, nullable=False, default=func.now())
    visits = Column(Integer, nullable=False, default=1)

    __table_args__ = (
        UniqueConstraint("client_key", "ip", name="uq_client_ips_key_ip"),
    )


class PresenceSession(Base):
    """Одна непрерывная сессия присутствия клиента (одно WS-подключение).

    Зарегистрированные пользователи идентифицируются по user_id,
    анонимные посетители — по session_id (UUID из localStorage).
    """

    __tablename__ = "presence_sessions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    session_id = Column(String(64), nullable=True, index=True)
    ip = Column(String(64), nullable=True)
    first_seen = Column(DateTime, nullable=False, default=func.now(), index=True)
    last_seen = Column(DateTime, nullable=False, default=func.now())
    offline_at = Column(DateTime, nullable=True)
    is_online = Column(Boolean, nullable=False, default=True, index=True)

    __table_args__ = (
        Index("idx_presence_first_seen", "first_seen"),
    )

    user = relationship("User", foreign_keys=[user_id])


class ProductView(Base):
    """Просмотр товара клиентом.

    Храним последние 100 просмотров на клиента (прунинг на запись).
    supplier_offer_id фиксирует поставщика/цену, показанные на момент просмотра.
    """

    __tablename__ = "product_views"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    session_id = Column(String(64), nullable=True, index=True)
    part_id = Column(Integer, ForeignKey("parts.id"), nullable=False, index=True)
    supplier_offer_id = Column(Integer, ForeignKey("supplier_offers.id"), nullable=True)
    viewed_at = Column(DateTime, nullable=False, default=func.now(), index=True)

    __table_args__ = (
        Index("idx_product_views_user_time", "user_id", "viewed_at"),
        Index("idx_product_views_session_time", "session_id", "viewed_at"),
    )

    part = relationship("Part")
    offer = relationship("SupplierOffer")
