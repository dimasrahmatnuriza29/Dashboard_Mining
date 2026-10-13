from __future__ import annotations

import random
from datetime import date, datetime, timedelta

from app.schemas import (
    CompositionSlice,
    DashboardData,
    Kpi,
    SiteRow,
    TrendPoint,
    TrendRow,
)

_SPARK = [42.1, 44.8, 43.2, 46.1, 45.0, 47.3, 46.8, 48.2, 47.5, 48.4]


class MockProvider:
    """Synthetic data matching the approved mockup.

    Swap-in point for SnowflakeProvider — same contract, real views.
    """

    name = "mock"

    def dashboard(self, pt: str | None = None, asof: str | None = None) -> DashboardData:
        rng = random.Random(7)  # deterministic so the UI stays stable
        today = date.today()
        days = [(today - timedelta(days=13 - i)).isoformat() for i in range(14)]

        actual = [round(44.5 + i * 0.35 + rng.uniform(-1.6, 1.6), 1) for i in range(10)]
        last = actual[-1]
        trend: list[TrendPoint] = []
        for i, d in enumerate(days):
            if i < 10:
                trend.append(TrendPoint(date=d, actual=actual[i]))
            else:
                f = round(last + (i - 9) * 0.7 + rng.uniform(-0.8, 0.8), 1)
                trend.append(
                    TrendPoint(date=d, forecast=f, lower=round(f - 1.8, 1), upper=round(f + 1.8, 1))
                )
        # bridge point so the forecast line connects to actual
        trend[9] = TrendPoint(date=days[9], actual=actual[9], forecast=actual[9])

        # PT × commodity grain — mirrors TREND_DIM_SQL shape
        trend_dim: list[TrendRow] = []
        for pt, com, unit, share in [
            ("PTBA", "COAL", "TON", 0.85),
            ("ANTAM", "NICKEL ORE", "WMT", 0.13),
            ("TIMAH", "TIN ORE", "TON SN", 0.02),
        ]:
            for p in trend:
                act = p.actual * share if p.actual is not None else None
                fc = p.forecast * share if p.forecast is not None else None
                tgt = fc * 1.05 if fc is not None else (act * 1.02 if act else None)
                trend_dim.append(
                    TrendRow(
                        pt_code=pt, commodity=com, unit=unit, date=p.date,
                        actual=act, forecast=fc,
                        lower=p.lower * share if p.lower is not None else None,
                        upper=p.upper * share if p.upper is not None else None,
                        target=tgt,
                        gap=(fc - tgt) if (fc is not None and tgt is not None) else None,
                    )
                )

        return DashboardData(
            generated_at=datetime.now().isoformat(timespec="seconds"),
            source=self.name,
            kpis=[
                Kpi(id="production", label="Production (t)", value=48210, unit="t", delta=8.2, sparkline=_SPARK),
                Kpi(id="ytd", label="YTD Achievement", value=76.4, unit="%", decimals=1, delta=1.4, sparkline=[s * 1.6 for s in _SPARK]),
                Kpi(id="downtime", label="Downtime (h)", value=1240, unit="h", delta=-2.1, sparkline=[s * 26 for s in reversed(_SPARK)]),
                Kpi(id="cost", label="Energy Cost / t", value=21450, unit="Rp", delta=-3.6, good_when_negative=True, sparkline=[s * 450 for s in reversed(_SPARK)]),
            ],
            trend=trend,
            trend_dim=trend_dim,
            composition=[
                CompositionSlice(name="Coal", value=44),
                CompositionSlice(name="Nickel Ore", value=28),
                CompositionSlice(name="Tin Ore", value=18),
                CompositionSlice(name="Alumina", value=10),
            ],
            site_summary=[
                r
                for r in [
                    SiteRow(site="PTBA · PTBA-SITE-01", commodity="COAL", production_t=18420, achievement_pct=104.2, downtime_h=38.5, downtime_avg_h=41.0, forecast_delta_pct=4.2, status="On Track"),
                    SiteRow(site="ANTAM · ANTAM-SITE-05", commodity="NICKEL ORE", production_t=16980, achievement_pct=112.4, downtime_h=22.1, downtime_avg_h=30.4, forecast_delta_pct=8.0, status="Ahead"),
                    SiteRow(site="TIMAH · TIMAH-SITE-02", commodity="TIN ORE", production_t=12810, achievement_pct=91.8, downtime_h=61.4, downtime_avg_h=48.9, forecast_delta_pct=-1.8, status="Watch"),
                    SiteRow(site="ANTAM · ANTAM-SITE-01", commodity="NICKEL ORE", production_t=11450, achievement_pct=78.3, downtime_h=88.7, downtime_avg_h=55.2, forecast_delta_pct=-6.1, status="Behind"),
                ]
                if not pt or r.site.startswith(pt)
            ],
            ytd_achievement_pct=76.0,
        )
