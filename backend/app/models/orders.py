from sqlalchemy import Column, Integer, String, ForeignKey, Numeric, DateTime, Enum, Text, Index
from sqlalchemy.orm import relationship
from datetime import datetime
import enum
from .vehicles import Base

class OrderStatus(enum.Enum):
    PENDING = "pending"
    CONFIRMED = "confirmed"
    PROCESSING = "processing"
    SHIPPED = "shipped"
    DELIVERED = "delivered"
    CANCELLED = "cancelled"

class Order(Base):
    __tablename__ = "orders"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    order_number = Column(String(20), unique=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    status = Column(Enum(OrderStatus), default=OrderStatus.PENDING, nullable=False, index=True)
    total = Column(Numeric(10, 2), nullable=False)
    full_name = Column(String, nullable=False)
    phone = Column(String, nullable=False)
    address = Column(Text, nullable=True)
    last_name = Column(String, nullable=True)
    first_name = Column(String, nullable=True)
    middle_name = Column(String, nullable=True)
    delivery_type = Column(String, nullable=True)
    delivery_city = Column(String, nullable=True)
    delivery_warehouse = Column(String, nullable=True)
    payment_method = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    updated_by_name = Column(String, nullable=True)
    updated_by_group = Column(String, nullable=True)
    updated_at = Column(DateTime, nullable=True)
    first_delivered_at = Column(DateTime, nullable=True)

    __table_args__ = (
        Index("idx_order_user_status", "user_id", "status"),
        Index("idx_order_status_created", "status", "created_at"),
    )
    
    user = relationship("User", foreign_keys=[user_id])
    updated_by = relationship("User", foreign_keys=[updated_by_user_id])
    items = relationship("OrderItem", back_populates="order")
    change_logs = relationship("OrderChangeLog", back_populates="order", order_by="OrderChangeLog.created_at.desc()")

class OrderItem(Base):
    __tablename__ = "order_items"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    order_id = Column(Integer, ForeignKey("orders.id"), nullable=False, index=True)
    part_id = Column(Integer, ForeignKey("parts.id"), nullable=False, index=True)
    quantity = Column(Integer, default=1, nullable=False)
    price = Column(Numeric(10, 2), nullable=False)
    
    order = relationship("Order", back_populates="items")
    part = relationship("Part")

class OrderChangeLog(Base):
    __tablename__ = "order_change_logs"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    order_id = Column(Integer, ForeignKey("orders.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    user_name = Column(String, nullable=True)
    user_group = Column(String, nullable=True)
    action = Column(String, nullable=False)
    details = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    order = relationship("Order", back_populates="change_logs")
