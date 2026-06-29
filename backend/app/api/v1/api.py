from fastapi import APIRouter
from app.api.v1.endpoints import catalog, users, cart, auth, favorites, orders, notifications, telegram, footer, settings, categories, returns, nova_poshta
from app.api.v1.endpoints.admin import admin_router

api_router = APIRouter()

api_router.include_router(catalog.router, prefix="/catalog", tags=["Catalog"])
api_router.include_router(users.router, prefix="/users", tags=["Users"])
api_router.include_router(cart.router, prefix="/cart", tags=["Cart"])
api_router.include_router(auth.router, prefix="/auth", tags=["Auth"])
api_router.include_router(favorites.router, prefix="/favorites", tags=["Favorites"])
api_router.include_router(orders.router, prefix="/orders", tags=["Orders"])
api_router.include_router(returns.router, prefix="/returns", tags=["Returns"])
api_router.include_router(notifications.router, prefix="/notifications", tags=["Notifications"])
api_router.include_router(telegram.router, prefix="/telegram", tags=["Telegram"])
api_router.include_router(footer.router, prefix="", tags=["Footer"])
api_router.include_router(settings.router, prefix="", tags=["Settings"])
api_router.include_router(admin_router, prefix="/admin")
api_router.include_router(categories.router, prefix="", tags=["Categories"])
api_router.include_router(nova_poshta.router, prefix="/nova-poshta", tags=["Nova Poshta"])
