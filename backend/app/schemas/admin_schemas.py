from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime

class OrdersByDateItem(BaseModel):
    date: str
    count: int
    revenue: float

class PartsByCategoryItem(BaseModel):
    category: str
    count: int

class DashboardResponse(BaseModel):
    total_users: int
    total_orders: int
    total_revenue: float
    total_parts: int
    orders_by_date: List[OrdersByDateItem]
    orders_by_status: dict
    parts_by_category: List[PartsByCategoryItem]

class AdminOrderItem(BaseModel):
    id: int
    user_id: int
    status: str
    total: float
    full_name: str
    phone: Optional[str] = None
    address: Optional[str] = None
    created_at: datetime
    items_count: int

    class Config:
        from_attributes = True

class AdminAdminOrderListResponse(BaseModel):
    items: List[AdminOrderItem]
    total: int
    page: int
    page_size: int

class AdminUserResponse(BaseModel):
    id: int
    email: str
    full_name: Optional[str] = None
    role: str
    is_active: bool
    phone: Optional[str] = None
    created_at: Optional[str] = None

    class Config:
        from_attributes = True

class AdminUserListResponse(BaseModel):
    items: List[AdminUserResponse]
    total: int
    page: int
    page_size: int

class UpdateOrderStatusSchema(BaseModel):
    status: str

# Role schemas
class PermissionResponse(BaseModel):
    id: int
    codename: str
    description: Optional[str] = None
    group_name: Optional[str] = None

class RoleResponse(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    is_system: bool
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    permissions: List[PermissionResponse] = []

class RoleCreate(BaseModel):
    name: str
    description: Optional[str] = None
    permission_ids: List[int] = []

class RoleUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    permission_ids: Optional[List[int]] = None
