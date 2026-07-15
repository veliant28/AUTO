from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.staticfiles import StaticFiles
from app.api.v1.api import api_router
from app.core.config import settings
from app.core.exceptions import (
    AppException,
    app_exception_handler,
    http_exception_handler,
    nova_poshta_api_error_handler,
)
from app.core.middleware import LoggingMiddleware, LocaleMiddleware
from app.core.logger import logger
from app.core.health import router as health_router
from app.core.protection_middleware import ProtectionMiddleware
from app.services.nova_poshta.errors import NovaPoshtaApiError

if settings.SENTRY_DSN:
    import sentry_sdk
    sentry_sdk.init(
        dsn=settings.SENTRY_DSN,
        traces_sample_rate=0.2,
        profiles_sample_rate=0.1,
    )


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup/shutdown lifecycle."""
    # ── Startup ──────────────────────────────────────────────────────
    # Register Telegram webhook (fire-and-forget, non-blocking)
    try:
        from app.core.db import SessionLocal
        from app.models.settings import SiteSettings
        from app.services.crypto_util import decrypt_password
        from app.telegram.client import set_webhook as tg_set_webhook

        public_url = settings.TELEGRAM_WEBHOOK_URL
        if public_url:
            db = SessionLocal()
            try:
                s = db.query(SiteSettings).first()
                if s and s.telegram_bot_token_encrypted:
                    token = decrypt_password(s.telegram_bot_token_encrypted)
                    if token:
                        ok = await tg_set_webhook(public_url, bot_token=token)
                        if ok:
                            logger.info("Telegram webhook registered: %s", public_url)
                        else:
                            logger.warning("Failed to register Telegram webhook")
            finally:
                db.close()
        else:
            logger.info("TELEGRAM_WEBHOOK_URL not set — skipping webhook registration")
    except Exception:
        logger.exception("Telegram webhook registration error")

    yield

    # ── Shutdown ─────────────────────────────────────────────────────
    pass


app = FastAPI(
    title=settings.PROJECT_NAME,
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
    docs_url="/docs",
    redoc_url="/redoc",
    version="1.0.0",
    lifespan=lifespan,
)

# Middleware — Protection must be FIRST (outermost) to catch all requests
app.add_middleware(ProtectionMiddleware)
app.add_middleware(GZipMiddleware, minimum_size=1000)
app.add_middleware(LoggingMiddleware)
# Locale middleware must be added LAST so it runs FIRST (outermost layer)
# and sets request.state.locale before route handlers read it.
app.add_middleware(LocaleMiddleware)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000", "http://localhost:3080", "http://127.0.0.1:3080"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Exception handlers
# Order: more specific → more general. HTTPException caught first via MRO lookup.
app.add_exception_handler(HTTPException, http_exception_handler)
app.add_exception_handler(AppException, app_exception_handler)
app.add_exception_handler(NovaPoshtaApiError, nova_poshta_api_error_handler)

# Routes
app.include_router(api_router, prefix=settings.API_V1_STR)
app.include_router(health_router)

# Static files (product images)
import os
media_dir = os.path.join(os.path.dirname(__file__), "..", "media")
os.makedirs(os.path.join(media_dir, "products"), exist_ok=True)
app.mount("/media", StaticFiles(directory=media_dir), name="media")

@app.get("/")
async def root():
    return {"message": "Welcome to the Auto Parts Store API"}
