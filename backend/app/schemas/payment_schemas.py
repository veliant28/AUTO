from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
from decimal import Decimal


class PaymentMethodInfo(BaseModel):
    code: str
    name: str
    enabled: bool


class PaymentTransactionResponse(BaseModel):
    id: int
    order_id: int
    payment_method: str
    amount: Decimal
    status: str
    provider_tx_id: Optional[str] = None
    payment_url: Optional[str] = None
    invoice_url: Optional[str] = None
    receipt_url: Optional[str] = None
    error_message: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class PaymentInitResponse(BaseModel):
    success: bool
    transaction_id: Optional[int] = None
    payment_url: Optional[str] = None
    message: Optional[str] = None


class PaymentMethodsResponse(BaseModel):
    methods: List[PaymentMethodInfo]
