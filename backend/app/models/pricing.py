from sqlalchemy import Column, Integer, String, Numeric, DateTime, Boolean, ForeignKey
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from .vehicles import Base


class PriceRule(Base):
    __tablename__ = "price_rules"

    id = Column(Integer, primary_key=True, autoincrement=True)
    type = Column(String(20), nullable=False, default="general")
    category_id = Column(Integer, ForeignKey("part_categories.id"), nullable=True, index=True)
    margin_percent = Column(Numeric(6, 2), nullable=False, default=0)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    category = relationship("PartCategory")
    history = relationship("PriceRuleHistory", back_populates="price_rule", cascade="all, delete-orphan")


class PriceRuleHistory(Base):
    __tablename__ = "price_rule_history"

    id = Column(Integer, primary_key=True, autoincrement=True)
    price_rule_id = Column(Integer, ForeignKey("price_rules.id", ondelete="CASCADE"), nullable=False, index=True)
    old_percent = Column(Numeric(6, 2), nullable=False)
    new_percent = Column(Numeric(6, 2), nullable=False)
    changed_at = Column(DateTime, server_default=func.now())

    price_rule = relationship("PriceRule", back_populates="history")
