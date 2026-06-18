from sqlalchemy import Column, Integer, String, ForeignKey, Table, UniqueConstraint
from sqlalchemy.orm import DeclarativeBase, relationship

class Base(DeclarativeBase):
    pass

class VehicleBrand(Base):
    __tablename__ = "vehicle_brands"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String, nullable=False, index=True)
    tecdoc_id = Column(Integer, unique=True, index=True, nullable=True)
    group = Column(String, nullable=False, index=True)  # passenger, commercial, motorbike
    
    models = relationship("VehicleModel", back_populates="brand")

class VehicleModel(Base):
    __tablename__ = "vehicle_models"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    brand_id = Column(Integer, ForeignKey("vehicle_brands.id"), nullable=False)
    name = Column(String, nullable=False, index=True)
    tecdoc_id = Column(Integer, unique=True, index=True, nullable=True)
    
    brand = relationship("VehicleBrand", back_populates="models")
    modifications = relationship("VehicleModification", back_populates="model")

class VehicleModification(Base):
    __tablename__ = "vehicle_modifications"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    model_id = Column(Integer, ForeignKey("vehicle_models.id"), nullable=False)
    name = Column(String, nullable=False)
    tecdoc_id = Column(Integer, unique=True, index=True, nullable=True)
    
    model = relationship("VehicleModel", back_populates="modifications")
