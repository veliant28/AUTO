"""
Abstract base class for payment provider integrations.
"""
from dataclasses import dataclass
from typing import Optional


@dataclass
class PaymentResult:
    tx_id: str
    payment_url: str
    invoice_url: Optional[str] = None
    receipt_url: Optional[str] = None


@dataclass
class PaymentStatusResult:
    status: str  # paid | failed | expired | pending
    provider_tx_id: Optional[str] = None
    invoice_url: Optional[str] = None
    receipt_url: Optional[str] = None
    raw: Optional[dict] = None


class BasePaymentProvider:
    """
    Each payment provider (Fondy, LiqPay, NovaPay) implements this interface.

    All methods are async.
    """

    provider_code: str = ""  # e.g. "monobank", "liqpay", "novapay"

    async def create_payment(
        self,
        amount: float,
        order_id: int,
        description: str,
        return_url: str,
        **kwargs,
    ) -> PaymentResult:
        """Create a payment and return the payment URL."""
        raise NotImplementedError

    async def process_webhook(self, data: dict) -> PaymentStatusResult:
        """Process incoming webhook from the provider."""
        raise NotImplementedError

    async def check_status(self, provider_tx_id: str) -> PaymentStatusResult:
        """Check payment status with the provider."""
        raise NotImplementedError

    async def get_invoice_url(self, provider_tx_id: str) -> Optional[str]:
        """Get invoice/receipt URL for a completed payment."""
        return None
