"""Заявки (журнал): категории, заявки, комментарии и события.

Заявка — внутренний тикет для сотрудников: то, что оператор или менеджер не
может сделать сам (нет прав или доступа) и адресует администратору, либо
публичная заявка с витрины (регистрация B2B-клиента). Сроки реакции и решения
берутся из категории и фиксируются снимком на заявке при создании — правки
категории не меняют уже созданные заявки (как правила смены в фиксации).
"""
import enum
from datetime import datetime

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Integer,
    JSON,
    String,
    Text,
)
from sqlalchemy.orm import relationship

from .vehicles import Base

# Коды автоматизированных категорий (автоматизации привязаны к коду, не к названию)
CATEGORY_B2B_REGISTRATION = "b2b_registration"
CATEGORY_TIMESHEET_MANUAL = "timesheet_manual"
CATEGORY_BAN_UNBAN = "ban_unban"

# Статусы, в которых заявка считается открытой (срок ещё тикает)
OPEN_STATUSES = ("new", "in_progress")


class RequestStatus(enum.Enum):
    NEW = "new"
    IN_PROGRESS = "in_progress"
    RESOLVED = "resolved"
    REJECTED = "rejected"
    # Автоматический статус: заявка закрыта спустя 7 дней после решения
    CLOSED = "closed"


class RequestCategory(Base):
    __tablename__ = "request_categories"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(120), nullable=False)
    code = Column(String(50), nullable=False, unique=True, index=True)
    # Роли, которым разрешено создавать заявки этой категории
    # (["admin","manager"] и т.п.); пустой список = всем сотрудникам с requests.create
    allowed_roles = Column(JSON, nullable=True)
    # Роли, которые могут взять заявку этой категории в работу
    # (пусто = любой сотрудник с правом requests.process)
    take_roles = Column(JSON, nullable=True)
    description = Column(Text, nullable=True)
    # Сроки: реакция (взять в работу) и решение (закрыть), в минутах
    response_minutes = Column(Integer, nullable=True)
    resolve_minutes = Column(Integer, nullable=True)
    is_active = Column(Boolean, nullable=False, default=True, server_default="true")
    sort_order = Column(Integer, nullable=False, default=100, server_default="100")
    created_at = Column(DateTime, default=datetime.utcnow)


class Request(Base):
    __tablename__ = "requests"

    id = Column(Integer, primary_key=True, autoincrement=True)
    number = Column(String(20), unique=True, index=True)
    category_id = Column(Integer, ForeignKey("request_categories.id"), nullable=False, index=True)
    status = Column(Enum(RequestStatus), default=RequestStatus.NEW, nullable=False, index=True)
    title = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    # Данные заявки: поля B2B-анкеты, часы для табеля, клиент для бана и т.п.
    payload = Column(JSON, nullable=True)
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    assignee_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    # Снимок сроков (naive UTC): реакция и решение
    response_due_at = Column(DateTime, nullable=True)
    due_at = Column(DateTime, nullable=True)
    overdue_notified_at = Column(DateTime, nullable=True)
    resolved_at = Column(DateTime, nullable=True)
    resolved_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    category = relationship("RequestCategory", lazy="joined")
    created_by = relationship("User", foreign_keys=[created_by_id])
    assignee = relationship("User", foreign_keys=[assignee_id])
    resolved_by = relationship("User", foreign_keys=[resolved_by_id])
    comments = relationship(
        "RequestComment", back_populates="request", order_by="RequestComment.created_at"
    )
    events = relationship(
        "RequestEvent", back_populates="request", order_by="RequestEvent.created_at"
    )

    __table_args__ = (
        Index("idx_request_status_created", "status", "created_at"),
        Index("idx_request_assignee_status", "assignee_id", "status"),
    )


class RequestComment(Base):
    __tablename__ = "request_comments"

    id = Column(Integer, primary_key=True, autoincrement=True)
    request_id = Column(Integer, ForeignKey("requests.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    # Снимок автора (как в OrderChangeLog) — переживает удаление пользователя
    author_name = Column(String, nullable=True)
    author_group = Column(String, nullable=True)
    text = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

    request = relationship("Request", back_populates="comments")
    user = relationship("User")


class RequestEvent(Base):
    __tablename__ = "request_events"

    id = Column(Integer, primary_key=True, autoincrement=True)
    request_id = Column(Integer, ForeignKey("requests.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    author_name = Column(String, nullable=True)
    author_group = Column(String, nullable=True)
    # created | taken | assigned | status_changed | comment | approved | rejected | email_sent | automation | closed
    event_type = Column(String(40), nullable=False)
    details = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

    request = relationship("Request", back_populates="events")
    user = relationship("User")
