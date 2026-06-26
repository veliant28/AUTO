from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.core.db import get_db
from app.models.settings import SiteSettings
from app.models import User
from app.schemas.settings_schemas import SettingsResponse, SettingsUpdate, EmailTestRequest
from app.api.v1.deps import require_role
from app.services.crypto_util import encrypt_password, decrypt_password

router = APIRouter()


def _mask_api_key(api_key: str) -> str:
    """Вернуть маскированный ключ: re_***************************_abcd."""
    if not api_key or len(api_key) < 8:
        return "****"
    return api_key[:3] + "*" * (len(api_key) - 7) + api_key[-4:]


def _mask_google_secret(s: SiteSettings, decrypt_func) -> str | None:
    """Вернуть маскированный Google Client Secret по длине."""
    if not s.google_client_secret_encrypted:
        return None
    try:
        secret = decrypt_func(s.google_client_secret_encrypted)
        if not secret:
            return None
        if len(secret) < 8:
            return "****"
        return secret[:4] + "*" * (len(secret) - 8) + secret[-4:]
    except Exception:
        return "****"


def _build_settings_response(s: SiteSettings) -> SettingsResponse:
    """Собрать SettingsResponse с маскированным API ключом."""
    masked = None
    if s.resend_api_key_encrypted:
        try:
            api_key = decrypt_password(s.resend_api_key_encrypted)
            masked = _mask_api_key(api_key)
        except Exception:
            masked = "****"
    return SettingsResponse(
        brand_name=s.brand_name,
        timezone=s.timezone,
        email_from=s.email_from,
        email_from_name=s.email_from_name,
        has_resend_api_key=bool(s.resend_api_key_encrypted),
        resend_api_key_masked=masked,
        google_client_id=s.google_client_id,
        has_google_secret=bool(s.google_client_secret_encrypted),
        google_client_secret_masked=_mask_google_secret(s, decrypt_password),
    )


def _get_settings(db: Session) -> SiteSettings:
    s = db.query(SiteSettings).first()
    if not s:
        s = SiteSettings(
            brand_name="SVOM",
            timezone="Europe/Kiev",
            email_from="noreply@svom.com.ua",
        )
        db.add(s)
        db.commit()
        db.refresh(s)
    return s


@router.get("/settings", response_model=SettingsResponse)
async def get_public_settings(db: Session = Depends(get_db)):
    """Получить публичные настройки сайта."""
    s = _get_settings(db)
    return _build_settings_response(s)


@router.get("/admin/settings", response_model=SettingsResponse)
async def get_admin_settings(
    current_user: User = Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    """Получить настройки сайта для админа."""
    s = _get_settings(db)
    return _build_settings_response(s)


@router.put("/admin/settings", response_model=SettingsResponse)
async def update_settings(
    body: SettingsUpdate,
    current_user: User = Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    """Обновить настройки сайта."""
    s = _get_settings(db)
    if body.brand_name is not None:
        s.brand_name = body.brand_name
    if body.timezone is not None:
        s.timezone = body.timezone
    if body.resend_api_key is not None:
        if body.resend_api_key:
            s.resend_api_key_encrypted = encrypt_password(body.resend_api_key)
        else:
            s.resend_api_key_encrypted = None
    if body.email_from is not None:
        s.email_from = body.email_from
    if body.email_from_name is not None:
        s.email_from_name = body.email_from_name
    if body.google_client_id is not None:
        s.google_client_id = body.google_client_id or None
    if body.google_client_secret is not None:
        if body.google_client_secret:
            s.google_client_secret_encrypted = encrypt_password(body.google_client_secret)
        else:
            s.google_client_secret_encrypted = None
    db.commit()
    db.refresh(s)
    return _build_settings_response(s)


@router.get("/settings/google-client-id")
async def get_google_client_id(db: Session = Depends(get_db)):
    """Публично вернуть Google Client ID для фронтенда."""
    s = _get_settings(db)
    if s.google_client_id:
        return {"client_id": s.google_client_id}
    return {"client_id": None}


@router.post("/admin/settings/test-email")
async def test_email_settings(
    body: EmailTestRequest,
    current_user: User = Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    """Отправить тестовое письмо для проверки настроек SMTP/Resend."""
    import asyncio
    from app.services.email_service import send_email

    s = _get_settings(db)
    if not s.resend_api_key_encrypted:
        raise HTTPException(400, "Resend API key is not configured")

    api_key = decrypt_password(s.resend_api_key_encrypted)
    try:
        await asyncio.to_thread(
            send_email,
            to_email=body.to_email,
            subject="Test email from SVOM Auto Parts",
            html="<p>This is a test email. Your SMTP/Resend settings are working correctly!</p>",
            api_key=api_key,
            from_email=s.email_from,
            from_name=s.email_from_name or s.brand_name,
        )
        return {"message": "Test email sent successfully"}
    except Exception as e:
        raise HTTPException(500, f"Failed to send test email: {str(e)}")
