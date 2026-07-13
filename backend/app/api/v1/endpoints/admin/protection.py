from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, desc
from datetime import datetime, timedelta
import time
from app.core.db import get_db
from app.api.v1.deps import require_permission
from app.models import User
from app.models.protection import BanRecord, ProtectionEvent, Whitelist
from app.schemas.protection_schemas import (
    BanListResponse, BanRecordResponse, BanCreateRequest, UnbanResponse,
    BanStatsResponse, ProtectionEventResponse,
    WhitelistListResponse, WhitelistResponse, WhitelistCreateRequest,
    DashboardStatsResponse,
)
from app.core.redis_client import redis_client
from pydantic import BaseModel
from typing import Optional

router = APIRouter()


def get_user_name(user: User) -> str:
    if user.first_name:
        return user.first_name
    if user.full_name:
        return user.full_name
    return user.email


# ─── Blacklist ───────────────────────────────────────────────────────────────


@router.get("/protection/blacklist", response_model=BanListResponse)
async def list_blacklist(
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    search: str = Query("", max_length=100),
    status: str = Query("active", regex="^(active|all)$"),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("protection.view")),
):
    """Список забаненных пользователей с пагинацией и поиском."""
    query = db.query(BanRecord)
    
    if status == "active":
        query = query.filter(BanRecord.is_active == True)
    
    if search:
        like = f"%{search}%"
        query = query.filter(
            BanRecord.email.ilike(like) |
            BanRecord.ip_address.ilike(like) |
            BanRecord.reason.ilike(like)
        )
    
    total = query.count()
    records = (
        query.order_by(desc(BanRecord.banned_at))
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    
    items = []
    for r in records:
        user_name = None
        user_role = None
        first_name = None
        last_name = None
        middle_name = None
        phone = None
        if r.user:
            user_name = get_user_name(r.user)
            user_role = r.user.role.name if r.user.role else None
            first_name = r.user.first_name
            last_name = r.user.last_name
            middle_name = r.user.middle_name
            phone = r.user.phone
        
        banned_by_name = None
        banned_by_role = None
        banned_by_first_name = None
        banned_by_last_name = None
        if r.banned_by:
            banned_by_name = get_user_name(r.banned_by)
            banned_by_role = r.banned_by.role.name if r.banned_by.role else None
            banned_by_first_name = r.banned_by.first_name
            banned_by_last_name = r.banned_by.last_name
        
        items.append(BanRecordResponse(
            id=r.id,
            user_id=r.user_id,
            email=r.email,
            ip_address=r.ip_address,
            reason=r.reason,
            banned_by_name=banned_by_name,
            banned_by_role=banned_by_role,
            banned_by_first_name=banned_by_first_name,
            banned_by_last_name=banned_by_last_name,
            banned_at=r.banned_at,
            unbanned_at=r.unbanned_at,
            is_active=r.is_active,
            block_count=r.block_count,
            ban_type=r.ban_type,
            user_name=user_name,
            user_role=user_role,
            first_name=first_name,
            last_name=last_name,
            middle_name=middle_name,
            phone=phone,
        ))
    
    return BanListResponse(items=items, total=total, page=page, page_size=page_size)


@router.post("/protection/blacklist", response_model=BanRecordResponse)
async def ban_user(
    data: BanCreateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("protection.ban")),
):
    """Забанить пользователя вручную. Причина обязательна."""
    if not data.reason or not data.reason.strip():
        raise HTTPException(400, "Reason is required for manual ban")
    
    if not data.email and not data.user_id:
        raise HTTPException(400, "Either email or user_id is required")
    
    # Check if in whitelist
    whitelist_query = db.query(Whitelist)
    if data.email:
        whitelist_query = whitelist_query.filter(Whitelist.email == data.email)
    if data.user_id:
        whitelist_query = whitelist_query.filter(Whitelist.user_id == data.user_id)
    
    whitelisted = whitelist_query.first()
    if whitelisted:
        raise HTTPException(400, "User is in whitelist and cannot be banned")
    
    # Find user if exists
    user = None
    if data.user_id:
        user = db.query(User).filter(User.id == data.user_id).first()
    elif data.email:
        user = db.query(User).filter(User.email == data.email).first()
    
    email = data.email or (user.email if user else None)
    user_id = user.id if user else None
    
    # Check if already actively banned
    existing = db.query(BanRecord).filter(
        BanRecord.is_active == True,
        (
            (BanRecord.user_id == user_id) if user_id else False
        )
    ).first()
    
    if existing:
        raise HTTPException(400, "User is already banned")
    
    # Check for existing inactive ban to increment block_count
    existing_inactive = None
    if user_id:
        existing_inactive = (
            db.query(BanRecord)
            .filter(BanRecord.user_id == user_id)
            .order_by(desc(BanRecord.banned_at))
            .first()
        )
    
    block_count = (existing_inactive.block_count + 1) if existing_inactive else 1
    
    # Look up last known IP from protection events
    last_ip = None
    if email:
        last_event = (
            db.query(ProtectionEvent.ip_address)
            .filter(ProtectionEvent.email == email, ProtectionEvent.ip_address.isnot(None))
            .order_by(desc(ProtectionEvent.created_at))
            .first()
        )
        if last_event:
            last_ip = last_event[0]
    elif user_id:
        last_event = (
            db.query(ProtectionEvent.ip_address)
            .filter(ProtectionEvent.user_id == user_id, ProtectionEvent.ip_address.isnot(None))
            .order_by(desc(ProtectionEvent.created_at))
            .first()
        )
        if last_event:
            last_ip = last_event[0]
    
    ban = BanRecord(
        user_id=user_id,
        email=email,
        ip_address=last_ip,
        reason=data.reason.strip(),
        banned_by_id=current_user.id,
        banned_at=datetime.utcnow(),
        is_active=True,
        block_count=block_count,
        ban_type="manual",
    )
    db.add(ban)
    
    # Also deactivate user if exists
    if user:
        user.is_active = False
    
    # Log the event
    event = ProtectionEvent(
        user_id=user_id,
        email=email,
        ip_address=last_ip,
        event_type="manual_ban",
        description=f"Banned by admin. Reason: {data.reason.strip()}",
        created_at=datetime.utcnow(),
    )
    db.add(event)
    
    db.commit()
    db.refresh(ban)
    
    banned_by_name = get_user_name(current_user)
    banned_by_role = current_user.role.name if current_user.role else None
    banned_by_first_name = current_user.first_name
    banned_by_last_name = current_user.last_name
    user_name = get_user_name(user) if user else None
    user_role = user.role.name if user and user.role else None
    first_name = user.first_name if user else None
    last_name = user.last_name if user else None
    middle_name = user.middle_name if user else None
    phone = user.phone if user else None
    
    return BanRecordResponse(
        id=ban.id,
        user_id=ban.user_id,
        email=ban.email,
        reason=ban.reason,
        banned_by_name=banned_by_name,
        banned_by_role=banned_by_role,
        banned_by_first_name=banned_by_first_name,
        banned_by_last_name=banned_by_last_name,
        banned_at=ban.banned_at,
        is_active=ban.is_active,
        block_count=ban.block_count,
        ban_type=ban.ban_type,
        user_name=user_name,
        user_role=user_role,
        first_name=first_name,
        last_name=last_name,
        middle_name=middle_name,
        phone=phone,
    )


@router.post("/protection/blacklist/{ban_id}/unban", response_model=UnbanResponse)
async def unban_user(
    ban_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("protection.unban")),
):
    """Разбанить пользователя."""
    ban = db.query(BanRecord).filter(BanRecord.id == ban_id).first()
    if not ban:
        raise HTTPException(404, "Ban record not found")
    
    if not ban.is_active:
        raise HTTPException(400, "User is not currently banned")
    
    ban.is_active = False
    ban.unbanned_at = datetime.utcnow()
    
    # Reactivate user if exists
    if ban.user_id:
        user = db.query(User).filter(User.id == ban.user_id).first()
        if user:
            user.is_active = True
    
    # Log the event
    event = ProtectionEvent(
        user_id=ban.user_id,
        email=ban.email,
        event_type="manual_unban",
        description=f"Unbanned by admin",
        created_at=datetime.utcnow(),
    )
    db.add(event)
    
    db.commit()
    
    return UnbanResponse(message="User unbanned successfully", ban_id=ban_id)


@router.get("/protection/blacklist/{ban_id}/stats", response_model=BanStatsResponse)
async def get_ban_stats(
    ban_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("protection.view")),
):
    """Получить статистику событий для забаненного пользователя."""
    ban = db.query(BanRecord).filter(BanRecord.id == ban_id).first()
    if not ban:
        raise HTTPException(404, "Ban record not found")
    
    user_name = None
    user_role = None
    first_name = None
    last_name = None
    phone = None
    if ban.user:
        user_name = get_user_name(ban.user)
        user_role = ban.user.role.name if ban.user.role else None
        first_name = ban.user.first_name
        last_name = ban.user.last_name
        phone = ban.user.phone
    
    banned_by_name = None
    banned_by_role = None
    banned_by_first_name = None
    banned_by_last_name = None
    if ban.banned_by:
        banned_by_name = get_user_name(ban.banned_by)
        banned_by_role = ban.banned_by.role.name if ban.banned_by.role else None
        banned_by_first_name = ban.banned_by.first_name
        banned_by_last_name = ban.banned_by.last_name
    
    # Get events
    events_query = db.query(ProtectionEvent)
    if ban.user_id:
        events_query = events_query.filter(ProtectionEvent.user_id == ban.user_id)
    elif ban.email:
        events_query = events_query.filter(ProtectionEvent.email == ban.email)
    else:
        events_query = events_query.filter(ProtectionEvent.id == None)
    
    total_events = events_query.count()
    events = events_query.order_by(desc(ProtectionEvent.created_at)).limit(100).all()
    
    ban_response = BanRecordResponse(
        id=ban.id,
        user_id=ban.user_id,
        email=ban.email,
        ip_address=ban.ip_address,
        reason=ban.reason,
        banned_by_name=banned_by_name,
        banned_by_role=banned_by_role,
        banned_by_first_name=banned_by_first_name,
        banned_by_last_name=banned_by_last_name,
        banned_at=ban.banned_at,
        unbanned_at=ban.unbanned_at,
        is_active=ban.is_active,
        block_count=ban.block_count,
        ban_type=ban.ban_type,
        user_name=user_name,
        user_role=user_role,
        first_name=first_name,
        last_name=last_name,
        phone=phone,
    )
    
    events_response = [
        ProtectionEventResponse(
            id=e.id,
            user_id=e.user_id,
            email=e.email,
            ip_address=e.ip_address,
            event_type=e.event_type,
            description=e.description,
            created_at=e.created_at,
        )
        for e in events
    ]
    
    return BanStatsResponse(
        ban=ban_response,
        events=events_response,
        total_events=total_events,
    )


# ─── Whitelist ──────────────────────────────────────────────────────────────


@router.get("/protection/whitelist", response_model=WhitelistListResponse)
async def list_whitelist(
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    search: str = Query("", max_length=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("protection.view")),
):
    """Список пользователей в белом списке."""
    query = db.query(Whitelist)
    
    if search:
        like = f"%{search}%"
        query = query.filter(Whitelist.email.ilike(like))
    
    total = query.count()
    records = (
        query.order_by(desc(Whitelist.added_at))
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    
    items = []
    for r in records:
        user_name = None
        user_role = None
        first_name = None
        last_name = None
        middle_name = None
        phone = None
        if r.user:
            user_name = get_user_name(r.user)
            user_role = r.user.role.name if r.user.role else None
            first_name = r.user.first_name
            last_name = r.user.last_name
            middle_name = r.user.middle_name
            phone = r.user.phone
        
        added_by_name = None
        added_by_role = None
        added_by_first_name = None
        added_by_last_name = None
        if r.added_by:
            added_by_name = get_user_name(r.added_by)
            added_by_role = r.added_by.role.name if r.added_by.role else None
            added_by_first_name = r.added_by.first_name
            added_by_last_name = r.added_by.last_name
        
        items.append(WhitelistResponse(
            id=r.id,
            user_id=r.user_id,
            email=r.email,
            ip_address=r.ip_address,
            reason=r.reason,
            added_by_name=added_by_name,
            added_by_role=added_by_role,
            added_by_first_name=added_by_first_name,
            added_by_last_name=added_by_last_name,
            added_at=r.added_at,
            user_name=user_name,
            user_role=user_role,
            first_name=first_name,
            last_name=last_name,
            middle_name=middle_name,
            phone=phone,
        ))
    
    return WhitelistListResponse(items=items, total=total, page=page, page_size=page_size)


@router.post("/protection/whitelist", response_model=WhitelistResponse)
async def add_to_whitelist(
    data: WhitelistCreateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("protection.edit")),
):
    """Добавить email в белый список."""
    if not data.email:
        raise HTTPException(400, "Email is required")
    
    existing = db.query(Whitelist).filter(Whitelist.email == data.email).first()
    if existing:
        raise HTTPException(400, "Email already in whitelist")
    
    user = db.query(User).filter(User.email == data.email).first()
    
    whitelist = Whitelist(
        user_id=user.id if user else None,
        email=data.email,
        reason=data.reason,
        added_by_id=current_user.id,
        added_at=datetime.utcnow(),
    )
    db.add(whitelist)
    
    # Also unban if currently banned
    active_ban = db.query(BanRecord).filter(
        BanRecord.is_active == True,
        BanRecord.email == data.email,
    ).first()
    if active_ban:
        active_ban.is_active = False
        active_ban.unbanned_at = datetime.utcnow()
    
    # Reactivate user if exists
    if user:
        user.is_active = True
    
    db.commit()
    db.refresh(whitelist)
    
    user_name = get_user_name(user) if user else None
    user_role = user.role.name if user and user.role else None
    added_by_name = get_user_name(current_user)
    
    return WhitelistResponse(
        id=whitelist.id,
        user_id=whitelist.user_id,
        email=whitelist.email,
        ip_address=whitelist.ip_address,
        reason=whitelist.reason,
        added_by_name=added_by_name,
        added_at=whitelist.added_at,
        user_name=user_name,
        user_role=user_role,
    )


@router.delete("/protection/whitelist/{whitelist_id}")
async def remove_from_whitelist(
    whitelist_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("protection.edit")),
):
    """Удалить из белого списка."""
    entry = db.query(Whitelist).filter(Whitelist.id == whitelist_id).first()
    if not entry:
        raise HTTPException(404, "Whitelist entry not found")
    
    db.delete(entry)
    db.commit()
    
    return {"message": "Removed from whitelist", "id": whitelist_id}


# ─── Dashboard ──────────────────────────────────────────────────────────────


@router.get("/protection/dashboard", response_model=DashboardStatsResponse)
async def get_protection_dashboard(
    period: str = Query("month", regex="^(day|week|month|year)$"),
    from_date: Optional[str] = Query(None),
    to_date: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("protection.view")),
):
    """Статистика для дашборда защиты."""
    now = datetime.utcnow()
    
    # Determine date range
    if from_date and to_date:
        dt_from = datetime.fromisoformat(from_date.replace('Z', '+00:00')).replace(tzinfo=None)
        dt_to = datetime.fromisoformat(to_date.replace('Z', '+00:00')).replace(tzinfo=None)
    else:
        if period == "day":
            dt_from = now - timedelta(days=1)
        elif period == "week":
            dt_from = now - timedelta(weeks=1)
        elif period == "month":
            dt_from = now - timedelta(days=30)
        else:  # year
            dt_from = now - timedelta(days=365)
        dt_to = now
    
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    
    # Total threats in period
    total_threats = db.query(func.count(ProtectionEvent.id)).filter(
        ProtectionEvent.created_at >= dt_from,
        ProtectionEvent.created_at <= dt_to,
    ).scalar() or 0
    
    # Active bans
    active_bans = db.query(func.count(BanRecord.id)).filter(
        BanRecord.is_active == True,
    ).scalar() or 0
    
    # Blocked today
    blocked_today = db.query(func.count(BanRecord.id)).filter(
        BanRecord.banned_at >= today_start,
    ).scalar() or 0
    
    # Whitelisted
    whitelisted_count = db.query(func.count(Whitelist.id)).scalar() or 0
    
    # Threats by day (last 7/30 days)
    import re
    use_dates = period in ("day", "week")
    day_count = 7 if use_dates else 30
    
    threats_by_day = []
    for i in range(day_count - 1, -1, -1):
        day = now - timedelta(days=i)
        day_start = day.replace(hour=0, minute=0, second=0, microsecond=0)
        day_end = day_start + timedelta(days=1)
        
        count = db.query(func.count(ProtectionEvent.id)).filter(
            ProtectionEvent.created_at >= day_start,
            ProtectionEvent.created_at < day_end,
        ).scalar() or 0
        
        threats_by_day.append({
            "date": day.strftime("%Y-%m-%d"),
            "count": count,
        })
    
    # Threats by type
    type_results = db.query(
        ProtectionEvent.event_type,
        func.count(ProtectionEvent.id).label("count"),
    ).filter(
        ProtectionEvent.created_at >= dt_from,
        ProtectionEvent.created_at <= dt_to,
    ).group_by(ProtectionEvent.event_type).all()
    
    threats_by_type = [
        {"type": r[0], "count": r[1]}
        for r in type_results
    ]
    
    # Timeline (hourly for day, daily for others)
    threats_timeline = []
    if period == "day":
        for h in range(24):
            hour_start = now.replace(hour=h, minute=0, second=0, microsecond=0)
            hour_end = hour_start + timedelta(hours=1)
            count = db.query(func.count(ProtectionEvent.id)).filter(
                ProtectionEvent.created_at >= hour_start,
                ProtectionEvent.created_at < hour_end,
            ).scalar() or 0
            threats_timeline.append({
                "time": f"{h:02d}:00",
                "count": count,
            })
    else:
        for i in range(day_count - 1, -1, -1):
            day = now - timedelta(days=i)
            day_start = day.replace(hour=0, minute=0, second=0, microsecond=0)
            day_end = day_start + timedelta(days=1)
            count = db.query(func.count(ProtectionEvent.id)).filter(
                ProtectionEvent.created_at >= day_start,
                ProtectionEvent.created_at < day_end,
            ).scalar() or 0
            threats_timeline.append({
                "time": day.strftime("%Y-%m-%d"),
                "count": count,
            })
    
    return DashboardStatsResponse(
        total_threats=total_threats,
        active_bans=active_bans,
        blocked_today=blocked_today,
        whitelisted_count=whitelisted_count,
        threats_by_day=threats_by_day,
        threats_by_type=threats_by_type,
        threats_timeline=threats_timeline,
    )


# ─── Abuse Stats ────────────────────────────────────────────────────────────


class AbuseStatItem(BaseModel):
    key: str
    ip: str = ""
    path: str = ""
    status_code: int = 0
    count: int = 0


class AbuseStatsResponse(BaseModel):
    top_abusive_ips: list[AbuseStatItem]
    top_endpoints: list[AbuseStatItem]
    recent_auto_bans: int
    total_blocked_today: int


@router.get("/protection/abuse-stats", response_model=AbuseStatsResponse)
async def get_abuse_stats(
    current_user: User = Depends(require_permission("protection.view")),
):
    """Статистика злоупотреблений для дашборда защиты."""
    recent_auto_bans = 0
    total_blocked_today = 0
    top_ips: list[AbuseStatItem] = []
    top_endpoints: list[AbuseStatItem] = []

    try:
        r = await redis_client.get_client()
        now_ts = time.time()
        today_start_dt = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)

        # Get top abusive stats from Redis
        stats_key = "protection:abuse:stats"
        raw = await r.zrevrange(stats_key, 0, 49, withscores=True)
        ip_counts: dict[str, int] = {}
        endpoint_counts: dict[str, int] = {}
        for member, score in raw:
            parts = member.split(":", 2)
            if len(parts) == 3:
                ip, path, code = parts
                ip_counts[ip] = ip_counts.get(ip, 0) + int(score)
                ep_key = path.split("/")[-1] if path else path
                endpoint_counts[ep_key] = endpoint_counts.get(ep_key, 0) + int(score)

        top_ips = [
            AbuseStatItem(key=ip, ip=ip, count=count)
            for ip, count in sorted(ip_counts.items(), key=lambda x: -x[1])[:10]
        ]
        top_endpoints = [
            AbuseStatItem(key=ep, path=ep, count=count)
            for ep, count in sorted(endpoint_counts.items(), key=lambda x: -x[1])[:10]
        ]

        # Count auto-bans in last 24h
        from app.core.db import SessionLocal as DbSession
        db = DbSession()
        try:
            day_ago = datetime.utcnow() - timedelta(days=1)
            recent_auto_bans = db.query(func.count(BanRecord.id)).filter(
                BanRecord.ban_type == "auto",
                BanRecord.banned_at >= day_ago,
            ).scalar() or 0

            total_blocked_today = db.query(func.count(BanRecord.id)).filter(
                BanRecord.banned_at >= today_start_dt,
            ).scalar() or 0
        finally:
            db.close()
    except ImportError:
        pass
    except Exception as e:
        import logging
        logging.getLogger(__name__).error(f"Failed to get abuse stats: {e}")

    return AbuseStatsResponse(
        top_abusive_ips=top_ips,
        top_endpoints=top_endpoints,
        recent_auto_bans=recent_auto_bans,
        total_blocked_today=total_blocked_today,
    )
