"""
High-level payment service.

Handles:
  - Checking available payment methods
  - Initializing payments through providers
  - Processing webhooks
  - Checking transaction status
"""
import logging
from decimal import Decimal
from typing import Optional, List

from sqlalchemy.orm import Session as DBSession

from app.models.payments import PaymentTransaction
from app.models.orders import Order
from app.models.settings import SiteSettings
from app.services.payments.base import BasePaymentProvider, PaymentResult
from app.services.payments.errors import (
    PaymentError,
    PaymentSettingsError,
    PaymentValidationError,
    PaymentAlreadyCompletedError,
)
from app.services.payments.monobank import MonobankPaymentProvider
from app.services.payments.liqpay import LiqpayPaymentProvider
from app.services.payments.novapay import NovaPayPaymentProvider
from app.services.crypto_util import decrypt_password

logger = logging.getLogger(__name__)

PAYMENT_METHOD_NAMES = {
    "cod": "Наложенный платеж",
    "monobank": "Monobank",
    "novapay": "NovaPay",
    "liqpay": "LiqPay",
}


class PaymentService:
    """High-level payment operations."""

    def __init__(self, db: DBSession):
        self.db = db

    # ── Settings helpers ────────────────────────────────────────────────────────

    def _get_settings(self) -> SiteSettings:
        settings = self.db.query(SiteSettings).first()
        if not settings:
            raise PaymentSettingsError("Site settings not found")
        return settings

    def _get_provider(self, method: str, webhook_url: str = "") -> BasePaymentProvider:
        """Build a payment provider from stored settings."""
        settings = self._get_settings()

        if method == "monobank":
            if not settings.monobank_token_encrypted:
                raise PaymentSettingsError("Monobank not configured")
            token = decrypt_password(settings.monobank_token_encrypted)
            return MonobankPaymentProvider(token)

        elif method == "liqpay":
            if not settings.liqpay_public_key_encrypted or not settings.liqpay_private_key_encrypted:
                raise PaymentSettingsError("LiqPay not configured")
            pub = decrypt_password(settings.liqpay_public_key_encrypted)
            priv = decrypt_password(settings.liqpay_private_key_encrypted)
            return LiqpayPaymentProvider(pub, priv)

        elif method == "novapay":
            if not settings.novapay_merchant_id or not settings.novapay_private_key_encrypted:
                raise PaymentSettingsError("NovaPay not configured")
            merchant_id = int(settings.novapay_merchant_id)
            private_key = decrypt_password(settings.novapay_private_key_encrypted)
            return NovaPayPaymentProvider(merchant_id, private_key, is_test=True)

        else:
            raise PaymentValidationError(f"Unknown payment method: {method}")

    # ── Available methods ───────────────────────────────────────────────────────

    def get_available_methods(self) -> List[dict]:
        """Return list of payment methods with their enabled status."""
        settings = self._get_settings()
        return [
            {"code": "cod", "name": PAYMENT_METHOD_NAMES["cod"], "enabled": settings.payment_cod_enabled},
            {"code": "monobank", "name": PAYMENT_METHOD_NAMES["monobank"],
             "enabled": settings.payment_monobank_enabled},
            {"code": "novapay", "name": PAYMENT_METHOD_NAMES["novapay"],
             "enabled": settings.payment_novapay_enabled},
            {"code": "liqpay", "name": PAYMENT_METHOD_NAMES["liqpay"],
             "enabled": settings.payment_liqpay_enabled},
        ]

    # ── Payment initialization ──────────────────────────────────────────────────

    async def init_payment(
        self,
        order_id: int,
        method: str,
        return_url: str = "",
        webhook_url: str = "",
    ) -> PaymentTransaction:
        """
        Initialize payment for an order through the specified provider.

        1. Validate the order and method
        2. Check if payment already completed
        3. Call the payment provider
        4. Save transaction record
        """
        order = self.db.query(Order).filter(Order.id == order_id).first()
        if not order:
            raise PaymentValidationError(f"Order #{order_id} not found")

        # Check for existing completed payment
        existing = self.db.query(PaymentTransaction).filter(
            PaymentTransaction.order_id == order_id,
            PaymentTransaction.status == "paid",
        ).first()
        if existing:
            raise PaymentAlreadyCompletedError("Order already paid")

        # Check if method is enabled
        methods = self.get_available_methods()
        method_info = next((m for m in methods if m["code"] == method), None)
        if not method_info or not method_info["enabled"]:
            raise PaymentValidationError(f"Payment method '{method}' is not available")

        if method == "cod":
            # COD doesn't need provider — just create a pending record
            tx = PaymentTransaction(
                order_id=order_id,
                payment_method="cod",
                amount=order.total,
                status="pending",
            )
            self.db.add(tx)
            self.db.flush()
            return tx

        # Bank payment — call provider
        provider = self._get_provider(method, webhook_url)
        description = f"Order #{order_id}"
        order_number = order.order_number or f"ORD-{order_id:010d}"

        # Build items for basket
        items = []
        for oi in order.items:
            part = oi.part
            item = {
                "name": part.name if part else order_number,
                "qty": oi.quantity or 1,
                "sum": int(round(float(oi.price or 0) * (oi.quantity or 1) * 100)),
                "code": part.article if part else order_number,
            }
            # Try to get product image
            if part and part.image_url:
                item["icon_url"] = part.image_url
            items.append(item)

        try:
            result = await provider.create_payment(
                amount=float(order.total),
                order_id=order_id,
                order_number=order_number,
                description=description,
                return_url=return_url,
                webhook_url=webhook_url,
                items=items,
            )
        except PaymentError:
            raise
        except Exception as e:
            raise PaymentError(f"Payment provider error: {e}")

        tx = PaymentTransaction(
            order_id=order_id,
            payment_method=method,
            amount=order.total,
            status="pending",
            provider_tx_id=result.tx_id,
            payment_url=result.payment_url,
            invoice_url=result.invoice_url,
            receipt_url=result.receipt_url,
        )
        self.db.add(tx)
        self.db.flush()

        return tx

    # ── Webhook processing ──────────────────────────────────────────────────────

    async def process_webhook(self, provider_code: str, data: dict) -> Optional[PaymentTransaction]:
        """
        Process incoming webhook from a payment provider.

        Returns the updated PaymentTransaction if found.
        """
        settings = self._get_settings()

        if provider_code == "monobank":
            token = decrypt_password(settings.monobank_token_encrypted) if settings.monobank_token_encrypted else ""
            provider = MonobankPaymentProvider(token)
        elif provider_code == "liqpay":
            pub = decrypt_password(settings.liqpay_public_key_encrypted) if settings.liqpay_public_key_encrypted else ""
            priv = decrypt_password(settings.liqpay_private_key_encrypted) if settings.liqpay_private_key_encrypted else ""
            provider = LiqpayPaymentProvider(pub, priv)
        elif provider_code == "novapay":
            merchant_id = int(settings.novapay_merchant_id) if settings.novapay_merchant_id else 0
            private_key = decrypt_password(settings.novapay_private_key_encrypted) if settings.novapay_private_key_encrypted else ""
            provider = NovaPayPaymentProvider(merchant_id, private_key)
        else:
            logger.warning("Unknown webhook provider: %s", provider_code)
            return None

        try:
            result = await provider.process_webhook(data)
        except PaymentError as e:
            logger.error("Webhook processing error: %s", e)
            return None

        if not result.provider_tx_id:
            logger.warning("Webhook missing provider_tx_id")
            return None

        # Find matching transaction
        tx = self.db.query(PaymentTransaction).filter(
            PaymentTransaction.provider_tx_id == result.provider_tx_id,
        ).first()
        if not tx:
            logger.warning("No transaction found for provider_tx_id=%s", result.provider_tx_id)
            return None

        tx.status = result.status
        if result.invoice_url:
            tx.invoice_url = result.invoice_url
        if result.receipt_url:
            tx.receipt_url = result.receipt_url
        self.db.flush()

        return tx

    # ── Transaction info ────────────────────────────────────────────────────────

    def get_transaction(self, order_id: int) -> Optional[PaymentTransaction]:
        """Get the latest payment transaction for an order."""
        return self.db.query(PaymentTransaction).filter(
            PaymentTransaction.order_id == order_id,
        ).order_by(PaymentTransaction.id.desc()).first()
