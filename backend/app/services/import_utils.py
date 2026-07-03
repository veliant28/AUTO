"""
Shared utilities for import Celery tasks.
"""
import logging
from datetime import datetime
from sqlalchemy.orm import Session
from app.models.imports import PriceImport

logger = logging.getLogger(__name__)


def make_progress_cb(db: Session, import_id: int, offset: int = 0, scale: float = 1.0):
    """
    Return a progress-update callback for promote_all_to_catalog.

    Usage:
        progress_cb = make_progress_cb(db, import_id, offset=35, scale=0.30)
        promote_all_to_catalog(db, "GPL", progress_cb=progress_cb)
    """
    def _cb(pct: int):
        try:
            pi = db.query(PriceImport).filter(PriceImport.id == import_id).first()
            if pi:
                pi.progress = offset + int(pct * scale)
                db.commit()
        except Exception:
            db.rollback()
    return _cb


def safe_fail_import(db: Session, import_id: int, error: str):
    """Mark an import as failed with the given error message."""
    try:
        pi = db.query(PriceImport).filter(PriceImport.id == import_id).first()
        if pi:
            pi.status = "failed"
            pi.error_message = str(error)[:500]
            db.commit()
    except Exception:
        db.rollback()


def complete_import(pi: PriceImport, db: Session):
    """Mark an import as complete (progress=100, status=complete)."""
    pi.progress = 100
    pi.status = "complete"
    pi.stage_name = ""
    pi.finished_at = datetime.utcnow()
    db.commit()
    logger.info("Import %d marked complete", pi.id)


def queue_post_import_tasks(supplier: str):
    """
    Queue post-import parallel tasks based on supplier type.

    Order:
      1. deactivate_orphaned_offers  — cleanup products gone from price list
      2. apply_margins_task          — apply pricing rules (also triggers 30h fallback)
      3. download_product_images     — GPL only
      4. match_parts_with_tecdoc     — TecDoc cross-reference
    """
    from app.workers.tasks.deactivation_tasks import deactivate_orphaned_offers

    try:
        deactivate_orphaned_offers.delay(supplier)
        logger.info("%s: orphaned offers deactivation queued", supplier)
    except Exception as e:
        logger.warning("%s: failed to queue orphan deactivation: %s", supplier, e)

    from app.workers.tasks.pricing_tasks import apply_margins_task

    try:
        apply_margins_task.delay()
        logger.info("%s: margins task queued", supplier)
    except Exception as e:
        logger.warning("%s: failed to queue margins: %s", supplier, e)

    if supplier.upper() == "GPL":
        try:
            from app.workers.tasks.image_tasks import download_product_images
            download_product_images.delay()
            logger.info("GPL: image download task queued")
        except Exception as e:
            logger.warning("GPL: failed to queue image download: %s", e)

    try:
        from app.workers.tasks.tecdoc_tasks import match_parts_with_tecdoc
        match_parts_with_tecdoc.delay()
        logger.info("%s: tecdoc matching task queued", supplier)
    except Exception as e:
        logger.warning("%s: failed to queue tecdoc matching: %s", supplier, e)
