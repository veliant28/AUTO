from sqlalchemy import Column, Integer, String, ForeignKey, Numeric, DateTime, Enum as SAEnum, Text
from sqlalchemy.orm import relationship
from datetime import datetime
import enum
from .vehicles import Base


class ReturnStatus(enum.Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    COMPLETED = "completed"


class ReturnRequest(Base):
    __tablename__ = "return_requests"

    id = Column(Integer, primary_key=True, autoincrement=True)
    return_number = Column(String(20), unique=True, index=True)
    order_id = Column(Integer, ForeignKey("orders.id"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    status = Column(SAEnum(ReturnStatus, name="returnstatus", create_type=False), default=ReturnStatus.PENDING, nullable=False, index=True)
    total_refund = Column(Numeric(10, 2), nullable=False, default=0)
    admin_notes = Column(Text, nullable=True)
    ttn_number = Column(String(20), nullable=True)

    # Return-specific recipient data (editable by admin, separate from order)
    return_phone = Column(String(32), nullable=True)
    return_last_name = Column(String(100), nullable=True)
    return_first_name = Column(String(100), nullable=True)
    return_middle_name = Column(String(100), nullable=True)
    return_delivery_city = Column(String(255), nullable=True)
    return_delivery_warehouse = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    approved_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    approved_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    updated_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    updated_by_name = Column(String, nullable=True)
    updated_by_group = Column(String, nullable=True)

    order = relationship("Order", foreign_keys=[order_id])
    user = relationship("User", foreign_keys=[user_id])
    approved_by = relationship("User", foreign_keys=[approved_by_user_id])
    updated_by = relationship("User", foreign_keys=[updated_by_user_id])
    items = relationship("ReturnItem", back_populates="return_request", cascade="all, delete-orphan")
    change_logs = relationship("ReturnChangeLog", back_populates="return_request", order_by="ReturnChangeLog.created_at.desc()")


class ReturnItem(Base):
    __tablename__ = "return_items"

    id = Column(Integer, primary_key=True, autoincrement=True)
    return_request_id = Column(Integer, ForeignKey("return_requests.id"), nullable=False, index=True)
    part_id = Column(Integer, ForeignKey("parts.id"), nullable=False)
    article = Column(String, nullable=False)
    part_name = Column(String, nullable=False)
    brand = Column(String, nullable=True)
    quantity = Column(Integer, nullable=False)
    price = Column(Numeric(10, 2), nullable=False)
    total = Column(Numeric(10, 2), nullable=False)

    return_request = relationship("ReturnRequest", back_populates="items")
    part = relationship("Part")


class ReturnChangeLog(Base):
    __tablename__ = "return_change_logs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    return_request_id = Column(Integer, ForeignKey("return_requests.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    user_name = Column(String, nullable=True)
    user_group = Column(String, nullable=True)
    action = Column(String, nullable=False)
    details = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    return_request = relationship("ReturnRequest", back_populates="change_logs")
