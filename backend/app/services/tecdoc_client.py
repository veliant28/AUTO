import httpx
from app.core.config import settings
from app.core.rate_limiter import rate_limiter
from fastapi import HTTPException
from app.core.constants import TECDOC_REQUEST_TIMEOUT
from app.models import TecDocConfig
from app.core.db import SessionLocal


class TecDocClient:
    def __init__(self):
        self.base_url = settings.TECDOC_API_URL
        self._auth = None

    @property
    def auth(self):
        """Lazy-load credentials: DB first (TecDocConfig), fallback to .env."""
        if self._auth is not None:
            return self._auth

        try:
            db = SessionLocal()
            try:
                config = db.query(TecDocConfig).first()
                if config and config.auth_user and config.auth_pass:
                    self._auth = (config.auth_user, config.auth_pass)
                    return self._auth
            finally:
                db.close()
        except Exception:
            pass

        self._auth = (settings.TECDOC_API_KEY, settings.TECDOC_API_SECRET)
        return self._auth

    async def request(self, action: str, params: dict = None):
        """
        Generic method to handle API requests with Rate Limiting.
        """
        await rate_limiter.check_limit()

        params = params or {}
        params["action"] = action

        async with httpx.AsyncClient() as client:
            try:
                response = await client.get(
                    self.base_url,
                    params=params,
                    auth=self.auth,
                    timeout=TECDOC_REQUEST_TIMEOUT
                )
                response.raise_for_status()

                rate_limiter.record_action()

                return response.json()
            except httpx.HTTPStatusError as e:
                if e.response.status_code == 429:
                    raise HTTPException(status_code=429, detail="TecDoc API limit reached")
                raise HTTPException(status_code=e.response.status_code, detail=str(e))
            except Exception as e:
                raise HTTPException(status_code=500, detail=f"API Error: {str(e)}")

    async def get_makes(self, group: str = "passenger"):
        return await self.request("getMakes", {"group": group})

    async def get_models(self, make_id: int, group: str = "passenger"):
        return await self.request("getModels", {"make": make_id, "group": group})

    async def get_modifications(self, model_id: int, group: str = "passenger"):
        return await self.request("getModifications", {"model": model_id, "group": group})

    async def get_sections(self, mod_id: int, parent: int = 0, group: str = "passenger"):
        return await self.request("getSections", {"mod_id": mod_id, "parent": parent, "group": group})

    async def get_section_parts(self, mod_id: int, sec_id: int, group: str = "passenger"):
        return await self.request("getSectionParts", {"mod_id": mod_id, "sec_id": sec_id, "group": group})

    def reset_auth(self):
        """Clear cached auth so next request re-reads from DB (e.g. after settings update)."""
        self._auth = None


tecdoc_client = TecDocClient()
