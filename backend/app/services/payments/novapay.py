"""
NovaPay payment provider.

Documentation: https://novapay.readme.io/reference/acquiring

API base: https://api.novapay.ua/v1

Auth: RSA-SHA256 signature (X-Sign header) with merchant private key.

Flow:
  1. POST /api/v1/session/create — create payment session → returns payment URL
  2. User pays on NovaPay page
  3. NovaPay sends postback (callback) with status updates
  4. POST /api/v1/session/status — check session status
"""
import base64
import hashlib
import json
import logging
from typing import Optional
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa
from cryptography.hazmat.primitives.asymmetric.rsa import RSAPrivateKey

import httpx

from app.services.payments.base import BasePaymentProvider, PaymentResult, PaymentStatusResult
from app.services.payments.errors import PaymentProviderError

logger = logging.getLogger(__name__)

NOVAPAY_API_URL_TEST = "https://api-qecom.novapay.ua"
NOVAPAY_API_URL_PROD = "https://api-ecom.novapay.ua"

# Error codes mapping
NOVAPAY_ERROR_CODES = {
    "AUTH_001": "Помилка авторизації. Невірний підпис",
    "AUTH_002": "Термін дії ключа минув",
    "VALID_001": "Невірний формат запиту",
    "VALID_002": "Обов'язкове поле відсутнє",
    "SESS_001": "Сесію не знайдено",
    "SESS_002": "Сесія вже завершена",
    "SESS_003": "Сесія прострочена",
    "SESS_004": "Не можна додати платіж до завершеної сесії",
    "PAY_001": "Платіж не знайдено",
    "PAY_002": "Платіж вже оплачено",
    "PAY_003": "Сума перевищує доступну",
    "HOLD_001": "Блокування не знайдено",
    "HOLD_002": "Блокування вже підтверджено",
    "HOLD_003": "Блокування прострочено",
    "CARD_001": "Картку не підтримано",
    "CARD_002": "Недостатньо коштів",
    "CARD_003": "Платіж відхилено банком",
}


def _load_private_key(pem_str: str) -> RSAPrivateKey:
    """Load RSA private key from PEM string."""
    try:
        key = serialization.load_pem_private_key(
            pem_str.encode("utf-8") if not pem_str.startswith("-----") else pem_str.encode("utf-8"),
            password=None,
        )
        if not isinstance(key, RSAPrivateKey):
            raise PaymentProviderError("NovaPay: invalid private key type")
        return key
    except Exception as e:
        raise PaymentProviderError(f"NovaPay: failed to load private key: {e}", provider="novapay")


def _sign_body(body: dict, private_key_pem: str) -> str:
    """
    Sign request body with RSA-SHA256.

    Algorithm:
      1. Serialize body to JSON (compact, no extra spaces)
      2. SHA-256 hash
      3. Sign with RSA private key
      4. Base64 encode
    """
    key = _load_private_key(private_key_pem)
    body_str = json.dumps(body, separators=(",", ":"), ensure_ascii=False)
    signature = key.sign(
        body_str.encode("utf-8"),
        padding.PKCS1v15(),
        hashes.SHA256(),
    )
    return base64.b64encode(signature).decode()


class NovaPayPaymentProvider(BasePaymentProvider):
    """
    NovaPay acquiring API.
    Uses RSA-SHA256 signature for authentication (X-Sign header).

    API base (test): https://api-qecom.novapay.ua
    API base (prod): https://api-ecom.novapay.ua

    Docs: https://novapay.readme.io/reference/acquiring
    """

    provider_code = "novapay"

    def __init__(self, merchant_id: int, private_key_pem: str, is_test: bool = True):
        self.merchant_id = merchant_id
        self.private_key_pem = private_key_pem
        self.base_url = NOVAPAY_API_URL_TEST if is_test else NOVAPAY_API_URL_PROD

    def _headers(self, body: dict) -> dict:
        signature = _sign_body(body, self.private_key_pem)
        return {
            "X-Sign": signature,
            "Content-Type": "application/json",
        }

    def _map_error(self, error_code: str) -> str:
        """Map NovaPay error code to human-readable message."""
        return NOVAPAY_ERROR_CODES.get(error_code, f"Помилка NovaPay: {error_code}")

    async def _request(self, method: str, path: str, payload: dict) -> dict:
        url = f"{self.base_url}{path}"
        headers = self._headers(payload)
        logger.debug("NovaPay %s %s", method, url)
        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(30)) as client:
                resp = await client.request(method, url, headers=headers, json=payload)
                resp.raise_for_status()
                data = resp.json()
        except httpx.HTTPStatusError as e:
            detail = ""
            try:
                err_json = e.response.json()
                error_code = err_json.get("error", "") or err_json.get("error_code", "")
                if error_code:
                    detail = self._map_error(error_code)
                else:
                    detail = str(err_json)
            except Exception:
                detail = str(e)
            raise PaymentProviderError(detail, provider="novapay", status_code=e.response.status_code)
        except httpx.RequestError as e:
            raise PaymentProviderError(f"NovaPay HTTP error: {e}", provider="novapay")

        if isinstance(data, dict):
            error_code = data.get("error") or data.get("error_code", "")
            if error_code:
                raise PaymentProviderError(self._map_error(error_code), provider="novapay")

        return data

    async def create_payment(
        self,
        amount: float,
        order_id: int,
        description: str = "",
        return_url: str = "",
        **kwargs,
    ) -> PaymentResult:
        """
        Create NovaPay session → returns payment URL.

        Steps:
          1. POST /session/create — create session
          2. POST /session/{id}/add-payment — add payment with amount
        """
        # Amount in kopecks
        amount_kopecks = int(round(amount * 100))
        order_ref = f"order-{order_id}"

        # Step 1: Create session
        session_payload = {
            "merchant_id": self.merchant_id,
            "metadata": {
                "order_id": str(order_id),
            },
            "client_first_name": kwargs.get("client_first_name", ""),
            "client_last_name": kwargs.get("client_last_name", ""),
            "client_phone": kwargs.get("client_phone", ""),
            "result_url": return_url,
            "postback_url": kwargs.get("webhook_url", ""),
        }

        session = await self._request("POST", "/session/create", session_payload)
        session_id = session.get("id", "")

        if not session_id:
            raise PaymentProviderError("NovaPay: no session_id in response", provider="novapay")

        payment_url = session.get("url") or session.get("payment_url", "")

        # Step 2: Add payment to session
        payment_payload = {
            "merchant_id": self.merchant_id,
            "session_id": session_id,
            "external_id": order_ref,
            "amount": amount_kopecks,
            "products": [
                {
                    "count": 1,
                    "price": amount_kopecks,
                    "description": description or f"Order #{order_id}",
                }
            ],
        }

        await self._request("POST", f"/session/{session_id}/add-payment", payment_payload)

        return PaymentResult(
            tx_id=session_id,
            payment_url=payment_url,
        )

    async def process_webhook(self, data: dict) -> PaymentStatusResult:
        """
        Process NovaPay postback.

        Statuses:
          created → pending
          processing → pending
          holded → pending (funds blocked, need confirmation)
          paid → paid
          failed → failed
          voided → refunded
          expired → expired
          hold_confirmed → paid
        """
        status = data.get("status", "")
        session_id = data.get("id", "")

        status_map = {
            "created": "pending",
            "processing": "pending",
            "holded": "pending",
            "hold_confirmed": "paid",
            "paid": "paid",
            "failed": "failed",
            "voided": "refunded",
            "expired": "expired",
            "processing_hold_completion": "pending",
            "processing_void": "pending",
        }
        mapped_status = status_map.get(status, "pending")

        return PaymentStatusResult(
            status=mapped_status,
            provider_tx_id=session_id,
            raw=data,
        )

    async def check_status(self, provider_tx_id: str) -> PaymentStatusResult:
        """Check session status with NovaPay API."""
        payload = {
            "merchant_id": self.merchant_id,
            "session_id": provider_tx_id,
        }
        result = await self._request("POST", "/session/status", payload)

        status = result.get("status", "")
        status_map = {
            "created": "pending",
            "processing": "pending",
            "holded": "pending",
            "hold_confirmed": "paid",
            "paid": "paid",
            "failed": "failed",
            "voided": "refunded",
            "expired": "expired",
        }
        mapped_status = status_map.get(status, "pending")

        return PaymentStatusResult(
            status=mapped_status,
            provider_tx_id=provider_tx_id,
            raw=result,
        )
