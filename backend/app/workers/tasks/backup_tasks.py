import os
import gzip
import shutil
import subprocess
import logging
from datetime import datetime

from app.core.config import settings
from app.core.db import SessionLocal
from app.models.backup import BackupRecord

logger = logging.getLogger(__name__)

BACKUP_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", "..", "Backup")
BACKUP_DIR = os.path.abspath(BACKUP_DIR)
MAX_BACKUPS = 7


def run_database_backup():
    """Create a full database dump, compress it, and store in Backup/ directory."""
    os.makedirs(BACKUP_DIR, exist_ok=True)

    timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
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

    try:
        # Build pg_dump command from config
        db_url = settings.DATABASE_URL
        # Parse DATABASE_URL: postgresql://user:pass@host:port/dbname
        import re
        match = re.match(
            r"postgresql(?:\+[a-z0-9]+)?(?:\.dryrun)?://(?:([^:@]+):?([^@]*)@)?([^:/]+):?(\d+)?/(.+)",
            db_url,
        )
        if not match:
            raise ValueError(f"Cannot parse DATABASE_URL: {db_url}")

        user = match.group(1) or "postgres"
        password = match.group(2) or ""
        host = match.group(3) or "localhost"
        port = match.group(4) or "5432"
        dbname = match.group(5)

        env = os.environ.copy()
        if password:
            env["PGPASSWORD"] = password

        # Dump to temporary uncompressed file
        temp_sql = filepath.replace(".gz", ".sql")
        cmd = [
            "pg_dump",
            "-h", host,
            "-p", str(port),
            "-U", user,
            "-d", dbname,
            "--no-owner",
            "--no-acl",
            "-f", temp_sql,
        ]

        logger.info(f"Running backup: {' '.join(cmd)}")
        result = subprocess.run(cmd, env=env, capture_output=True, text=True, timeout=3600)

        if result.returncode != 0:
            raise RuntimeError(f"pg_dump failed: {result.stderr}")

        # Compress
        with open(temp_sql, "rb") as f_in:
            with gzip.open(filepath, "wb") as f_out:
                shutil.copyfileobj(f_in, f_out)

        # Remove temp file
        os.remove(temp_sql)

        file_size = os.path.getsize(filepath)

        # Update record as completed
        db = SessionLocal()
        try:
            record = db.query(BackupRecord).filter(BackupRecord.id == record_id).first()
            if record:
                record.status = "completed"
                record.file_size = file_size
                record.completed_at = datetime.utcnow()
                db.commit()
        finally:
            db.close()

        logger.info(f"Backup completed: {filename} ({file_size} bytes)")

        # Cleanup old backups - keep only MAX_BACKUPS most recent
        _cleanup_old_backups(db_url, user, password, host, port, dbname)

    except Exception as e:
        logger.error(f"Backup failed: {e}")
        db = SessionLocal()
        try:
            record = db.query(BackupRecord).filter(BackupRecord.id == record_id).first()
            if record:
                record.status = "failed"
                record.completed_at = datetime.utcnow()
                db.commit()
        finally:
            db.close()

        # Clean up partial file
        for f in [filepath, filepath.replace(".gz", ".sql")]:
            if os.path.exists(f):
                os.remove(f)


def _cleanup_old_backups(db_url: str, user: str, password: str, host: str, port: str, dbname: str):
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
            # Delete file
            if rec.filepath and os.path.exists(rec.filepath):
                os.remove(rec.filepath)
                logger.info(f"Deleted old backup file: {rec.filepath}")
            # Delete DB record
            db.delete(rec)
        db.commit()
        logger.info(f"Cleaned up {len(to_delete)} old backup(s)")
    finally:
        db.close()
