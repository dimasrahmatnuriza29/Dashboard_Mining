"""SQL for the Production Intelligence page — MIND_DEMO.GOLD (DM_HPL_* views).

Conventions:
- KPI_MONTHLY.PRODUCTION_TON is already unit-normalized, so it is used for
  every aggregated tonnage (actuals, targets, PT totals).
- PRODUCTION_FORECAST.FORECAST_QTY is native-unit → converted to tons with
  UNIT_TON_FACTOR before aggregation.
- "Actual" months = months before the forecast boundary (MIN FORECAST_DATE
  of the latest RUN_AT). Forecast months = boundary..Dec.
"""

# ton-equivalent factor for native commodity units in FORECAST/PROD tables
UNIT_TON_FACTOR = (
    "CASE WHEN UNIT = 'KG' THEN 0.001 ELSE 1.0 END"
)


def _pt(pt: str | None) -> str:
    """Optional PT_CODE predicate fragment."""
    return f"AND PT_CODE = '{pt}'" if pt else ""

# ---------- context ----------

FC_BOUNDARY_SQL = """
SELECT MIN(DATE_TRUNC('month', FORECAST_DATE)) AS fc_start
FROM DM_HPL_PRODUCTION_FORECAST
WHERE RUN_AT = (SELECT MAX(RUN_AT) FROM DM_HPL_PRODUCTION_FORECAST)
"""

# ---------- KPI row ----------

def kpi_ytd_sql(year: int, before: str, pt: str | None = None) -> str:
    """YTD KPI totals for a year up to (excl.) the forecast boundary month."""
    return f"""
SELECT
    SUM(PRODUCTION_TON)                              AS production_ton,
    SUM(TARGET_TON)                                  AS target_ton,
    SUM(REVENUE_USD)                                 AS revenue_usd,
    SUM(OPERATIONAL_COST_USD)                        AS cost_usd,
    AVG(UNPLANNED_DOWNTIME_PCT)                      AS downtime_pct,
    SUM(CO2_TON) / NULLIF(SUM(PRODUCTION_TON), 0)    AS co2_intensity
FROM DM_HPL_KPI_MONTHLY
WHERE YEAR(MONTH_START) = {year}
  AND MONTH_START < DATE '{before}'
  {_pt(pt)}
"""

# ---------- trend + forecast badge ----------

def actual_monthly_sql(year: int, before: str, pt: str | None = None) -> str:
    return f"""
SELECT MONTH_START, SUM(PRODUCTION_TON) AS production_ton
FROM DM_HPL_KPI_MONTHLY
WHERE YEAR(MONTH_START) = {year}
  AND MONTH_START < DATE '{before}'
  {_pt(pt)}
GROUP BY MONTH_START
ORDER BY MONTH_START
"""

def forecast_monthly_sql(year: int, pt: str | None = None) -> str:
    return f"""
SELECT DATE_TRUNC('month', FORECAST_DATE) AS month_start,
       SUM(FORECAST_QTY * {UNIT_TON_FACTOR}) AS production_ton
FROM DM_HPL_PRODUCTION_FORECAST
WHERE RUN_AT = (SELECT MAX(RUN_AT) FROM DM_HPL_PRODUCTION_FORECAST)
  AND YEAR(FORECAST_DATE) = {year}
  {_pt(pt)}
GROUP BY 1
ORDER BY 1
"""

def trend_dim_actual_sql(year: int, before: str, pt: str | None = None) -> str:
    """Actual + target per PT×commodity per month — native units.
    Uses PRODUCTION_MONTHLY (full commodity coverage incl. GOLD ORE,
    LEACH FEED, BAUXITE); ACHIEVEMENT_PT_MONTHLY only carries the 6
    targeted commodities per PT."""
    return f"""
SELECT MONTH_START, PT_CODE, COMMODITY, UNIT,
       SUM(ACTUAL_QTY) AS actual_qty, SUM(TARGET_QTY) AS target_qty
FROM DM_HPL_PRODUCTION_MONTHLY
WHERE YEAR(MONTH_START) = {year}
  AND MONTH_START < DATE '{before}'
  {_pt(pt)}
GROUP BY MONTH_START, PT_CODE, COMMODITY, UNIT
ORDER BY MONTH_START
"""

def trend_dim_forecast_sql(year: int, pt: str | None = None) -> str:
    """Forecast per PT×commodity per month — native units, latest run."""
    return f"""
SELECT DATE_TRUNC('month', FORECAST_DATE) AS month_start,
       PT_CODE, COMMODITY, UNIT,
       SUM(FORECAST_QTY) AS forecast_qty
FROM DM_HPL_PRODUCTION_FORECAST
WHERE RUN_AT = (SELECT MAX(RUN_AT) FROM DM_HPL_PRODUCTION_FORECAST)
  AND YEAR(FORECAST_DATE) = {year}
  {_pt(pt)}
GROUP BY 1, 2, 3, 4
ORDER BY 1
"""

def trend_dim_target_sql(year: int, after: str, pt: str | None = None) -> str:
    """Forecast-month targets per PT×commodity from FORECAST_VS_TARGET."""
    return f"""
SELECT PT_CODE, COMMODITY, UNIT, SUM(TARGET_QTY) AS target_qty
FROM DM_HPL_FORECAST_VS_TARGET
WHERE YEAR(MONTH_START) = {year}
  AND MONTH_START >= DATE '{after}'
  {_pt(pt)}
GROUP BY PT_CODE, COMMODITY, UNIT
"""

def forecast_target_sql(year: int, after: str, pt: str | None = None) -> str:
    """Target for the forecast months from FORECAST_VS_TARGET (KPI_MONTHLY
    has no targets beyond actuals)."""
    return f"""
SELECT SUM(TARGET_QTY * {UNIT_TON_FACTOR})   AS target_ton,
       SUM(FORECAST_QTY * {UNIT_TON_FACTOR}) AS forecast_ton
FROM DM_HPL_FORECAST_VS_TARGET
WHERE YEAR(MONTH_START) = {year}
  AND MONTH_START >= DATE '{after}'
  {_pt(pt)}
"""

# ---------- donut: commodity group share ----------

def commodity_share_sql(year: int, before: str) -> str:
    return f"""
SELECT COMMODITY_GROUP, SUM(PRODUCTION_TON) AS production_ton
FROM DM_HPL_COMMODITY_GROUP_MONTHLY
WHERE YEAR(MONTH_START) = {year}
  AND MONTH_START < DATE '{before}'
GROUP BY COMMODITY_GROUP
"""

# ---------- PT table (YTD actual vs plan) ----------

def pt_ytd_sql(year: int, before: str) -> str:
    return f"""
SELECT
    k.PT_CODE,
    d.PT_NAME,
    SUM(k.PRODUCTION_TON)   AS actual_ton,
    SUM(k.TARGET_TON)       AS target_ton,
    SUM(k.REVENUE_USD)      AS revenue_usd
FROM DM_HPL_KPI_MONTHLY k
LEFT JOIN DM_HPL_DIM_PT d ON d.PT_CODE = k.PT_CODE
WHERE YEAR(k.MONTH_START) = {year}
  AND k.MONTH_START < DATE '{before}'
GROUP BY k.PT_CODE, d.PT_NAME
ORDER BY actual_ton DESC
"""

# ---------- sites: map + top-5 ----------

def dim_sites_sql(pt: str | None = None) -> str:
    return f"""
SELECT s.SITE_NAME, s.PT_CODE, d.PT_NAME, s.LONGITUDE, s.LATITUDE
FROM DM_HPL_DIM_SITE s
LEFT JOIN DM_HPL_DIM_PT d ON d.PT_CODE = s.PT_CODE
WHERE s.LONGITUDE IS NOT NULL AND s.LATITUDE IS NOT NULL
  {f"AND s.PT_CODE = '{pt}'" if pt else ""}
"""

def site_monthly_sql(year: int, before: str, pt: str | None = None) -> str:
    return f"""
SELECT MONTH_START, PT_CODE, SITE_NAME, PRODUCTION_TON, VS_LAST_YEAR_PCT
FROM DM_HPL_SITE_MONTHLY
WHERE YEAR(MONTH_START) = {year}
  AND MONTH_START < DATE '{before}'
  {_pt(pt)}
"""

# ---------- market prices ----------

MARKET_SQL = """
SELECT BENCHMARK, UNIT, PRICE_USD, CHANGE_30D_PCT
FROM DM_HPL_MARKET_PRICE_DAILY
QUALIFY ROW_NUMBER() OVER (PARTITION BY BENCHMARK ORDER BY PRICE_DATE DESC) = 1
"""

# =====================================================================
# Zero Waste Intelligence — DM_ZWI_* (MIND_DEMO.GOLD)
# =====================================================================

WASTE_YEARS_SQL = """
SELECT DISTINCT YEAR(MONTH_START) AS y
FROM DM_ZWI_WASTE_MONTHLY
ORDER BY y DESC
"""


def waste_mm_sql(year: int) -> str:
    """Latest month with data inside `year` (2026 = YTD window)."""
    return f"""
SELECT MAX(MONTH(MONTH_START)) AS mm
FROM DM_ZWI_WASTE_MONTHLY
WHERE YEAR(MONTH_START) = {year}
"""


def _mmo(mm: int) -> str:
    """Month-window predicate: months 1..mm — apples-to-apples YoY."""
    return f"AND MONTH(MONTH_START) <= {mm}" if mm < 12 else ""


def waste_ytd_sql(y0: int, y1: int, mm: int) -> str:
    """YTD aggregates for the two boundary years — KPI values + YoY deltas."""
    return f"""
SELECT YEAR(MONTH_START)              AS y,
       SUM(GENERATED_TON)             AS gen_ton,
       SUM(UTILIZED_TON)              AS util_ton,
       SUM(LANDFILL_TON)              AS lfill_ton,
       SUM(POTENTIAL_VALUE_USD)       AS pot_usd,
       SUM(UTILIZED_VALUE_USD)        AS rea_usd,
       SUM(UNTAPPED_VALUE_USD)        AS unt_usd,
       SUM(CO2E_AVOIDED_TON)          AS co2_ton
FROM DM_ZWI_WASTE_MONTHLY
WHERE YEAR(MONTH_START) IN ({y0}, {y1})
  {_mmo(mm)}
GROUP BY 1
"""


def waste_monthly_sql(y0: int, y1: int) -> str:
    """Holding-level monthly totals across two years — trend + sparks."""
    return f"""
SELECT MONTH_START, SUM(GENERATED_TON) gen, SUM(UTILIZED_TON) util,
       SUM(LANDFILL_TON) lfill, SUM(POTENTIAL_VALUE_USD) pot,
       SUM(CO2E_AVOIDED_TON) co2
FROM DM_ZWI_WASTE_MONTHLY
WHERE YEAR(MONTH_START) IN ({y0}, {y1})
GROUP BY MONTH_START
ORDER BY MONTH_START
"""


def waste_pt_monthly_sql(year: int) -> str:
    """Per-PT monthly generated/utilized — pt_details charts."""
    return f"""
SELECT PT_CODE, MONTH_START, SUM(GENERATED_TON) gen, SUM(UTILIZED_TON) util
FROM DM_ZWI_WASTE_MONTHLY
WHERE YEAR(MONTH_START) = {year}
GROUP BY PT_CODE, MONTH_START
"""


def waste_target_sql(y0: int, y1: int) -> str:
    """Utilization target/progress incl. HOLDING row — rings + ZW KPI."""
    return f"""
SELECT YEAR, PT_CODE, GENERATED_TON, UTILIZED_TON, ACTUAL_UTILIZATION_PCT,
       TARGET_UTILIZATION_PCT, TARGET_2030_PCT, PROGRESS_TO_2030_PCT,
       MONTHS_WITH_DATA
FROM DM_ZWI_TARGET_PROGRESS
WHERE YEAR IN ({y0}, {y1})
"""


def waste_sites_sql(year: int) -> str:
    """Sites with waste data this year — map pins sized by tonnage."""
    return f"""
SELECT SITE_NAME, PT_CODE,
       MAX(LATITUDE) AS lat, MAX(LONGITUDE) AS lon,
       SUM(GENERATED_TON) AS gen
FROM DM_ZWI_WASTE_MONTHLY
WHERE YEAR(MONTH_START) = {year}
  AND LATITUDE IS NOT NULL AND LONGITUDE IS NOT NULL
GROUP BY SITE_NAME, PT_CODE
ORDER BY gen DESC
"""


def waste_type_sql(year: int, mm: int) -> str:
    """WASTE_GROUP × WASTE_TYPE — holding donut, commodity donut, rev bars."""
    return f"""
SELECT WASTE_GROUP, WASTE_TYPE,
       SUM(GENERATED_TON)       AS gen,
       SUM(UTILIZED_TON)        AS util,
       SUM(POTENTIAL_VALUE_USD) AS pot,
       SUM(UNTAPPED_VALUE_USD)  AS unt
FROM DM_ZWI_WASTE_MONTHLY
WHERE YEAR(MONTH_START) = {year}
  {_mmo(mm)}
GROUP BY WASTE_GROUP, WASTE_TYPE
ORDER BY gen DESC
"""


def waste_pt_stream_sql(year: int, mm: int) -> str:
    """PT × WASTE_TYPE — By-PT donut + per-PT stream tables."""
    return f"""
SELECT PT_CODE, WASTE_TYPE,
       SUM(GENERATED_TON)       AS gen,
       SUM(UTILIZED_TON)        AS util,
       SUM(POTENTIAL_VALUE_USD) AS pot,
       SUM(UNTAPPED_VALUE_USD)  AS unt
FROM DM_ZWI_WASTE_MONTHLY
WHERE YEAR(MONTH_START) = {year}
  {_mmo(mm)}
GROUP BY PT_CODE, WASTE_TYPE
"""


WASTE_OPPS_SQL = """
SELECT OPPORTUNITY_NAME AS opp, PT_CODE, WASTE_TYPE,
       UNTAPPED_TON_PER_YEAR, POTENTIAL_REVENUE_USD_PER_YEAR AS rev_usd,
       STATUS, RANK_BY_VALUE AS rank
FROM DM_ZWI_OPPORTUNITY
ORDER BY RANK_BY_VALUE
"""

WASTE_PROJECTS_SQL = """
SELECT PT_CODE, SITE_NAME, TITLE, DESCRIPTION, STATUS,
       START_YEAR, VOLUME_TON_PER_YEAR, VALUE_USD, IS_SYNTHETIC
FROM DM_ZWI_PROJECT
ORDER BY IS_SYNTHETIC, START_YEAR
"""

# ---------- ML quality-gate — DM_ZWI_CLASSIFICATION_FACT_MONTHLY ----------


def waste_clf_type_sql(year: int, mm: int) -> str:
    """Potential vs realized USD per waste type — grouped revenue bars."""
    return f"""
SELECT WASTE_TYPE,
       SUM(POTENTIAL_USD) AS pot,
       SUM(REALIZED_USD)  AS rea
FROM DM_ZWI_CLASSIFICATION_FACT_MONTHLY
WHERE YEAR(MONTH_START) = {year}
  {_mmo(mm)}
GROUP BY WASTE_TYPE
ORDER BY pot DESC
"""


def waste_clf_gap_sql(year: int, mm: int) -> str:
    """Quality-gap reasons pareto — why waste fails ML classification."""
    return f"""
SELECT QUALITY_GAP_REASON AS reason, SUM(QUALITY_GAP_TON) AS gap_t
FROM DM_ZWI_CLASSIFICATION_FACT_MONTHLY
WHERE YEAR(MONTH_START) = {year}
  {_mmo(mm)}
  AND QUALITY_GAP_REASON IS NOT NULL AND QUALITY_GAP_REASON != ''
GROUP BY 1
ORDER BY gap_t DESC
LIMIT 8
"""


def waste_clf_pt_sql(year: int, mm: int) -> str:
    """Potential vs realized USD per PT — realized gap story."""
    return f"""
SELECT PT_CODE,
       SUM(POTENTIAL_USD) AS pot,
       SUM(REALIZED_USD)  AS rea
FROM DM_ZWI_CLASSIFICATION_FACT_MONTHLY
WHERE YEAR(MONTH_START) = {year}
  {_mmo(mm)}
GROUP BY PT_CODE
ORDER BY pot DESC
"""
