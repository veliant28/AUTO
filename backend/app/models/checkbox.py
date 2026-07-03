from sqlalchemy import Column, Integer, String, ForeignKey, DateTime, Text, Boolean
from sqlalchemy.orm import relationship
from datetime import datetime
from .vehicles import Base


class OrderCheckboxReceipt(Base):
    __tablename__ = "order_checkbox_receipts"

    id = Column(Integer, primary_key=True, autoincrement=True)
    order_id = Column(Integer, ForeignKey("orders.id"), nullable=False, index=True)
    receipt_id = Column(String(100), nullable=True, comment="ID чека в Checkbox")
    status = Column(String(20), default="pending", nullable=False, comment="pending | created | error")
    fiscal_code = Column(String(100), nullable=True, comment="Фіскальний номер")
    fiscal_date = Column(DateTime, nullable=True)
    receipt_url = Column(Text, nullable=True, comment="Посилання на чек")
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    order = relationship("Order", backref="checkbox_receipts")
