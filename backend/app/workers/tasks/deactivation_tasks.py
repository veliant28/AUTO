"""Periodic product deactivation check."""
import logging
from datetime import datetime, timedelta

from sqlalchemy import text, delete as sa_delete

from app.core.db import SessionLocal
from app.workers import celery_app

logger = logging.getLogger(__name__)

DEACTIVATION_REASONS = {
    "no_recent_offers": "Не обновлялся в прайсе более 30 часов",
    "no_stock": "Нет в наличии (quantity = 0 у всех поставщиков)",
    "zero_price": "Нулевая цена у всех поставщиков",
    "no_markup": "Не применена наценка (final_price IS NULL)",
    "orphaned": "Пропал из прайса поставщика",
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


@celery_app.task(bind=True, name="deactivate_orphaned_offers")
def deactivate_orphaned_offers(self, supplier: str):
    """
    Deactivate products that disappeared from a supplier's price list.
    Called immediately after a successful import for that specific supplier.

    Logic:
    1. Collect all (article, brand) from SupplierPrice for this supplier (price > 0)
    2. Find SupplierOffer rows for this supplier whose Part is NOT in that set
    3. Delete those stale offers
    4. Deactivate Parts that now have zero active offers from any supplier
    """
    db = SessionLocal()
    try:
        supplier_upper = supplier.upper()
        logger.info("Deactivating orphaned offers for supplier: %s", supplier_upper)

        # 1. Collect active article+brand from SupplierPrice
        from app.models.tecdoc import SupplierPrice
        active = db.query(
            SupplierPrice.article, SupplierPrice.brand
        ).filter(
            SupplierPrice.supplier == supplier_upper,
            SupplierPrice.price.isnot(None),
            SupplierPrice.price > 0,
        ).all()
        active_set = {(a, b or "") for a, b in active}
        logger.info("  Active (article,brand) in SupplierPrice: %s", len(active_set))

        # 2. Find SupplierOffer rows for this supplier to check
        from app.models.suppliers import Supplier, SupplierOffer
        supplier_obj = db.query(Supplier).filter(Supplier.name == supplier_upper).first()
        if not supplier_obj:
            logger.warning("  Supplier %s not found, skipping", supplier_upper)
            return {"error": "Supplier not found"}

        from app.models.parts import Part
        offers = db.query(SupplierOffer, Part).join(
            Part, Part.id == SupplierOffer.part_id
        ).filter(
            SupplierOffer.supplier_id == supplier_obj.id
        ).all()

        stale_part_ids = set()
        stale_offer_ids = set()
        for offer, part in offers:
            key = (part.article, part.brand or "")
            if key not in active_set:
                stale_offer_ids.add(offer.id)
                stale_part_ids.add(part.id)

        logger.info("  Stale offers to remove: %s", len(stale_offer_ids))
        logger.info("  Affected parts: %s", len(stale_part_ids))

        if not stale_offer_ids:
            return {"deactivated": 0, "removed_offers": 0}

        # 3. Delete stale offers
        db.execute(
            sa_delete(SupplierOffer).where(SupplierOffer.id.in_(stale_offer_ids))
        )
        db.commit()
        logger.info("  Deleted %s stale offers", len(stale_offer_ids))

        # 4. Deactivate parts that have no other offers from any supplier
        deactivated_count = 0
        for pid in stale_part_ids:
            remaining = db.query(SupplierOffer).filter(
                SupplierOffer.part_id == pid
            ).count()
            if remaining == 0:
                part = db.query(Part).filter(Part.id == pid).first()
                if part and part.is_active:
                    part.is_active = False
                    part.deactivated_at = datetime.utcnow()
                    part.deactivation_reason = "orphaned"
                    deactivated_count += 1
                    logger.info("  Deactivated part %s (article=%s, brand=%s)",
                               pid, part.article, part.brand)

        db.commit()
        logger.info("Deactivation complete for %s: %s parts deactivated, %s offers removed",
                    supplier_upper, deactivated_count, len(stale_offer_ids))
        return {"deactivated": deactivated_count, "removed_offers": len(stale_offer_ids)}

    except Exception as e:
        db.rollback()
        logger.error("deactivate_orphaned_offers failed for %s: %s", supplier, e)
        self.update_state(state="FAILURE", meta={"error": str(e)})
        raise
    finally:
        db.close()
