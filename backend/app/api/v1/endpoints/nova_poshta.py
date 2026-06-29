"""Public Nova Poshta lookup endpoints for storefront (checkout etc.).

Uses the default sender profile configured in admin.
"""
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.schemas.nova_poshta_schemas import (
    NovaPoshtaLookupQuery,
    NovaPoshtaLookupSettlement,
    NovaPoshtaLookupStreet,
    NovaPoshtaLookupWarehouse,
    NovaPoshtaStreetLookupQuery,
    NovaPoshtaWarehouseLookupQuery,
)
from app.services.nova_poshta import (
    NovaPoshtaApiError,
    NovaPoshtaLookupService,
    NovaPoshtaSenderNotFoundError,
)
from app.api.v1.endpoints.auth import get_current_user

router = APIRouter()


@router.post("/lookup/settlements", response_model=List[NovaPoshtaLookupSettlement])
async def lookup_settlements(
    data: NovaPoshtaLookupQuery,
    db: Session = Depends(get_db),
    current_user: int = Depends(get_current_user),
):
    """Search settlements (cities) by name. Uses the default sender profile."""
    service = NovaPoshtaLookupService(db)
    try:
        # Do not pass sender_profile_id — use default sender
        results = await service.search_settlements(
            query=data.query,
            locale=data.locale,
        )
    except NovaPoshtaSenderNotFoundError as e:
        raise HTTPException(404, str(e))
    except NovaPoshtaApiError as e:
        raise HTTPException(502, detail=str(e))
    return results


@router.post("/lookup/streets", response_model=List[NovaPoshtaLookupStreet])
async def lookup_streets(
    data: NovaPoshtaStreetLookupQuery,
    db: Session = Depends(get_db),
    current_user: int = Depends(get_current_user),
):
    """Search streets within a settlement. Uses the default sender profile."""
    service = NovaPoshtaLookupService(db)
    try:
        results = await service.search_streets(
            settlement_ref=data.settlement_ref,
            query=data.query,
            locale=data.locale,
        )
    except NovaPoshtaSenderNotFoundError as e:
        raise HTTPException(404, str(e))
    except NovaPoshtaApiError as e:
        raise HTTPException(502, detail=str(e))
    return results


@router.post("/lookup/warehouses", response_model=List[NovaPoshtaLookupWarehouse])
async def lookup_warehouses(
    data: NovaPoshtaWarehouseLookupQuery,
    db: Session = Depends(get_db),
    current_user: int = Depends(get_current_user),
):
    """Search warehouses / postomats in a city. Uses the default sender profile."""
    service = NovaPoshtaLookupService(db)
    try:
        results = await service.search_warehouses(
            city_ref=data.city_ref,
            query=data.query,
            warehouse_type_ref=data.warehouse_type_ref,
            locale=data.locale,
        )
    except NovaPoshtaSenderNotFoundError as e:
        raise HTTPException(404, str(e))
    except NovaPoshtaApiError as e:
        raise HTTPException(502, detail=str(e))
    return results
