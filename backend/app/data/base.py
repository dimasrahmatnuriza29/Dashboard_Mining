from __future__ import annotations

from typing import Protocol

from app.schemas import DashboardData


class DataProvider(Protocol):
    """Presentation-layer contract.

    The dashboard NEVER computes analytics — the provider only reads
    pre-aggregated results. MockProvider serves synthetic data now;
    SnowflakeProvider serves real views once the ANALYTICS schema lands.
    Same contract either way.
    """

    name: str

    def dashboard(self, pt: str | None = None, asof: str | None = None) -> DashboardData: ...
