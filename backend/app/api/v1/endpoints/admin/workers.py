from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from app.api.v1.deps import require_role, get_db
from app.models import User
from app.models.imports import PriceImport
from app.workers import celery_app
import time
import logging

logger = logging.getLogger(__name__)
router = APIRouter()


class TaskItem(BaseModel):
    id: str
    name: str
    worker: str
    status: str
    runtime_seconds: float
    time_start: float | None = None
    slot_index: int = 0
    import_progress: int | None = None
    import_status: str | None = None
    import_stage: str | None = None
    stage_progress_start: int | None = None
    stage_started_at: float | None = None


class WorkerStatus(BaseModel):
    name: str
    status: str
    active_count: int
    reserved_count: int
    concurrency: int
    cpu_percent: float


class WorkersResponse(BaseModel):
    worker: WorkerStatus
    tasks: list[TaskItem]
    stuck_tasks: list[TaskItem]


def _get_docker_cpu() -> float:
    try:
        import docker
        client = docker.from_env()
        container = client.containers.get("celery_worker")
        stats = container.stats(stream=False)
        cpu_stats = stats.get("cpu_stats", {})
        precpu_stats = stats.get("precpu_stats", {})
        cpu_usage = cpu_stats.get("cpu_usage", {})
        precpu_usage = precpu_stats.get("cpu_usage", {})

        cpu_delta = cpu_usage.get("total_usage", 0) - precpu_usage.get("total_usage", 0)
        system_delta = cpu_stats.get("system_cpu_usage", 0) - precpu_stats.get("system_cpu_usage", 0)

        if system_delta > 0 and cpu_delta > 0:
            percpu = cpu_usage.get("percpu_usage") or []
            cpu_count = len(percpu) if percpu else 1
            cpu_percent = (cpu_delta / system_delta) * cpu_count * 100
            return round(cpu_percent, 1)
    except Exception as e:
        logger.warning(f"Docker CPU read failed: {e}")
    return 0.0


def is_task_active(task_name: str) -> bool:
    """Check if a task with the given name is currently active (running)."""
    try:
        inspect = celery_app.control.inspect()
        active = inspect.active() or {}
        for tasks in active.values():
            for t in tasks:
                if t.get("name") == task_name:
                    return True
    except Exception as e:
        logger.warning(f"is_task_active check failed: {e}")
    return False


def _collect_tasks(
    active_raw: dict | None,
    reserved_raw: dict | None,
    scheduled_raw: dict | None,
    db: Session | None = None,
) -> tuple[list[TaskItem], list[TaskItem]]:
    now = time.time()
    stuck_threshold = 3600.0
    tasks: list[TaskItem] = []
    stuck: list[TaskItem] = []

    # Fast service tasks that should not occupy a slot (shown gray)
    SERVICE_TASKS = {"deactivate_orphaned_offers"}

    def _append(source: dict | None, status: str, assign_slot: bool = False) -> None:
        if not source:
            return
        # Collect all tasks first to assign slots dynamically
        all_in_source: list[tuple] = []
        for worker_name, task_list in source.items():
            if not task_list:
                continue
            for task in task_list:
                all_in_source.append((worker_name, task))

        # Assign slots 1..4 to first 4 active tasks (non-service)
        slot_counter = 1
        for worker_name, task in all_in_source:
            tid = task.get("id", "")
            tname = task.get("name", "")
            tstart = task.get("time_start")
            runtime = round(now - tstart, 0) if tstart else 0.0

            if assign_slot and tname not in SERVICE_TASKS and slot_counter <= 4:
                si = slot_counter
                slot_counter += 1
            else:
                si = 0  # gray for service tasks or beyond slot 4

            import_progress = None
            import_status = None
            import_stage = None
            stage_progress_start = None
            stage_started_at = None
            if db and tname == "process_price_import":
                try:
                    args = task.get("args", [])
                    if args:
                        pi = db.query(PriceImport).filter(
                            PriceImport.id == int(args[0])
                        ).first()
                        if pi:
                            import_progress = pi.progress
                            import_status = pi.status
                            import_stage = pi.stage_name
                            stage_progress_start = pi.stage_progress_start
                            stage_started_at = pi.stage_started_at.timestamp() if pi.stage_started_at else None
                except Exception:
                    pass
            elif status == "active" and tname in ("download_product_images", "match_parts_with_tecdoc"):
                try:
                    from celery.result import AsyncResult
                    ar = AsyncResult(tid, app=celery_app)
                    if ar.state == "PROGRESS" and ar.info:
                        meta = ar.info
                        current = meta.get("current", 0)
                        total = meta.get("total", 0)
                        if total > 0:
                            import_progress = int(current / total * 100)
                            import_stage = f"{current}/{total}"
                            import_status = "processing"
                except Exception:
                    pass
            item = TaskItem(
                id=tid,
                name=tname,
                worker=worker_name,
                status=status,
                runtime_seconds=runtime,
                time_start=tstart,
                slot_index=si,
                import_progress=import_progress,
                import_status=import_status,
                import_stage=import_stage,
                stage_progress_start=stage_progress_start,
                stage_started_at=stage_started_at,
            )
            tasks.append(item)
            if status == "active" and tstart and now - tstart > stuck_threshold:
                stuck.append(item)

    _append(active_raw, "active", assign_slot=True)
    _append(reserved_raw, "reserved")
    _append(scheduled_raw, "scheduled")

    return tasks, stuck


@router.get("/workers", response_model=WorkersResponse)
async def get_workers(
    current_user: User = Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    """Получить статус Celery воркеров и активных задач."""
    inspect = celery_app.control.inspect()
    active_raw = inspect.active() or {}
    reserved_raw = inspect.reserved() or {}
    scheduled_raw = inspect.scheduled() or {}
    stats_raw = inspect.stats() or {}

    worker_name = ""
    active_count = 0
    reserved_count = 0
    concurrency = 4

    if active_raw:
        worker_name = list(active_raw.keys())[0]
        active_count = len(active_raw.get(worker_name, []))
    elif stats_raw:
        worker_name = list(stats_raw.keys())[0]

    if reserved_raw and worker_name:
        reserved_count = len(reserved_raw.get(worker_name, []))

    if stats_raw and worker_name:
        stats = stats_raw.get(worker_name, {})
        concurrency = stats.get("pool", {}).get("max-concurrency", 4)
        if not concurrency:
            concurrency = 4

    cpu_percent = _get_docker_cpu()

    tasks, stuck = _collect_tasks(active_raw, reserved_raw, scheduled_raw, db=db)

    worker = WorkerStatus(
        name=worker_name or "unknown",
        status="online" if worker_name else "offline",
        active_count=active_count,
        reserved_count=reserved_count,
        concurrency=concurrency,
        cpu_percent=cpu_percent,
    )

    return WorkersResponse(worker=worker, tasks=tasks, stuck_tasks=stuck)


@router.post("/workers/tasks/{task_id}/revoke")
async def revoke_task(
    task_id: str,
    current_user: User = Depends(require_role("admin")),
):
    """Отменить задачу Celery."""
    try:
        celery_app.control.revoke(task_id, terminate=True, signal="SIGKILL")
        return {"status": "revoked", "task_id": task_id}
    except Exception as e:
        logger.error(f"Revoke task {task_id} failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/workers/restart")
async def restart_worker(
    current_user: User = Depends(require_role("admin")),
):
    """Перезапустить Celery воркер."""
    try:
        import docker
        client = docker.from_env()
        container = client.containers.get("celery_worker")
        container.restart()
        return {"status": "restarted"}
    except Exception as e:
        logger.error(f"Restart worker failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))
