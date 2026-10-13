"""Snowflake connection & schema inspector for the MindID POC.

Run from backend/ with the venv active:

    python inspect_snowflake.py            # connect + list databases/schemas/tables
    python inspect_snowflake.py --sample   # also dump 3 rows per table/view

Reads SNOWFLAKE_* vars from .env (see .env.example).
Nothing here writes to Snowflake — read-only metadata + SELECT * LIMIT 3.
"""

from __future__ import annotations

import sys

from app.config import settings


def main() -> int:
    sample = "--sample" in sys.argv

    if not (settings.sf_account and settings.sf_user and settings.sf_password):
        print("SNOWFLAKE_ACCOUNT / _USER / _PASSWORD belum diisi di .env")
        return 1

    import snowflake.connector  # noqa: E402 — keep import error isolated

    print(f"Connecting to {settings.sf_account} as {settings.sf_user} ...")
    try:
        conn = snowflake.connector.connect(
            account=settings.sf_account,
            user=settings.sf_user,
            password=settings.sf_password,
            role=settings.sf_role or None,
            warehouse=settings.sf_warehouse or None,
            database=settings.sf_database or None,
            schema=settings.sf_schema or None,
        )
    except Exception as exc:
        print(f"CONNECTION FAILED: {exc}")
        return 1

    cur = conn.cursor()

    def q(sql: str) -> list[tuple]:
        cur.execute(sql)
        return cur.fetchall()

    row = q(
        "SELECT CURRENT_USER(), CURRENT_ROLE(), CURRENT_WAREHOUSE(), "
        "CURRENT_DATABASE(), CURRENT_SCHEMA(), CURRENT_VERSION()"
    )[0]
    print("\n=== CONNECTION OK ===")
    print(f"  user={row[0]}  role={row[1]}  warehouse={row[2]}")
    print(f"  database={row[3]}  schema={row[4]}  snowflake={row[5]}")

    # warehouses — a warehouse is required for queries to run
    try:
        whs = [r[0] for r in q("SHOW WAREHOUSES")]
        print(f"\n=== WAREHOUSES ===\n  {', '.join(whs)}")
    except Exception as exc:
        print(f"\n=== WAREHOUSES === (cannot list: {exc})")

    # pick database
    dbs = [r[1] for r in q("SHOW DATABASES")]
    print(f"\n=== DATABASES ===\n  {', '.join(dbs)}")
    system_dbs = {"SNOWFLAKE", "SNOWFLAKE_LEARNING_DB", "SNOWFLAKE_SAMPLE_DATA"}
    user_dbs = [d for d in dbs if d.upper() not in system_dbs and not d.startswith("USER$")]
    db = settings.sf_database
    if db and db.upper() not in {d.upper() for d in dbs}:
        print(f"\nSNOWFLAKE_DATABASE={db} not visible — auto-fallback")
        db = None
    if not db:
        db = user_dbs[0] if user_dbs else (dbs[0] if dbs else None)
    if not db:
        print("No database visible — check role privileges.")
        return 1
    print(f"\nUsing database: {db}")

    # schemas
    schemas = [r[1] for r in q(f'SHOW SCHEMAS IN DATABASE "{db}"')]
    print(f"\n=== SCHEMAS in {db} ===\n  {', '.join(schemas)}")

    # --schema NAME limits --sample dumping to one schema
    schema_filter = ""
    if "--schema" in sys.argv:
        schema_filter = sys.argv[sys.argv.index("--schema") + 1].upper()

    # tables/views per schema
    for sch in schemas:
        if schema_filter and sch.upper() != schema_filter:
            continue
        print(f"\n=== {db}.{sch} ===")
        try:
            tables = q(f'SHOW TABLES IN SCHEMA "{db}"."{sch}"')
            views = q(f'SHOW VIEWS IN SCHEMA "{db}"."{sch}"')
        except Exception as exc:
            print(f"  (cannot list: {exc})")
            continue
        for t in tables:      # SHOW TABLES: row[1]=name, row[5]=rows
            print(f"  TABLE {t[1]}  (~{t[5]} rows)")
        for v in views:       # SHOW VIEWS: row[1]=name
            print(f"  VIEW  {v[1]}")

        if sample:
            for name in [t[1] for t in tables] + [v[1] for v in views]:
                print(f"  --- sample {sch}.{name} ---")
                try:
                    cur.execute(f'SELECT * FROM "{db}"."{sch}"."{name}" LIMIT 3')
                    cols = [c[0] for c in cur.description]
                    print(f"    cols: {', '.join(cols)}")
                    for r in cur.fetchall():
                        print(f"    {r}")
                except Exception as exc:
                    print(f"    (cannot select: {exc})")

    cur.close()
    conn.close()
    print("\nDone. Share this output so queries.py can be mapped to the real schema.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
