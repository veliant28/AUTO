"""
Service for batch tracking sync of Nova Poshta waybills.

Used by Celery tasks and manual refresh operations.
"""
import logging
from typing import List, Optional
from datetime import datetime, timedelta

from sqlalchemy.orm import Session
from sqlalchemy import select

from app.models.nova_poshta import OrderNovaPoshtaWaybill, NovaPoshtaSenderProfile
from app.services.nova_poshta.client import NovaPoshtaApiClient
from app.services.nova_poshta.error_mapper import NovaPoshtaErrorMapper
from app.services.nova_poshta.errors import NovaPoshtaApiError

logger = logging.getLogger(__name__)


class NovaPoshtaTrackingService:
    """
    Batch tracking sync for NP waybills.

    Handles one-at-a-time status sync through the waybill service,
    and bulk sync for Celery.
    """

    def __init__(self, db: Session):
        self.db = db

    async def sync_all_active(
        self,
        max_age_days: int = 45,
        max_waybills: Optional[int] = None,
    ) -> int:
        """
        Sync tracking status for all active (non-deleted) waybills
        that don't have a final status.

        Returns the number of synced waybills.
        """
        from app.services.nova_poshta.waybill_service import NovaPoshtaWaybillService
        from app.services.nova_poshta.constants import NOVA_POSHTA_FINAL_STATUSES

        waybill_service = NovaPoshtaWaybillService(self.db)

        # Query active waybills without final status
        cutoff = datetime.utcnow() - timedelta(days=max_age_days)
        stmt = (
            select(OrderNovaPoshtaWaybill)
            .where(
                OrderNovaPoshtaWaybill.is_deleted == False,
                OrderNovaPoshtaWaybill.created_at >= cutoff,
                ~OrderNovaPoshtaWaybill.status_code.in_(NOVA_POSHTA_FINAL_STATUSES),
            )
            .order_by(OrderNovaPoshtaWaybill.status_synced_at.asc().nullsfirst())
        )

        if max_waybills:
            stmt = stmt.limit(max_waybills)

        waybills = list(self.db.execute(stmt).scalars().all())
        synced_count = 0

        for wb in waybills:
            try:
                await waybill_service.sync_tracking_status(waybill_id=wb.id)
                synced_count += 1
            except Exception as e:
                logger.error("Failed to sync waybill id=%d: %s", wb.id, e)

        logger.info("Synced %d/%d waybills", synced_count, len(waybills))
        return synced_count

    async def sync_waybill_numbers(
        self,
        numbers: List[str],
        sender_profile_id: Optional[int] = None,
    ) -> dict:
        """
        Sync tracking for specific TTN numbers.

        Returns dict of {number: {status_code, status_text}}.
        """
        from app.services.nova_poshta.constants import MODEL_TRACKING

        # Find the sender profile to use
        if sender_profile_id:
            sender = self.db.get(NovaPoshtaSenderProfile, sender_profile_id)
        else:
            stmt = (
                select(NovaPoshtaSenderProfile)
                .where(
                    NovaPoshtaSenderProfile.is_active == True,
                    NovaPoshtaSenderProfile.is_default == True,
                )
                .limit(1)
            )
            sender = self.db.execute(stmt).scalar_one_or_none()

        if not sender:
            logger.warning("No sender profile available for tracking sync")
            return {}

        client = NovaPoshtaApiClient(sender.api_token)

        # NP accepts up to 100 documents per request
        documents = [{"DocumentNumber": num} for num in numbers]
        try:
            response = await client.get_status({"Documents": documents})
        except NovaPoshtaApiError as e:
            logger.error("Batch tracking sync failed: %s", e)
            return {num: {"status_code": "", "status_text": f"Error: {e.message}"} for num in numbers}

        results: dict = {}
        data_list = response.get("data", [])
        if isinstance(data_list, list):
            for item in data_list:
                number = item.get("Number", "")
                results[number] = {
                    "status_code": item.get("StatusCode", ""),
                    "status_text": item.get("Status", ""),
                    "date": item.get("Date", ""),
                }

        # Fill in missing numbers
        for num in numbers:
            if num not in results:
                results[num] = {"status_code": "", "status_text": "Не знайдено"}

        return results

    @staticmethod
    def get_expired_waybills(
        db: Session,
        max_age_days: int = 90,
    ) -> List[OrderNovaPoshtaWaybill]:
        """Get waybills that are very old and can be archived."""
        from app.services.nova_poshta.constants import NOVA_POSHTA_FINAL_STATUSES
        cutoff = datetime.utcnow() - timedelta(days=max_age_days)
        stmt = (
            select(OrderNovaPoshtaWaybill)
            .where(
                OrderNovaPoshtaWaybill.is_deleted == False,
                OrderNovaPoshtaWaybill.status_code.in_(NOVA_POSHTA_FINAL_STATUSES),
                OrderNovaPoshtaWaybill.created_at < cutoff,
            )
        )
        return list(db.execute(stmt).scalars().all())
