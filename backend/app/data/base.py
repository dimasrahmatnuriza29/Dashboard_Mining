from __future__ import annotations

from typing import Protocol

from app.schemas import ProductionData, WasteData


class DataProvider(Protocol):
    """Presentation-layer contract.

    The dashboard NEVER computes analytics — the provider only reads
    pre-aggregated results. MockProvider serves synthetic data now;
    SnowflakeProvider serves real views once the ANALYTICS schema lands.
    Same contract either way.
    """

    name: str

    def production(self, period: str | None = None, pt: str | None = None) -> ProductionData: ...

    def waste(self, period: str | None = None) -> WasteData: ...
