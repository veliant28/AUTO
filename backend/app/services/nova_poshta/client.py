"""
Low-level HTTP client for the Nova Poshta JSON API.

Usage:
    client = NovaPoshtaApiClient(api_token="...")
    resp = await client.call("InternetDocument", "save", {...})
"""
import asyncio
import logging
from typing import Optional, Dict, Any

import httpx

from app.services.nova_poshta.constants import (
    NOVA_POSHTA_API_URL,
    NOVA_POSHTA_TIMEOUT,
    NOVA_POSHTA_MAX_RETRIES,
)
from app.services.nova_poshta.errors import NovaPoshtaApiError
from app.services.nova_poshta.error_mapper import NovaPoshtaErrorMapper

logger = logging.getLogger(__name__)


class NovaPoshtaApiClient:
    """
    Async HTTP client for Nova Poshta API v2.0.

    Thread-safe; each call creates its own transport so it can be used
    as a short-lived or long-lived instance.
    """

    def __init__(self, api_token: str):
        self.api_token = api_token
        self.base_url = NOVA_POSHTA_API_URL

    async def call(
        self,
        model_name: str,
        called_method: str,
        method_properties: Optional[dict] = None,
        timeout: Optional[int] = None,
    ) -> dict:
        """
        Execute a JSON-RPC style call against the NP API.

        https://developers.novaposhta.ua/documentation
        """
        payload = self._build_payload(model_name, called_method, method_properties)
        last_exc: Optional[Exception] = None

        for attempt in range(1 + NOVA_POSHTA_MAX_RETRIES):
            try:
                async with httpx.AsyncClient(timeout=httpx.Timeout(timeout or NOVA_POSHTA_TIMEOUT)) as client:
                    response = await client.post(self.base_url, json=payload)
                    response.raise_for_status()
                    data: dict = response.json()

                # Log raw response for debugging (truncate large payloads)
                logger.debug(
                    "NP API call %s/%s — success=%s",
                    model_name, called_method,
                    data.get("success"),
                )

                # Handle business-logic errors
                if not NovaPoshtaErrorMapper.is_success(data):
                    errors = NovaPoshtaErrorMapper.flatten_errors(data)
                    error_codes = self._extract_error_codes(data)
                    severity = NovaPoshtaErrorMapper.classify_severity(error_codes)
                    msg = "; ".join(errors) if errors else f"NP API error: {data.get('errorMessage', 'unknown')}"
                    logger.warning(
                        "NP API error %s/%s: success=false, errors=%s, codes=%s, msg=%s",
                        model_name, called_method,
                        data.get("errors"), error_codes, msg,
                    )
                    raise NovaPoshtaApiError(
                        message=msg,
                        status_code=response.status_code,
                        errors=error_codes,
                        severity=severity,
                    )

                return data

            except httpx.TimeoutException as exc:
                last_exc = exc
                logger.warning(
                    "NP API timeout (attempt %d/%d): %s/%s",
                    attempt + 1, 1 + NOVA_POSHTA_MAX_RETRIES,
                    model_name, called_method,
                )
                if attempt < NOVA_POSHTA_MAX_RETRIES:
                    await asyncio.sleep(1.0 * (attempt + 1))
                continue

            except httpx.HTTPStatusError as exc:
                # Non-2xx HTTP status
                status = exc.response.status_code
                try:
                    body = exc.response.json()
                except Exception:
                    body = {}

                errors = NovaPoshtaErrorMapper.flatten_errors(body)
                error_codes = self._extract_error_codes(body)
                msg = "; ".join(errors) if errors else f"HTTP {status}"
                raise NovaPoshtaApiError(
                    message=msg,
                    status_code=status,
                    errors=error_codes,
                )

            except NovaPoshtaApiError:
                raise  # re-raise our own errors directly

            except Exception as exc:
                last_exc = exc
                logger.exception("NP API unexpected error: %s/%s", model_name, called_method)
                if attempt < NOVA_POSHTA_MAX_RETRIES:
                    await asyncio.sleep(1.0)
                continue

        # If we exhausted retries, raise the last exception
        raise NovaPoshtaApiError(
            message=f"NP API request failed after {NOVA_POSHTA_MAX_RETRIES + 1} attempts: {last_exc}",
            errors=[],
        )

    def _build_payload(self, model_name: str, called_method: str, method_properties: Optional[dict]) -> dict:
        """Build the standard NP JSON request body."""
        payload: Dict[str, Any] = {
            "apiKey": self.api_token,
            "modelName": model_name,
            "calledMethod": called_method,
        }
        if method_properties is not None:
            payload["methodProperties"] = method_properties
        return payload

    @staticmethod
    def _extract_error_codes(api_response: dict) -> list:
        """Extract error codes from a NP API response."""
        codes: list = api_response.get("errorCodes", []) or []
        data = api_response.get("data", [])
        if isinstance(data, list) and data:
            first = data[0] if isinstance(data[0], dict) else {}
            codes.extend(first.get("ErrorCodes", []) or [])
        return list(set(codes))

    # ─── Convenience shorthands ────────────────────────────────────────

    async def save(self, model_name: str, props: dict) -> dict:
        return await self.call(model_name, "save", props)

    async def update(self, model_name: str, props: dict) -> dict:
        return await self.call(model_name, "update", props)

    async def delete(self, model_name: str, props: dict) -> dict:
        return await self.call(model_name, "delete", props)

    async def get_list(self, model_name: str, props: Optional[dict] = None) -> dict:
        return await self.call(model_name, "getDocumentList", props)

    async def get_status(self, props: dict) -> dict:
        return await self.call("TrackingDocument", "getStatusDocuments", props)
