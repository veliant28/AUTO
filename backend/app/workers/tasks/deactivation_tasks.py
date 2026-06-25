"""Periodic product deactivation check."""
import logging
from datetime import datetime, timedelta

from sqlalchemy import text

from app.core.db import SessionLocal
from app.workers import celery_app

logger = logging.getLogger(__name__)

DEACTIVATION_REASONS = {
    "no_recent_offers": "Не обновлялся в прайсе более 30 часов",
    "no_stock": "Нет в наличии (quantity = 0 у всех поставщиков)",
    "zero_price": "Нулевая цена у всех поставщиков",
    "no_markup": "Не применена наценка (final_price IS NULL)",
}


@celery_app.task(bind=True, name="check_product_deactivation")
def check_product_deactivation(self):
    """Check all parts and deactivate/reactivate based on criteria."""
    db = SessionLocal()
    try:
        thirty_hours_ago = datetime.utcnow() - timedelta(hours=30)
        total_deactivated = 0
        total_reactivated = 0

        # ── Deactivation: find parts that fail at least one criterion ──────
        deactivate_sql = text("""
            WITH deactivated_parts AS (
                SELECT p.id,
                       CASE
                           WHEN NOT EXISTS (
                               SELECT 1 FROM supplier_offers so
                               WHERE so.part_id = p.id AND so.updated_at > :thirty_hours_ago
                           ) THEN 'no_recent_offers'
                           WHEN EXISTS (
                               SELECT 1 FROM supplier_offers so
                               WHERE so.part_id = p.id AND so.quantity = 0
                           ) AND NOT EXISTS (
                               SELECT 1 FROM supplier_offers so
                               WHERE so.part_id = p.id AND so.quantity > 0
                           ) THEN 'no_stock'
                           WHEN EXISTS (
                               SELECT 1 FROM supplier_offers so
                               WHERE so.part_id = p.id AND so.price = 0
                           ) THEN 'zero_price'
                           WHEN EXISTS (
                               SELECT 1 FROM supplier_offers so
                               WHERE so.part_id = p.id AND so.final_price IS NULL
                           ) THEN 'no_markup'
                           ELSE NULL
                       END AS reason
                FROM parts p
                WHERE p.is_active = TRUE
            )
            UPDATE parts
            SET is_active = FALSE,
                deactivated_at = NOW(),
                deactivation_reason = dp.reason
            FROM deactivated_parts dp
            WHERE parts.id = dp.id AND dp.reason IS NOT NULL
            RETURNING parts.id, dp.reason
        """)

        result = db.execute(deactivate_sql, {"thirty_hours_ago": thirty_hours_ago})
        deactivated = result.fetchall()
        total_deactivated = len(deactivated)
        for pid, reason in deactivated:
            logger.info("Deactivated part %s: %s", pid, DEACTIVATION_REASONS.get(reason, reason))

        # ── Reactivation: previously deactivated parts that now pass all criteria ──────
        reactivate_sql = text("""
            UPDATE parts
            SET is_active = TRUE,
                deactivated_at = NULL,
                deactivation_reason = NULL
            WHERE is_active = FALSE
              AND EXISTS (SELECT 1 FROM supplier_offers so WHERE so.part_id = parts.id AND so.updated_at > :thirty_hours_ago)
              AND EXISTS (SELECT 1 FROM supplier_offers so WHERE so.part_id = parts.id AND so.quantity > 0)
              AND NOT EXISTS (SELECT 1 FROM supplier_offers so WHERE so.part_id = parts.id AND so.price = 0)
              AND NOT EXISTS (SELECT 1 FROM supplier_offers so WHERE so.part_id = parts.id AND so.final_price IS NULL)
            RETURNING id
        """)

        result = db.execute(reactivate_sql, {"thirty_hours_ago": thirty_hours_ago})
        reactivated = result.fetchall()
        total_reactivated = len(reactivated)
        for (pid,) in reactivated:
            logger.info("Reactivated part %s", pid)

        db.commit()
        logger.info("Deactivation check complete: %s deactivated, %s reactivated",
                     total_deactivated, total_reactivated)
        return {"deactivated": total_deactivated, "reactivated": total_reactivated}

    except Exception as e:
        db.rollback()
        logger.error("Deactivation check failed: %s", e)
        self.update_state(state="FAILURE", meta={"error": str(e)})
        raise
    finally:
        db.close()
