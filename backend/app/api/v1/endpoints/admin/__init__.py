from fastapi import APIRouter
from app.api.v1.endpoints.admin.dashboard import router as dashboard_router
from app.api.v1.endpoints.admin.users import router as users_router
from app.api.v1.endpoints.admin.orders import router as orders_router
from app.api.v1.endpoints.admin.roles import router as roles_router
from app.api.v1.endpoints.admin.tecdoc import router as tecdoc_router
from app.api.v1.endpoints.admin.products import router as products_router
from app.api.v1.endpoints.admin.brands import router as brands_router
from app.api.v1.endpoints.admin.catalog import router as catalog_router
from app.api.v1.endpoints.admin.categories import router as categories_router
from app.api.v1.endpoints.admin.imports import router as imports_router
from app.api.v1.endpoints.admin.pricing import router as pricing_router
from app.api.v1.endpoints.admin.schedules import router as schedules_router
from app.api.v1.endpoints.admin.suppliers import router as suppliers_router
from app.api.v1.endpoints.admin.workers import router as workers_router
from app.api.v1.endpoints.admin.nova_poshta import router as nova_poshta_router
from app.api.v1.endpoints.admin.returns import router as returns_router
from app.api.v1.endpoints.admin.loyalty import router as loyalty_router
from app.api.v1.endpoints.admin.checkbox import router as checkbox_router
from app.api.v1.endpoints.admin.payments import router as payments_router
from app.api.v1.endpoints.admin.staff import router as staff_router
from app.api.v1.endpoints.admin.support import router as admin_support_router

admin_router = APIRouter()

admin_router.include_router(dashboard_router, tags=["Admin"])
admin_router.include_router(users_router, tags=["Admin"])
admin_router.include_router(orders_router, tags=["Admin"])
admin_router.include_router(roles_router, tags=["Admin"])
admin_router.include_router(tecdoc_router, prefix="/tecdoc", tags=["TecDoc"])
admin_router.include_router(products_router, tags=["Products"])
admin_router.include_router(brands_router, tags=["Brands"])
admin_router.include_router(catalog_router, tags=["Catalog"])
admin_router.include_router(categories_router, tags=["Admin Categories"])
admin_router.include_router(imports_router, tags=["Admin Imports"])
admin_router.include_router(pricing_router, tags=["Admin Pricing"])
admin_router.include_router(schedules_router, tags=["Admin Schedules"])
admin_router.include_router(suppliers_router, tags=["Admin Suppliers"])
admin_router.include_router(workers_router, tags=["Admin Workers"])
admin_router.include_router(nova_poshta_router, prefix="/nova-poshta", tags=["Nova Poshta"])
admin_router.include_router(returns_router, tags=["Admin Returns"])
admin_router.include_router(loyalty_router, tags=["Admin Loyalty"])
admin_router.include_router(checkbox_router, prefix="/checkbox", tags=["Checkbox"])
admin_router.include_router(payments_router, prefix="/payments", tags=["Payments"])
admin_router.include_router(staff_router, tags=["Staff"])
admin_router.include_router(admin_support_router, tags=["Admin Support"])

__all__ = ["admin_router"]
