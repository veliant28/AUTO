from celery import Celery
from app.core.config import settings

celery_app = Celery(
    "autoparts",
    broker=f"redis://{settings.REDIS_HOST}:{settings.REDIS_PORT}/0",
    backend=f"redis://{settings.REDIS_HOST}:{settings.REDIS_PORT}/0",
)

import app.workers.tasks.tecdoc_tasks  # noqa: F401
import app.workers.tasks.import_tasks  # noqa: F401
import app.workers.tasks.pricing_tasks  # noqa: F401
import app.workers.tasks.nova_poshta_tasks  # noqa: F401
import app.workers.tasks.deactivation_tasks  # noqa: F401
import app.workers.tasks.image_tasks  # noqa: F401
import app.workers.tasks.checkbox_tasks  # noqa: F401
import app.workers.tasks.chat_cleanup_tasks  # noqa: F401

celery_app.conf.beat_schedule = {
    'scheduler-tick': {
        'task': 'scheduler_tick',
        'schedule': 60.0,
    },
    'sync-nova-poshta-waybill-statuses': {
        'task': 'sync_nova_poshta_waybill_statuses',
        'schedule': 1200.0,
    },
    'check-product-deactivation': {
        'task': 'check_product_deactivation',
        'schedule': 3600.0,
    },
    'cleanup-old-chat-messages': {
        'task': 'cleanup_old_chat_messages',
        'schedule': 86400.0,
    },
}

