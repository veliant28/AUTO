import base64
import logging
import time
from datetime import datetime, timedelta
from typing import Optional
from urllib.parse import quote

import httpx
from sqlalchemy.orm import Session

from app.models.imports import SupplierConfig
from app.services.crypto_util import decrypt_password


AUTONOVA_D_SUPPLIER = "AUTONOVA-D"
AUTONOVA_D_ENVIRONMENTS = {
    "dev": "https://api.autonovad.ua/dev",
    "stable": "https://api.autonovad.ua/stable",
}
AUTONOVA_D_DEFAULT_API_URL = AUTONOVA_D_ENVIRONMENTS["dev"]

logger = logging.getLogger(__name__)


class AutonovaError(Exception):
    """Ошибка при обращении к API Autonova D."""


def normalize_autonova_api_url(url: str | None) -> str:
    value = (url or "").strip().rstrip("/")
    if value not in AUTONOVA_D_ENVIRONMENTS.values():
        raise ValueError(
            "Autonova D API URL must be one of: "
            + ", ".join(AUTONOVA_D_ENVIRONMENTS.values())
        )
    return value


def build_supplier_client(supplier: str, config: SupplierConfig) -> "SupplierAPIClient":
    key = (supplier or "").strip().upper()
    if key == "GPL":
        return GPLAPIClient(config)
    if key == "UTR":
        return UTRAPIClient(config)
    if key in (AUTONOVA_D_SUPPLIER, "AUTONOVA D", "AUTONOVAD"):
        return AutonovaDAPIClient(config)
    raise ValueError(f"Unknown supplier: {supplier}")


def get_supplier_client_and_token(
    db: Session, supplier: str
) -> tuple["SupplierAPIClient | None", str | None]:
    """Return a configured client and a valid token (refresh/auth if needed).

    The second value is an error message when the client/token pair is
    unavailable. Kept supplier-aware because Autonova D tokens live only 300s.
    """
    config = (
        db.query(SupplierConfig)
        .filter(SupplierConfig.supplier == supplier)
        .first()
    )
    if not config:
        logger.warning("%s: supplier config not found", supplier)
        return None, None

    key = supplier.upper()
    try:
        client = build_supplier_client(supplier, config)
    except ValueError as exc:
        logger.warning("%s: %s", supplier, exc)
        return None, str(exc)

    now = datetime.utcnow()
    token = config.token
    expires_at = config.token_expires_at
    remaining = (expires_at - now).total_seconds() if expires_at and token else 0
    logger.info(
        "%s: token expires_at=%s, expires_in=%.2fh",
        supplier,
        expires_at,
        remaining / 3600,
    )

    if token and remaining > 30:
        # Autonova D tokens live only 300 seconds: reuse them until nearly
        # expired instead of refreshing before every import. Keep a 2-minute
        # margin so a price download cannot start with an almost-dead token.
        if key != AUTONOVA_D_SUPPLIER or remaining > 120:
            logger.info(
                "%s: token valid (%.1fm remaining), using existing",
                supplier,
                remaining / 60,
            )
            return client, token

    result = None
    if key == "GPL":
        logger.info("%s: performing full auth...", supplier)
        result = client.auth()
    else:
        if config.refresh_token:
            logger.info("%s: trying refresh...", supplier)
            result = client.refresh(config.refresh_token)
        if not result or not result.success:
            previous = result.message if result else "no refresh token"
            logger.info(
                "%s: refresh failed (%s), performing full auth...",
                supplier,
                previous,
            )
            result = client.auth()

    if not result or not result.success:
        message = result.message if result else "Auth returned None"
        logger.warning("%s: AUTH FAILED — %s", supplier, message)
        return None, message

    config.token = result.token
    config.token_expires_at = result.expires_at
    if result.refresh_token:
        config.refresh_token = result.refresh_token
    db.commit()

    new_remaining = (
        (result.expires_at - datetime.utcnow()).total_seconds()
        if result.expires_at
        else 0
    )
    logger.info(
        "%s: auth SUCCESS — new token expires in %.1fm (at %s)",
        supplier,
        new_remaining / 60,
        result.expires_at,
    )
    return client, result.token


class SupplierAuthResult:
    def __init__(self, success: bool, token: str = "", expires_at: Optional[datetime] = None,
                 refresh_token: str = "", message: str = ""):
        self.success = success
        self.token = token
        self.expires_at = expires_at
        self.refresh_token = refresh_token
        self.message = message


class ExportParamsResult:
    def __init__(self, brands: list, categories: list, models: list, formats: list):
        self.brands = brands
        self.categories = categories
        self.models = models
        self.formats = formats


class ExportRequestResult:
    def __init__(self, external_id: str = "", external_token: str = "", status: str = "in_queue"):
        self.external_id = external_id
        self.external_token = external_token
        self.status = status


class SupplierAPIClient:
    def __init__(self, config: SupplierConfig):
        self.config = config

    @property
    def password(self) -> str:
        return decrypt_password(self.config.password_encrypted or "")

    def auth(self) -> SupplierAuthResult:
        raise NotImplementedError

    def get_export_params(self, token: str) -> ExportParamsResult:
        raise NotImplementedError

    def request_export(self, token: str, params: dict) -> ExportRequestResult:
        raise NotImplementedError

    def check_export_status(self, token: str, external_id: str) -> ExportRequestResult:
        raise NotImplementedError

    def download_export(self, token: str, external_token: str) -> bytes:
        raise NotImplementedError


class GPLAPIClient(SupplierAPIClient):
    def auth(self) -> SupplierAuthResult:
        try:
            resp = httpx.post(
                f"{self.config.api_url}/api/auth/login",
                json={"login": self.config.login, "password": self.password},
                timeout=15,
            )
            data = resp.json() if resp.text else {}
            if resp.status_code != 200:
                msg = data.get("message") or data.get("error") or resp.text or f"HTTP {resp.status_code}"
                if "unauthorized" in str(msg).lower():
                    msg = f"{msg}. Enable API access in GPL account settings"
                return SupplierAuthResult(success=False, message=str(msg))
            if not data.get("access_token"):
                return SupplierAuthResult(success=False, message=f"Unexpected response: {data}")
            expires_in = data.get("expires_in", 86400)
            expires_at = datetime.utcnow() + timedelta(seconds=expires_in)
            return SupplierAuthResult(
                success=True,
                token=data["access_token"],
                expires_at=expires_at,
                refresh_token=data.get("refresh_token", ""),
            )
        except httpx.RequestError as e:
            return SupplierAuthResult(success=False, message=f"Connection error: {str(e)}")
        except Exception as e:
            return SupplierAuthResult(success=False, message=f"Error: {str(e)}")

    def get_export_params(self, token: str) -> ExportParamsResult:
        resp = httpx.post(
            f"{self.config.api_url}/api/prices?page=1",
            headers={"Authorization": f"Bearer {token}"},
            timeout=15,
        )
        data = resp.json()
        items = data.get("data", {}).get("items", []) if isinstance(data.get("data"), dict) else []

        brands_set: dict = {}
        categories_set: dict = {}
        for item in items:
            name = item.get("category", "")
            if name and name not in categories_set:
                categories_set[name] = {"id": name, "name": name}

        return ExportParamsResult(
            brands=[],
            categories=list(categories_set.values()),
            models=[],
            formats=["xlsx"],
        )

    def refresh(self, token: str) -> SupplierAuthResult:
        try:
            resp = httpx.post(
                f"{self.config.api_url}/api/auth/refresh",
                headers={"Authorization": f"Bearer {token}"},
                timeout=15,
            )
            data = resp.json() if resp.text else {}
            if resp.status_code != 200:
                msg = data.get("message") or data.get("error") or resp.text or f"HTTP {resp.status_code}"
                return SupplierAuthResult(success=False, message=str(msg))
            if not data.get("access_token"):
                return SupplierAuthResult(success=False, message=f"Unexpected response: {data}")
            expires_in = data.get("expires_in", 86400)
            expires_at = datetime.utcnow() + timedelta(seconds=expires_in)
            return SupplierAuthResult(
                success=True,
                token=data["access_token"],
                expires_at=expires_at,
            )
        except httpx.RequestError as e:
            return SupplierAuthResult(success=False, message=f"Connection error: {str(e)}")
        except Exception as e:
            return SupplierAuthResult(success=False, message=f"Error: {str(e)}")

    def fetch_all_prices(self, token: str, progress_cb=None) -> list:
        """
        Fetch all price pages from the GPL API.

        progress_cb: optional callable(percent: int) invoked after each
        successful page, with percent in 0..24 (the import task clamps and
        maps it to its own progress range).
        """
        import time
        all_items = []
        page = 1
        max_retries = 3
        while True:
            last_err = None
            for attempt in range(max_retries):
                try:
                    resp = httpx.post(
                        f"{self.config.api_url}/api/prices?page={page}",
                        headers={"Authorization": f"Bearer {token}"},
                        timeout=60,
                    )
                    data = resp.json()
                    items = data.get("data", {}).get("items", [])
                    if not items:
                        return all_items
                    all_items.extend(items)
                    last_page = data.get("last_page", 1) or 1
                    if progress_cb:
                        progress_cb(max(0, min(24, int(page / last_page * 24))))
                    if page >= last_page:
                        return all_items
                    page += 1
                    last_err = None
                    break
                except (httpx.ReadTimeout, httpx.ConnectTimeout, httpx.PoolTimeout) as e:
                    last_err = e
                    wait = 5 * (attempt + 1)
                    print(f"[GPL] page {page} timeout (attempt {attempt+1}/{max_retries}), retrying in {wait}s...")
                    time.sleep(wait)
                except httpx.HTTPStatusError as e:
                    last_err = e
                    wait = 10 * (attempt + 1)
                    print(f"[GPL] page {page} HTTP {e.response.status_code} (attempt {attempt+1}/{max_retries}), retrying in {wait}s...")
                    time.sleep(wait)
            if last_err:
                raise last_err
        return all_items


class UTRAPIClient(SupplierAPIClient):
    def auth(self) -> SupplierAuthResult:
        import hashlib
        fingerprint = hashlib.md5(self.config.login.encode()).hexdigest()
        try:
            resp = httpx.post(
                f"{self.config.api_url}/api/login_check",
                json={"email": self.config.login, "password": self.password, "browser_fingerprint": fingerprint},
                timeout=15,
            )
            data = resp.json() if resp.text else {}
            if resp.status_code == 412:
                detail = data.get("message", "Invalid credentials")
                return SupplierAuthResult(success=False, message=str(detail))
            if resp.status_code != 200:
                detail = data.get("message") or data.get("error") or resp.text or f"HTTP {resp.status_code}"
                return SupplierAuthResult(success=False, message=str(detail))
            if not data.get("token"):
                return SupplierAuthResult(success=False, message=f"Unexpected response: {data}")
            return self._parse_auth_response(data)
        except httpx.RequestError as e:
            return SupplierAuthResult(success=False, message=f"Connection error: {str(e)}")
        except Exception as e:
            return SupplierAuthResult(success=False, message=f"Error: {str(e)}")

    def refresh(self, refresh_token: str) -> SupplierAuthResult:
        import hashlib
        fingerprint = hashlib.md5(self.config.login.encode()).hexdigest()
        try:
            resp = httpx.post(
                f"{self.config.api_url}/api/token/refresh",
                json={"refresh_token": refresh_token, "browser_fingerprint": fingerprint},
                timeout=15,
            )
            if resp.status_code != 200:
                detail = resp.json().get("message", resp.text)
                return SupplierAuthResult(success=False, message=f"HTTP {resp.status_code}: {detail}")
            data = resp.json()
            return self._parse_auth_response(data)
        except httpx.RequestError as e:
            return SupplierAuthResult(success=False, message=str(e))

    def _parse_auth_response(self, data: dict) -> SupplierAuthResult:
        expires_str = data.get("expires_at", "")
        expires_at = None
        if expires_str:
            try:
                expires_at = datetime.strptime(expires_str, "%Y-%m-%d %H:%M:%S")
            except ValueError:
                pass
        return SupplierAuthResult(
            success=True,
            token=data["token"],
            expires_at=expires_at,
            refresh_token=data.get("refresh_token", ""),
        )

    def get_export_params(self, token: str) -> ExportParamsResult:
        resp = httpx.get(
            f"{self.config.api_url}/pricelists/export-params",
            headers={"Authorization": f"Bearer {token}"},
            timeout=15,
        )
        data = resp.json()
        brands = [{"id": b["id"], "name": b["title"]} for b in data.get("visibleBrands", [])]
        categories = [{"id": c["id"], "name": c["title"]} for c in data.get("categories", [])]
        return ExportParamsResult(
            brands=brands,
            categories=categories,
            models=[m["name"] for m in data.get("models", [])],
            formats=[f["format"] for f in data.get("supportedFormatsExt", [])],
        )

    def request_export(self, token: str, params: dict) -> ExportRequestResult:
        body = {
            "categoriesId": params.get("categories_ids", []),
            "format": params.get("format", "xlsx"),
            "inStock": params.get("in_stock_only", True),
            "modelsId": params.get("models_ids", []),
            "showScancode": False,
            "utrArticle": False,
            "visibleBrandsId": params.get("visible_brands_ids", []),
        }
        resp = httpx.post(
            f"{self.config.api_url}/pricelists/export-request",
            json=body,
            headers={"Authorization": f"Bearer {token}"},
            timeout=15,
        )
        data = resp.json()
        return ExportRequestResult(
            external_id=str(data.get("id", "")),
            external_token=data.get("token", ""),
            status=data.get("status", "in_queue"),
        )

    def check_export_status(self, token: str, external_id: str) -> ExportRequestResult:
        resp = httpx.get(
            f"{self.config.api_url}/pricelists/{external_id}",
            headers={"Authorization": f"Bearer {token}"},
            timeout=15,
        )
        data = resp.json()
        if isinstance(data, dict):
            return ExportRequestResult(
                external_id=external_id,
                external_token=data.get("token", ""),
                status=data.get("status", "in_queue"),
            )
        # Might return a list
        if isinstance(data, list) and data:
            item = data[0]
            return ExportRequestResult(
                external_id=external_id,
                external_token=item.get("token", ""),
                status=item.get("status", "in_queue"),
            )
        return ExportRequestResult(external_id=external_id, status="in_queue")

    def download_export(self, token: str, external_token: str) -> bytes:
        resp = httpx.get(
            f"{self.config.api_url}/pricelists/export/{external_token}",
            headers={"Authorization": f"Bearer {token}"},
            timeout=120,
        )
        return resp.content


class AutonovaDAPIClient(SupplierAPIClient):
    """
    Autonova D partner API.

    Price import uses only the official price-list endpoints:
    GET /api/v1/prices/clients/{clientId} and GET /api/v1/prices/{priceId}.
    UTR blocked us for aggressive polling, so every request is throttled and
    retried at most once (only for 429/5xx/network errors).
    """

    MIN_REQUEST_INTERVAL = 1.0
    MAX_ATTEMPTS = 2

    def __init__(self, config: SupplierConfig):
        super().__init__(config)
        self._last_request_at = 0.0

    @property
    def api_url(self) -> str:
        return normalize_autonova_api_url(
            self.config.api_url or AUTONOVA_D_DEFAULT_API_URL
        )

    @property
    def client_id(self) -> str:
        return (self.config.client_id or "").strip()

    def _require_client_id(self) -> str:
        if not self.client_id:
            raise AutonovaError("Autonova D client ID is not configured")
        return self.client_id

    def _throttle(self) -> None:
        elapsed = time.monotonic() - self._last_request_at
        if elapsed < self.MIN_REQUEST_INTERVAL:
            time.sleep(self.MIN_REQUEST_INTERVAL - elapsed)
        self._last_request_at = time.monotonic()

    @staticmethod
    def _error_message(resp: httpx.Response) -> str:
        try:
            data = resp.json()
        except ValueError:
            return (resp.text or f"HTTP {resp.status_code}")[:500]
        if isinstance(data, dict):
            for key in ("message", "error", "detail", "title"):
                value = data.get(key)
                if value:
                    return str(value)[:500]
        return str(data)[:500]

    def _request(
        self,
        method: str,
        path: str,
        token: str | None = None,
        timeout: float = 60,
        **kwargs,
    ) -> httpx.Response:
        url = f"{self.api_url}{path}"
        headers = dict(kwargs.pop("headers", {}))
        headers.setdefault("Accept", "application/json")
        headers.setdefault("User-Agent", "AUTO-Parts-Price-Import/1.0")
        if token:
            headers["Authorization"] = f"Bearer {token}"

        last_error: Exception | None = None
        for attempt in range(self.MAX_ATTEMPTS):
            self._throttle()
            try:
                resp = httpx.request(
                    method,
                    url,
                    headers=headers,
                    timeout=timeout,
                    **kwargs,
                )
            except httpx.RequestError as exc:
                last_error = exc
                if attempt + 1 < self.MAX_ATTEMPTS:
                    time.sleep(5 * (attempt + 1))
                    continue
                raise AutonovaError(
                    f"Autonova D connection error: {exc}"
                ) from exc

            if resp.status_code == 429:
                retry_after = resp.headers.get("Retry-After")
                try:
                    wait = min(int(retry_after), 60) if retry_after else 30
                except ValueError:
                    wait = 30
                if attempt + 1 < self.MAX_ATTEMPTS:
                    time.sleep(wait)
                    continue
                raise AutonovaError(
                    "Autonova D API rate limit exceeded; import aborted to "
                    "avoid another supplier block"
                )

            if resp.status_code >= 500 and attempt + 1 < self.MAX_ATTEMPTS:
                time.sleep(5 * (attempt + 1))
                continue

            return resp

        raise AutonovaError(str(last_error or "Autonova D request failed"))

    @staticmethod
    def _token_result(data: dict) -> SupplierAuthResult:
        token = data.get("access_token")
        if not token:
            return SupplierAuthResult(
                success=False,
                message=f"Unexpected Autonova D auth response: {data}",
            )
        try:
            expires_in = int(data.get("expires_in") or 300)
        except (TypeError, ValueError):
            expires_in = 300
        return SupplierAuthResult(
            success=True,
            token=token,
            expires_at=datetime.utcnow() + timedelta(seconds=expires_in),
            refresh_token=data.get("refresh_token", ""),
        )

    def auth(self) -> SupplierAuthResult:
        if not self.config.login:
            return SupplierAuthResult(
                success=False,
                message="Autonova D username is not configured",
            )
        try:
            resp = self._request(
                "POST",
                "/api/v1/auth/token",
                json={"username": self.config.login, "password": self.password},
                timeout=20,
            )
        except (AutonovaError, ValueError) as exc:
            return SupplierAuthResult(success=False, message=str(exc))

        if resp.status_code != 200:
            return SupplierAuthResult(
                success=False,
                message=f"HTTP {resp.status_code}: {self._error_message(resp)}",
            )
        try:
            data = resp.json()
        except ValueError:
            return SupplierAuthResult(
                success=False,
                message="Autonova D returned a non-JSON auth response",
            )
        return self._token_result(data)

    def refresh(self, refresh_token: str) -> SupplierAuthResult:
        if not refresh_token:
            return SupplierAuthResult(
                success=False, message="No refresh token available",
            )
        try:
            resp = self._request(
                "GET",
                f"/api/v1/auth/token/refresh/{quote(refresh_token, safe='')}",
                timeout=20,
            )
        except (AutonovaError, ValueError) as exc:
            return SupplierAuthResult(success=False, message=str(exc))

        if resp.status_code != 200:
            return SupplierAuthResult(
                success=False,
                message=f"HTTP {resp.status_code}: {self._error_message(resp)}",
            )
        try:
            data = resp.json()
        except ValueError:
            return SupplierAuthResult(
                success=False,
                message="Autonova D returned a non-JSON refresh response",
            )
        return self._token_result(data)

    def list_prices(self, token: str) -> list[dict]:
        client_id = self._require_client_id()
        resp = self._request(
            "GET",
            f"/api/v1/prices/clients/{quote(client_id, safe='')}",
            token=token,
            timeout=30,
        )
        if resp.status_code != 200:
            raise AutonovaError(
                f"Autonova D price list request failed: HTTP {resp.status_code}: "
                f"{self._error_message(resp)}"
            )
        try:
            payload = resp.json()
        except ValueError as exc:
            raise AutonovaError(
                "Autonova D returned a non-JSON price list response"
            ) from exc
        items = payload.get("data") if isinstance(payload, dict) else None
        if not isinstance(items, list):
            raise AutonovaError(
                f"Unexpected Autonova D price list response: {payload}"
            )
        return [item for item in items if isinstance(item, dict)]

    def get_warehouses(self, token: str) -> list[dict]:
        resp = self._request("GET", "/api/v1/warehouses", token=token, timeout=30)
        if resp.status_code != 200:
            return []
        try:
            payload = resp.json()
        except ValueError:
            return []
        items = payload.get("data") if isinstance(payload, dict) else None
        return [item for item in items if isinstance(item, dict)] if isinstance(items, list) else []

    def download_price_file(
        self,
        token: str,
        price_id: str,
        extension: str = "xlsx",
    ) -> bytes:
        resp = self._request(
            "GET",
            f"/api/v1/prices/{quote(str(price_id), safe='')}",
            token=token,
            params={"extension": extension},
            timeout=120,
        )
        if resp.status_code != 200:
            raise AutonovaError(
                f"Autonova D price download failed: HTTP {resp.status_code}: "
                f"{self._error_message(resp)}"
            )

        content = resp.content or b""
        content_type = (resp.headers.get("content-type") or "").lower()
        if "json" in content_type or content.lstrip()[:1] in (b"{", b"["):
            try:
                payload = resp.json()
            except ValueError as exc:
                raise AutonovaError(
                    "Autonova D returned an invalid price file response"
                ) from exc
            data = payload.get("data") if isinstance(payload, dict) else None
            if isinstance(data, dict):
                encoded = (
                    data.get("fileData")
                    or data.get("filedata")
                    or data.get("file_data")
                )
                if encoded:
                    if encoded.startswith("data:") and "," in encoded:
                        encoded = encoded.split(",", 1)[1]
                    try:
                        return base64.b64decode(encoded)
                    except (ValueError, TypeError) as exc:
                        raise AutonovaError(
                            "Autonova D returned invalid base64 price data"
                        ) from exc
            raise AutonovaError(
                f"Autonova D price response has no fileData: {payload}"
            )

        if content[:2] == b"PK":
            return content
        if content[:4] == b"\xd0\xcf\x11\xe0":
            raise AutonovaError(
                "Autonova D returned an old .xls file; xlsx is required"
            )
        raise AutonovaError(
            f"Unexpected Autonova D price file content (HTTP {resp.status_code})"
        )

    def get_export_params(self, token: str) -> ExportParamsResult:
        # One request is enough for the import dialog. Price lists are exposed
        # as selectable "categories" so the admin can pin the exact price.
        prices = self.list_prices(token)

        def _price_key(item: dict) -> datetime:
            raw = str(item.get("lastUpdate") or "").strip()
            for fmt in ("%d.%m.%Y %H:%M:%S", "%d.%m.%Y %H:%M", "%Y-%m-%dT%H:%M:%S"):
                try:
                    return datetime.strptime(raw, fmt)
                except ValueError:
                    continue
            return datetime.min

        prices.sort(key=_price_key, reverse=True)
        categories = []
        for item in prices:
            price_id = item.get("id")
            if not price_id:
                continue
            name = str(item.get("name") or "").strip()
            number = str(item.get("number") or "").strip()
            label = name or (f"Прайс {number}" if number else str(price_id))
            if name and number and number not in name:
                label = f"{name} (№{number})"
            categories.append({"id": str(price_id), "name": label})

        return ExportParamsResult(
            brands=[],
            categories=categories,
            models=[],
            formats=["xlsx"],
        )
