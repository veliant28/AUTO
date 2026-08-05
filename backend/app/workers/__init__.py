from celery import Celery
from app.core.config import settings

celery_app = Celery(
    "autoparts",
    broker=f"redis://{settings.REDIS_HOST}:{settings.REDIS_PORT}/0",
    backend=f"redis://{settings.REDIS_HOST}:{settings.REDIS_PORT}/0",
)

# Messages consumed by a worker that dies mid-run must be redelivered to
# another worker instead of being lost forever. Keep visibility_timeout
# above the hard time_limit of the longest task (process_price_import:
# 3h5m) so a still-running task is not redelivered as a duplicate.
celery_app.conf.broker_transport_options = {"visibility_timeout": 4 * 60 * 60}

import app.workers.tasks.tecdoc_tasks  # noqa: F401
import app.workers.tasks.import_tasks  # noqa: F401
import app.workers.tasks.pricing_tasks  # noqa: F401
import app.workers.tasks.nova_poshta_tasks  # noqa: F401
import app.workers.tasks.deactivation_tasks  # noqa: F401
import app.workers.tasks.image_tasks  # noqa: F401
import app.workers.tasks.checkbox_tasks  # noqa: F401
import app.workers.tasks.chat_cleanup_tasks  # noqa: F401
import app.workers.tasks.backup_tasks  # noqa: F401
import app.workers.tasks.price_cleanup_tasks  # noqa: F401
import app.workers.tasks.presence_tasks  # noqa: F401

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
    'cleanup-stale-presence': {
        'task': 'cleanup_stale_presence',
        'schedule': 60.0,
    },
    'cleanup-presence-logs': {
        'task': 'cleanup_presence_logs',
        'schedule': 86400.0,
    },
}

