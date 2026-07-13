"""
Protection Middleware — intelligent API abuse detection and auto-ban.

Runs on every request:
1. Extracts client IP and optional user_id from token
2. Checks if IP/user is banned (BanRecord)
3. Tracks request frequency in Redis (sliding window)
4. Auto-bans IPs/users that exceed thresholds
5. Logs all abuse events to ProtectionEvent
"""
import ipaddress
import logging
import time
from datetime import datetime, timedelta
from typing import Optional

from fastapi import Request, HTTPException
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.db import SessionLocal
from app.core.redis_client import redis_client
from app.models.protection import BanRecord, ProtectionEvent, Whitelist
from app.api.v1.endpoints.auth import get_client_ip, verify_token

logger = logging.getLogger(__name__)

# Skip tracking for these paths
SKIP_PATHS = {"/health", "/favicon.ico", "/media", "/docs", "/redoc", "/openapi.json"}

# Redis key prefixes
REDIS_IP_MINUTE = "protection:ip:{ip}:minute"
REDIS_IP_HOUR = "protection:ip:{ip}:hour"
REDIS_IP_ENDPOINT = "protection:ip:{ip}:endpoint:{path}"
REDIS_USER_MINUTE = "protection:user:{user_id}:minute"
REDIS_FAILED_LOGIN_IP = "protection:failed_login:ip:{ip}"
REDIS_FAILED_LOGIN_EMAIL = "protection:failed_login:email:{email}"
REDIS_ABUSE_STATS = "protection:abuse:stats"


def _should_skip(request: Request) -> bool:
    """Check if request path should be skipped."""
    path = request.url.path
    for skip in SKIP_PATHS:
        if path.startswith(skip):
            return True
    return False


def _get_client_ip(request: Request) -> Optional[str]:
    """Extract client IP from request."""
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    if request.client:
        return request.client.host
    return None


def _is_private_ip(ip: str) -> bool:
    """Check if an IP address is in a private/trusted range."""
    try:
        addr = ipaddress.ip_address(ip)
        return addr.is_private or addr.is_loopback
    except ValueError:
        return False


def _extract_user_id(request: Request) -> Optional[int]:
    """Try to extract user_id from Authorization header without raising errors."""
    auth = request.headers.get("Authorization")
    if not auth:
        return None
    try:
        token = auth.replace("Bearer ", "")
        data = verify_token(token)
        return data.get("user_id")
    except Exception:
        return None


def _get_db() -> Session:
    """Get a new database session."""
    return SessionLocal()


class ProtectionMiddleware(BaseHTTPMiddleware):
    """Middleware that protects API from abuse, DOS, and brute force attacks."""

    async def dispatch(self, request: Request, call_next) -> Response:
        if not settings.PROTECTION_ENABLED or _should_skip(request):
            return await call_next(request)

        client_ip = _get_client_ip(request)
        user_id = _extract_user_id(request)
        path = request.url.path
        method = request.method

        # Skip auth/login and auth/register for rate limiting (they have their own checks)
        is_auth_endpoint = "/auth/login" in path or "/auth/register" in path

        db: Optional[Session] = None
        try:
            # ── Check if IP is banned ──────────────────────────────────────
            if client_ip and not is_auth_endpoint:
                db = _get_db()
                ip_ban = db.query(BanRecord).filter(
                    BanRecord.is_active == True,
                    BanRecord.ip_address == client_ip,
                ).first()
                if ip_ban:
                    raise HTTPException(
                        status_code=403,
                        detail=f"Ваш IP адрес заблокирован. Причина: {ip_ban.reason}",
                    )

                # Check if IP is whitelisted
                if settings.WHITELIST_BYPASS_LIMITS:
                    whitelisted = db.query(Whitelist).filter(
                        Whitelist.ip_address == client_ip,
                    ).first()
                    if whitelisted:
                        db.close()
                        db = None
                        return await call_next(request)

                # Check if IP is private/trusted (e.g. Docker internal network)
                if settings.TRUST_PRIVATE_IPS and _is_private_ip(client_ip):
                    db.close()
                    db = None
                    return await call_next(request)

            # ── Check if user is banned ────────────────────────────────────
            if user_id and not is_auth_endpoint:
                if db is None:
                    db = _get_db()
                user_ban = db.query(BanRecord).filter(
                    BanRecord.is_active == True,
                    BanRecord.user_id == user_id,
                ).first()
                if user_ban:
                    raise HTTPException(
                        status_code=403,
                        detail=f"Ваш аккаунт заблокирован. Причина: {user_ban.reason}",
                    )

            # ── Rate limiting with Redis ───────────────────────────────────
            if client_ip and not is_auth_endpoint:
                try:
                    r = await redis_client.get_client()
                    now = time.time()
                    window_minute = 60
                    window_hour = 3600

                    # Track per-minute requests for this IP
                    ip_min_key = REDIS_IP_MINUTE.format(ip=client_ip)
                    await r.zadd(ip_min_key, {str(now): now})
                    await r.zremrangebyscore(ip_min_key, 0, now - window_minute)
                    await r.expire(ip_min_key, window_minute)
                    ip_min_count = await r.zcard(ip_min_key)

                    if ip_min_count > settings.RATE_LIMIT_PER_MINUTE:
                        await self._handle_abuse(
                            db=db,
                            ip=client_ip,
                            user_id=user_id,
                            event_type="rate_limit",
                            description=f"IP {client_ip} exceeded {settings.RATE_LIMIT_PER_MINUTE} req/min ({ip_min_count})",
                            path=path,
                        )
                        raise HTTPException(status_code=429, detail="Слишком много запросов. Попробуйте позже.")

                    # Track per-hour requests for this IP
                    ip_hour_key = REDIS_IP_HOUR.format(ip=client_ip)
                    await r.zadd(ip_hour_key, {str(now): now})
                    await r.zremrangebyscore(ip_hour_key, 0, now - window_hour)
                    await r.expire(ip_hour_key, window_hour)
                    ip_hour_count = await r.zcard(ip_hour_key)

                    if ip_hour_count > settings.RATE_LIMIT_PER_HOUR:
                        await self._handle_abuse(
                            db=db,
                            ip=client_ip,
                            user_id=user_id,
                            event_type="rate_limit",
                            description=f"IP {client_ip} exceeded {settings.RATE_LIMIT_PER_HOUR} req/hour ({ip_hour_count})",
                            path=path,
                        )
                        raise HTTPException(status_code=429, detail="Превышен лимит запросов на час. Попробуйте позже.")

                    # Track per-endpoint requests for this IP
                    endpoint_key = REDIS_IP_ENDPOINT.format(ip=client_ip, path=path)
                    await r.zadd(endpoint_key, {str(now): now})
                    await r.zremrangebyscore(endpoint_key, 0, now - window_minute)
                    await r.expire(endpoint_key, window_minute)
                    endpoint_count = await r.zcard(endpoint_key)

                    if endpoint_count > settings.RATE_LIMIT_PER_ENDPOINT:
                        await self._handle_abuse(
                            db=db,
                            ip=client_ip,
                            user_id=user_id,
                            event_type="endpoint_abuse",
                            description=f"IP {client_ip} hit {path} {endpoint_count} times/min",
                            path=path,
                        )
                        raise HTTPException(status_code=429, detail="Слишком много запросов к этому эндпоинту.")

                    # Track per-minute requests for authenticated user
                    if user_id:
                        user_min_key = REDIS_USER_MINUTE.format(user_id=user_id)
                        await r.zadd(user_min_key, {str(now): now})
                        await r.zremrangebyscore(user_min_key, 0, now - window_minute)
                        await r.expire(user_min_key, window_minute)
                        user_min_count = await r.zcard(user_min_key)

                        if user_min_count > settings.RATE_LIMIT_PER_MINUTE * 2:
                            await self._handle_abuse(
                                db=db,
                                ip=client_ip,
                                user_id=user_id,
                                event_type="rate_limit",
                                description=f"User {user_id} exceeded {(settings.RATE_LIMIT_PER_MINUTE * 2)} req/min ({user_min_count})",
                                path=path,
                            )
                            raise HTTPException(status_code=429, detail="Слишком много запросов. Попробуйте позже.")

                except HTTPException:
                    raise
                except Exception as e:
                    logger.error(f"Protection middleware Redis error: {e}")

        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Protection middleware error: {e}")
        finally:
            if db:
                db.close()

        # ── Process the request ───────────────────────────────────────────
        response = await call_next(request)

        # ── Log abuse stats to Redis (lightweight tracking) ────────────────
        if client_ip and response.status_code >= 400 and not is_auth_endpoint:
            try:
                r = await redis_client.get_client()
                stats_key = REDIS_ABUSE_STATS
                await r.zincrby(stats_key, 1, f"{client_ip}:{path}:{response.status_code}")
                await r.expire(stats_key, 86400)  # 24h retention
            except Exception:
                pass

        return response

    async def _handle_abuse(
        self,
        db: Session | None,
        ip: Optional[str],
        user_id: Optional[int],
        event_type: str,
        description: str,
        path: str,
    ):
        """Log abuse event and optionally auto-ban."""
        own_db = False
        if db is None:
            db = _get_db()
            own_db = True

        try:
            # Log event
            event = ProtectionEvent(
                user_id=user_id,
                ip_address=ip,
                event_type=event_type,
                description=description,
                created_at=datetime.utcnow(),
            )
            db.add(event)

            # Auto-ban if enabled
            if settings.AUTO_BAN_ENABLED:
                # Don't auto-ban whitelisted IPs
                if ip and settings.WHITELIST_BYPASS_LIMITS:
                    whitelisted = db.query(Whitelist).filter(
                        Whitelist.ip_address == ip,
                    ).first()
                    if whitelisted:
                        db.commit()
                        return

                # Don't auto-ban private/trusted IPs (e.g. Docker internal)
                if ip and settings.TRUST_PRIVATE_IPS and _is_private_ip(ip):
                    db.commit()
                    return

                ban_duration = settings.AUTO_BAN_DURATION_MINUTES
                unbanned_at = datetime.utcnow() + timedelta(minutes=ban_duration) if ban_duration > 0 else None

                # Check for existing ban to increment block_count
                existing_ban = None
                if ip:
                    existing_ban = db.query(BanRecord).filter(
                        BanRecord.ip_address == ip,
                    ).order_by(BanRecord.banned_at.desc()).first()

                block_count = (existing_ban.block_count + 1) if existing_ban else 1

                ban = BanRecord(
                    ip_address=ip,
                    user_id=user_id,
                    reason=f"Автоматическая блокировка: {event_type}",
                    banned_by_id=None,  # System ban
                    banned_at=datetime.utcnow(),
                    unbanned_at=unbanned_at,
                    is_active=True,
                    block_count=block_count,
                    ban_type="auto",
                )
                db.add(ban)

            db.commit()
        except Exception as e:
            logger.error(f"Failed to log abuse: {e}")
            db.rollback()
        finally:
            if own_db:
                db.close()
