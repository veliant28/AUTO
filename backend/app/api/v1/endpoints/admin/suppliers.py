from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from datetime import datetime
from app.core.db import get_db
from app.api.v1.deps import require_role
from app.models import User
from app.models.imports import SupplierConfig
from app.schemas.import_schemas import (
    SupplierConfigResponse, SupplierConfigUpdate, SupplierAuthResponse,
    TokenStatusResponse, ExportParamsResponse,
)
from app.services.supplier_api import GPLAPIClient, UTRAPIClient
from app.services.crypto_util import encrypt_password

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
        api_url=c.api_url,
        is_active=c.is_active,
        token_status=token_status,
        token_expires_at=c.token_expires_at,
        created_at=c.created_at,
        updated_at=c.updated_at,
    )


@router.get("/suppliers", response_model=list[SupplierConfigResponse])
async def list_suppliers(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    """Список поставщиков с их конфигурацией."""
    configs = db.query(SupplierConfig).all()
    return [_config_to_response(c) for c in configs]


@router.put("/suppliers/{supplier}", response_model=SupplierConfigResponse)
async def update_supplier(
    supplier: str,
    body: SupplierConfigUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    """Обновить конфигурацию поставщика (логин/пароль)."""
    config = db.query(SupplierConfig).filter(SupplierConfig.supplier == supplier).first()
    if not config:
        raise HTTPException(status_code=404, detail="Supplier config not found")
    if body.login is not None:
        config.login = body.login
    if body.password is not None and body.password:
        config.password_encrypted = encrypt_password(body.password)
    config.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(config)
    return _config_to_response(config)


@router.post("/suppliers/{supplier}/auth", response_model=SupplierAuthResponse)
async def authenticate_supplier(
    supplier: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    """Аутентифицироваться в API поставщика."""
    config = db.query(SupplierConfig).filter(SupplierConfig.supplier == supplier).first()
    if not config:
        raise HTTPException(status_code=404, detail="Supplier config not found")

    if supplier.upper() == "GPL":
        client = GPLAPIClient(config)
    elif supplier.upper() == "UTR":
        client = UTRAPIClient(config)
    else:
        raise HTTPException(status_code=400, detail=f"Unknown supplier: {supplier}")

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
    current_user: User = Depends(require_role("admin")),
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
    current_user: User = Depends(require_role("admin")),
):
    """Обновить токен поставщика."""
    config = db.query(SupplierConfig).filter(SupplierConfig.supplier == supplier).first()
    if not config:
        raise HTTPException(status_code=404, detail="Supplier config not found")

    if not config.token:
        return SupplierAuthResponse(success=False, message="No token to refresh")

    if supplier.upper() == "GPL":
        client = GPLAPIClient(config)
        result = client.refresh(config.token)
    elif supplier.upper() == "UTR":
        if not config.refresh_token:
            return SupplierAuthResponse(success=False, message="No refresh token available")
        client = UTRAPIClient(config)
        result = client.refresh(config.refresh_token)
    else:
        raise HTTPException(status_code=400, detail=f"Unknown supplier: {supplier}")

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
