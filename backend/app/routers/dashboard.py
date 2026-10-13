from __future__ import annotations

from fastapi import APIRouter, Depends, Query

from app.data.base import DataProvider
from app.deps import get_provider
from app.schemas import DashboardData

router = APIRouter(prefix="/api", tags=["dashboard"])


@router.get("/dashboard", response_model=DashboardData)
def dashboard(
    provider: DataProvider = Depends(get_provider),
    pt: str | None = Query(default=None, pattern=r"^[A-Z0-9_-]+$"),
    asof: str | None = Query(default=None, pattern=r"^\d{4}-\d{2}$"),
) -> DashboardData:
    return provider.dashboard(pt, asof)
