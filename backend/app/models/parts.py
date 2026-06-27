from sqlalchemy import Column, Integer, String, ForeignKey, Text, Boolean, DateTime, Index
from sqlalchemy.orm import relationship
from datetime import datetime
from .vehicles import Base


class PartCategory(Base):
    __tablename__ = "part_categories"

    id = Column(Integer, primary_key=True, autoincrement=True)
    parent_id = Column(Integer, ForeignKey("part_categories.id"), nullable=True)
    name = Column(String, nullable=False)
    name_ua = Column(String, nullable=True)
    name_en = Column(String, nullable=True)
    tecdoc_id = Column(Integer, unique=True, index=True, nullable=True)

    children = relationship("PartCategory")


class Part(Base):
    __tablename__ = "parts"

    id = Column(Integer, primary_key=True, autoincrement=True)
    article = Column(String, nullable=False, index=True)
    brand = Column(String, nullable=True, index=True)
    brand_id = Column(Integer, nullable=False, index=True)
    name = Column(String, nullable=False)
    sku = Column(String, unique=True, nullable=True, index=True)
    category_id = Column(Integer, ForeignKey("part_categories.id"), nullable=True, index=True)
    tecdoc_id = Column(Integer, unique=True, index=True, nullable=True)
    description = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True, index=True)
    deactivated_at = Column(DateTime, nullable=True)
    deactivation_reason = Column(String, nullable=True)
    image_url = Column(String, nullable=True)
    matched_at = Column(DateTime, nullable=True)

    __table_args__ = (
        Index("idx_part_article_brand", "article", "brand"),
    )

    category = relationship("PartCategory")
    offers = relationship("SupplierOffer", back_populates="part")


class PartApplicability(Base):
    __tablename__ = "part_applicability"

    part_id = Column(Integer, ForeignKey("parts.id"), primary_key=True)
    mod_id = Column(Integer, ForeignKey("vehicle_modifications.id"), primary_key=True)

    part = relationship("Part")
    modification = relationship("VehicleModification")
