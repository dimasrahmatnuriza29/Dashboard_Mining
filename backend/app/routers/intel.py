from __future__ import annotations

from fastapi import APIRouter, Depends, Query

from app.data.base import DataProvider
from app.deps import get_provider
from app.schemas import ProductionData, WasteData

router = APIRouter(tags=["intelligence"])


@router.get("/production", response_model=ProductionData)
def production(
    provider: DataProvider = Depends(get_provider),
    period: str | None = Query(default=None, max_length=40),
    pt: str | None = Query(default=None, max_length=20),
) -> ProductionData:
    return provider.production(period, pt)


@router.get("/waste", response_model=WasteData)
def waste(
    provider: DataProvider = Depends(get_provider),
    period: str | None = Query(default=None, max_length=40),
) -> WasteData:
    return provider.waste(period)
