"""
LiqPay payment provider (official API v7).

Docs: https://www.liqpay.ua/en/doc/api/

- Client is sent to the payment page via an HTML form POSTing to
  https://www.liqpay.ua/api/3/checkout with two fields:
    data      = base64(compact JSON with payment params)
    signature = base64(sha3-256(private_key + data + private_key))
- Server callbacks (server_url) arrive as POST form-urlencoded with the same
  data/signature fields; verify the signature, then trust the decoded payload.

API v3 (legacy) used SHA-1; API v7 uses SHA-3-256 (version: 7 in data).
"""
import base64
import hashlib
import json
import logging
from typing import Optional
from urllib.parse import urlencode

import httpx

from app.services.payments.base import BasePaymentProvider, PaymentResult, PaymentStatusResult
from app.services.payments.errors import PaymentProviderError

logger = logging.getLogger(__name__)

LIQPAY_API_URL = "https://www.liqpay.ua/api"
LIQPAY_CHECKOUT_PATH = "/3/checkout"
LIQPAY_REQUEST_PATH = "/request"
LIQPAY_CURRENCY = "UAH"
# JSON keys in data are not required to be sorted (official examples are not)
LIQPAY_STATUS_MAP = {
    "success": "paid",
    "sandbox": "paid",
    "failure": "failed",
    "error": "failed",
    "reversed": "refunded",
    "processing": "pending",
    "wait_secure": "pending",
    "wait_accept": "pending",
}


class LiqpayPaymentProvider(BasePaymentProvider):
    """
    LiqPay payment provider (API v7, signature sha3-256).
    Uses Public Key + Private Key for authentication.
    """

    provider_code = "liqpay"

    def __init__(self, public_key: str, private_key: str):
        self.public_key = public_key
        self.private_key = private_key

    def _encode_data(self, data: dict) -> str:
        """data = base64(compact UTF-8 JSON)."""
        raw = json.dumps(data, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
        return base64.b64encode(raw).decode()

    def _sign(self, data_b64: str) -> str:
        """signature = base64(sha3-256(private_key + data + private_key)) (API v7)."""
        sign_str = self.private_key + data_b64 + self.private_key
        raw_hash = hashlib.sha3_256(sign_str.encode("utf-8")).digest()
        return base64.b64encode(raw_hash).decode()

    def _verify_signature(self, data_b64: str, signature: str) -> bool:
        """Verify incoming webhook signature (constant-time compare)."""
        expected = self._sign(data_b64)
        return expected == signature

    @staticmethod
    def _amount_str(amount: float) -> str:
        """Сумма с двумя знаками после запятой, как в примерах документации."""
        return f"{round(float(amount), 2):.2f}"

    async def create_payment(
        self,
        amount: float,
        order_id: int,
        description: str = "",
        return_url: str = "",
        **kwargs,
    ) -> PaymentResult:
        """
        Create a LiqPay checkout (action=pay, API v7).

        Returns a payment form (official way: POST to /3/checkout with the
        hidden data/signature fields) plus a reference GET URL.
        """
        order_id_str = f"order-{order_id}-{hash(order_id) % 10000:04d}"

        data = {
            "version": 7,
            "public_key": self.public_key,
            "action": "pay",
            "amount": self._amount_str(amount),
            "currency": LIQPAY_CURRENCY,
            "description": (description or f"Order #{order_id}")[:255],
            "order_id": order_id_str,
            "server_url": kwargs.get("webhook_url", ""),
        }
        if return_url:
            data["result_url"] = return_url
        language = kwargs.get("language") or "uk"
        if language in ("ru", "uk", "en"):
            data["language"] = language

        data_b64 = self._encode_data(data)
        signature = self._sign(data_b64)

        # GET-ссылка — только справочная; официальный способ — POST-форма ниже
        checkout_url = (
            f"{LIQPAY_API_URL}{LIQPAY_CHECKOUT_PATH}?"
            + urlencode({"data": data_b64, "signature": signature})
        )
        payment_form = {
            "action": f"{LIQPAY_API_URL}{LIQPAY_CHECKOUT_PATH}",
            "method": "POST",
            "fields": {"data": data_b64, "signature": signature},
        }

        return PaymentResult(
            tx_id=order_id_str,
            payment_url=checkout_url,
            payment_form=payment_form,
        )

    async def process_webhook(self, data: dict) -> PaymentStatusResult:
        """
        Process a LiqPay server callback.

        LiqPay POSTs form-urlencoded `data` (base64 JSON) and `signature`.
        Verifies the signature before decoding; raw payload is returned so the
        caller can reconcile order_id/amount/currency with its own records.
        """
        data_b64 = (data.get("data") or "").strip()
        signature = (data.get("signature") or "").strip()
        if not data_b64 or not signature:
            raise PaymentProviderError("LiqPay webhook: missing data/signature", provider="liqpay")

        if not self._verify_signature(data_b64, signature):
            raise PaymentProviderError("LiqPay webhook: invalid signature", provider="liqpay")

        try:
            decoded = json.loads(base64.b64decode(data_b64).decode("utf-8"))
        except Exception as e:
            raise PaymentProviderError(f"LiqPay webhook: decode error: {e}", provider="liqpay")

        liqpay_status = decoded.get("status", "")
        mapped_status = LIQPAY_STATUS_MAP.get(liqpay_status, "pending")

        return PaymentStatusResult(
            status=mapped_status,
            provider_tx_id=str(decoded.get("order_id", "")),
            invoice_url=decoded.get("invoice_url", ""),
            receipt_url=decoded.get("receipt_url", ""),
            raw=decoded,
        )

    async def check_status(self, provider_tx_id: str) -> PaymentStatusResult:
        """Check payment status via the official /api/request endpoint (action=status)."""
        data = {
            "version": 7,
            "public_key": self.public_key,
            "action": "status",
            "order_id": provider_tx_id,
        }
        data_b64 = self._encode_data(data)
        signature = self._sign(data_b64)

        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(30)) as client:
                resp = await client.post(
                    f"{LIQPAY_API_URL}{LIQPAY_REQUEST_PATH}",
                    data={"data": data_b64, "signature": signature},
                )
                resp.raise_for_status()
                result = resp.json()
        except httpx.RequestError as e:
            raise PaymentProviderError(f"LiqPay status error: {e}", provider="liqpay")

        liqpay_status = result.get("status", "")
        mapped_status = LIQPAY_STATUS_MAP.get(liqpay_status, "pending")

        return PaymentStatusResult(
            status=mapped_status,
            provider_tx_id=str(result.get("order_id", "") or result.get("transaction_id", "")),
            invoice_url=result.get("invoice_url", ""),
            receipt_url=result.get("receipt_url", ""),
            raw=result,
        )
