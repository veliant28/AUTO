from celery import shared_task
from app.workers import celery_app
from app.core.db import SessionLocal
from app.services.pricing_service import apply_margins_bulk
from app.models.pricing import PriceRule
from app.services.notifications import send_telegram_notification


@celery_app.task(bind=True, name="apply_margins")
def apply_margins_task(self, part_ids=None):
    db = SessionLocal()
    try:
        self.update_state(state="PROGRESS", meta={"progress": 0})
        
        count = apply_margins_bulk(db, part_ids)
        
        self.update_state(state="SUCCESS", meta={"progress": 100, "updated": count})
        
        # Notify admins
        send_telegram_notification(
            f"✅ Наценка применена: {count} товаров обновлены"
        )
        
        return {"status": "success", "updated": count}
    except Exception as e:
        send_telegram_notification(
            f"❌ Ошибка применения наценки: {str(e)}"
        )
        self.update_state(state="FAILURE", meta={"error": str(e)})
        raise
    finally:
        db.close()
