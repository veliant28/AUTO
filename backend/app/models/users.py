from sqlalchemy import Column, Integer, String, Boolean, ForeignKey, Enum
from sqlalchemy.orm import relationship
import enum
from .vehicles import Base

class UserRole(enum.Enum):
    RETAIL = "retail"
    B2B = "b2b"
    OPERATOR = "operator"
    MANAGER = "manager"
    ADMIN = "admin"

class User(Base):
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    email = Column(String, unique=True, nullable=False, index=True)
    password_hash = Column(String, nullable=False)
    full_name = Column(String, nullable=True)
    role = Column(Enum(UserRole), default=UserRole.RETAIL, nullable=False)
    is_active = Column(Boolean, default=True)
    phone = Column(String, nullable=True)
    created_at = Column(String, nullable=True)
    
    garage = relationship("UserGarage", back_populates="user")

class UserGarage(Base):
    __tablename__ = "user_garage"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    mod_id = Column(Integer, ForeignKey("vehicle_modifications.id"), nullable=False)
    added_at = Column(String, nullable=True) # Simulating timestamp for brevity
    
    user = relationship("User", back_populates="garage")
    modification = relationship("VehicleModification")
