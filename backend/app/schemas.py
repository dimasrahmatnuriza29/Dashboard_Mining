from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class Kpi(BaseModel):
    id: str
    label: str
    value: float
    unit: str = ""
    decimals: int = 0
    delta: float                          # vs previous period, %
    good_when_negative: bool = False      # e.g. cost/ton
    sparkline: list[float] = Field(default_factory=list)


class TrendPoint(BaseModel):
    date: str                             # ISO date
    actual: float | None = None
    forecast: float | None = None
    lower: float | None = None            # 95% CI
    upper: float | None = None
    target: float | None = None           # plan/RKAP for that month
    gap: float | None = None              # EXPECTED_GAP_QTY (forecast − target)


class TrendRow(BaseModel):
    """Trend point at PT × commodity grain — frontend filters/aggregates."""
    pt_code: str
    commodity: str
    unit: str
    date: str
    actual: float | None = None
    forecast: float | None = None
    lower: float | None = None
    upper: float | None = None
    target: float | None = None
    gap: float | None = None


class CompositionSlice(BaseModel):
    name: str
    value: float


class SiteRow(BaseModel):
    site: str
    commodity: str | None = None            # dominant commodity, latest month
    production_t: float
    achievement_pct: float                  # actual vs target, latest month
    downtime_h: float                       # downtime hours, latest month
    downtime_avg_h: float | None = None     # avg monthly downtime, trailing 6 months
    forecast_delta_pct: float
    status: Literal["On Track", "Ahead", "Watch", "Behind"]


class DashboardData(BaseModel):
    """Everything the dashboard needs in one read-only bundle."""

    generated_at: str
    source: str                           # "mock" | "snowflake"
    kpis: list[Kpi]
    trend: list[TrendPoint]
    trend_dim: list[TrendRow] = Field(default_factory=list)
    composition: list[CompositionSlice]
    site_summary: list[SiteRow]
    ytd_achievement_pct: float


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class ChatRequest(BaseModel):
    message: str
    history: list[ChatMessage] = Field(default_factory=list)
    context: dict = Field(default_factory=dict)   # compact dashboard snapshot


class Recommendation(BaseModel):
    level: Literal["warning", "opportunity", "info"]
    tag: str                              # e.g. "WARNING · SITE C"
    text: str


class ChatResponse(BaseModel):
    reply: str
    recommendations: list[Recommendation] = Field(default_factory=list)
