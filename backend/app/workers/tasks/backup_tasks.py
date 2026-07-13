import os
import gzip
import shutil
import logging
from datetime import datetime, timezone, timedelta

import docker

from app.core.db import SessionLocal
from app.models.backup import BackupRecord

logger = logging.getLogger(__name__)

BACKUP_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", "..", "Backup")
BACKUP_DIR = os.path.abspath(BACKUP_DIR)
MAX_BACKUPS = 7
KYIV_TZ = timezone(timedelta(hours=3))


def _kyiv_now() -> datetime:
    return datetime.now(KYIV_TZ)


def run_database_backup():
    """Create a full database dump via pg_dump in the postgres container."""
    os.makedirs(BACKUP_DIR, exist_ok=True)

    now = _kyiv_now()
    timestamp = now.strftime("%Y%m%d_%H%M%S")
    filename = f"backup_full_{timestamp}.sql.gz"
    filepath = os.path.join(BACKUP_DIR, filename)

    db = SessionLocal()
    try:
        record = BackupRecord(
            filename=filename,
            filepath=filepath,
            file_size=0,
            status="in_progress",
            type="full",
        )
        db.add(record)
        db.commit()
        db.refresh(record)
        record_id = record.id
    except Exception as e:
        logger.error(f"Failed to create backup record: {e}")
        db.close()
        return
    finally:
        db.close()

    temp_sql = filepath.replace(".gz", ".sql")
    try:
        # Run pg_dump inside the postgres container via Docker SDK
        client = docker.from_env()
        pg_container = client.containers.get("auto-postgres-1")

        logger.info("Running pg_dump in postgres container...")
        exit_code, output = pg_container.exec_run(
            cmd=[
                "pg_dump",
                "-U", "postgres",
                "-d", "autoparts",
                "--no-owner",
                "--no-acl",
            ],
            environment={"PGPASSWORD": "postgres"},
            demux=False,
            stream=False,
        )

        if exit_code != 0:
            stderr = output.decode() if isinstance(output, bytes) else str(output)
            raise RuntimeError(f"pg_dump failed (exit {exit_code}): {stderr}")

        # Write the dump directly
        sql_data = output if isinstance(output, bytes) else output.encode()
        with open(temp_sql, "wb") as f:
            f.write(sql_data)

        # Compress
        with open(temp_sql, "rb") as f_in:
            with gzip.open(filepath, "wb") as f_out:
                shutil.copyfileobj(f_in, f_out)

        os.remove(temp_sql)
        file_size = os.path.getsize(filepath)

        # Update record as completed
        db = SessionLocal()
        try:
            record = db.query(BackupRecord).filter(BackupRecord.id == record_id).first()
            if record:
                record.status = "completed"
                record.file_size = file_size
                record.completed_at = _kyiv_now()
                db.commit()
        finally:
            db.close()

        logger.info(f"Backup completed: {filename} ({file_size} bytes)")

        # Cleanup old backups
        _cleanup_old_backups()

    except Exception as e:
        logger.error(f"Backup failed: {e}")
        db = SessionLocal()
        try:
            record = db.query(BackupRecord).filter(BackupRecord.id == record_id).first()
            if record:
                record.status = "failed"
                record.completed_at = _kyiv_now()
                db.commit()
        finally:
            db.close()

        for f in [filepath, temp_sql]:
            if os.path.exists(f):
                os.remove(f)


def _cleanup_old_backups():
    """Remove old backups beyond MAX_BACKUPS."""
    db = SessionLocal()
    try:
        records = (
            db.query(BackupRecord)
            .filter(BackupRecord.status == "completed")
            .order_by(BackupRecord.created_at.desc())
            .all()
        )

        if len(records) <= MAX_BACKUPS:
            return

        to_delete = records[MAX_BACKUPS:]
        for rec in to_delete:
            if rec.filepath and os.path.exists(rec.filepath):
                os.remove(rec.filepath)
                logger.info(f"Deleted old backup file: {rec.filepath}")
            db.delete(rec)
        db.commit()
        logger.info(f"Cleaned up {len(to_delete)} old backup(s)")
    finally:
        db.close()
