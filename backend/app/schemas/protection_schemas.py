from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime


class BanRecordResponse(BaseModel):
    id: int
    user_id: Optional[int] = None
    email: Optional[str] = None
    ip_address: Optional[str] = None
    reason: str
    banned_by_name: Optional[str] = None
    banned_by_role: Optional[str] = None
    banned_by_first_name: Optional[str] = None
    banned_by_last_name: Optional[str] = None
    banned_at: Optional[datetime] = None
    unbanned_at: Optional[datetime] = None
    is_active: bool
    block_count: int
    ban_type: str
    user_name: Optional[str] = None
    user_role: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    middle_name: Optional[str] = None
    phone: Optional[str] = None

    class Config:
        from_attributes = True


class BanListResponse(BaseModel):
    items: List[BanRecordResponse]
    total: int
    page: int
    page_size: int


class BanCreateRequest(BaseModel):
    email: Optional[str] = None
    user_id: Optional[int] = None
    reason: str


class UnbanResponse(BaseModel):
    message: str
    ban_id: int


class ProtectionEventResponse(BaseModel):
    id: int
    user_id: Optional[int] = None
    email: Optional[str] = None
    ip_address: Optional[str] = None
    event_type: str
    description: Optional[str] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class BanStatsResponse(BaseModel):
    ban: BanRecordResponse
    events: List[ProtectionEventResponse]
    total_events: int


class WhitelistResponse(BaseModel):
    id: int
    user_id: Optional[int] = None
    email: Optional[str] = None
    ip_address: Optional[str] = None
    reason: Optional[str] = None
    added_by_name: Optional[str] = None
    added_by_role: Optional[str] = None
    added_by_first_name: Optional[str] = None
    added_by_last_name: Optional[str] = None
    added_at: Optional[datetime] = None
    user_name: Optional[str] = None
    user_role: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    middle_name: Optional[str] = None
    phone: Optional[str] = None

    class Config:
        from_attributes = True


class WhitelistListResponse(BaseModel):
    items: List[WhitelistResponse]
    total: int
    page: int
    page_size: int


class WhitelistCreateRequest(BaseModel):
    email: str
    reason: Optional[str] = None


class DashboardStatsResponse(BaseModel):
    total_threats: int
    active_bans: int
    blocked_today: int
    whitelisted_count: int
    threats_by_day: List[dict]
    threats_by_type: List[dict]
    threats_timeline: List[dict]
