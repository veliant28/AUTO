from pydantic import BaseModel, EmailStr
from typing import Optional, List
from enum import Enum

class UserRole(str, Enum):
    RETAIL = "retail"
    B2B = "b2b"
    OPERATOR = "operator"
    MANAGER = "manager"
    ADMIN = "admin"

class UserBase(BaseModel):
    email: EmailStr
    full_name: Optional[str] = None

class UserCreate(UserBase):
    password: str

class UserSchema(UserBase):
    id: int
    role: UserRole
    is_active: bool = True
    phone: Optional[str] = None
    last_name: Optional[str] = None
    first_name: Optional[str] = None
    middle_name: Optional[str] = None
    delivery_type: Optional[str] = None
    delivery_city: Optional[str] = None
    delivery_warehouse: Optional[str] = None

    class Config:
        from_attributes = True

class ProfileUpdate(BaseModel):
    last_name: Optional[str] = None
    first_name: Optional[str] = None
    middle_name: Optional[str] = None
    phone: Optional[str] = None
    delivery_type: Optional[str] = None
    delivery_city: Optional[str] = None
    delivery_warehouse: Optional[str] = None

class ChangePasswordSchema(BaseModel):
    current_password: str
    new_password: str

class AdminUserCreate(BaseModel):
    email: EmailStr
    password: str
    full_name: Optional[str] = None
    role: UserRole = UserRole.RETAIL
    is_active: bool = True
    phone: Optional[str] = None

class AdminUserUpdate(BaseModel):
    email: Optional[EmailStr] = None
    full_name: Optional[str] = None
    role: Optional[UserRole] = None
    is_active: Optional[bool] = None
    phone: Optional[str] = None

class GarageVehicleSchema(BaseModel):
    id: int
    mod_id: int
    name: str
    brand_name: str
    model_name: str

    class Config:
        from_attributes = True

class GarageAddSchema(BaseModel):
    mod_id: int
