from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, text
from datetime import datetime, timedelta
from app.core.db import get_db
from app.api.v1.deps import require_role
from app.models import User
from app.models.orders import OrderChangeLog
from pydantic import BaseModel
from typing import Optional, List

router = APIRouter()


class StaffMemberStats(BaseModel):
    id: int
    name: str
    group: str
    phone: Optional[str] = None
    actions_count: int = 0
    orders_count: int = 0
    status_changes: int = 0
    edits: int = 0


class StaffActionByDate(BaseModel):
    date: str
    count: int


class StaffActionType(BaseModel):
    action: str
    count: int


class StaffStatsResponse(BaseModel):
    total_actions: int
    total_orders_touched: int
    staff_members: int
    active_staff: int
    staff_list: List[StaffMemberStats]
    actions_by_date: List[StaffActionByDate]
    actions_by_type: List[StaffActionType]


def get_period_range(period: str, from_date: Optional[str] = None, to_date: Optional[str] = None):
    """Return (from_dt, to_dt) based on period or custom range. Both are timezone-naive UTC."""
    now = datetime.utcnow()
    if from_date and to_date:
        return datetime.fromisoformat(from_date).replace(tzinfo=None), datetime.fromisoformat(to_date).replace(tzinfo=None)
    if period == "day":
        return now.replace(hour=0, minute=0, second=0, microsecond=0), now
    elif period == "week":
        return now - timedelta(days=7), now
    elif period == "year":
        return now - timedelta(days=365), now
    else:  # month
        return now - timedelta(days=30), now


@router.get("/staff/stats", response_model=StaffStatsResponse)
async def get_staff_stats(
    period: str = Query("month", regex="^(day|week|month|year)$"),
    from_date: Optional[str] = Query(None),
    to_date: Optional[str] = Query(None),
    staff_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin", "manager")),
):
    """Статистика активности сотрудников за период."""
    from_dt, to_dt = get_period_range(period, from_date, to_date)

    # Base filter
    base_filter = "WHERE ocl.created_at >= :from_dt AND ocl.created_at <= :to_dt"
    params = {"from_dt": from_dt, "to_dt": to_dt}
    staff_filter = ""
    staff_params = {}
    if staff_id:
        staff_filter = " AND ocl.user_id = :staff_id"
        staff_params = {"staff_id": staff_id}

    # Total actions
    total_actions = db.execute(text(f"""
        SELECT COUNT(*) FROM order_change_logs ocl {base_filter}{staff_filter}
    """), {**params, **staff_params}).scalar() or 0

    # Total orders touched
    total_orders = db.execute(text(f"""
        SELECT COUNT(DISTINCT ocl.order_id) FROM order_change_logs ocl {base_filter}{staff_filter}
    """), {**params, **staff_params}).scalar() or 0

    # Staff list aggregated
    staff_rows = db.execute(text(f"""
        SELECT
            COALESCE(ocl.user_id, 0) as user_id,
            COALESCE(ocl.user_name, 'System') as user_name,
            COALESCE(ocl.user_group, 'system') as user_group,
            u.phone,
            COUNT(*) as actions_count,
            COUNT(DISTINCT ocl.order_id) as orders_count,
            COUNT(CASE WHEN ocl.action = 'status_change' THEN 1 END) as status_changes,
            COUNT(CASE WHEN ocl.action = 'edit' THEN 1 END) as edits
        FROM order_change_logs ocl
        LEFT JOIN users u ON u.id = ocl.user_id
        {base_filter}
        GROUP BY ocl.user_id, ocl.user_name, ocl.user_group, u.phone
        ORDER BY actions_count DESC
    """), params).fetchall()

    staff_list = [
        StaffMemberStats(
            id=row[0],
            name=row[1],
            group=row[2],
            phone=row[3],
            actions_count=row[4],
            orders_count=row[5],
            status_changes=row[6],
            edits=row[7],
        )
        for row in staff_rows
    ]

    # Actions by date
    date_rows = db.execute(text(f"""
        SELECT DATE(ocl.created_at) as date, COUNT(*) as count
        FROM order_change_logs ocl
        {base_filter}{staff_filter}
        GROUP BY DATE(ocl.created_at)
        ORDER BY date ASC
    """), {**params, **staff_params}).fetchall()

    actions_by_date = [StaffActionByDate(date=str(row[0]), count=row[1]) for row in date_rows]

    # Actions by type
    type_rows = db.execute(text(f"""
        SELECT ocl.action, COUNT(*) as count
        FROM order_change_logs ocl
        {base_filter}{staff_filter}
        GROUP BY ocl.action
        ORDER BY count DESC
    """), {**params, **staff_params}).fetchall()

    actions_by_type = [StaffActionType(action=row[0], count=row[1]) for row in type_rows]

    # Staff members / active staff counts
    staff_members = db.query(func.count(func.distinct(OrderChangeLog.user_id))).filter(
        OrderChangeLog.created_at >= from_dt,
        OrderChangeLog.created_at <= to_dt,
    ).scalar() or 0

    active_staff = db.query(func.count(func.distinct(OrderChangeLog.user_id))).filter(
        OrderChangeLog.created_at >= from_dt,
        OrderChangeLog.created_at <= to_dt,
        OrderChangeLog.action == "status_change",
    ).scalar() or 0

    return StaffStatsResponse(
        total_actions=total_actions,
        total_orders_touched=total_orders,
        staff_members=staff_members,
        active_staff=active_staff,
        staff_list=staff_list,
        actions_by_date=actions_by_date,
        actions_by_type=actions_by_type,
    )
