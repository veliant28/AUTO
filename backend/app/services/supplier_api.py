import httpx
from datetime import datetime, timedelta
from typing import Optional
from sqlalchemy.orm import Session
from app.models.imports import SupplierConfig
from app.services.crypto_util import decrypt_password, encrypt_password


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

    def fetch_all_prices(self, token: str) -> list:
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
                    if page >= data.get("last_page", 1):
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
