from celery import shared_task
from app.workers import celery_app
from app.core.db import SessionLocal
from app.services.pricing_service import apply_margins_bulk
import json
from app.models.pricing import PriceRule, PricingApplySnapshot
from app.services.notifications import send_telegram_notification
from app.workers.tasks.deactivation_tasks import check_product_deactivation


@celery_app.task(bind=True, name="apply_margins")
def apply_margins_task(self, part_ids=None):
    db = SessionLocal()
    try:
        self.update_state(state="PROGRESS", meta={"progress": 0})

        count = apply_margins_bulk(db, part_ids)

        # Snapshot current rules after successful apply
        from sqlalchemy import text
        general = db.query(PriceRule).filter(
            PriceRule.type == "general",
            PriceRule.is_active == True
        ).first()
        categories = db.query(PriceRule).filter(
            PriceRule.type == "category",
            PriceRule.is_active == True
        ).all()
        cat_margins = {str(r.category_id): float(r.margin_percent) for r in categories} if categories else {}
        snapshot = PricingApplySnapshot(
            general_margin=float(general.margin_percent) if general else None,
            category_margins=json.dumps(cat_margins) if cat_margins else None,
        )
        db.add(snapshot)
        db.commit()

        self.update_state(state="SUCCESS", meta={"progress": 100, "updated": count})

        # Notify admins
        send_telegram_notification(
            f"✅ Наценка применена: {count} товаров обновлены"
        )

        # Запустить проверку деактивации — чтобы реактивировать товары у которых теперь есть final_price
        check_product_deactivation.delay()

        return {"status": "success", "updated": count}
    except Exception as e:
        send_telegram_notification(
            f"❌ Ошибка применения наценки: {str(e)}"
        )
        self.update_state(state="FAILURE", meta={"error": str(e)})
        raise
    finally:
        db.close()
