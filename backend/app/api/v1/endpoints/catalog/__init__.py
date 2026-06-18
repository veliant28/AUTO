from fastapi import APIRouter
from app.api.v1.endpoints.catalog.parts import router as parts_router
from app.api.v1.endpoints.catalog.vehicle import router as vehicle_router

router = APIRouter()

router.include_router(parts_router)
router.include_router(vehicle_router)

__all__ = ["router"]
