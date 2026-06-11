from sqlalchemy import Column, Integer, String, Boolean, ForeignKey
from sqlalchemy.orm import relationship
from .vehicles import Base

class User(Base):
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    email = Column(String, unique=True, nullable=False, index=True)
    password_hash = Column(String, nullable=False)
    full_name = Column(String, nullable=True)
    first_name = Column(String, nullable=True)
    last_name = Column(String, nullable=True)
    middle_name = Column(String, nullable=True)
    is_active = Column(Boolean, default=True)
    phone = Column(String, nullable=True)
    delivery_type = Column(String, nullable=True)
    delivery_city = Column(String, nullable=True)
    delivery_warehouse = Column(String, nullable=True)
    created_at = Column(String, nullable=True)
    role_id = Column(Integer, ForeignKey("roles.id"), nullable=False)
    
    garage = relationship("UserGarage", back_populates="user")
    role = relationship("Role", back_populates="users")

class UserGarage(Base):
    __tablename__ = "user_garage"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    mod_id = Column(Integer, ForeignKey("vehicle_modifications.id"), nullable=True)
    added_at = Column(String, nullable=True) # Simulating timestamp for brevity
    tecdoc_car_id = Column(Integer, nullable=True)
    
    user = relationship("User", back_populates="garage")
    modification = relationship("VehicleModification")
