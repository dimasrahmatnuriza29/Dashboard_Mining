from __future__ import annotations

import logging
from functools import lru_cache

from app.config import settings
from app.data.base import DataProvider
from app.data.mock import MockProvider

log = logging.getLogger(__name__)


@lru_cache
def get_provider() -> DataProvider:
    """Single seam for the presentation layer.

    Flip DATA_PROVIDER=snowflake in .env when the real schema is ready.
    Falls back to mock if Snowflake can't be reached.
    """
    if settings.data_provider == "snowflake":
        try:
            from app.data.snowflake import SnowflakeProvider

            return SnowflakeProvider()
        except Exception as exc:  # connector missing / bad creds
            log.warning("Snowflake provider unavailable (%s) — using mock", exc)
    return MockProvider()
