"""
Celery task for cleaning up old PriceImport records.
Keeps only the last N records per supplier, removes older ones (DB + files).
Triggered automatically after each successful import via queue_post_import_tasks.
"""
import os
import logging
from sqlalchemy.orm import Session
from app.core.db import SessionLocal
from app.models.imports import PriceImport
from app.workers import celery_app

logger = logging.getLogger(__name__)

PRICE_IMPORT_KEEP_COUNT = 5


@celery_app.task(bind=True, name="cleanup_old_price_imports")
def cleanup_old_price_imports(self):
    """Delete old PriceImport records beyond the keep count per supplier."""
    db = SessionLocal()
    total_deleted = 0
    try:
        suppliers = db.query(PriceImport.supplier).distinct().all()

        for (supplier,) in suppliers:
            all_records = (
                db.query(PriceImport)
                .filter(PriceImport.supplier == supplier)
                .order_by(PriceImport.created_at.desc())
                .all()
            )

            if len(all_records) <= PRICE_IMPORT_KEEP_COUNT:
                continue

            to_delete = all_records[PRICE_IMPORT_KEEP_COUNT:]

            for rec in to_delete:
                if rec.file_path and os.path.exists(rec.file_path):
                    os.remove(rec.file_path)
                db.delete(rec)
                total_deleted += 1

            db.commit()
            logger.info(
                "Cleaned up %d old import(s) for supplier '%s' (kept last %d)",
                len(to_delete), supplier, PRICE_IMPORT_KEEP_COUNT,
            )

        logger.info("cleanup_old_price_imports: deleted %d record(s)", total_deleted)
        return {"deleted": total_deleted}

    except Exception as e:
        logger.error("cleanup_old_price_imports failed: %s", e)
        db.rollback()
        return {"error": str(e)}
    finally:
        db.close()
