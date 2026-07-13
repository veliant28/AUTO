import os
import logging
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from app.core.db import get_db
from app.api.v1.deps import require_role
from app.models import User, SiteSettings
from app.models.backup import BackupRecord
from app.schemas.backup_schemas import (
    BackupRecordResponse,
    BackupConfigResponse,
    BackupConfigUpdate,
)
from app.workers.tasks.backup_tasks import run_database_backup
import threading

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/backups", response_model=list[BackupRecordResponse])
async def list_backups(
    current_user: User = Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    """Get list of all backup records (ordered newest first, max 50)."""
    records = (
        db.query(BackupRecord)
        .order_by(BackupRecord.created_at.desc())
        .limit(50)
        .all()
    )
    return records


@router.post("/backups/run", response_model=dict)
async def run_backup(
    current_user: User = Depends(require_role("admin")),
):
    """Trigger a manual database backup in background thread."""
    thread = threading.Thread(target=run_database_backup, daemon=True)
    thread.start()
    return {"status": "started"}


@router.delete("/backups/{backup_id}", response_model=dict)
async def delete_backup(
    backup_id: int,
    current_user: User = Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    """Delete a backup record and its file."""
    record = db.query(BackupRecord).filter(BackupRecord.id == backup_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Backup not found")

    # Delete file
    if record.filepath and os.path.exists(record.filepath):
        os.remove(record.filepath)
        logger.info(f"Deleted backup file: {record.filepath}")

    db.delete(record)
    db.commit()
    return {"status": "deleted"}


@router.get("/backups/{backup_id}/download")
async def download_backup(
    backup_id: int,
    current_user: User = Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    """Download a backup file."""
    record = db.query(BackupRecord).filter(BackupRecord.id == backup_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Backup not found")

    if not record.filepath or not os.path.exists(record.filepath):
        raise HTTPException(status_code=404, detail="Backup file not found on disk")

    return FileResponse(
        path=record.filepath,
        filename=record.filename,
        media_type="application/gzip",
    )


@router.get("/backups/config", response_model=BackupConfigResponse)
async def get_backup_config(
    current_user: User = Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    """Get backup schedule configuration."""
    settings_row = _get_settings(db)
    return BackupConfigResponse(run_at_time=settings_row.backup_run_at_time or "02:00")


@router.put("/backups/config", response_model=BackupConfigResponse)
async def update_backup_config(
    body: BackupConfigUpdate,
    current_user: User = Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    """Update backup schedule configuration."""
    # Validate time format
    try:
        parts = body.run_at_time.split(":")
        if len(parts) != 2:
            raise ValueError
        h, m = int(parts[0]), int(parts[1])
        if not (0 <= h <= 23 and 0 <= m <= 59):
            raise ValueError
    except (ValueError, IndexError):
        raise HTTPException(status_code=422, detail="Invalid time format. Use HH:MM")

    settings_row = _get_settings(db)
    settings_row.backup_run_at_time = body.run_at_time
    db.commit()
    db.refresh(settings_row)
    return BackupConfigResponse(run_at_time=settings_row.backup_run_at_time)


def _get_settings(db: Session) -> SiteSettings:
    """Get or create the single site settings row."""
    settings_row = db.query(SiteSettings).first()
    if not settings_row:
        settings_row = SiteSettings()
        db.add(settings_row)
        db.commit()
        db.refresh(settings_row)
    return settings_row
