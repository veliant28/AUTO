from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime


class CheckboxReceiptItem(BaseModel):
    name: str
    quantity: int
    price: float
    total: float


class CheckboxReceiptCreateRequest(BaseModel):
    order_id: int


class CheckboxReceiptResponse(BaseModel):
    id: int
    order_id: int
    receipt_id: Optional[str] = None
    status: str  # pending | created | error
    fiscal_code: Optional[str] = None
    fiscal_date: Optional[datetime] = None
    receipt_url: Optional[str] = None
    error_message: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class CheckboxReceiptCreateResponse(BaseModel):
    success: bool
    receipt_id: Optional[str] = None
    receipt_url: Optional[str] = None
    status: str
    message: Optional[str] = None


class CheckboxReceiptLinkResponse(BaseModel):
    url: str
