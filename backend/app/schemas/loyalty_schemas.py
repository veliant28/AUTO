from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime


class PromocodeResponse(BaseModel):
    id: int
    code: str
    type: str
    user_id: Optional[int] = None
    user_name: Optional[str] = None
    user_phone: Optional[str] = None
    user_email: Optional[str] = None
    discount_percent: int = 100
    reason: str
    issued_by_id: int
    issued_by_name: Optional[str] = None
    expires_at: datetime
    used_at: Optional[datetime] = None
    is_active: bool = True
    created_at: datetime

    class Config:
        from_attributes = True


class PromocodeCreate(BaseModel):
    type: str  # 'delivery' | 'margin'
    user_id: Optional[int] = None
    discount_percent: int = 100
    reason: str
    expires_at: datetime


class PromocodeValidateResponse(BaseModel):
    valid: bool
    type: Optional[str] = None
    discount_percent: int = 0
    message: str = ""


class PromocodeListResponse(BaseModel):
    items: List[PromocodeResponse]
    total: int
    page: int
    page_size: int


class PromocodeStatsItem(BaseModel):
    date: str
    count: int
    staff: List[dict]  # [{name, count}]


class PromocodeStatsResponse(BaseModel):
    items: List[PromocodeStatsItem]
    total: int


class PromocodeMyListResponse(BaseModel):
    items: List[PromocodeResponse]
    total: int
    page: int
    page_size: int
