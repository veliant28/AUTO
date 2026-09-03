"""
Public payment endpoints.

- GET /payments/methods — available payment methods (for checkout)
- POST /payments/webhook/{provider} — webhooks from banks
"""
import json

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
    """Receive webhook from payment provider (Monobank, LiqPay, NovaPay).

    LiqPay отправляет form-urlencoded (data/signature); NovaPay — JSON c
    подписью x-sign-v2 по СЫРОМУ телу (проверяется до парсинга); Monobank —
    JSON. Всегда отвечаем HTTP 200, иначе провайдер повторяет отправку.
    """
    if provider not in ("monobank", "liqpay", "novapay"):
        raise HTTPException(400, f"Unknown provider: {provider}")

    raw_body = await request.body()

    if provider == "novapay":
        # Подпись NovaPay считается по raw body — передаём его провайдеру целиком
        signature = (
            request.headers.get("x-sign-v2")
            or request.headers.get("X-Sign-V2")
            or ""
        )
        payload = {}
        if raw_body:
            try:
                payload = json.loads(raw_body.decode("utf-8"))
            except Exception:
                payload = {}
        body = {"raw": raw_body, "signature": signature, "payload": payload}
    else:
        body = {}
        try:
            form = await request.form()
            if "data" in form:
                body = {
                    "data": str(form.get("data", "")),
                    "signature": str(form.get("signature", "")),
                }
        except Exception:
            form = None
        if not body:
            try:
                body = await request.json()
            except Exception:
                body = {}

    service = PaymentService(db)
    tx = await service.process_webhook(provider, body)

    if tx:
        return {"status": "ok", "transaction_id": tx.id, "payment_status": tx.status}
    return {"status": "ignored"}
