"""
Business logic for Checkbox fiscal receipt integration.
"""
import logging
from decimal import Decimal
from typing import Optional

from sqlalchemy.orm import Session as DBSession
from sqlalchemy import select

from app.models.checkbox import OrderCheckboxReceipt
from app.models.orders import Order, OrderItem
from app.models.settings import SiteSettings
from app.services.checkbox.errors import (
    CheckboxError,
    CheckboxSettingsError,
    CheckboxValidationError,
)
from app.services.checkbox.client import CheckboxApiClient

logger = logging.getLogger(__name__)


class CheckboxService:
    """High-level service for Checkbox receipt operations."""

    def __init__(self, db: DBSession):
        self.db = db

    # ── Settings helpers ────────────────────────────────────────────────────────

    def _get_settings(self) -> SiteSettings:
        """Return the single SiteSettings row."""
        settings = self.db.query(SiteSettings).first()
        if not settings:
            raise CheckboxSettingsError("Site settings not found")
        return settings

    def _get_client(self) -> CheckboxApiClient:
        """Build an API client from stored settings."""
        settings = self._get_settings()
        if not settings.checkbox_api_key_encrypted:
            raise CheckboxSettingsError("Checkbox API key not configured")
        return CheckboxApiClient(
            signature_key=settings.checkbox_api_key_encrypted,
            is_test=settings.checkbox_is_test if settings.checkbox_is_test is not None else True,
        )

    def _get_organization_id(self) -> str:
        settings = self._get_settings()
        org_id = settings.checkbox_organization_id
        if not org_id:
            raise CheckboxSettingsError("Checkbox organization ID not configured")
        return org_id

    def is_configured(self) -> bool:
        """Check whether Checkbox is configured in site settings."""
        try:
            settings = self._get_settings()
            return bool(settings.checkbox_api_key_encrypted and settings.checkbox_organization_id)
        except CheckboxSettingsError:
            return False

    # ── Receipt operations ──────────────────────────────────────────────────────

    def _order_to_receipt_items(self, order: Order) -> list:
        """Convert order items into Checkbox receipt items format."""
        items = []
        for order_item in order.items:
            part = order_item.part
            price = float(order_item.price)
            quantity = order_item.quantity or 1
            total = round(price * quantity, 2)
            items.append({
                "code": part.article if part and hasattr(part, "article") else "",
                "name": part.name[:256] if part and hasattr(part, "name") else f"Товар #{order_item.part_id}",
                "quantity": quantity,
                "price": price,
                "total": total,
                # Default tax 20% — can be made configurable later
                "tax_id": "20",
            })
        return items

    async def create_receipt_for_order(self, order_id: int) -> OrderCheckboxReceipt:
        """
        Create a fiscal receipt in Checkbox for the given order.

        1. Fetch order + items
        2. Build Checkbox payload
        3. Call Checkbox API
        4. Save result in OrderCheckboxReceipt
        """
        order = self.db.query(Order).filter(Order.id == order_id).first()
        if not order:
            raise CheckboxValidationError(f"Order #{order_id} not found")

        # Check if receipt already exists
        existing = self.db.query(OrderCheckboxReceipt).filter(
            OrderCheckboxReceipt.order_id == order_id
        ).first()
        if existing and existing.status == "created":
            logger.info("Receipt already exists for order %d, skipping", order_id)
            return existing

        client = self._get_client()
        org_id = self._get_organization_id()
        settings = self._get_settings()
        is_test = settings.checkbox_is_test if settings.checkbox_is_test is not None else True

        items = self._order_to_receipt_items(order)
        total = float(order.total)

        payments = [
            {
                "type": "CARD",
                "amount": total,
            }
        ]

        # Create record first
        receipt_record = self.db.query(OrderCheckboxReceipt).filter(
            OrderCheckboxReceipt.order_id == order_id
        ).first()
        if not receipt_record:
            receipt_record = OrderCheckboxReceipt(
                order_id=order_id,
                status="pending",
            )
            self.db.add(receipt_record)
            self.db.flush()

        try:
            result = await client.create_receipt(
                organization_id=org_id,
                items=items,
                payments=payments,
                is_test=is_test,
            )
            receipt_id = result.get("id", "")
            receipt_url = result.get("url", "") or result.get("text", "")

            receipt_record.receipt_id = receipt_id
            receipt_record.status = "created"
            receipt_record.receipt_url = receipt_url
            receipt_record.fiscal_code = result.get("fiscal_code", "")
            receipt_record.fiscal_date = result.get("fiscal_date", None)
            receipt_record.error_message = None

            logger.info("Checkbox receipt created: order=%d receipt=%s", order_id, receipt_id)

        except CheckboxError as e:
            receipt_record.status = "error"
            receipt_record.error_message = str(e)
            logger.error("Checkbox receipt failed for order %d: %s", order_id, e)
            # Re-raise so caller knows it failed
            raise

        finally:
            self.db.flush()

        return receipt_record

    async def get_receipt(self, order_id: int) -> Optional[OrderCheckboxReceipt]:
        """Get receipt record for an order."""
        return self.db.query(OrderCheckboxReceipt).filter(
            OrderCheckboxReceipt.order_id == order_id
        ).first()

    async def get_receipt_link(self, order_id: int) -> Optional[str]:
        """Get receipt view link from Checkbox API."""
        receipt = await self.get_receipt(order_id)
        if not receipt or not receipt.receipt_id:
            return None
        if receipt.receipt_url:
            return receipt.receipt_url
        # Fetch fresh link from API
        try:
            client = self._get_client()
            result = await client.get_receipt_text(receipt.receipt_id)
            return result.get("url", "") or result.get("text", "")
        except CheckboxError:
            return None
