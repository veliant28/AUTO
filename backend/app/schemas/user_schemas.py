from pydantic import BaseModel, EmailStr
from typing import Optional, List

class UserBase(BaseModel):
    email: EmailStr
    full_name: Optional[str] = None

class UserCreate(UserBase):
    password: str

class UserSchema(UserBase):
    id: int
    role: str = 'retail'
    is_active: bool = True
    phone: Optional[str] = None
    last_name: Optional[str] = None
    first_name: Optional[str] = None
    middle_name: Optional[str] = None
    avatar_index: Optional[int] = None
    delivery_type: Optional[str] = None
    delivery_city: Optional[str] = None
    delivery_warehouse: Optional[str] = None
    delivery_city_ref: Optional[str] = None
    delivery_settlement_ref: Optional[str] = None
    delivery_city_label: Optional[str] = None
    delivery_warehouse_ref: Optional[str] = None
    delivery_warehouse_label: Optional[str] = None
    delivery_street_ref: Optional[str] = None
    delivery_street_label: Optional[str] = None
    delivery_house: Optional[str] = None
    delivery_apartment: Optional[str] = None

    class Config:
        from_attributes = True

class ProfileUpdate(BaseModel):
    last_name: Optional[str] = None
    first_name: Optional[str] = None
    middle_name: Optional[str] = None
    phone: Optional[str] = None
    avatar_index: Optional[int] = None
    delivery_type: Optional[str] = None
    delivery_city: Optional[str] = None
    delivery_warehouse: Optional[str] = None
    delivery_city_ref: Optional[str] = None
    delivery_settlement_ref: Optional[str] = None
    delivery_city_label: Optional[str] = None
    delivery_warehouse_ref: Optional[str] = None
    delivery_warehouse_label: Optional[str] = None
    delivery_street_ref: Optional[str] = None
    delivery_street_label: Optional[str] = None
    delivery_house: Optional[str] = None
    delivery_apartment: Optional[str] = None

class ChangePasswordSchema(BaseModel):
    current_password: str
    new_password: str

class AdminUserCreate(BaseModel):
    email: EmailStr
    password: str
    full_name: Optional[str] = None
    role_id: int = 1
    is_active: bool = True
    phone: Optional[str] = None

class AdminUserUpdate(BaseModel):
    email: Optional[EmailStr] = None
    full_name: Optional[str] = None
    role_id: Optional[int] = None
    is_active: Optional[bool] = None
    phone: Optional[str] = None
    password: Optional[str] = None

class GarageVehicleSchema(BaseModel):
    id: int
    mod_id: int
    name: str
    brand_name: str
    model_name: str
    tecdoc_car_id: Optional[int] = None
    volume: Optional[str] = None
    engine: Optional[str] = None
    power: Optional[str] = None
    year_from: Optional[int] = None
    year_to: Optional[int] = None
    vehicle_type: Optional[str] = None

    class Config:
        from_attributes = True

class GarageAddSchema(BaseModel):
    mod_id: int
    tecdoc_car_id: Optional[int] = None
