from sqlalchemy import Column, Integer, String, DateTime, Boolean
from datetime import datetime
from .vehicles import Base

class TelegramLink(Base):
    __tablename__ = "telegram_links"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, nullable=False, index=True)
    chat_id = Column(Integer, nullable=True)
    code = Column(String, nullable=True)
    code_expires_at = Column(DateTime, nullable=True)
    telegram_username = Column(String, nullable=True)
    connected = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
