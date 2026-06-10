from fastapi import APIRouter
from app.api.v1.endpoints import catalog, users, cart, auth, favorites, orders, notifications, telegram, admin, footer, settings
from app.api.v1.endpoints import admin_suppliers, admin_imports, admin_schedules, admin_categories, admin_pricing, admin_workers

api_router = APIRouter()

api_router.include_router(catalog.router, prefix="/catalog", tags=["Catalog"])
api_router.include_router(users.router, prefix="/users", tags=["Users"])
api_router.include_router(cart.router, prefix="/cart", tags=["Cart"])
api_router.include_router(auth.router, prefix="/auth", tags=["Auth"])
api_router.include_router(favorites.router, prefix="/favorites", tags=["Favorites"])
api_router.include_router(orders.router, prefix="/orders", tags=["Orders"])
api_router.include_router(notifications.router, prefix="/notifications", tags=["Notifications"])
api_router.include_router(telegram.router, prefix="/telegram", tags=["Telegram"])
api_router.include_router(footer.router, prefix="", tags=["Footer"])
api_router.include_router(settings.router, prefix="", tags=["Settings"])
api_router.include_router(admin.router, prefix="/admin", tags=["Admin"])
api_router.include_router(admin_suppliers.router, prefix="/admin", tags=["Admin Suppliers"])
api_router.include_router(admin_imports.router, prefix="/admin", tags=["Admin Imports"])
api_router.include_router(admin_schedules.router, prefix="/admin", tags=["Admin Schedules"])
api_router.include_router(admin_categories.router, prefix="/admin", tags=["Admin Categories"])
api_router.include_router(admin_pricing.router, prefix="/admin", tags=["Admin Pricing"])
api_router.include_router(admin_workers.router, prefix="/admin", tags=["Admin Workers"])
