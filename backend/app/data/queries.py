"""SQL for the presentation layer — mapped to MIND_DEMO.GOLD.

The marts are pre-aggregated upstream (medallion: BRONZE→SILVER→GOLD);
dashboard stays READ-ONLY. Only tonnage-family units are summed —
KG rows (silver) are excluded so units never mix.
"""

from app.config import settings

GOLD = f'"{settings.sf_database or "MIND_DEMO"}"."{settings.sf_schema or "GOLD"}"'

T_MONTHLY = f"{GOLD}.DM_HPL_PRODUCTION_MONTHLY"
T_FORECAST = f"{GOLD}.DM_HPL_PRODUCTION_FORECAST"
T_FCST_VS_TARGET = f"{GOLD}.DM_HPL_FORECAST_VS_TARGET"
T_DOWNTIME = f"{GOLD}.DM_HPL_DOWNTIME_MONTHLY"
T_COST_REV = f"{GOLD}.DM_HPL_COST_REVENUE_MONTHLY"
T_ACHIEVE = f"{GOLD}.DM_HPL_ACHIEVEMENT_PT_MONTHLY"
T_DIM_PT = f"{GOLD}.DM_HPL_DIM_PT"

TON_UNITS = "('WMT','TON','MTON','TON SN','TO','TNI','T','TONS','TONNE','TONNES')"

# Latest month that actually has data — the monthly table carries
# NULL-actual placeholder rows for future months.
LATEST_ACTUAL = f"(SELECT MAX(MONTH_START) FROM {T_MONTHLY} WHERE ACTUAL_QTY IS NOT NULL)"


def _pf(col: str, pt: str | None) -> str:
    """PT filter fragment — emits `AND col = 'pt'` only when a PT is selected."""
    return f"AND {col} = '{pt}'" if pt else ""


def _anchor(asof: str | None, fallback: str = LATEST_ACTUAL) -> str:
    """Anchor month — explicit 'YYYY-MM' becomes a date literal; default = latest actual."""
    return f"DATE '{asof}-01'" if asof else fallback

# Actual monthly totals (last 9 months) then forecast months — one ordered
# series; the provider bridges the last actual point into the forecast line.
# target/gap: past target from MONTHLY, future target+gap from FVT.
TREND_SQL = f"""
WITH actual AS (
  SELECT MONTH_START AS d, SUM(ACTUAL_QTY) AS qty, SUM(TARGET_QTY) AS tgt
  FROM {T_MONTHLY}
  WHERE UNIT IN {TON_UNITS}
    AND MONTH_START >= DATEADD(month, -9, {LATEST_ACTUAL})
    AND ACTUAL_QTY IS NOT NULL
  GROUP BY MONTH_START
),
fc AS (
  SELECT FORECAST_DATE AS d,
         SUM(FORECAST_QTY) AS qty,
         SUM(LOWER_BOUND)  AS lo,
         SUM(UPPER_BOUND)  AS hi
  FROM {T_FORECAST}
  WHERE UNIT IN {TON_UNITS}
  GROUP BY FORECAST_DATE
),
fvt AS (
  SELECT MONTH_START AS d,
         SUM(TARGET_QTY)        AS tgt,
         SUM(EXPECTED_GAP_QTY)  AS gap
  FROM {T_FCST_VS_TARGET}
  WHERE UNIT IN {TON_UNITS}
  GROUP BY MONTH_START
)
SELECT a.d AS date, a.qty AS actual_t, NULL AS forecast_t,
       NULL AS forecast_lo_t, NULL AS forecast_hi_t,
       a.tgt AS target_t, NULL AS gap_t
FROM actual a
UNION ALL
SELECT fc.d, NULL, fc.qty, fc.lo, fc.hi, fvt.tgt, fvt.gap
FROM fc LEFT JOIN fvt ON fvt.d = fc.d
ORDER BY date
"""

# Same series at PT × commodity grain — powers the trend panel filters.
# Includes non-tonnage units on purpose: a single commodity is never mixed.
TREND_DIM_SQL = f"""
WITH actual AS (
  SELECT PT_CODE AS pt, COMMODITY AS com, UNIT, MONTH_START AS d,
         SUM(ACTUAL_QTY) AS qty, SUM(TARGET_QTY) AS tgt
  FROM {T_MONTHLY}
  WHERE MONTH_START >= DATEADD(month, -9, {LATEST_ACTUAL})
    AND ACTUAL_QTY IS NOT NULL
  GROUP BY 1, 2, 3, 4
),
fc AS (
  SELECT f.PT_CODE AS pt, f.COMMODITY AS com, f.UNIT, f.FORECAST_DATE AS d,
         SUM(f.FORECAST_QTY) AS qty,
         SUM(f.LOWER_BOUND)  AS lo,
         SUM(f.UPPER_BOUND)  AS hi
  FROM {T_FORECAST} f
  GROUP BY 1, 2, 3, 4
),
fvt AS (
  SELECT PT_CODE AS pt, COMMODITY AS com, MONTH_START AS d,
         SUM(TARGET_QTY)       AS tgt,
         SUM(EXPECTED_GAP_QTY) AS gap
  FROM {T_FCST_VS_TARGET}
  GROUP BY 1, 2, 3
)
SELECT a.pt, a.com, a.UNIT AS unit, a.d AS date,
       a.qty AS actual_t, NULL AS forecast_t,
       NULL AS forecast_lo_t, NULL AS forecast_hi_t,
       a.tgt AS target_t, NULL AS gap_t
FROM actual a
UNION ALL
SELECT fc.pt, fc.com, fc.UNIT, fc.d, NULL, fc.qty, fc.lo, fc.hi,
       fvt.tgt, fvt.gap
FROM fc LEFT JOIN fvt ON fvt.pt = fc.pt AND fvt.com = fc.com AND fvt.d = fc.d
ORDER BY pt, com, date
"""

# Donut: production share by commodity, last 12 months.
def composition_sql(pt: str | None = None, asof: str | None = None) -> str:
    anchor = _anchor(asof)
    return f"""
WITH base AS (
  SELECT COMMODITY AS name, SUM(ACTUAL_QTY) AS qty
  FROM {T_MONTHLY}
  WHERE UNIT IN {TON_UNITS}
    AND MONTH_START >= DATEADD(month, -12, {anchor})
    AND ACTUAL_QTY IS NOT NULL
    {_pf('PT_CODE', pt)}
  GROUP BY COMMODITY
  HAVING SUM(ACTUAL_QTY) IS NOT NULL
)
SELECT name, ROUND(100 * qty / SUM(qty) OVER (), 1) AS value
FROM base
ORDER BY value DESC
"""

# Site summary: latest-month actual, target achievement, downtime hours,
# forecast gap (aggregated to PT level), status derived from achievement.
def site_summary_sql(pt: str | None = None, asof: str | None = None) -> str:
    anchor = _anchor(asof)
    return f"""
WITH mx AS (SELECT {anchor} AS m),
prod AS (
  SELECT m.SITE_ID, m.PT_CODE,
         SUM(m.ACTUAL_QTY) AS prod,
         SUM(m.TARGET_QTY) AS tgt
  FROM {T_MONTHLY} m JOIN mx ON m.MONTH_START = mx.m
  WHERE m.UNIT IN {TON_UNITS}
    {_pf('m.PT_CODE', pt)}
  GROUP BY m.SITE_ID, m.PT_CODE
  HAVING SUM(m.ACTUAL_QTY) IS NOT NULL
),
dt AS (
  SELECT d.SITE_ID,
         SUM(IFF(d.MONTH_START = mx.m, d.DOWNTIME_HOURS, 0)) AS downtime_h,
         AVG(d.DOWNTIME_HOURS) AS downtime_avg_h
  FROM {T_DOWNTIME} d
  JOIN mx ON d.MONTH_START > DATEADD(month, -6, mx.m) AND d.MONTH_START <= mx.m
  GROUP BY d.SITE_ID
),
com AS (
  SELECT SITE_ID, COMMODITY
  FROM {T_MONTHLY} m JOIN mx ON m.MONTH_START = mx.m
  WHERE m.UNIT IN {TON_UNITS}
  GROUP BY SITE_ID, COMMODITY
  QUALIFY ROW_NUMBER() OVER (PARTITION BY SITE_ID ORDER BY SUM(ACTUAL_QTY) DESC) = 1
),
fc AS (
  SELECT PT_CODE,
         ROUND(100 * (SUM(FORECAST_QTY) - SUM(TARGET_QTY))
               / NULLIF(SUM(TARGET_QTY), 0), 1) AS fc_delta
  FROM {T_FCST_VS_TARGET}
  WHERE UNIT IN {TON_UNITS}
  GROUP BY PT_CODE
)
SELECT p.PT_CODE || ' · ' || p.SITE_ID AS site,
       com.COMMODITY           AS commodity,
       ROUND(p.prod, 0)          AS production_t,
       ROUND(100 * p.prod / NULLIF(p.tgt, 0), 1) AS achievement_pct,
       ROUND(COALESCE(dt.downtime_h, 0), 1)      AS downtime_h,
       ROUND(dt.downtime_avg_h, 1)               AS downtime_avg_h,
       COALESCE(fc.fc_delta, 0)  AS forecast_delta_pct,
       CASE
         WHEN p.tgt IS NULL OR p.tgt = 0           THEN 'Watch'
         WHEN 100 * p.prod / p.tgt >= 110          THEN 'Ahead'
         WHEN 100 * p.prod / p.tgt >= 95           THEN 'On Track'
         WHEN 100 * p.prod / p.tgt >= 85           THEN 'Watch'
         ELSE 'Behind'
       END AS status
FROM prod p
LEFT JOIN dt ON dt.SITE_ID = p.SITE_ID
LEFT JOIN com ON com.SITE_ID = p.SITE_ID
LEFT JOIN fc ON fc.PT_CODE = p.PT_CODE
ORDER BY p.PT_CODE, production_t DESC NULLS LAST
"""

# KPI series: one row per metric × month (12 months back).
# Provider picks latest value + MoM delta + sparkline per metric.
def kpi_sql(pt: str | None = None, asof: str | None = None) -> str:
    anchor = _anchor(asof)
    return f"""
WITH mx AS (SELECT {anchor} AS m),
prod AS (
  SELECT 'production' AS id, 'Production (t)' AS label,
         MONTH_START AS mo, SUM(ACTUAL_QTY) AS v
  FROM {T_MONTHLY}
  WHERE UNIT IN {TON_UNITS}
    {_pf('PT_CODE', pt)}
    AND MONTH_START >= DATEADD(month, -12, (SELECT m FROM mx))
    AND MONTH_START <= (SELECT m FROM mx)
    AND ACTUAL_QTY IS NOT NULL
  GROUP BY MONTH_START
),
ytd AS (
  SELECT 'ytd' AS id, 'YTD Achievement' AS label,
         MONTH_START AS mo,
         100 * SUM(ACTUAL_QTY) / NULLIF(SUM(TARGET_QTY), 0) AS v
  FROM {T_ACHIEVE}
  WHERE MONTH_START >= DATEADD(month, -12, (SELECT m FROM mx))
    AND MONTH_START <= (SELECT m FROM mx)
    {_pf('PT_CODE', pt)}
  GROUP BY MONTH_START
),
dt AS (
  SELECT 'downtime' AS id, 'Downtime (h)' AS label,
         MONTH_START AS mo, SUM(DOWNTIME_HOURS) AS v
  FROM {T_DOWNTIME}
  WHERE MONTH_START >= DATEADD(month, -12, (SELECT m FROM mx))
    AND MONTH_START <= (SELECT m FROM mx)
    {_pf('PT_CODE', pt)}
  GROUP BY MONTH_START
),
cost AS (
  SELECT 'cost' AS id, 'Energy Cost / t' AS label,
         MONTH_START AS mo,
         SUM(ENERGY_COST_IDR) / NULLIF(SUM(PRODUCTION_QTY), 0) AS v
  FROM {T_COST_REV}
  WHERE PRODUCTION_UNIT IN {TON_UNITS}
    {_pf('PT_CODE', pt)}
    AND MONTH_START >= DATEADD(month, -12, (SELECT m FROM mx))
    AND MONTH_START <= (SELECT m FROM mx)
  GROUP BY MONTH_START
)
SELECT * FROM prod
UNION ALL SELECT * FROM ytd
UNION ALL SELECT * FROM dt
UNION ALL SELECT * FROM cost
ORDER BY id, mo
"""

# Gauge: weighted YTD achievement across all PT/commodity rows
# at the latest month (units never mix — ratio per row, then weighted).
def ytd_sql(pt: str | None = None, asof: str | None = None) -> str:
    anchor = _anchor(asof, f"(SELECT MAX(MONTH_START) FROM {T_ACHIEVE} WHERE YTD_ACTUAL_QTY IS NOT NULL)")
    return f"""
SELECT ROUND(100 * SUM(YTD_ACTUAL_QTY) / NULLIF(SUM(YTD_TARGET_QTY), 0), 1) AS achievement_pct
FROM {T_ACHIEVE}
WHERE MONTH_START = {anchor}
  {_pf('PT_CODE', pt)}
"""
