from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from app.core.db import get_db
from app.models.footer import FooterContent
from app.models import User
from app.schemas.footer_schemas import FooterResponse, FooterUpdate
from app.api.v1.deps import require_role

router = APIRouter()

LOCALES = ['ru', 'en', 'ua']

@router.get("/footer", response_model=FooterResponse)
async def get_footer(locale: str = "ru", db: Session = Depends(get_db)):
    if locale not in LOCALES:
        locale = "ru"
    entry = db.query(FooterContent).filter(FooterContent.locale == locale).first()
    if not entry:
        return FooterResponse(locale=locale, data={})
    return FooterResponse(locale=entry.locale, data=entry.data)

@router.get("/admin/footer", response_model=List[FooterResponse])
async def get_all_footer(current_user: User = Depends(require_role("admin")), db: Session = Depends(get_db)):
    entries = db.query(FooterContent).all()
    return [FooterResponse(locale=e.locale, data=e.data) for e in entries]

@router.put("/admin/footer/{locale}", response_model=FooterResponse)
async def update_footer(locale: str, body: FooterUpdate, current_user: User = Depends(require_role("admin")), db: Session = Depends(get_db)):
    if locale not in LOCALES:
        raise HTTPException(400, f"Invalid locale: {locale}")
    entry = db.query(FooterContent).filter(FooterContent.locale == locale).first()
    if not entry:
        entry = FooterContent(locale=locale, data={})
        db.add(entry)
    update_data = body.data.model_dump(exclude_none=True)
    entry.data = {**entry.data, **update_data} if entry.data else update_data
    db.commit()
    db.refresh(entry)
    return FooterResponse(locale=entry.locale, data=entry.data)
