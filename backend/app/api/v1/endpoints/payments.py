"""
Public payment endpoints.

- GET /payments/methods — available payment methods (for checkout)
- POST /payments/webhook/{provider} — webhooks from banks
"""
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session as DBSession

from app.core.db import get_db
from app.schemas.payment_schemas import PaymentMethodsResponse
from app.services.payments.service import PaymentService

router = APIRouter()


@router.get("/payments/methods", response_model=PaymentMethodsResponse)
async def get_payment_methods(
    db: DBSession = Depends(get_db),
):
    """Get list of available payment methods with enabled status."""
    service = PaymentService(db)
    methods = service.get_available_methods()
    return PaymentMethodsResponse(methods=methods)


@router.post("/payments/webhook/{provider}")
async def payment_webhook(
    provider: str,
    request: Request,
    db: DBSession = Depends(get_db),
):
    """Receive webhook from payment provider (Fondy, LiqPay, NovaPay)."""
    if provider not in ("monobank", "liqpay", "novapay"):
        raise HTTPException(400, f"Unknown provider: {provider}")

    try:
        body = await request.json()
    except Exception:
        body = {}

    service = PaymentService(db)
    tx = await service.process_webhook(provider, body)

    if tx:
        return {"status": "ok", "transaction_id": tx.id, "payment_status": tx.status}
    return {"status": "ignored"}
