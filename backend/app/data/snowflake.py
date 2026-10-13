from __future__ import annotations

import logging
import re

from app.config import settings
from app.data import queries as q
from app.schemas import (
    CompositionSlice,
    DashboardData,
    Kpi,
    SiteRow,
    TrendPoint,
    TrendRow,
)

log = logging.getLogger(__name__)


class SnowflakeProvider:
    """Read-only provider over Snowflake ANALYTICS views.

    SQL lives in queries.py — that file is the ONLY thing to update
    once the real schema lands.
    """

    name = "snowflake"

    def __init__(self) -> None:
        self._conn = None  # lazy connect so backend still boots w/o creds

    def _connection(self):
        if self._conn is None:
            import snowflake.connector

            self._conn = snowflake.connector.connect(
                account=settings.sf_account,
                user=settings.sf_user,
                password=settings.sf_password,
                role=settings.sf_role or None,
                warehouse=settings.sf_warehouse or None,
                database=settings.sf_database or None,
                schema=settings.sf_schema or None,
            )
        return self._conn

    def _rows(self, sql: str) -> list[dict]:
        cur = self._connection().cursor()
        try:
            cur.execute(sql)
            cols = [c[0].lower() for c in cur.description]
            return [dict(zip(cols, row)) for row in cur.fetchall()]
        finally:
            cur.close()

    def dashboard(self, pt: str | None = None, asof: str | None = None) -> DashboardData:
        # defense-in-depth: only plain values reach the SQL text
        if pt and not re.fullmatch(r"[A-Z0-9_-]+", pt):
            pt = None
        if asof and not re.fullmatch(r"\d{4}-\d{2}", asof):
            asof = None

        # kpi_sql returns one row per metric×month; collapse into Kpi objects.
        meta = {
            "production": ("t", 0, False),
            "ytd": ("%", 1, False),
            "downtime": ("h", 0, False),
            "cost": ("Rp", 0, True),
        }
        order = ["production", "ytd", "downtime", "cost"]
        series: dict[str, dict] = {}
        for r in self._rows(q.kpi_sql(pt, asof)):
            s = series.setdefault(r["id"], {"label": r["label"], "vals": []})
            if r["v"] is not None:
                s["vals"].append(float(r["v"]))
        kpis = []
        for kid in order:
            s = series.get(kid)
            if not s or not s["vals"]:
                continue
            vals = s["vals"]
            unit, dec, neg = meta[kid]
            delta = (vals[-1] - vals[-2]) / vals[-2] * 100 if len(vals) > 1 and vals[-2] else 0.0
            kpis.append(
                Kpi(id=kid, label=s["label"], value=round(vals[-1], dec),
                    unit=unit, decimals=dec, delta=round(delta, 1),
                    good_when_negative=neg, sparkline=vals)
            )

        def num(r, k):
            return None if r.get(k) is None else float(r[k])

        trend = [
            TrendPoint(
                date=str(r["date"]),
                actual=num(r, "actual_t"), forecast=num(r, "forecast_t"),
                lower=num(r, "forecast_lo_t"), upper=num(r, "forecast_hi_t"),
                target=num(r, "target_t"), gap=num(r, "gap_t"),
            )
            for r in self._rows(q.TREND_SQL)
        ]
        # bridge: forecast line starts at the last actual point
        for p in reversed(trend):
            if p.actual is not None:
                p.forecast = p.actual
                break

        trend_dim = [
            TrendRow(
                pt_code=r["pt"], commodity=r["com"], unit=r["unit"] or "",
                date=str(r["date"]),
                actual=num(r, "actual_t"), forecast=num(r, "forecast_t"),
                lower=num(r, "forecast_lo_t"), upper=num(r, "forecast_hi_t"),
                target=num(r, "target_t"), gap=num(r, "gap_t"),
            )
            for r in self._rows(q.TREND_DIM_SQL)
        ]

        composition = [
            CompositionSlice(name=r["name"], value=float(r["value"] or 0))
            for r in self._rows(q.composition_sql(pt, asof))
            if r["value"] is not None
        ]

        sites = [
            SiteRow(
                site=r["site"],
                commodity=r["commodity"],
                production_t=float(r["production_t"] or 0),
                achievement_pct=float(r["achievement_pct"] or 0),
                downtime_h=float(r["downtime_h"] or 0),
                downtime_avg_h=None if r["downtime_avg_h"] is None else float(r["downtime_avg_h"]),
                forecast_delta_pct=float(r["forecast_delta_pct"] or 0),
                status=r["status"],
            )
            for r in self._rows(q.site_summary_sql(pt, asof))
        ]

        ytd = self._rows(q.ytd_sql(pt, asof))
        ytd_pct = float(ytd[0]["achievement_pct"]) if ytd else 0.0

        from datetime import datetime

        return DashboardData(
            generated_at=datetime.now().isoformat(timespec="seconds"),
            source=self.name,
            kpis=kpis,
            trend=trend,
            trend_dim=trend_dim,
            composition=composition,
            site_summary=sites,
            ytd_achievement_pct=ytd_pct,
        )
