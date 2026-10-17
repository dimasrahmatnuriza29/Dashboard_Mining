from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


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


class InsightRequest(BaseModel):
    context: dict = Field(default_factory=dict)


class Finding(BaseModel):
    severity: Literal["high", "medium", "low"]
    title: str
    detail: str


class KeyInsight(BaseModel):
    kind: Literal["check", "warn"]
    text: str


class VizSpec(BaseModel):
    """Small structured chart the LLM may attach to an answer."""
    kind: str = "bar"                       # bar | line | pie
    title: str = ""
    x: list[str] = Field(default_factory=list)           # category labels
    series: list[dict] = Field(default_factory=list)     # [{"name": str, "data": [n]}]


class InsightResponse(BaseModel):
    summary: str
    findings: list[Finding] = Field(default_factory=list)
    recommendations: list[Recommendation] = Field(default_factory=list)
    viz: VizSpec | None = None
    key_insights: list[KeyInsight] = Field(default_factory=list)
    next_actions: list[str] = Field(default_factory=list)
    generated_at: str = ""


class ChatResponse(BaseModel):
    reply: str
    recommendations: list[Recommendation] = Field(default_factory=list)
    viz: VizSpec | None = None


# =====================================================================
# Intelligence pages (Production / Zero Waste) — presentation payload
# =====================================================================

class KpiCard(BaseModel):
    id: str
    label: str
    sub: str = ""
    icon: str = "activity"           # lucide icon key, resolved on the frontend
    icon_tone: str = "blue"          # blue | green | sky
    value: float
    decimals: int = 0
    prefix: str = ""                 # e.g. 'USD'
    suffix: str = ""                 # e.g. 'Mt', 'Million', 'Ton CO₂e'
    delta: str = ""                  # e.g. '▲ 6.8% YoY'
    delta_tone: str = "green"        # green | amber | red | slate
    spark: list[float] = Field(default_factory=list)
    progress: float | None = None    # 0-100 → renders a progress bar instead of delta
    progress_min: str = ""
    progress_max: str = ""


class TrendSeries(BaseModel):
    months: list[str]
    actual: list[float | None]
    forecast: list[float | None]
    target: float | None = None


class ForecastBadge(BaseModel):
    label: str
    value: float
    decimals: int = 2
    unit: str = ""
    delta: str = ""


class TrendDimRow(BaseModel):
    """Per-PT×commodity trend — native units (TON/KG/WMT/TNI/MTON/TON SN)."""
    pt_code: str
    pt: str                             # display name
    commodity: str
    unit: str
    actual: list[float | None]          # 12 months, actual_qty
    forecast: list[float | None]        # 12 months, bridged at last actual
    target_monthly: float | None = None # avg monthly target
    projected: float | None = None      # full-year projection
    target_annual: float | None = None  # ytd target + forecast-month target
    delta_pct: float | None = None      # projected vs annual target


class DonutItem(BaseModel):
    name: str
    value: float
    color: str


class DonutChart(BaseModel):
    items: list[DonutItem]
    center_top: str = ""
    center_bottom: str = ""


class PtProdRow(BaseModel):
    pt: str
    pt_code: str = ""
    color: str
    actual: float
    plan: float
    achievement_pct: float
    delta_pct: float


class MapSite(BaseModel):
    name: str
    pt: str
    lon: float
    lat: float
    show_label: bool = False
    size: float = 10


class TopSite(BaseModel):
    rank: int
    site: str
    pt: str
    prod: float
    vs_plan: str
    spark: list[float]


class MarketItem(BaseModel):
    name: str
    price: str
    delta: str
    up: bool


class InsightItem(BaseModel):
    kind: str = "check"              # 'check' | 'warn'
    text: str


class AiBlock(BaseModel):
    title: str
    tag: str = ""
    body: str = ""
    actions: list[str] = Field(default_factory=list)


class ProductionData(BaseModel):
    generated_at: str
    source: str
    periods: list[str]
    selected_pt: str = ""
    kpis: list[KpiCard]
    trend: TrendSeries
    forecast_badge: ForecastBadge
    trend_dim: list[TrendDimRow] = []
    commodity: DonutChart
    pt_rows: list[PtProdRow]
    pt_total: PtProdRow
    ai: AiBlock
    sites: list[MapSite]
    pt_colors: dict[str, str]
    top_sites: list[TopSite]
    market: list[MarketItem]
    key_insights: list[InsightItem]
    next_actions: list[str]


class WasteTrend(BaseModel):
    quarters: list[str]
    recycled: list[float]
    landfill: list[float]
    utilization: list[float]


class UtilRing(BaseModel):
    pt: str
    pct: float
    yoy: str


class CompSet(BaseModel):
    key: str
    label: str
    items: list[DonutItem]
    center: str = ""


class BarItem(BaseModel):
    name: str
    value: float
    color: str


class RevBar(BaseModel):
    name: str
    pot: float
    rea: float


class TopOpp(BaseModel):
    rank: int
    opp: str
    pt: str
    rev: float


class Story(BaseModel):
    pt: str
    gradient: str
    title: str
    body: str
    status: str
    image: str | None = None


class WasteStream(BaseModel):
    name: str
    volume: float
    util: float
    rev: float


class PtWaste(BaseModel):
    pt: str
    letter: str
    color: str
    waste: float
    util: float
    rev: float
    streams: list[WasteStream]
    monthly: list[float]
    monthly_util: list[float]


class AiItem(BaseModel):
    title: str
    body: str                          # may contain <b>…</b> inline markup


class WasteData(BaseModel):
    generated_at: str
    source: str
    periods: list[str]
    kpis: list[KpiCard]
    trend: WasteTrend
    util_rings: list[UtilRing]
    sites: list[MapSite]
    pt_colors: dict[str, str]
    ai_items: list[AiItem]
    ai_generated_at: str
    comp_sets: list[CompSet]
    rev_bars: list[RevBar]
    gap_pareto: list[BarItem] = []
    pt_realize: list[RevBar] = []
    top_opps: list[TopOpp]
    stories: list[Story]
    pt_details: list[PtWaste]
    key_insights: list[InsightItem]
    next_actions: list[str]
