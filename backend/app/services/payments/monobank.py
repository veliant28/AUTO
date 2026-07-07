"""
Monobank payment provider.

Documentation: https://monobank.ua/api-docs/acquiring

API base: https://api.monobank.ua

Auth: X-Token header with merchant token.

Flow:
  1. POST /api/merchant/invoice/create — create invoice → returns pageUrl
  2. User pays on monobank page
  3. Monobank sends callback POST to webHookUrl
  4. GET /api/merchant/invoice/status — check status
  5. GET /api/merchant/invoice/receipt — get receipt (payment confirmation)
"""
import logging
from typing import Optional

import httpx

from app.services.payments.base import BasePaymentProvider, PaymentResult, PaymentStatusResult
from app.services.payments.errors import PaymentProviderError

logger = logging.getLogger(__name__)

MONOBANK_API_URL = "https://api.monobank.ua"

# Monobank error codes
MONOBANK_ERROR_CODES = {
    "400": "Невірний формат запиту",
    "403": "Доступ заборонено. Перевірте X-Token",
    "404": "Ресурс не знайдено",
    "405": "Метод не підтримується",
    "429": "Забагато запитів. Спробуйте пізніше",
    "500": "Внутрішня помилка сервера Monobank",
}


class MonobankPaymentProvider(BasePaymentProvider):
    """
    Monobank acquiring API.
    Uses Merchant Token for authentication (X-Token header).
    """

    provider_code = "monobank"

    def __init__(self, token: str):
        self.token = token

    def _headers(self) -> dict:
        return {
            "X-Token": self.token,
            "Content-Type": "application/json",
        }

    def _map_http_error(self, status_code: int) -> str:
        """Map HTTP status to human-readable message."""
        return MONOBANK_ERROR_CODES.get(str(status_code), f"Помилка Monobank (HTTP {status_code})")

    async def _request(self, method: str, path: str, payload: Optional[dict] = None) -> dict:
        url = f"{MONOBANK_API_URL}{path}"
        import json as _json
        logger.debug("Monobank %s %s body=%s", method, url, _json.dumps(payload, ensure_ascii=False))
        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(30)) as client:
                resp = await client.request(method, url, headers=self._headers(), json=payload)
                resp.raise_for_status()
                data = resp.json()
        except httpx.HTTPStatusError as e:
            detail = ""
            try:
                err_json = e.response.json()
                logger.info("Monobank error response: %s", err_json)
                detail = err_json.get("errText", self._map_http_error(e.response.status_code))
            except Exception:
                detail = self._map_http_error(e.response.status_code)
            raise PaymentProviderError(detail, provider="monobank", status_code=e.response.status_code)
        except httpx.RequestError as e:
            raise PaymentProviderError(f"Мережева помилка Monobank: {e}", provider="monobank")

        if isinstance(data, dict) and data.get("errCode"):
            err_text = data.get("errText", f"Код помилки: {data['errCode']}")
            raise PaymentProviderError(err_text, provider="monobank")

        return data

    async def create_payment(
        self,
        amount: float,
        order_id: int,
        order_number: str = "",
        description: str = "",
        return_url: str = "",
        items: Optional[list] = None,
        **kwargs,
    ) -> PaymentResult:
        """
        Create Monobank invoice → returns payment URL.

        Amount is in kopecks (integer).
        items: list of dicts with name, qty, sum, code, icon_url
        """
        amount_kopecks = int(round(amount * 100))
        order_ref = order_number or f"Order #{order_id}"

        basket = []
        if items:
            for item in items:
                basket.append({
                    "name": item.get("name", order_ref)[:128],
                    "qty": item.get("qty", 1),
                    "sum": int(round(item.get("sum", amount_kopecks))),
                    "code": item.get("code", order_ref)[:32],
                    "taxes": [{"amount": 0, "type": 0}],
                })
                if item.get("icon_url"):
                    basket[-1]["icon"] = item["icon_url"]
        else:
            basket = [{
                "name": order_ref,
                "qty": 1,
                "sum": amount_kopecks,
                "code": order_ref,
                "taxes": [{"amount": 0, "type": 0}],
            }]

        payload = {
            "amount": amount_kopecks,
            "ccy": 980,  # UAH
            "merchantPaymInfo": {
                "reference": order_ref,
                "destination": order_ref,
                "basketOrder": basket,
            },
            "redirectUrl": return_url,
            "webHookUrl": kwargs.get("webhook_url", ""),
            "validity": 86400,  # 24 hours
            "paymentType": "debit",
        }

        result = await self._request("POST", "/api/merchant/invoice/create", payload)
        invoice_id = result.get("invoiceId", "")
        page_url = result.get("pageUrl", "")

        return PaymentResult(
            tx_id=invoice_id,
            payment_url=page_url,
        )

    async def process_webhook(self, data: dict) -> PaymentStatusResult:
        """
        Process Monobank webhook callback.

        Monobank sends POST to webHookUrl with JSON body identical
        to GET /api/merchant/invoice/status response.
        """
        invoice_id = data.get("invoiceId", "")
        status = data.get("status", "")

        status_map = {
            "success": "paid",
            "paid": "paid",
            "failure": "failed",
            "hold": "pending",
            "created": "pending",
            "processing": "pending",
            "refund": "refunded",
            "reversed": "refunded",
            "expired": "expired",
        }
        mapped_status = status_map.get(status, "pending")

        # Use modifiedDate if available to determine the latest webhook
        return PaymentStatusResult(
            status=mapped_status,
            provider_tx_id=invoice_id,
            invoice_url=data.get("pageUrl", ""),
            raw=data,
        )

    async def cancel_invoice(self, provider_tx_id: str) -> bool:
        """Cancel/remove an invoice in Monobank."""
        try:
            await self._request("POST", "/api/merchant/invoice/cancel", {"invoiceId": provider_tx_id})
            return True
        except PaymentProviderError:
            # fallback: try remove endpoint
            try:
                await self._request("POST", "/api/merchant/invoice/remove", {"invoiceId": provider_tx_id})
                return True
            except PaymentProviderError:
                return False

    async def get_receipt_url(self, provider_tx_id: str) -> Optional[str]:
        """Get receipt URL for a paid invoice from Monobank."""
        try:
            result = await self._request("GET", f"/api/merchant/invoice/receipt?invoiceId={provider_tx_id}")
            return result.get("receiptUrl", "") or result.get("url", "")
        except PaymentProviderError:
            return None

    async def check_status(self, provider_tx_id: str) -> PaymentStatusResult:
        """Check invoice status with Monobank API."""
        result = await self._request("GET", f"/api/merchant/invoice/status?invoiceId={provider_tx_id}")

        status = result.get("status", "")
        status_map = {
            "success": "paid",
            "paid": "paid",
            "failure": "failed",
            "hold": "pending",
            "created": "pending",
            "processing": "pending",
            "refund": "refunded",
            "reversed": "refunded",
            "expired": "expired",
        }
        mapped_status = status_map.get(status, "pending")

        return PaymentStatusResult(
            status=mapped_status,
            provider_tx_id=provider_tx_id,
            invoice_url=result.get("pageUrl", ""),
            receipt_url=result.get("receiptUrl", ""),
            raw=result,
        )
