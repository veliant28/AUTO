from sqlalchemy import Column, Integer, String, ForeignKey, UniqueConstraint, Text
from sqlalchemy.orm import relationship
from .vehicles import Base

class PartCategory(Base):
    __tablename__ = "part_categories"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    parent_id = Column(Integer, ForeignKey("part_categories.id"), nullable=True)
    name = Column(String, nullable=False)
    tecdoc_id = Column(Integer, unique=True, index=True, nullable=True)
    
    children = relationship("PartCategory")

class Part(Base):
    __tablename__ = "parts"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    article = Column(String, nullable=False, unique=True, index=True)
    brand_id = Column(Integer, nullable=False) # TecDoc supplier id
    name = Column(String, nullable=False)
    category_id = Column(Integer, ForeignKey("part_categories.id"), nullable=True)
    tecdoc_id = Column(Integer, unique=True, index=True, nullable=True)
    description = Column(Text, nullable=True)
    
    category = relationship("PartCategory")

class PartApplicability(Base):
    __tablename__ = "part_applicability"
    
    part_id = Column(Integer, ForeignKey("parts.id"), primary_key=True)
    mod_id = Column(Integer, ForeignKey("vehicle_modifications.id"), primary_key=True)
    
    # Link back to Part and Modification
    part = relationship("Part")
    modification = relationship("VehicleModification")
