"""
NovaPay Internet Acquiring provider (official API).

Docs: https://novapay.readme.io/reference/acquiring-requests
Base:  test https://api-qecom.novapay.ua / prod https://api-ecom.novapay.ua

Flow (per docs):
  1. POST {base}/v1/session   — create session  (client_phone is required,
     callback_url = где ждать постбек, success_url/fail_url — куда вернуть клиента)
  2. POST {base}/v1/payment   — add payment to the session (amount in UAH,
     float, e.g. 100.25; response contains the payment `url` to redirect client)
  3. NovaPay POSTs postbacks to callback_url; they are signed by NovaPay with
     their private RSA key — merchant verifies with NovaPay's PUBLIC key over
     the RAW request body, signature header `x-sign-v2`.
  4. POST {base}/v1/get-status — session status check.

Every outbound request carries header x-sign = base64(RSA-SHA256 signature of
the raw JSON body) made with the merchant's private key.
"""
import base64
import json
import logging
from typing import Optional

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.hazmat.primitives.asymmetric.rsa import RSAPrivateKey

import httpx

from app.services.payments.base import BasePaymentProvider, PaymentResult, PaymentStatusResult
from app.services.payments.errors import PaymentProviderError

logger = logging.getLogger(__name__)

NOVAPAY_API_URL_TEST = "https://api-qecom.novapay.ua"
NOVAPAY_API_URL_PROD = "https://api-ecom.novapay.ua"

# Заголовок подписи постбеков от NovaPay (отличается от x-sign исходящих запросов)
NOVAPAY_POSTBACK_SIGN_HEADER = "x-sign-v2"

# Статусы сессий из https://novapay.readme.io/reference/session-statuses
NOVAPAY_STATUS_MAP = {
    "created": "pending",
    "processing": "pending",
    "holded": "pending",
    "hold_confirmed": "pending",  # блокировка подтверждена — списание ещё не прошло
    "processing_hold_completion": "pending",
    "processing_void": "pending",
    "paid": "paid",
    "failed": "failed",
    "voided": "refunded",
    "expired": "expired",
}


def _load_private_key(pem_str: str) -> RSAPrivateKey:
    """Load RSA private key from PEM string."""
    try:
        key = serialization.load_pem_private_key(pem_str.encode("utf-8"), password=None)
        if not isinstance(key, RSAPrivateKey):
            raise PaymentProviderError("NovaPay: invalid private key type")
        return key
    except PaymentProviderError:
        raise
    except Exception as e:
        raise PaymentProviderError(f"NovaPay: failed to load private key: {e}", provider="novapay")


def _load_public_key(pem_str: str):
    """Load RSA public key from PEM string."""
    try:
        return serialization.load_pem_public_key(pem_str.encode("utf-8"))
    except Exception as e:
        raise PaymentProviderError(f"NovaPay: failed to load public key: {e}", provider="novapay")


def _rsa_sign(pem_str: str, raw_body: bytes) -> str:
    """base64(RSA-SHA256 signature) of the raw request/postback body."""
    key = _load_private_key(pem_str)
    signature = key.sign(raw_body, padding.PKCS1v15(), hashes.SHA256())
    return base64.b64encode(signature).decode()


def _rsa_verify(pem_str: str, raw_body: bytes, signature: str) -> bool:
    """Verify RSA-SHA256 signature (NovaPay public key) over the raw body."""
    try:
        key = _load_public_key(pem_str)
        key.verify(
            base64.b64decode(signature),
            raw_body,
            padding.PKCS1v15(),
            hashes.SHA256(),
        )
        return True
    except Exception:
        return False


class NovaPayPaymentProvider(BasePaymentProvider):
    """
    NovaPay Internet Acquiring (official /v1 API).
    """

    provider_code = "novapay"

    def __init__(
        self,
        merchant_id: int,
        private_key_pem: str,
        is_test: bool = True,
        public_key_pem: str = "",
    ):
        self.merchant_id = merchant_id
        self.private_key_pem = private_key_pem
        self.public_key_pem = public_key_pem
        self.base_url = NOVAPAY_API_URL_TEST if is_test else NOVAPAY_API_URL_PROD

    def _headers(self, raw_body: bytes) -> dict:
        return {
            "X-Sign": _rsa_sign(self.private_key_pem, raw_body),
            "Content-Type": "application/json",
        }

    async def _request(self, method: str, path: str, payload: dict) -> dict:
        url = f"{self.base_url}{path}"
        # Подпись считается по сырому телу — используем ровно те же байты,
        # которые отправляем на сервер
        raw_body = json.dumps(
            payload, separators=(",", ":"), ensure_ascii=False
        ).encode("utf-8")
        headers = self._headers(raw_body)
        logger.debug("NovaPay %s %s", method, url)
        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(30)) as client:
                resp = await client.request(method, url, headers=headers, content=raw_body)
                resp.raise_for_status()
                data = resp.json()
        except httpx.HTTPStatusError as e:
            raise PaymentProviderError(
                f"NovaPay HTTP {e.response.status_code}: {e.response.text[:300]}",
                provider="novapay",
                status_code=e.response.status_code,
            )
        except httpx.RequestError as e:
            raise PaymentProviderError(f"NovaPay HTTP error: {e}", provider="novapay")

        if isinstance(data, dict):
            err = data.get("error") or data.get("error_code") or data.get("message")
            if err:
                raise PaymentProviderError(f"NovaPay: {err}", provider="novapay")
        return data

    async def create_payment(
        self,
        amount: float,
        order_id: int,
        description: str = "",
        return_url: str = "",
        **kwargs,
    ) -> PaymentResult:
        """NovaPay flow: create session → add payment → return payment URL."""
        order_ref = f"order-{order_id}"
        webhook_url = kwargs.get("webhook_url", "")

        # 1) Сессия: client_phone обязателен, callback_url — куда придёт постбек
        session_payload = {
            "merchant_id": str(self.merchant_id),
            "client_first_name": kwargs.get("client_first_name") or "",
            "client_last_name": kwargs.get("client_last_name") or "",
            "client_phone": kwargs.get("client_phone") or "",
            "metadata": {"order_id": str(order_id)},
        }
        if webhook_url:
            session_payload["callback_url"] = webhook_url
        if return_url:
            session_payload["success_url"] = return_url
            session_payload["fail_url"] = return_url
            session_payload["success_redirect_timeout"] = 5

        session = await self._request("POST", "/v1/session", session_payload)
        session_id = session.get("id", "")
        if not session_id:
            raise PaymentProviderError(
                "NovaPay: no session id in /v1/session response", provider="novapay"
            )

        # 2) Платёж: amount — float в гривнах (как в доках, пример 100.25)
        amount_uah = round(float(amount), 2)
        payment_payload = {
            "merchant_id": str(self.merchant_id),
            "session_id": session_id,
            "external_id": order_ref,
            "amount": amount_uah,
            "products": [
                {
                    "count": 1,
                    "price": amount_uah,
                    "description": (description or f"Order #{order_id}")[:255],
                }
            ],
        }
        payment = await self._request("POST", "/v1/payment", payment_payload)

        payment_url = payment.get("url") or payment.get("payment_url") or ""
        if not payment_url:
            raise PaymentProviderError(
                "NovaPay: no payment url in /v1/payment response", provider="novapay"
            )

        return PaymentResult(
            tx_id=session_id,
            payment_url=payment_url,
        )

    async def process_webhook(self, data: dict) -> PaymentStatusResult:
        """
        Verify and process a NovaPay postback.

        `data` must contain the RAW request body ('raw', bytes) and the
        signature header ('signature', x-sign-v2) — the signature is computed
        over the raw body and must be verified BEFORE parsing the JSON.
        Optionally 'payload' holds the already-decoded JSON.
        """
        raw_body = data.get("raw")
        signature = (data.get("signature") or "").strip()

        if not isinstance(raw_body, (bytes, bytearray)) or not signature:
            raise PaymentProviderError(
                "NovaPay postback: missing raw body or signature", provider="novapay"
            )

        if not self.public_key_pem:
            raise PaymentProviderError(
                "NovaPay postback: public key is not configured", provider="novapay"
            )
        if not _rsa_verify(self.public_key_pem, bytes(raw_body), signature):
            raise PaymentProviderError("NovaPay postback: invalid signature", provider="novapay")

        try:
            payload = data.get("payload")
            if payload is None:
                payload = json.loads(bytes(raw_body).decode("utf-8"))
        except Exception as e:
            raise PaymentProviderError(f"NovaPay postback: decode error: {e}", provider="novapay")

        status = str(payload.get("status", ""))
        session_id = str(payload.get("id") or payload.get("session_id") or "")

        return PaymentStatusResult(
            status=NOVAPAY_STATUS_MAP.get(status, "pending"),
            provider_tx_id=session_id,
            raw=payload,
        )

    async def check_status(self, provider_tx_id: str) -> PaymentStatusResult:
        """Check session status via POST {base}/v1/get-status."""
        payload = {
            "merchant_id": str(self.merchant_id),
            "session_id": provider_tx_id,
        }
        result = await self._request("POST", "/v1/get-status", payload)

        status = str(result.get("status", ""))
        session_id = str(result.get("id") or provider_tx_id)
        return PaymentStatusResult(
            status=NOVAPAY_STATUS_MAP.get(status, "pending"),
            provider_tx_id=session_id,
            raw=result,
        )
