"""
Nova Poshta periodic tasks for Celery.

Syncs waybill tracking statuses for all active (non-final) waybills
that haven't reached a terminal status.
"""

import asyncio
import logging

from app.core.db import SessionLocal
from app.services.nova_poshta.tracking_service import NovaPoshtaTrackingService
from app.workers import celery_app

logger = logging.getLogger(__name__)


@celery_app.task(bind=True, name="sync_nova_poshta_waybill_statuses", max_retries=3, default_retry_delay=300)
def sync_nova_poshta_waybill_statuses(self):
    """
    Sync tracking status for all active NP waybills (last 45 days).

    Runs every 20 minutes via Celery Beat. Skips waybills that already
    have a final status. Logs the number of updated waybills.
    """
    db = SessionLocal()
    try:
        service = NovaPoshtaTrackingService(db)
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            count = loop.run_until_complete(
                service.sync_all_active(max_age_days=45)
            )
        finally:
            loop.close()

        logger.info("Synced %d Nova Poshta waybill(s)", count)
        return {"synced": count}
    except Exception as exc:
        logger.error("Nova Poshta waybill sync failed: %s", exc, exc_info=True)
        raise self.retry(exc=exc)
    finally:
        db.close()
