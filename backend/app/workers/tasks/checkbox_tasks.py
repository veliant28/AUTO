"""
Celery task for async Checkbox receipt creation after TTN creation.
"""
import logging
from app.workers import celery_app
from app.core.db import SessionLocal
from app.services.checkbox.service import CheckboxService

logger = logging.getLogger(__name__)


@celery_app.task(
    name="create_checkbox_receipt",
    max_retries=3,
    default_retry_delay=30,
    autoretry_for=(Exception,),
)
def create_checkbox_receipt_task(order_id: int):
    """
    Create a Checkbox fiscal receipt for an order.

    Runs asynchronously after TTN creation so it doesn't block the API response.
    """
    logger.info("Starting Checkbox receipt creation for order %d", order_id)
    db = SessionLocal()
    try:
        import asyncio

        service = CheckboxService(db)
        if not service.is_configured():
            logger.warning("Checkbox not configured, skipping receipt for order %d", order_id)
            return {"success": False, "reason": "not_configured"}

        # Run the async method in a sync context
        loop = asyncio.new_event_loop()
        try:
            receipt = loop.run_until_complete(service.create_receipt_for_order(order_id))
        finally:
            loop.close()

        if receipt.status == "created":
            logger.info("Checkbox receipt created for order %d: %s", order_id, receipt.receipt_id)
            return {"success": True, "receipt_id": receipt.receipt_id}
        else:
            logger.warning("Checkbox receipt failed for order %d: %s", order_id, receipt.error_message)
            return {"success": False, "reason": receipt.error_message}

    except Exception as e:
        logger.error("Checkbox receipt task error for order %d: %s", order_id, e, exc_info=True)
        raise  # let Celery retry

    finally:
        db.close()
