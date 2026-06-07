from celery import shared_task
from app.workers import celery_app
from app.core.db import SessionLocal
from app.models import SupplierPrice
from app.services.tecdoc_gateway import TecDocGateway
from app.services.rate_limiter import rate_limiter
from sqlalchemy import func
from datetime import datetime


@celery_app.task(bind=True, name="process_tecdoc_batch")
def process_tecdoc_batch(self, article_ids: list[int] = None, batch_size: int = 25):
    db = SessionLocal()
    try:
        if article_ids:
            articles = db.query(SupplierPrice).filter(
                SupplierPrice.id.in_(article_ids)
            ).order_by(SupplierPrice.id).all()
        else:
            articles = db.query(SupplierPrice).filter(
                SupplierPrice.match_status.in_(["pending", "unmatched"])
            ).order_by(func.random()).limit(batch_size).all()

        total = len(articles)
        gateway = TecDocGateway(db)

        for i, sp in enumerate(articles):
            if self.request.called_directly:
                pass
            self.update_state(state="PROGRESS", meta={"processed": i, "total": total})

            remaining = rate_limiter.remaining(db)
            if remaining <= 0:
                raise Exception("Hourly limit reached")

            try:
                import asyncio
                loop = asyncio.new_event_loop()
                asyncio.set_event_loop(loop)
                result = loop.run_until_complete(gateway.search(sp.article))
                loop.close()

                if result and isinstance(result, list) and len(result) > 0:
                    first = result[0]
                    sp.tecdoc_article = first.get("number", sp.article)
                    sp.tecdoc_brand_id = first.get("brand", None)
                    sp.match_status = "matched"
                else:
                    sp.match_status = "not_found" if sp.attempts >= 2 else "unmatched"
            except Exception:
                sp.match_status = "not_found" if sp.attempts >= 2 else "unmatched"

            sp.attempts = (sp.attempts or 0) + 1
            sp.last_attempt_at = datetime.utcnow()
            db.commit()

    except Exception as e:
        db.rollback()
        raise
    finally:
        db.close()
