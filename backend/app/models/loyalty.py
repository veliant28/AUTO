from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Index, Numeric
from sqlalchemy.orm import relationship
from datetime import datetime
from .vehicles import Base


class Promocode(Base):
    __tablename__ = "promocodes"

    id = Column(Integer, primary_key=True, autoincrement=True)
    code = Column(String(10), unique=True, nullable=False, index=True)
    type = Column(String, nullable=False)  # 'delivery' | 'margin'
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    discount_percent = Column(Integer, default=100)
    reason = Column(String, nullable=False)
    issued_by_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    expires_at = Column(DateTime, nullable=False)
    used_at = Column(DateTime, nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", foreign_keys=[user_id])
    issued_by = relationship("User", foreign_keys=[issued_by_id])

    __table_args__ = (
        Index("idx_promocode_created", "created_at"),
        Index("idx_promocode_user", "user_id"),
        Index("idx_promocode_issued_by", "issued_by_id"),
    )
