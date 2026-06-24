from fastapi import HTTPException, Request
from fastapi.responses import JSONResponse
from typing import Union
import logging

logger = logging.getLogger(__name__)

class AppException(Exception):
    def __init__(
        self,
        status_code: int = 500,
        message: str = "Internal server error",
        detail: Union[str, dict] = None
    ):
        self.status_code = status_code
        self.message = message
        self.detail = detail
        super().__init__(message)

class BadRequestException(AppException):
    def __init__(self, message: str = "Bad request", detail: Union[str, dict] = None):
        super().__init__(status_code=400, message=message, detail=detail)

class NotFoundException(AppException):
    def __init__(self, message: str = "Not found", detail: Union[str, dict] = None):
        super().__init__(status_code=404, message=message, detail=detail)

class UnauthorizedException(AppException):
    def __init__(self, message: str = "Unauthorized", detail: Union[str, dict] = None):
        super().__init__(status_code=401, message=message, detail=detail)

class ForbiddenException(AppException):
    def __init__(self, message: str = "Forbidden", detail: Union[str, dict] = None):
        super().__init__(status_code=403, message=message, detail=detail)

class InternalServerErrorException(AppException):
    def __init__(self, message: str = "Internal server error", detail: Union[str, dict] = None):
        super().__init__(status_code=500, message=message, detail=detail)

async def app_exception_handler(request: Request, exc: AppException):
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "status": "error",
            "message": exc.message,
            "detail": exc.detail or {}
        },
        headers={
            "Access-Control-Allow-Origin": request.headers.get("origin", "*"),
            "Access-Control-Allow-Credentials": "true",
        }
    )

async def http_exception_handler(request: Request, exc: HTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "status": "error",
            "message": exc.detail,
            "detail": exc.detail
        },
        headers={
            "Access-Control-Allow-Origin": request.headers.get("origin", "*"),
            "Access-Control-Allow-Credentials": "true",
        }
    )

async def catch_all_exception_handler(request: Request, exc: Exception):
    """Catch-all handler for unhandled exceptions — ensures CORS headers on 500s."""
    logger.exception("Unhandled exception: %s", exc)
    return JSONResponse(
        status_code=500,
        content={
            "status": "error",
            "message": "Internal server error",
            "detail": str(exc) if str(exc) else None
        },
        headers={
            "Access-Control-Allow-Origin": request.headers.get("origin", "*"),
            "Access-Control-Allow-Credentials": "true",
        }
    )
