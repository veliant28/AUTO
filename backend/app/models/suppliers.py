from sqlalchemy import Column, Integer, String, ForeignKey, Float, Numeric, DateTime, JSON, UniqueConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from .parts import Base


class Supplier(Base):
    __tablename__ = "suppliers"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String, nullable=False)
    tecdoc_id = Column(Integer, unique=True, index=True, nullable=True)
    contact_info = Column(String, nullable=True)

    offers = relationship("SupplierOffer", back_populates="supplier")


class SupplierOffer(Base):
    __tablename__ = "supplier_offers"

    id = Column(Integer, primary_key=True, autoincrement=True)
    part_id = Column(Integer, ForeignKey("parts.id"), nullable=False, index=True)
    supplier_id = Column(Integer, ForeignKey("suppliers.id"), nullable=False)
    price = Column(Numeric(10, 2), nullable=False)
    currency = Column(String, default="RUB", nullable=False)
    quantity = Column(Integer, default=0)
    delivery_days = Column(Integer, default=0)
    stock_regions = Column(JSON, nullable=True)
    updated_at = Column(DateTime, default=func.now())

    __table_args__ = (
        UniqueConstraint('part_id', 'supplier_id', name='uq_supplier_offers_part_supplier'),
    )

    supplier = relationship("Supplier", back_populates="offers")
    part = relationship("Part", back_populates="offers")
