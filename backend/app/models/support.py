from sqlalchemy import Column, Integer, String, ForeignKey, DateTime, Enum as SAEnum, Text
from sqlalchemy.orm import relationship
from datetime import datetime
import enum
from .vehicles import Base


class ChatStatus(enum.Enum):
    NEW = "new"
    ACTIVE = "active"
    CLOSED = "closed"


class SenderRole(enum.Enum):
    USER = "user"
    ADMIN = "admin"


class ChatConversation(Base):
    __tablename__ = "chat_conversations"

    id = Column(Integer, primary_key=True, autoincrement=True)
    ticket_number = Column(String(20), unique=True, index=True, nullable=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    status = Column(SAEnum(ChatStatus, name="chatstatus", create_type=False), default=ChatStatus.NEW, nullable=False, index=True)
    assigned_to = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = relationship("User", foreign_keys=[user_id], lazy="joined")
    assignee = relationship("User", foreign_keys=[assigned_to], lazy="joined")
    messages = relationship("ChatMessage", back_populates="conversation", order_by="ChatMessage.created_at", cascade="all, delete-orphan")


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id = Column(Integer, primary_key=True, autoincrement=True)
    conversation_id = Column(Integer, ForeignKey("chat_conversations.id"), nullable=False, index=True)
    sender_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    sender_role = Column(SAEnum(SenderRole, name="senderrole", create_type=False), nullable=False)
    message = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    conversation = relationship("ChatConversation", back_populates="messages")
    sender = relationship("User", foreign_keys=[sender_id], lazy="joined")
