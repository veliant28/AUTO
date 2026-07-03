"""
LiqPay payment provider.

Documentation: https://www.liqpay.ua/documentation/
API: https://www.liqpay.ua/api/3/checkout

Auth: data (base64 JSON) + signature (SHA-1 of private_key + data + private_key)
"""
import base64
import hashlib
import json
import logging
from typing import Optional

import httpx

from app.services.payments.base import BasePaymentProvider, PaymentResult, PaymentStatusResult
from app.services.payments.errors import PaymentProviderError

logger = logging.getLogger(__name__)

LIQPAY_API_URL = "https://www.liqpay.ua/api"


class LiqpayPaymentProvider(BasePaymentProvider):
    """
    LiqPay payment provider.
    Uses Public Key + Private Key for authentication.
    """

    provider_code = "liqpay"

    def __init__(self, public_key: str, private_key: str):
        self.public_key = public_key
        self.private_key = private_key

    def _encode_data(self, data: dict) -> str:
        """Base64-encode JSON data."""
        return base64.b64encode(json.dumps(data).encode()).decode()

    def _sign(self, data_b64: str) -> str:
        """SHA-1 signature: private_key + data_base64 + private_key."""
        sign_str = self.private_key + data_b64 + self.private_key
        return hashlib.sha1(sign_str.encode("utf-8")).hexdigest()

    def _verify_signature(self, data_b64: str, signature: str) -> bool:
        """Verify incoming webhook signature."""
        expected = self._sign(data_b64)
        return expected == signature

    async def create_payment(
        self,
        amount: float,
        order_id: int,
        description: str = "",
        return_url: str = "",
        **kwargs,
    ) -> PaymentResult:
        """
        Create LiqPay payment → returns payment URL.
        LiqPay uses a form-based approach, but we provide a redirect URL.
        """
        # Amount in kopecks (LiqPay uses integer cents)
        amount_kop = int(round(amount * 100))
        order_id_str = f"order-{order_id}-{hash(order_id) % 10000:04d}"

        data = {
            "version": 3,
            "public_key": self.public_key,
            "action": "pay",
            "amount": amount_kop,
            "currency": "UAH",
            "description": description or f"Order #{order_id}",
            "order_id": order_id_str,
            "result_url": return_url,
            "server_url": kwargs.get("webhook_url", ""),
        }

        data_b64 = self._encode_data(data)
        signature = self._sign(data_b64)

        # LiqPay checkout URL (redirect user here)
        checkout_url = f"{LIQPAY_API_URL}/3/checkout?data={data_b64}&signature={signature}"

        return PaymentResult(
            tx_id=order_id_str,
            payment_url=checkout_url,
        )

    async def process_webhook(self, data: dict) -> PaymentStatusResult:
        """
        Process LiqPay callback.

        LiqPay sends POST with:
          - data (base64 JSON)
          - signature (SHA-1)
        """
        data_b64 = data.get("data", "")
        signature = data.get("signature", "")

        if not self._verify_signature(data_b64, signature):
            raise PaymentProviderError("LiqPay webhook: invalid signature", provider="liqpay")

        try:
            decoded = json.loads(base64.b64decode(data_b64).decode())
        except (json.JSONDecodeError, Exception) as e:
            raise PaymentProviderError(f"LiqPay webhook: decode error: {e}", provider="liqpay")

        status_map = {
            "success": "paid",
            "failure": "failed",
            "error": "failed",
            "reversed": "refunded",
            "subscribed": "paid",
            "wait_secure": "pending",
            "processing": "pending",
            "sandbox": "paid",
        }
        liqpay_status = decoded.get("status", "")
        mapped_status = status_map.get(liqpay_status, "pending")

        return PaymentStatusResult(
            status=mapped_status,
            provider_tx_id=str(decoded.get("transaction_id", "")),
            invoice_url=decoded.get("invoice_url", ""),
            receipt_url=decoded.get("receipt_url", ""),
            raw=decoded,
        )

    async def check_status(self, provider_tx_id: str) -> PaymentStatusResult:
        """Check payment status with LiqPay API."""
        data = {
            "version": 3,
            "public_key": self.public_key,
            "action": "status",
            "order_id": provider_tx_id,
        }
        data_b64 = self._encode_data(data)
        signature = self._sign(data_b64)

        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(30)) as client:
                resp = await client.post(
                    f"{LIQPAY_API_URL}/request",
                    data={"data": data_b64, "signature": signature},
                )
                resp.raise_for_status()
                result = resp.json()
        except httpx.RequestError as e:
            raise PaymentProviderError(f"LiqPay status error: {e}", provider="liqpay")

        status_map = {
            "success": "paid",
            "failure": "failed",
            "error": "failed",
            "reversed": "refunded",
            "processing": "pending",
            "wait_secure": "pending",
            "sandbox": "paid",
        }
        liqpay_status = result.get("status", "")
        mapped_status = status_map.get(liqpay_status, "pending")

        return PaymentStatusResult(
            status=mapped_status,
            provider_tx_id=str(result.get("transaction_id", "")),
            invoice_url=result.get("invoice_url", ""),
            receipt_url=result.get("receipt_url", ""),
            raw=result,
        )
