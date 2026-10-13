"""Temp check: columns of downtime + cost tables."""
from app.data.snowflake import SnowflakeProvider

p = SnowflakeProvider()
for t in ["DM_HPL_DOWNTIME_MONTHLY", "DM_HPL_COST_REVENUE_MONTHLY", "DM_HPL_ACHIEVEMENT_PT_MONTHLY"]:
    rows = p._rows(f"DESCRIBE TABLE MIND_DEMO.GOLD.{t}")
    print(f"--- {t} ---")
    print("  " + ", ".join(r["name"] for r in rows))
