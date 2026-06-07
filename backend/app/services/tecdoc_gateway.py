import httpx
import time
from sqlalchemy.orm import Session
from app.models import TecDocConfig
from app.services.rate_limiter import rate_limiter


class TecDocGateway:
    def __init__(self, db: Session):
        self.db = db
        self._config = None

    @property
    def config(self) -> TecDocConfig:
        if not self._config:
            self._config = self.db.query(TecDocConfig).first()
        return self._config

    @property
    def base_url(self) -> str:
        return (self.config.api_url or "https://auto-db.pro/api/v1/").rstrip("/")

    @property
    def auth(self):
        user = self.config.db_user or self.config.auth_user or ""
        passwd = self.config.db_pass or self.config.auth_pass or ""
        return (user, passwd)

    def can_call(self) -> bool:
        return not rate_limiter.is_exhausted(self.db)

    def remaining(self) -> int:
        return rate_limiter.remaining(self.db)

    async def _call(self, params: dict, endpoint_label: str,
                     article: str = None, brand_id: int = None) -> dict:
        if rate_limiter.is_exhausted(self.db):
            raise TecDocLimitExceeded("TecDoc hourly limit reached")

        t0 = time.monotonic()
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                resp = await client.get(
                    self.base_url + "/",
                    params=params,
                    auth=httpx.BasicAuth(*self.auth),
                )
                resp.raise_for_status()
                data = resp.json()
                ms = int((time.monotonic() - t0) * 1000)
                rate_limiter.log(self.db, endpoint_label, article=article, brand_id=brand_id,
                                 success=True, response_ms=ms)
                return data
        except TecDocLimitExceeded:
            raise
        except Exception as e:
            ms = int((time.monotonic() - t0) * 1000)
            rate_limiter.log(self.db, endpoint_label, article=article, brand_id=brand_id,
                             success=False, response_ms=ms)
            raise TecDocApiError(str(e))

    async def search(self, query: str) -> dict:
        return await self._call({"action": "search", "q": query}, "search", article=query)

    async def get_article_info(self, number: str, brand: int) -> dict:
        return await self._call({"action": "getArtInfo", "number": number, "brand": brand},
                                "getArtInfo", article=number, brand_id=brand)

    async def get_oem(self, number: str, brand: int) -> dict:
        return await self._call({"action": "getOem", "number": number, "brand": brand},
                                "getOem", article=number, brand_id=brand)

    async def get_cross(self, number: str, brand: int) -> dict:
        return await self._call({"action": "getCross", "number": number, "brand": brand},
                                "getCross", article=number, brand_id=brand)

    async def get_images(self, number: str, brand: int) -> dict:
        return await self._call({"action": "getImages", "number": number, "brand": brand},
                                "getImages", article=number, brand_id=brand)

    async def get_vehicles(self, number: str, brand: int) -> dict:
        return await self._call({"action": "getVehicles", "number": number, "brand": brand},
                                "getVehicles", article=number, brand_id=brand)

    async def test_connection(self) -> dict:
        t0 = time.monotonic()
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                resp = await client.get(
                    self.base_url + "/",
                    params={"action": "getMakes", "group": "passenger"},
                    auth=httpx.BasicAuth(*self.auth),
                )
                resp.raise_for_status()
                ms = int((time.monotonic() - t0) * 1000)
                return {"success": True, "message": "OK", "latency_ms": ms}
        except Exception as e:
            ms = int((time.monotonic() - t0) * 1000)
            return {"success": False, "message": str(e), "latency_ms": ms}


class TecDocLimitExceeded(Exception):
    pass


class TecDocApiError(Exception):
    pass


gateway_instances: dict[int, TecDocGateway] = {}


def get_gateway(db: Session) -> TecDocGateway:
    key = id(db)
    if key not in gateway_instances:
        gateway_instances[key] = TecDocGateway(db)
    return gateway_instances[key]
