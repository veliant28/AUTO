from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.orm import Session
from datetime import datetime
from app.core.db import get_db
from app.api.v1.deps import require_permission
from app.models import User
from app.models.imports import SupplierConfig
from app.schemas.import_schemas import (
    SupplierConfigResponse, SupplierConfigUpdate, SupplierAuthResponse,
    SupplierPasswordResponse, TokenStatusResponse, ExportParamsResponse,
)
from app.services.supplier_api import (
    AUTONOVA_D_SUPPLIER,
    build_supplier_client,
    normalize_autonova_api_url,
)
from app.services.crypto_util import decrypt_password, encrypt_password

router = APIRouter()


def _config_to_response(c: SupplierConfig) -> SupplierConfigResponse:
    token_status = "none"
    if c.token:
        if c.token_expires_at and c.token_expires_at > datetime.utcnow():
            token_status = "active"
        else:
            token_status = "expired"
    return SupplierConfigResponse(
        id=c.id,
        supplier=c.supplier,
        login=c.login,
        client_id=c.client_id,
        api_url=c.api_url,
        is_active=c.is_active,
        has_password=bool(c.password_encrypted),
        token_status=token_status,
        token_expires_at=c.token_expires_at,
        created_at=c.created_at,
        updated_at=c.updated_at,
    )


@router.get("/suppliers", response_model=list[SupplierConfigResponse])
async def list_suppliers(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("suppliers.view")),
):
    """Список поставщиков с их конфигурацией."""
    configs = db.query(SupplierConfig).all()
    return [_config_to_response(c) for c in configs]


@router.put("/suppliers/{supplier}", response_model=SupplierConfigResponse)
async def update_supplier(
    supplier: str,
    body: SupplierConfigUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("suppliers.edit")),
):
    """Обновить конфигурацию поставщика (логин/пароль)."""
    config = db.query(SupplierConfig).filter(SupplierConfig.supplier == supplier).first()
    if not config:
        raise HTTPException(status_code=404, detail="Supplier config not found")
    if body.login is not None:
        config.login = body.login.strip()
    if body.client_id is not None:
        config.client_id = body.client_id.strip() or None
    if body.password is not None and body.password:
        config.password_encrypted = encrypt_password(body.password)
    if body.api_url is not None:
        new_url = body.api_url.strip().rstrip("/")
        if supplier.upper() == AUTONOVA_D_SUPPLIER:
            try:
                new_url = normalize_autonova_api_url(new_url)
            except ValueError as exc:
                raise HTTPException(status_code=400, detail=str(exc))
        elif not new_url.startswith(("http://", "https://")):
            raise HTTPException(status_code=400, detail="Invalid API URL")
        if new_url != (config.api_url or "").rstrip("/"):
            config.api_url = new_url
            # Tokens are environment-specific: never reuse a dev token in stable.
            config.token = None
            config.refresh_token = None
            config.token_expires_at = None
    config.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(config)
    return _config_to_response(config)


@router.get("/suppliers/{supplier}/password", response_model=SupplierPasswordResponse)
async def reveal_supplier_password(
    supplier: str,
    response: Response,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("suppliers.edit")),
):
    """Показать сохранённый пароль поставщика (только для редактирования)."""
    config = db.query(SupplierConfig).filter(SupplierConfig.supplier == supplier).first()
    if not config:
        raise HTTPException(status_code=404, detail="Supplier config not found")
    if not config.password_encrypted:
        raise HTTPException(status_code=404, detail="Password not configured")

    try:
        password = decrypt_password(config.password_encrypted)
    except Exception:
        raise HTTPException(status_code=500, detail="Stored supplier password cannot be decrypted")

    response.headers["Cache-Control"] = "no-store"
    response.headers["Pragma"] = "no-cache"
    return SupplierPasswordResponse(password=password)


@router.post("/suppliers/{supplier}/auth", response_model=SupplierAuthResponse)
async def authenticate_supplier(
    supplier: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("suppliers.edit")),
):
    """Аутентифицироваться в API поставщика."""
    config = db.query(SupplierConfig).filter(SupplierConfig.supplier == supplier).first()
    if not config:
        raise HTTPException(status_code=404, detail="Supplier config not found")

    try:
        client = build_supplier_client(supplier, config)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    result = client.auth()
    if not result.success:
        return SupplierAuthResponse(success=False, message=result.message)

    config.token = result.token
    config.token_expires_at = result.expires_at
    if result.refresh_token:
        config.refresh_token = result.refresh_token
    config.updated_at = datetime.utcnow()
    db.commit()

    remaining = int((config.token_expires_at - datetime.utcnow()).total_seconds()) if config.token_expires_at else None
    return SupplierAuthResponse(success=True, token_expires_at=result.expires_at, seconds_remaining=remaining)


@router.get("/suppliers/{supplier}/token-status", response_model=TokenStatusResponse)
async def get_token_status(
    supplier: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("suppliers.view")),
):
    """Получить статус токена поставщика."""
    config = db.query(SupplierConfig).filter(SupplierConfig.supplier == supplier).first()
    if not config:
        raise HTTPException(status_code=404, detail="Supplier config not found")

    status = "none"
    remaining = None
    if config.token and config.token_expires_at:
        now = datetime.utcnow()
        remaining = int((config.token_expires_at - now).total_seconds())
        status = "active" if remaining > 0 else "expired"
    return TokenStatusResponse(
        supplier=supplier,
        token_status=status,
        token_expires_at=config.token_expires_at,
        seconds_remaining=max(0, remaining) if remaining is not None else None,
    )


@router.post("/suppliers/{supplier}/refresh", response_model=SupplierAuthResponse)
async def refresh_supplier_token(
    supplier: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("suppliers.edit")),
):
    """Обновить токен поставщика."""
    config = db.query(SupplierConfig).filter(SupplierConfig.supplier == supplier).first()
    if not config:
        raise HTTPException(status_code=404, detail="Supplier config not found")

    if not config.token:
        return SupplierAuthResponse(success=False, message="No token to refresh")

    try:
        client = build_supplier_client(supplier, config)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    if supplier.upper() == "GPL":
        result = client.refresh(config.token)
    else:
        if not config.refresh_token:
            return SupplierAuthResponse(success=False, message="No refresh token available")
        result = client.refresh(config.refresh_token)

    if not result.success:
        return SupplierAuthResponse(success=False, message=result.message)

    config.token = result.token
    config.token_expires_at = result.expires_at
    if result.refresh_token:
        config.refresh_token = result.refresh_token
    config.updated_at = datetime.utcnow()
    db.commit()

    remaining = int((config.token_expires_at - datetime.utcnow()).total_seconds()) if config.token_expires_at else None
    return SupplierAuthResponse(success=True, token_expires_at=result.expires_at, seconds_remaining=remaining)
