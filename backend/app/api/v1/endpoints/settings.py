from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.core.db import get_db
from app.models.settings import SiteSettings
from app.models import User
from app.schemas.settings_schemas import SettingsResponse, SettingsUpdate
from app.api.v1.deps import require_role

router = APIRouter()

def _get_settings(db: Session) -> SiteSettings:
    s = db.query(SiteSettings).first()
    if not s:
        s = SiteSettings(brand_name="AutoParts")
        db.add(s)
        db.commit()
        db.refresh(s)
    return s

@router.get("/settings", response_model=SettingsResponse)
async def get_public_settings(db: Session = Depends(get_db)):
    s = _get_settings(db)
    return SettingsResponse(brand_name=s.brand_name)

@router.get("/admin/settings", response_model=SettingsResponse)
async def get_admin_settings(
    current_user: User = Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    s = _get_settings(db)
    return SettingsResponse(brand_name=s.brand_name)

@router.put("/admin/settings", response_model=SettingsResponse)
async def update_settings(
    body: SettingsUpdate,
    current_user: User = Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    s = _get_settings(db)
    if body.brand_name is not None:
        s.brand_name = body.brand_name
    db.commit()
    db.refresh(s)
    return SettingsResponse(brand_name=s.brand_name)
