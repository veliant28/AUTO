"""
Low-level HTTP client for Checkbox API v2.

Docs: https://checkbox.expert/apidocs/

Auth flow:
  1. POST /api/v1/auth/signin with the signature API key
  2. Use the returned Bearer token for subsequent requests
"""
import json
import time
import logging
from typing import Optional, Dict, Any, List

import httpx

from app.services.checkbox.errors import CheckboxApiError, CheckboxAuthError

logger = logging.getLogger(__name__)

CHECKBOX_API_URL = "https://api.checkbox.ua/api/v1"
CHECKBOX_TIMEOUT = 30


class CheckboxApiClient:
    """Async HTTP client for Checkbox API."""

    def __init__(self, signature_key: str, is_test: bool = True):
        self.signature_key = signature_key
        self.base_url = CHECKBOX_API_URL
        self.is_test = is_test
        self._bearer_token: Optional[str] = None
        self._token_expires_at: float = 0

    async def _ensure_token(self) -> str:
        """Obtain or refresh the Bearer token."""
        if self._bearer_token and time.time() < self._token_expires_at:
            return self._bearer_token
        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(CHECKBOX_TIMEOUT)) as client:
                response = await client.post(
                    f"{self.base_url}/auth/signin",
                    json={"api_key": self.signature_key},
                )
                if response.status_code in (401, 403):
                    raise CheckboxAuthError("Checkbox sign-in failed: invalid API key")
                response.raise_for_status()
                data = response.json()
                token = data.get("access_token") or data.get("token", "")
                self._bearer_token = token
                self._token_expires_at = time.time() + 240  # tokens live 5 min, refresh every 4
                logger.debug("Checkbox Bearer token obtained/refreshed")
                return token
        except httpx.RequestError as e:
            raise CheckboxApiError(f"Checkbox auth request failed: {e}")

    def _get_headers(self) -> dict:
        token = self._bearer_token or ""

        return {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "X-Client-Name": "svom-api",
        }

    async def _request(
        self,
        method: str,
        path: str,
        json_data: Optional[dict] = None,
    ) -> dict:
        url = f"{self.base_url}{path}"
        # Ensure we have a token before making the request
        await self._ensure_token()
        headers = self._get_headers()
        logger.debug("Checkbox %s %s", method, url)
        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(CHECKBOX_TIMEOUT)) as client:
                response = await client.request(method, url, headers=headers, json=json_data)
        except httpx.RequestError as e:
            raise CheckboxApiError(f"HTTP request failed: {e}", errors=[str(e)])

        if response.status_code in (401, 403):
            # Token might have expired, force re-auth next time
            self._bearer_token = None
            raise CheckboxAuthError(f"Checkbox auth failed ({response.status_code})")

        if response.status_code >= 400:
            try:
                err_data = response.json()
                detail = err_data.get("detail", str(response.text))
            except (json.JSONDecodeError, AttributeError):
                detail = response.text or f"HTTP {response.status_code}"
            raise CheckboxApiError(detail, status_code=response.status_code)

        try:
            return response.json()
        except json.JSONDecodeError:
            return {"raw": response.text}

    async def ping(self) -> dict:
        """Health-check endpoint."""
        return await self._request("GET", "/ping")

    async def create_receipt(
        self,
        organization_id: str,
        items: List[Dict[str, Any]],
        payments: List[Dict[str, Any]],
        is_test: bool = True,
    ) -> dict:
        """
        Create a fiscal receipt (shift must be opened first).
        """
        payload = {
            "organization_id": organization_id,
            "items": items,
            "payments": payments,
            "is_test": is_test,
        }
        return await self._request("POST", "/receipts", json_data=payload)

    async def get_receipt(self, receipt_id: str) -> dict:
        """Get receipt status/details."""
        return await self._request("GET", f"/receipts/{receipt_id}")

    async def get_receipt_text(self, receipt_id: str) -> dict:
        """Get HTML/text link to view the receipt."""
        return await self._request("GET", f"/receipts/{receipt_id}/text")

    async def open_shift(self, organization_id: str) -> dict:
        """Open a cash register shift (required before creating receipts)."""
        return await self._request("POST", "/shifts", json_data={
            "organization_id": organization_id,
        })

    async def close_shift(self, shift_id: str) -> dict:
        """Close an open shift."""
        return await self._request("POST", f"/shifts/{shift_id}/close")
