from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from app.core.db import get_db
from app.api.v1.deps import require_permission
from app.models import User
from app.models.imports import ImportSchedule, PriceImport
from app.schemas.import_schemas import ImportScheduleItem, ImportScheduleUpdate

router = APIRouter()


def _compute_next_run_utc(schedule: ImportSchedule, tz_name: str = "Europe/Kiev") -> datetime:
    try:
        from zoneinfo import ZoneInfo
        tz = ZoneInfo(tz_name)
    except Exception:
        tz = None

    now_utc = datetime.utcnow()
    hour, minute = map(int, schedule.run_at_time.split(":"))
    if tz:
        from zoneinfo import ZoneInfo
        tz_utc = ZoneInfo("UTC")
        now_kiev = now_utc.replace(tzinfo=tz_utc).astimezone(tz)
    else:
        now_kiev = now_utc

    target = now_kiev.replace(hour=hour, minute=minute, second=0, microsecond=0)
    if target <= now_kiev:
        target += timedelta(hours=24)

    if tz:
        target_utc = target.astimezone(ZoneInfo("UTC")).replace(tzinfo=None)
    else:
        target_utc = target

    return target_utc


def _schedule_status(schedule, last_import) -> str:
    if not schedule.enabled:
        return "disabled"
    if not last_import:
        return "waiting"
    if last_import.status == "in_queue":
        return "waiting"
    if last_import.status == "processing":
        return "in_progress"
    if last_import.status == "failed":
        return "error"
    if last_import.status == "complete":
        if last_import.matched_items > 0:
            return "done"
        return "success"
    return "waiting"


def _schedule_to_response(s: ImportSchedule) -> ImportScheduleItem:
    return ImportScheduleItem(
        id=s.id,
        supplier=s.supplier,
        enabled=s.enabled,
        run_at_time=s.run_at_time,
        last_run_at=s.last_run_at,
        next_run_utc=_compute_next_run_utc(s) if s.enabled else None,
        last_import_id=s.last_import_id,
        last_import_progress=None,
        last_import_status=None,
        schedule_status="disabled" if not s.enabled else "waiting",
        created_at=s.created_at,
        updated_at=s.updated_at,
    )


@router.get("/schedules", response_model=list[ImportScheduleItem])
async def list_schedules(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("imports.view")),
):
    """Список расписаний импорта."""
    schedules = db.query(ImportSchedule).order_by(ImportSchedule.supplier).all()
    result = []
    for s in schedules:
        pi = db.query(PriceImport).filter(PriceImport.id == s.last_import_id).first() if s.last_import_id else None
        item = _schedule_to_response(s)
        item.schedule_status = _schedule_status(s, pi)
        if pi:
            item.last_import_progress = pi.progress
            item.last_import_status = pi.status
        result.append(item)
    return result


@router.put("/schedules/{supplier}", response_model=ImportScheduleItem)
async def update_schedule(
    supplier: str,
    body: ImportScheduleUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("imports.edit")),
):
    """Обновить расписание импорта для поставщика."""
    s = db.query(ImportSchedule).filter(ImportSchedule.supplier == supplier).first()
    if not s:
        raise HTTPException(status_code=404, detail="Schedule not found")
    if body.enabled is not None:
        s.enabled = body.enabled
    if body.run_at_time is not None:
        s.run_at_time = body.run_at_time
    s.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(s)
    item = _schedule_to_response(s)
    if s.last_import_id:
        pi = db.query(PriceImport).filter(PriceImport.id == s.last_import_id).first()
        if pi:
            item.last_import_progress = pi.progress
            item.last_import_status = pi.status
    return item


@router.post("/schedules/{supplier}/run", response_model=ImportScheduleItem)
async def run_schedule_now(
    supplier: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("imports.create")),
):
    """Запустить импорт по расписанию немедленно."""
    s = db.query(ImportSchedule).filter(ImportSchedule.supplier == supplier).first()
    if not s:
        raise HTTPException(status_code=404, detail="Schedule not found")

    pimport = PriceImport(supplier=supplier, format="xlsx", status="in_queue")
    db.add(pimport)
    db.commit()
    db.refresh(pimport)

    from app.workers.tasks.import_tasks import process_price_import
    process_price_import.delay(pimport.id)

    s.last_import_id = pimport.id
    s.last_run_at = datetime.utcnow()
    s.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(s)

    item = _schedule_to_response(s)
    item.last_import_progress = 0
    item.last_import_status = "in_queue"
    return item
