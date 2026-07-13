"""
Admin payment endpoints.

- POST /payments/orders/{id}/init — initialize payment
- GET  /payments/orders/{id}/transaction — get transaction info
- POST /payments/orders/{id}/check-status — force status check
"""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session as DBSession

from app.core.db import get_db
from app.api.v1.deps import require_role
from app.models import User
from app.schemas.payment_schemas import (
    PaymentTransactionResponse,
    PaymentInitResponse,
)
from app.services.payments.service import PaymentService
from app.services.payments.errors import (
    PaymentSettingsError,
    PaymentValidationError,
    PaymentAlreadyCompletedError,
    PaymentError,
)

router = APIRouter()


@router.post("/orders/{order_id}/init", response_model=PaymentInitResponse)
async def init_payment(
    order_id: int,
    method: str = "monobank",
    current_user: User = Depends(require_role("admin", "manager")),
    request: Request = None,
    db: DBSession = Depends(get_db),
):
    """Initialize payment for an order through the specified provider."""
    service = PaymentService(db)
    try:
        webhook_url = str(request.base_url) + f"api/v1/payments/webhook/{method}"
        tx = await service.init_payment(
            order_id=order_id,
            method=method,
            return_url="",
            webhook_url=webhook_url,
        )
        return PaymentInitResponse(
            success=(tx.status != "error"),
            transaction_id=tx.id,
            payment_url=tx.payment_url,
            message=None,
        )
    except PaymentSettingsError as e:
        raise HTTPException(400, str(e))
    except PaymentValidationError as e:
        raise HTTPException(400, str(e))
    except PaymentAlreadyCompletedError as e:
        raise HTTPException(400, str(e))
    except PaymentError as e:
        raise HTTPException(502, f"Payment error: {e}")


@router.get("/orders/{order_id}/transaction", response_model=PaymentTransactionResponse | None)
async def get_transaction(
    order_id: int,
    current_user: User = Depends(require_role("admin", "manager")),
    db: DBSession = Depends(get_db),
):
    """Get payment transaction for an order."""
    service = PaymentService(db)
    tx = service.get_transaction(order_id)
    if not tx:
        return None
    return PaymentTransactionResponse(
        id=tx.id,
        order_id=tx.order_id,
        payment_method=tx.payment_method,
        amount=tx.amount,
        status=tx.status,
        provider_tx_id=tx.provider_tx_id,
        payment_url=tx.payment_url,
        invoice_url=tx.invoice_url,
        receipt_url=tx.receipt_url,
        error_message=tx.error_message,
        created_at=tx.created_at,
        updated_at=tx.updated_at,
    )


@router.post("/orders/{order_id}/cancel-invoice")
async def cancel_invoice(
    order_id: int,
    current_user: User = Depends(require_role("admin", "manager")),
    db: DBSession = Depends(get_db),
):
    """Cancel/remove a pending invoice for an order."""
    from app.services.payments.service import PaymentService
    service = PaymentService(db)
    tx = service.get_transaction(order_id)
    if not tx or not tx.provider_tx_id:
        raise HTTPException(404, "No active invoice found")

    if tx.status == "paid":
        raise HTTPException(400, "Cannot cancel a paid invoice")

    from app.services.payments.monobank import MonobankPaymentProvider
    from app.models.settings import SiteSettings
    from app.services.crypto_util import decrypt_password

    settings = db.query(SiteSettings).first()
    token = decrypt_password(settings.monobank_token_encrypted) if settings and settings.monobank_token_encrypted else ""
    if not token:
        raise HTTPException(400, "Monobank not configured")

    provider = MonobankPaymentProvider(token)
    success = await provider.cancel_invoice(tx.provider_tx_id)

    if success:
        tx.status = "expired"
        db.commit()
        return {"status": "ok", "message": "Invoice cancelled"}
    else:
        # Both cancel and remove failed — check actual status from Monobank
        try:
            status_result = await provider.check_status(tx.provider_tx_id)
            if status_result.status in ("expired", "failed"):
                tx.status = status_result.status
                db.commit()
                return {"status": "ok", "message": f"Invoice already {status_result.status} on Monobank side"}
        except Exception:
            pass

        raise HTTPException(502, "Failed to cancel invoice in Monobank")
