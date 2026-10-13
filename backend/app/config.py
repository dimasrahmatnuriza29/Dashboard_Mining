from __future__ import annotations

import os
from dataclasses import dataclass

from dotenv import load_dotenv

load_dotenv()


@dataclass(frozen=True)
class Settings:
    # Provider switch: "mock" | "snowflake" — the single seam between
    # synthetic data and real Snowflake views.
    data_provider: str = os.getenv("DATA_PROVIDER", "mock").lower()
    frontend_origin: str = os.getenv("FRONTEND_ORIGIN", "http://localhost:5173")

    sf_account: str = os.getenv("SNOWFLAKE_ACCOUNT", "")
    sf_user: str = os.getenv("SNOWFLAKE_USER", "")
    sf_password: str = os.getenv("SNOWFLAKE_PASSWORD", "")
    sf_role: str = os.getenv("SNOWFLAKE_ROLE", "")
    sf_warehouse: str = os.getenv("SNOWFLAKE_WAREHOUSE", "")
    sf_database: str = os.getenv("SNOWFLAKE_DATABASE", "")
    sf_schema: str = os.getenv("SNOWFLAKE_SCHEMA", "ANALYTICS")

    openrouter_api_key: str = os.getenv("OPENROUTER_API_KEY", "")
    chat_model: str = os.getenv("CHAT_MODEL", "")


settings = Settings()
