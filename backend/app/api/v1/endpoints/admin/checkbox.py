from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session as DBSession

from app.core.db import get_db
from app.api.v1.deps import require_permission
from app.models import User
from app.schemas.checkbox_schemas import (
    CheckboxReceiptResponse,
    CheckboxReceiptCreateResponse,
    CheckboxReceiptLinkResponse,
)
from app.services.checkbox.service import CheckboxService
from app.services.checkbox.errors import (
    CheckboxSettingsError,
    CheckboxValidationError,
    CheckboxError,
)

router = APIRouter()


@router.get("/orders/{order_id}/receipt", response_model=Optional[CheckboxReceiptResponse])
async def get_receipt(
    order_id: int,
    current_user: User = Depends(require_permission("checkbox.view")),
    db: DBSession = Depends(get_db),
):
    """Get fiscal receipt info for an order."""
    service = CheckboxService(db)
    receipt = await service.get_receipt(order_id)
    if not receipt:
        return None
    return CheckboxReceiptResponse(
        id=receipt.id,
        order_id=receipt.order_id,
        receipt_id=receipt.receipt_id,
        status=receipt.status,
        fiscal_code=receipt.fiscal_code,
        fiscal_date=receipt.fiscal_date,
        receipt_url=receipt.receipt_url,
        error_message=receipt.error_message,
        created_at=receipt.created_at,
        updated_at=receipt.updated_at,
    )


@router.post("/orders/{order_id}/receipt", response_model=CheckboxReceiptCreateResponse)
async def create_receipt(
    order_id: int,
    current_user: User = Depends(require_permission("checkbox.view")),
    db: DBSession = Depends(get_db),
):
    """Create a fiscal receipt for an order via Checkbox."""
    service = CheckboxService(db)
    try:
        if not service.is_configured():
            raise HTTPException(400, "Checkbox not configured: set API key and organization ID in settings")
        receipt = await service.create_receipt_for_order(order_id)
        return CheckboxReceiptCreateResponse(
            success=(receipt.status == "created"),
            receipt_id=receipt.receipt_id,
            receipt_url=receipt.receipt_url,
            status=receipt.status,
            message=receipt.error_message,
        )
    except CheckboxSettingsError as e:
        raise HTTPException(400, str(e))
    except CheckboxValidationError as e:
        raise HTTPException(400, str(e))
    except CheckboxError as e:
        raise HTTPException(502, f"Checkbox API error: {e}")


@router.get("/orders/{order_id}/receipt/link", response_model=Optional[CheckboxReceiptLinkResponse])
async def get_receipt_link(
    order_id: int,
    current_user: User = Depends(require_permission("checkbox.view")),
    db: DBSession = Depends(get_db),
):
    """Get a link to view the fiscal receipt."""
    service = CheckboxService(db)
    url = await service.get_receipt_link(order_id)
    if not url:
        raise HTTPException(404, "Receipt link not available")
    return CheckboxReceiptLinkResponse(url=url)
