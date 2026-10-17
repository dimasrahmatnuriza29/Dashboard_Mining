from __future__ import annotations

import logging
import re
import threading
import time
from datetime import datetime

from app.config import settings
from app.data import queries as q
from app.schemas import (
    AiBlock,
    AiItem,
    BarItem,
    CompSet,
    DonutChart,
    DonutItem,
    ForecastBadge,
    InsightItem,
    KpiCard,
    MapSite,
    MarketItem,
    ProductionData,
    PtProdRow,
    PtWaste,
    RevBar,
    Story,
    TopOpp,
    TopSite,
    TrendDimRow,
    TrendSeries,
    UtilRing,
    WasteData,
    WasteStream,
    WasteTrend,
)

log = logging.getLogger(__name__)

MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
PT_COLORS = {"ANTAM": "#16a34a", "PTBA": "#ef4444", "TIMAH": "#a855f7", "INALUM": "#2563eb"}
GROUP_COLORS = {"Coal": "#334155", "Nickel": "#16a34a", "Aluminium": "#3b82f6", "Tin": "#f59e0b", "Gold": "#eab308"}
MT = 1_000_000.0

_CACHE_TTL = 1800  # seconds — dashboards don't change per-request; keep warm for a session
_cache: dict[tuple[str, str | None], tuple[float, object]] = {}
_cache_lock = threading.Lock()


def _cached(key: tuple[str, str | None], build):
    """Return cached payload or rebuild; caches Snowflake results for _CACHE_TTL."""
    with _cache_lock:
        hit = _cache.get(key)
        if hit and time.time() - hit[0] < _CACHE_TTL:
            return hit[1]
    val = build()
    with _cache_lock:
        _cache[key] = (time.time(), val)
    return val


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

    def _rows_batch(self, sqls: list[str]) -> list[list[dict]]:
        """Submit all queries async on the shared session — they run in
        parallel on the warehouse (one handshake, concurrent exec)."""
        if len(sqls) == 1:
            return [self._rows(sqls[0])]
        conn = self._connection()
        from snowflake.connector.cursor import DictCursor

        curs = [conn.cursor(DictCursor) for _ in sqls]
        try:
            qids = [c.execute_async(s)["queryId"] for c, s in zip(curs, sqls)]
            deadline = time.time() + 90
            out = []
            for c, qid in zip(curs, qids):
                while conn.is_still_running(conn.get_query_status(qid)):
                    if time.time() > deadline:
                        raise TimeoutError(f"query {qid} exceeded 90s")
                    time.sleep(0.1)
                c.get_results_from_sfqid(qid)
                out.append([{k.lower(): v for k, v in row.items()} for row in c.fetchall()])
            return out
        finally:
            for c in curs:
                c.close()

    # ----------------------------------------------------------------
    # New intelligence pages — tables not yet mapped.
    # TODO: replace with real Snowflake views in queries.py once the new
    # schema/table names are confirmed, then drop the mock delegation.
    # ----------------------------------------------------------------

    def production(self, period: str | None = None, pt: str | None = None) -> ProductionData:
        def build():
            try:
                return self._production_sf(period, pt)
            except Exception as exc:
                log.warning("production(): Snowflake query failed (%s) — serving mock data", exc)
                from app.data.mock import MockProvider

                return MockProvider().production(period)

        return _cached(("production", f"{period}|{pt}"), build)

    # ----------------------------------------------------------------
    # Production Intelligence — real DM_HPL_* assembly
    # ----------------------------------------------------------------

    @staticmethod
    def _f(v, d: float = 0.0) -> float:
        return d if v is None else float(v)

    def _production_sf(self, period: str | None, pt: str | None = None) -> ProductionData:
        from app.data.mock import MockProvider

        mock = MockProvider().production(period)   # static copy: AI text, insights, actions

        # forecast boundary → actual = months < fc_start, forecast = fc_start..Dec
        b = self._rows(q.FC_BOUNDARY_SQL)
        fc_start = str(b[0]["fc_start"])[:10] if b and b[0]["fc_start"] else None
        if not fc_start:
            raise ValueError("no forecast boundary found")
        boundary_year = int(fc_start[:4])
        boundary_month = int(fc_start[5:7])

        m = re.search(r"(\d{4})", period or "")
        year = int(m.group(1)) if m else boundary_year
        # Past/future years: full 12-month actual window (targets fully populated).
        # Boundary year only: actuals stop at the forecast boundary month.
        elapsed = boundary_month - 1 if year == boundary_year else 12
        cur = f"{year + 1}-01-01" if elapsed == 12 else f"{year}-{'%02d' % boundary_month}-01"

        # All remaining queries are independent → run concurrently.
        # prior window mirrors `elapsed` (full year for past years, YTD boundary else).
        prior_before = f"{year}-01-01" if elapsed == 12 else f"{year - 1}-{'%02d' % boundary_month}-01"
        fc_before = f"{year}-{'%02d' % boundary_month}-01"
        (c_rows, p_rows, actual_rows, fc_rows, fvt, grp_rows, pt_rows_raw,
         pt_prev_rows, site_rows, sm_rows, market_rows,
         tda, tdf, tdt) = self._rows_batch([
            q.kpi_ytd_sql(year, cur, pt),
            q.kpi_ytd_sql(year - 1, prior_before, pt),
            # trend card has its own PT×commodity filter → stays unfiltered
            q.actual_monthly_sql(year, cur),
            q.forecast_monthly_sql(year),
            q.forecast_target_sql(year, fc_before),
            q.commodity_share_sql(year, cur),              # holding-level (no PT_CODE col)
            q.pt_ytd_sql(year, cur),                        # comparison table: all PTs
            q.pt_ytd_sql(year - 1, prior_before),
            q.dim_sites_sql(pt),
            q.site_monthly_sql(year, cur, pt),
            q.MARKET_SQL,                                   # global benchmarks
            q.trend_dim_actual_sql(year, cur),
            q.trend_dim_forecast_sql(year),
            q.trend_dim_target_sql(year, fc_before),
        ])

        # ---------- KPI totals (current vs prior year same window) ----------
        c = c_rows[0] if c_rows else {}
        p = p_rows[0] if p_rows else {}
        prod_ton, tgt_ton = self._f(c["production_ton"]), self._f(c["target_ton"])
        p_prod, p_tgt = self._f(p.get("production_ton")), self._f(p.get("target_ton"))
        achv = prod_ton / tgt_ton * 100 if tgt_ton else 0.0
        p_achv = p_prod / p_tgt * 100 if p_tgt else 0.0

        def yoy(cur_v: float, prev_v: float) -> tuple[str, str]:
            if not prev_v:
                return "—", "slate"
            d = (cur_v - prev_v) / prev_v * 100
            return f"{'▲' if d >= 0 else '▼'} {abs(d):.1f}% YoY", ("green" if d >= 0 else "amber")

        rev_d, rev_t = yoy(self._f(c["revenue_usd"]), self._f(p.get("revenue_usd")))
        cost_d, cost_t = yoy(self._f(c["cost_usd"]), self._f(p.get("cost_usd")))
        dt_d, dt_t = yoy(self._f(c["downtime_pct"]), self._f(p.get("downtime_pct")))
        dt_t = "amber" if dt_t == "green" else "green"     # downtime down = good
        co2_d, co2_t = yoy(self._f(c["co2_intensity"]), self._f(p.get("co2_intensity")))
        co2_t = "amber" if co2_t == "green" else "green"   # intensity down = good
        prod_d, prod_t = yoy(prod_ton, p_prod)
        achv_diff = achv - p_achv

        kpis = [
            KpiCard(id="prod", label="Total Production (Mt)", icon="truck", icon_tone="blue",
                    value=round(prod_ton / MT, 2), decimals=2, suffix="Mt", delta=prod_d, delta_tone=prod_t),
            KpiCard(id="achv", label="Production Achievement", icon="target", icon_tone="blue",
                    value=round(achv, 1), decimals=1, suffix="%",
                    delta=f"vs {p_achv:.1f}% (YTD {year - 1}) {'▲' if achv_diff >= 0 else '▼'} {abs(achv_diff):.1f}%",
                    delta_tone="green" if achv_diff >= 0 else "amber"),
            KpiCard(id="rev", label="Total Revenue (USD)", icon="coins", icon_tone="blue",
                    value=round(self._f(c["revenue_usd"]) / 1e9, 2), decimals=2, suffix="B",
                    delta=rev_d, delta_tone=rev_t),
            KpiCard(id="cost", label="Operational Cost (USD)", icon="wallet", icon_tone="blue",
                    value=round(self._f(c["cost_usd"]) / 1e9, 2), decimals=2, suffix="B",
                    delta=cost_d, delta_tone=cost_t),
            KpiCard(id="dt", label="Unplanned Downtime", icon="wrench", icon_tone="blue",
                    value=round(self._f(c["downtime_pct"]), 1), decimals=1, suffix="%",
                    delta=dt_d, delta_tone=dt_t),
            KpiCard(id="co2", label="CO₂ Intensity (tCO₂e/t)", icon="leaf", icon_tone="green",
                    value=round(self._f(c["co2_intensity"]), 4), decimals=4,
                    delta=co2_d, delta_tone=co2_t),
        ]

        # ---------- trend (actual line + forecast line + target) ----------
        actual_by_m = {str(r["month_start"])[5:7]: self._f(r["production_ton"]) / MT for r in actual_rows}
        fc_by_m = {str(r["month_start"])[5:7]: self._f(r["production_ton"]) / MT for r in fc_rows}

        actual: list[float | None] = [None] * 12
        forecast: list[float | None] = [None] * 12
        for i in range(12):
            mm = f"{i + 1:02d}"
            if mm in actual_by_m:
                actual[i] = round(actual_by_m[mm], 2)
            if mm in fc_by_m:
                forecast[i] = round(fc_by_m[mm], 2)
        # bridge: forecast line starts at last actual point
        last_act = max((i for i, v in enumerate(actual) if v is not None), default=-1)
        if last_act >= 0 and last_act < 11:
            forecast[last_act] = actual[last_act]

        # TARGET_TON only populated through actual months; FORECAST_VS_TARGET
        # carries the Oct–Dec targets → precise annual target, fallback = prorate.
        # Trend card is holding-level → use unfiltered PT totals for its target.
        hold_tgt = sum(self._f(r["target_ton"]) for r in pt_rows_raw)
        monthly_target = round(hold_tgt / MT / max(elapsed, 1), 2) if hold_tgt else None
        fvt_tgt = self._f(fvt[0]["target_ton"]) / MT if fvt else 0.0
        tgt_annual = hold_tgt / MT + fvt_tgt if fvt_tgt else (monthly_target or 0.0) * 12

        # ---------- forecast badge (year-end projection) ----------
        projected = sum(v for v in actual if v) + sum(
            v for i, v in enumerate(forecast or []) if v and i != last_act
        )
        badge_delta = (projected / tgt_annual - 1) * 100 if tgt_annual else 0.0
        badge = ForecastBadge(
            label=f"Dec {year} Forecast" if any(v for v in forecast) else f"FY {year} Actual",
            value=round(projected, 2), decimals=2, unit="Mt",
            delta=f"{'▲' if badge_delta >= 0 else '▼'} {abs(badge_delta):.1f}% vs Target",
        )

        # ---------- commodity donut ----------
        grp_total = sum(self._f(r["production_ton"]) for r in grp_rows) or 1.0
        donut_items = [
            DonutItem(name=r["commodity_group"], value=round(self._f(r["production_ton"]) / grp_total * 100, 1),
                      color=GROUP_COLORS.get(r["commodity_group"], "#94a3b8"))
            for r in grp_rows if r["production_ton"] is not None
        ]
        donut_items.sort(key=lambda i: i.value, reverse=True)

        # ---------- PT table ----------
        pt_prev = {r["pt_code"]: self._f(r["actual_ton"]) for r in pt_prev_rows}
        pt_rows = []
        for r in pt_rows_raw:
            act, tgt = self._f(r["actual_ton"]), self._f(r["target_ton"])
            prev = pt_prev.get(r["pt_code"], 0.0)
            pt_rows.append(PtProdRow(
                pt=r["pt_name"] or r["pt_code"], pt_code=r["pt_code"],
                color=PT_COLORS.get(r["pt_code"], "#64748b"),
                actual=round(act / MT, 2), plan=round(tgt / MT, 2),
                achievement_pct=round(act / tgt * 100, 1) if tgt else 0.0,
                delta_pct=round((act / prev - 1) * 100, 1) if prev else 0.0,
            ))
        t_act = sum(r.actual for r in pt_rows)
        t_plan = sum(r.plan for r in pt_rows)
        t_prev = sum(pt_prev.values())
        pt_total = PtProdRow(
            pt="Total Holding", color="#0d2d4f", actual=round(t_act, 2), plan=round(t_plan, 2),
            achievement_pct=round(t_act / t_plan * 100, 1) if t_plan else 0.0,
            delta_pct=round((t_act / (t_prev / MT) - 1) * 100, 1) if t_prev else 0.0,
        )

        # ---------- map + top-5 sites ----------
        sites = [
            MapSite(name=r["site_name"], pt=r["pt_name"] or r["pt_code"],
                    lon=self._f(r["longitude"]), lat=self._f(r["latitude"]), size=10)
            for r in site_rows
        ]
        pt_colors = {}
        for r in pt_rows_raw:
            name = r["pt_name"] or r["pt_code"]
            pt_colors[name] = PT_COLORS.get(r["pt_code"], "#64748b")

        by_site: dict[tuple, dict] = {}
        for r in sm_rows:
            k = (r["pt_code"], r["site_name"])
            s = by_site.setdefault(k, {"total": 0.0, "vsl": [], "series": []})
            s["total"] += self._f(r["production_ton"])
            if r["vs_last_year_pct"] is not None:
                s["vsl"].append(float(r["vs_last_year_pct"]))
            s["series"].append(self._f(r["production_ton"]) / MT)
        top = sorted(by_site.items(), key=lambda kv: kv[1]["total"], reverse=True)[:5]
        top_sites = [
            TopSite(rank=i + 1, site=k[1], pt=k[0],
                    prod=round(s["total"] / MT, 2),
                    vs_plan=f"{'▲' if (sum(s['vsl']) / len(s['vsl']) if s['vsl'] else 0) >= 0 else '▼'} "
                            f"{abs(sum(s['vsl']) / len(s['vsl']) if s['vsl'] else 0):.1f}%",
                    spark=[round(v, 2) for v in s["series"]])
            for i, (k, s) in enumerate(top)
        ]

        # ---------- per-PT×commodity trend (native units) ----------
        dim: dict[tuple, dict] = {}

        def cell(k):
            return dim.setdefault(
                k, {"actual": [None] * 12, "forecast": [None] * 12,
                    "tgt": 0.0, "fc_tgt": 0.0})

        for r in tda:
            d = cell((r["pt_code"], r["commodity"], r["unit"]))
            i = int(str(r["month_start"])[5:7]) - 1
            d["actual"][i] = round(self._f(r["actual_qty"]), 2)
            d["tgt"] += self._f(r["target_qty"])
        for r in tdf:
            d = cell((r["pt_code"], r["commodity"], r["unit"]))
            i = int(str(r["month_start"])[5:7]) - 1
            d["forecast"][i] = round(self._f(r["forecast_qty"]), 2)
        for r in tdt:
            cell((r["pt_code"], r["commodity"], r["unit"]))["fc_tgt"] = self._f(r["target_qty"])

        pt_name = {r["pt_code"]: (r["pt_name"] or r["pt_code"]) for r in pt_rows_raw}
        pt_order = [r["pt_code"] for r in pt_rows_raw]
        trend_dim = []
        for (pt_code, com, unit), d in dim.items():
            # drop combos with neither actuals nor forecast for this year
            if not any(d["actual"]) and not any(d["forecast"]):
                continue
            last = max((i for i, v in enumerate(d["actual"]) if v is not None), default=-1)
            if last >= 0 and last < 11:
                d["forecast"][last] = d["actual"][last]
            tgt_a = d["tgt"] + d["fc_tgt"] or None
            proj = sum(v for v in d["actual"] if v) + sum(
                v for i, v in enumerate(d["forecast"]) if v and i != last) or None
            trend_dim.append(TrendDimRow(
                pt_code=pt_code, pt=pt_name.get(pt_code, pt_code), commodity=com, unit=unit,
                actual=d["actual"], forecast=d["forecast"],
                target_monthly=round(tgt_a / 12, 2) if tgt_a else None,
                projected=round(proj, 2) if proj else None,
                target_annual=round(tgt_a, 2) if tgt_a else None,
                delta_pct=round((proj / tgt_a - 1) * 100, 1)
                          if proj and tgt_a else None,
            ))
        vol = {k: sum(v for v in d["actual"] if v) for k, d in dim.items()}
        trend_dim.sort(key=lambda t: (
            pt_order.index(t.pt_code) if t.pt_code in pt_order else 99,
            -vol.get((t.pt_code, t.commodity, t.unit), 0)))

        # ---------- AI recommendation (data-driven, filter-aware) ----------
        scope = pt_name.get(pt, pt) if pt else "total holding"
        scope_rows = [t for t in trend_dim if t.pt_code == pt] if pt else trend_dim
        worst_pt = min(pt_rows, key=lambda r: r.achievement_pct, default=None)
        worst_com = min((t for t in scope_rows if t.delta_pct is not None),
                        key=lambda t: t.delta_pct, default=None)
        ai_tag = "On Track" if badge_delta >= 0 else ("High Impact" if badge_delta <= -3 else "Watch")

        prow = next((r for r in pt_rows if r.pt_code == pt), None) if pt else None
        if prow is not None:
            body = (
                f"For {scope}, YTD production is {prow.actual:.2f} Mt vs plan "
                f"{prow.plan:.2f} Mt ({prow.achievement_pct:.1f}%, "
                f"{prow.delta_pct:+.1f}% YoY)."
            )
        else:
            body = (
                f"For {scope}, Dec {year} forecast projects {projected:.2f} Mt "
                f"vs annual target {tgt_annual:.2f} Mt ({badge_delta:+.1f}%)."
            )
            if worst_pt is not None:
                body += (f" Widest gap: {worst_pt.pt} at {worst_pt.achievement_pct:.1f}% "
                         f"of plan ({worst_pt.actual:.2f}/{worst_pt.plan:.2f} Mt).")
        if worst_com is not None:
            body += (f" Weakest commodity: {worst_com.commodity} at {worst_com.pt} "
                     f"projected {worst_com.delta_pct:+.1f}% vs target.")

        actions = []
        focus_pt = prow or worst_pt
        if focus_pt is not None and focus_pt.achievement_pct < 100:
            gap_mt = focus_pt.plan - focus_pt.actual
            actions.append(f"Close {gap_mt:.2f} Mt gap at {focus_pt.pt} — review site-level throughput plan")
        if worst_com is not None and worst_com.delta_pct is not None and worst_com.delta_pct < 0:
            gap_c = (worst_com.target_annual or 0) - (worst_com.projected or 0)
            actions.append(f"Recover {worst_com.commodity} shortfall (~{gap_c:,.0f} {worst_com.unit}) at {worst_com.pt}")
        if any(v for v in forecast):
            actions.append(f"Monitor Oct–Dec forecast ramp-up; holding is {badge_delta:+.1f}% vs target")
        ai_block = AiBlock(
            title="Production Opportunity" if badge_delta < 0 else "Forecast On Track",
            tag=ai_tag, body=body, actions=actions)

        # ---------- market ----------
        market = [
            MarketItem(name=r["benchmark"], price=f"{self._f(r['price_usd']):,.1f}".rstrip("0").rstrip("."),
                       delta=f"{'▲' if self._f(r['change_30d_pct']) >= 0 else '▼'} {abs(self._f(r['change_30d_pct'])):.1f}%",
                       up=self._f(r["change_30d_pct"]) >= 0)
            for r in market_rows
        ]

        return ProductionData(
            generated_at=datetime.now().isoformat(timespec="seconds"),
            source=self.name,
            periods=[f"Jan {boundary_year} – Dec {boundary_year}",
                     f"Jan {boundary_year - 1} – Dec {boundary_year - 1}"],
            selected_pt=pt or "",
            kpis=kpis,
            trend=TrendSeries(months=MONTHS, actual=actual, forecast=forecast, target=monthly_target),
            forecast_badge=badge,
            trend_dim=trend_dim,
            commodity=DonutChart(items=donut_items, center_top=f"{grp_total / MT:.2f} Mt",
                                 center_bottom="Total Production"),
            pt_rows=pt_rows,
            pt_total=pt_total,
            ai=ai_block,
            sites=sites,
            pt_colors=pt_colors,
            top_sites=top_sites,
            market=market,
            key_insights=[InsightItem(kind=i.kind, text=i.text) for i in mock.key_insights],
            next_actions=list(mock.next_actions),
        )

    def waste(self, period: str | None = None) -> WasteData:
        def build():
            try:
                return self._waste_sf(period)
            except Exception as exc:
                log.warning("waste(): Snowflake query failed (%s) — serving mock data", exc)
                from app.data.mock import MockProvider

                return MockProvider().waste(period)

        return _cached(("waste", period), build)

    # ----------------------------------------------------------------
    # Zero Waste Intelligence — real DM_ZWI_* assembly
    # ----------------------------------------------------------------

    def _waste_sf(self, period: str | None = None) -> WasteData:
        from app.data.mock import MockProvider

        mock = MockProvider().waste(period)  # static copy: AI text, insights, actions

        # ---------- boundary year ----------
        years = [int(r["y"]) for r in self._rows(q.WASTE_YEARS_SQL)]
        m = re.search(r"(\d{4})", period or "")
        year = int(m.group(1)) if m and int(m.group(1)) in years else years[0]
        prev = year - 1

        # ---------- batch ----------
        # tiny month-window query first → the big batch runs once with the real YTD window
        mm = int(self._rows(q.waste_mm_sql(year))[0]["mm"] or 12)

        (ytd, monthly, ptm, targets, sites, types, streams, opps, projects,
         clf_t, clf_gap, clf_pt) = (
            self._rows_batch([
                q.waste_ytd_sql(prev, year, mm),
                q.waste_monthly_sql(prev, year),
                q.waste_pt_monthly_sql(year),
                q.waste_target_sql(prev, year),
                q.waste_sites_sql(year),
                q.waste_type_sql(year, mm),
                q.waste_pt_stream_sql(year, mm),
                q.WASTE_OPPS_SQL,
                q.WASTE_PROJECTS_SQL,
                q.waste_clf_type_sql(year, mm),
                q.waste_clf_gap_sql(year, mm),
                q.waste_clf_pt_sql(year, mm),
            ])
        )

        def fy(r, k):
            return self._f(r.get(k)) if r else 0.0

        cur = next((r for r in ytd if int(r["y"]) == year), None)
        prv = next((r for r in ytd if int(r["y"]) == prev), None)
        tgt_by = {(int(r["year"]), r["pt_code"]): r for r in targets}
        holding = tgt_by.get((year, "HOLDING"), {})

        def delta_pct(c, p):
            if not p:
                return "—", "slate"
            d = (c - p) / p * 100
            return f"{'▲' if d >= 0 else '▼'} {abs(d):.0f}% vs. {prev}", "green" if d >= 0 else "red"

        gen, pot, util_t, co2 = fy(cur, "gen_ton"), fy(cur, "pot_usd"), fy(cur, "util_ton"), fy(cur, "co2_ton")
        p_gen, p_pot, p_util, p_co2 = fy(prv, "gen_ton"), fy(prv, "pot_usd"), fy(prv, "util_ton"), fy(prv, "co2_ton")
        util_pct = util_t / gen * 100 if gen else 0.0
        p_util_pct = p_util / p_gen * 100 if p_gen else 0.0

        # monthly helper — rows for `year` only
        mo = [r for r in monthly if r["month_start"].year == year]
        mo_gen = [fy(r, "gen") / 1000 for r in mo]      # kton
        mo_pot = [fy(r, "pot") / 1e6 for r in mo]
        mo_co2 = [fy(r, "co2") / 1000 for r in mo]
        mo_util = [fy(r, "util") / fy(r, "gen") * 100 if fy(r, "gen") else 0.0 for r in mo]

        # ---------- KPIs ----------
        d1, t1 = delta_pct(gen, p_gen)
        d2, t2 = delta_pct(pot, p_pot)
        d3 = util_pct - p_util_pct
        d3s = f"{'▲' if d3 >= 0 else '▼'} {abs(d3):.0f}% vs. {prev}" if prv else "—"
        t3 = "green" if d3 >= 0 else "red"
        d4, t4 = delta_pct(co2, p_co2)
        zw = fy(holding, "progress_to_2030_pct") or (fy(holding, "actual_utilization_pct"))
        kpis = [
            KpiCard(id="waste", label="Total Waste Generated", sub=f"({year} YTD)", icon="recycle",
                    icon_tone="green", value=round(gen), suffix="Ton",
                    delta=d1, delta_tone=t1, spark=mo_gen),
            KpiCard(id="rev", label="Total Potential Revenue", sub="(from Waste Utilization)",
                    icon="coins", icon_tone="green", value=round(pot / 1e6, 1), decimals=1,
                    prefix="USD", suffix="Million", delta=d2, delta_tone=t2, spark=mo_pot),
            KpiCard(id="util", label="Waste Recycled / Utilized", sub=" ", icon="leaf",
                    icon_tone="green", value=round(util_pct, 1), decimals=1, suffix="%",
                    delta=d3s, delta_tone=t3, spark=mo_util),
            KpiCard(id="co2", label="Estimated CO₂ Avoided", sub=" ", icon="cloud",
                    icon_tone="sky", value=round(co2), suffix="Ton CO₂e",
                    delta=d4, delta_tone=t4, spark=mo_co2),
            KpiCard(id="zw", label="Zero Waste Progress", icon="target", icon_tone="green",
                    value=round(zw, 1), decimals=1, suffix="%", progress=zw,
                    progress_min=f"Target {fy(holding, 'target_2030_pct'):.0f}% in 2030",
                    progress_max="100%"),
        ]

        # ---------- quarterly trend ----------
        qtr: dict[str, dict] = {}
        for r in monthly:
            ms = r["month_start"]
            key = f"Q{(ms.month - 1) // 3 + 1} {ms.year}"
            c = qtr.setdefault(key, {"rec": 0.0, "lf": 0.0, "gen": 0.0, "util": 0.0})
            c["rec"] += fy(r, "util") / 1000
            c["lf"] += fy(r, "lfill") / 1000
            c["gen"] += fy(r, "gen")
            c["util"] += fy(r, "util")
        trend = WasteTrend(
            quarters=list(qtr.keys()),
            recycled=[round(v["rec"], 1) for v in qtr.values()],
            landfill=[round(v["lf"], 1) for v in qtr.values()],
            utilization=[round(v["util"] / v["gen"] * 100, 1) if v["gen"] else 0.0 for v in qtr.values()],
        )

        # ---------- util rings ----------
        util_rings = []
        for code in ("ANTAM", "INALUM", "TIMAH"):
            r = tgt_by.get((year, code))
            p = tgt_by.get((prev, code))
            if not r:
                continue
            cur_pct = fy(r, "actual_utilization_pct")
            dy = cur_pct - (fy(p, "actual_utilization_pct") if p else 0.0)
            util_rings.append(UtilRing(
                pt=code, pct=round(cur_pct),
                yoy=f"{'+' if dy >= 0 else ''}{dy:.0f}%" if p else "—"))

        # ---------- sites ----------
        mx = max((fy(r, "gen") for r in sites), default=1.0)
        waste_sites = [
            MapSite(name=r["site_name"], pt=r["pt_code"], lon=float(r["lon"]), lat=float(r["lat"]),
                    show_label=True, size=8 + 6 * (fy(r, "gen") / mx))
            for r in sites
        ]
        pt_colors = {"ANTAM": "#16a34a", "INALUM": "#2563eb", "TIMAH": "#f97316"}

        # ---------- composition donuts ----------
        WG_COLORS = {"Tailings": "#1e4d8b", "Slag": "#2e9e62", "Fly Ash": "#f97316",
                     "Scrap Metal": "#8b5cf6", "Used Oil": "#eab308", "Other": "#cbd5e1"}
        COM_MAP = {"Nickel slag": "Nickel", "Gold tailings": "Gold",
                   "Bauxite washing tailings": "Bauxite", "Red mud (bauxite residue)": "Bauxite",
                   "Tin mineral tailings": "Tin", "Tin slag": "Tin",
                   "Aluminium dross": "Aluminium", "Spent pot lining": "Aluminium"}
        COM_COLORS = {"Nickel": "#16a34a", "Gold": "#eab308", "Bauxite": "#8b5cf6",
                      "Tin": "#f97316", "Aluminium": "#2563eb", "Other": "#cbd5e1"}

        tot = sum(fy(r, "gen") for r in types) or 1.0
        grp: dict[str, float] = {}
        com: dict[str, float] = {}
        for r in types:
            grp[r["waste_group"] or "Other"] = grp.get(r["waste_group"] or "Other", 0.0) + fy(r, "gen")
            c = COM_MAP.get(r["waste_type"], "Other")
            com[c] = com.get(c, 0.0) + fy(r, "gen")
        pts = {r["pt_code"]: 0.0 for r in streams}
        for r in streams:
            pts[r["pt_code"]] += fy(r, "gen")
        center = f"{tot / MT:.2f} M\nTon"

        comp_sets = [
            CompSet(key="holding", label="Total Holding", center=center, items=[
                DonutItem(name=g, value=round(v / tot * 100, 1), color=WG_COLORS.get(g, "#cbd5e1"))
                for g, v in sorted(grp.items(), key=lambda x: -x[1])]),
            CompSet(key="pt", label="By PT", center=center, items=[
                DonutItem(name=p_, value=round(v / tot * 100, 1), color=pt_colors.get(p_, "#94a3b8"))
                for p_, v in sorted(pts.items(), key=lambda x: -x[1])]),
            CompSet(key="com", label="By Commodity", center=center, items=[
                DonutItem(name=c_, value=round(v / tot * 100, 1), color=COM_COLORS.get(c_, "#cbd5e1"))
                for c_, v in sorted(com.items(), key=lambda x: -x[1])]),
        ]

        # ---------- revenue bars: potential vs realized (ML classification) ----------
        rev_bars = [
            RevBar(name=r["waste_type"],
                   pot=round(fy(r, "pot") / 1e6, 1),
                   rea=round(fy(r, "rea") / 1e6, 1))
            for r in clf_t[:6]
        ]

        # ---------- ML quality gate: gap reasons pareto + realized per PT ----------
        gap_pareto = [
            BarItem(name=r["reason"], value=round(fy(r, "gap_t") / 1000, 1),
                    color="#f59e0b")
            for r in clf_gap
        ]
        pt_realize = [
            RevBar(name=r["pt_code"],
                   pot=round(fy(r, "pot") / 1e6, 1),
                   rea=round(fy(r, "rea") / 1e6, 1))
            for r in clf_pt
        ]

        # ---------- top 5 opportunities ----------
        top_opps = [
            TopOpp(rank=int(r["rank"]), opp=r["opp"], pt=r["pt_code"],
                   rev=round(fy(r, "rev_usd") / 1e6, 1))
            for r in opps[:5]
        ]

        # ---------- stories ----------
        GRADS = {
            "ANTAM": "linear-gradient(135deg,#14532d,#166534 55%,#3f6212)",
            "INALUM": "linear-gradient(135deg,#78350f,#a16207 60%,#713f12)",
            "TIMAH": "linear-gradient(135deg,#7c2d12,#9a3412 60%,#b45309)",
        }
        STORY_IMG = {  # keyword → file in frontend/public/stories/ (specific first)
            "poton": "poton-paving", "precast": "poton-paving",
            "pilot": "pilot-plant",
            "red mud": "red-mud",
            "pot lining": "cement-kiln", "cement kiln": "cement-kiln",
            "tin slag": "timah-ponton", "reprocessing": "timah-ponton",
            "yard base": "pomalaa-slag", "slag": "pomalaa-slag",
        }
        def story_img(title: str) -> str | None:
            t = title.lower()
            for kw, f in STORY_IMG.items():
                if kw in t:
                    return f"/stories/{f}.jpg"
            return None

        stories = [
            Story(pt=r["pt_code"], gradient=GRADS.get(r["pt_code"], GRADS["ANTAM"]),
                  title=r["title"], body=r["description"] or "",
                  status=r["status"] or "Planned", image=story_img(r["title"]))
            for r in projects
        ]

        # ---------- per-PT details ----------
        mo_by_pt: dict[str, dict[int, dict]] = {}
        for r in ptm:
            mo_by_pt.setdefault(r["pt_code"], {})[r["month_start"].month] = r

        pt_details = []
        for code, _ in sorted(pts.items(), key=lambda x: -x[1]):
            s_rows = [r for r in streams if r["pt_code"] == code]
            s_top = sorted(s_rows, key=lambda x: -fy(x, "gen"))[:4]
            s_gen = sum(fy(r, "gen") for r in s_rows)
            s_util = sum(fy(r, "util") for r in s_rows)
            s_pot = sum(fy(r, "pot") for r in s_rows)
            ptm_rows = mo_by_pt.get(code, {})
            pt_details.append(PtWaste(
                pt=code, letter=code[0], color=pt_colors.get(code, "#94a3b8"),
                waste=round(s_gen), util=round(s_util / s_gen * 100) if s_gen else 0,
                rev=round(s_pot / 1e6, 1),
                streams=[
                    WasteStream(name=r["waste_type"], volume=round(fy(r, "gen")),
                                util=round(fy(r, "util") / fy(r, "gen") * 100) if fy(r, "gen") else 0,
                                rev=round(fy(r, "pot") / 1e6, 1))
                    for r in s_top
                ],
                monthly=[round(fy(ptm_rows.get(mo_i), "gen") / 1000, 1) for mo_i in range(1, mm + 1)],
                monthly_util=[
                    round(fy(ptm_rows.get(mo_i), "util") / fy(ptm_rows.get(mo_i), "gen") * 100)
                    if fy(ptm_rows.get(mo_i), "gen") else 0
                    for mo_i in range(1, mm + 1)
                ],
            ))

        # ---------- key insights + next steps (data-driven) ----------
        key_insights: list[InsightItem] = []
        next_actions: list[str] = []

        tgt_pct = fy(holding, "target_utilization_pct")
        if tgt_pct:
            ok = util_pct >= tgt_pct
            key_insights.append(InsightItem(
                kind="check" if ok else "warn",
                text=f"Utilisasi holding {year} YTD {util_pct:.1f}% — "
                     f"{'di atas' if ok else 'di bawah'} target {tgt_pct:.0f}% "
                     f"(progress {fy(holding, 'progress_to_2030_pct'):.0f}% menuju 2030)."))
        if pts:
            top_pt, top_v = max(pts.items(), key=lambda x: x[1])
            share = top_v / tot * 100 if tot else 0.0
            key_insights.append(InsightItem(
                kind="check",
                text=f"{top_pt} mendominasi {share:.0f}% total waste generated holding ({top_v / 1000:,.0f} kt)."))
        if util_rings:
            worst = min(util_rings, key=lambda r: r.pct)
            key_insights.append(InsightItem(
                kind="warn",
                text=f"Utilisasi {worst.pt} terendah ({worst.pct}%) — gap utama menuju target holding."))
        if gap_pareto:
            g0 = gap_pareto[0]
            key_insights.append(InsightItem(
                kind="warn",
                text=f"Quality gate: '{g0.name}' gagalkan {g0.value:,.0f} kt waste — mitigasi pre-treatment diperlukan."))
        if pt_realize:
            wr = min(pt_realize, key=lambda r: r.rea / r.pot if r.pot else 1.0)
            if wr.pot:
                pct_r = wr.rea / wr.pot * 100
                if pct_r < 85:
                    key_insights.append(InsightItem(
                        kind="warn",
                        text=f"Realisasi nilai {wr.name} baru {pct_r:.0f}% — gap USD {wr.pot - wr.rea:.1f} jt."))
        if top_opps:
            o0 = top_opps[0]
            key_insights.append(InsightItem(
                kind="check",
                text=f"Peluang revenue terbesar: '{o0.opp}' ({o0.pt}) — USD {o0.rev} jt/tahun."))

        if top_opps:
            o0 = top_opps[0]
            next_actions.append(
                f"Prioritaskan studi kelayakan '{o0.opp}' di {o0.pt} (USD {o0.rev}M/tahun).")
        if gap_pareto:
            next_actions.append(
                f"Kurangi kegagalan '{gap_pareto[0].name}' via pre-treatment / drying program.")
        if util_rings:
            worst = min(util_rings, key=lambda r: r.pct)
            next_actions.append(
                f"Scale up route utilisasi {worst.pt} (saat ini {worst.pct}% — terendah holding).")
        if pt_realize:
            wr = min(pt_realize, key=lambda r: r.rea / r.pot if r.pot else 1.0)
            if wr.pot and wr.rea / wr.pot < 0.85:
                next_actions.append(
                    f"Percepat monetisasi {wr.name} — realisasi baru USD {wr.rea}M dari {wr.pot}M.")

        return WasteData(
            generated_at=datetime.now().isoformat(timespec="seconds"),
            source=self.name,
            periods=[f"Jan {y} – Dec {y}" for y in years],
            kpis=kpis,
            trend=trend,
            util_rings=util_rings,
            sites=waste_sites,
            pt_colors=pt_colors,
            ai_items=[AiItem(title=i.title, body=i.body) for i in mock.ai_items],
            ai_generated_at=mock.ai_generated_at,
            comp_sets=comp_sets,
            rev_bars=rev_bars,
            gap_pareto=gap_pareto,
            pt_realize=pt_realize,
            top_opps=top_opps,
            stories=stories,
            pt_details=pt_details,
            key_insights=key_insights,
            next_actions=next_actions,
        )
