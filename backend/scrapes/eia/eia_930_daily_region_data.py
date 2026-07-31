"""EIA-930 daily region demand, forecast, generation, and interchange.

Source contract:
- Source system: EIA Open Data API v2, Hourly Electric Grid Monitor.
- Endpoint: /electricity/rto/daily-region-data
- Frequency: daily
- Raw grain: period x respondent x type x timezone
- Destination: eia.eia_930_daily_region_data
- Safe rerun: idempotent upsert on the source grain.

The public daily endpoint returns multiple timezone variants for each
period/respondent/type. Preserve timezone in the raw table; downstream
dashboard/API paths can select the preferred timezone per region.
"""

from __future__ import annotations

import logging
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from uuid import uuid4

import pandas as pd

from backend import credentials
from backend.scrapes.eia import client
from backend.utils import db, script_logging
from backend.utils.ops_logging import redact_secrets


API_SCRAPE_NAME = "eia_930_daily_region_data"
ROUTE = "electricity/rto/daily-region-data"
TARGET_DATABASE: str | None = None
TARGET_SCHEMA = "eia"
TARGET_TABLE = API_SCRAPE_NAME
TARGET_TABLE_FQN = f"{TARGET_SCHEMA}.{TARGET_TABLE}"
PRIMARY_KEY = ["period", "respondent", "type", "timezone"]
TARGET_COLUMNS = [
    "period",
    "respondent",
    "respondent_name",
    "type",
    "type_name",
    "timezone",
    "timezone_description",
    "value",
    "value_units",
    "scrape_run_at_utc",
]
TARGET_DATA_TYPES = [
    "DATE",
    "VARCHAR",
    "VARCHAR",
    "VARCHAR",
    "VARCHAR",
    "VARCHAR",
    "VARCHAR",
    "DOUBLE PRECISION",
    "VARCHAR",
    "TIMESTAMPTZ",
]
REQUIRED_SOURCE_COLUMNS = ["period", "respondent", "type", "timezone", "value"]
DEFAULT_TIMEZONES = ("Arizona", "Central", "Eastern", "Mountain", "Pacific")
DEFAULT_TYPES = ("D", "DF", "NG", "TI")
DEFAULT_RESPONDENTS: tuple[str, ...] | None = None
DEFAULT_LOOKBACK_DAYS = 7

logger = logging.getLogger(__name__)


def _pull(
    start_date: date | datetime | str | None = None,
    end_date: date | datetime | str | None = None,
    *,
    timezones: tuple[str, ...] = DEFAULT_TIMEZONES,
    types: tuple[str, ...] = DEFAULT_TYPES,
    respondents: tuple[str, ...] | None = DEFAULT_RESPONDENTS,
    api_key: str | None = None,
    run_id: str | None = None,
    database: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> pd.DataFrame:
    """Pull and normalize daily EIA-930 region rows."""
    start_param, end_param = _default_window(
        start_date=start_date,
        end_date=end_date,
    )
    api_key = api_key if api_key is not None else credentials.EIA_API_KEY
    facets: dict[str, tuple[str, ...]] = {
        "timezone": timezones,
        "type": types,
    }
    if respondents:
        facets["respondent"] = respondents

    rows = client.get_eia_v2_data(
        ROUTE,
        api_key=api_key or "",
        frequency="daily",
        data_fields=("value",),
        start=start_param,
        end=end_param,
        facets=facets,
        sort_column="period",
        sort_direction="asc",
        pipeline_name=API_SCRAPE_NAME,
        run_id=run_id,
        feed_name=API_SCRAPE_NAME,
        target_table=TARGET_TABLE_FQN,
        operation_name=API_SCRAPE_NAME,
        metadata={
            "requested_start": start_param,
            "requested_end": end_param,
            "timezones": list(timezones),
            "types": list(types),
            "respondents": list(respondents) if respondents else None,
            **(metadata or {}),
        },
        database=database,
    )
    return _format(pd.DataFrame(rows))


def _format(df: pd.DataFrame) -> pd.DataFrame:
    """Sanitize EIA daily region API response rows into the raw target shape."""
    if df.empty:
        return pd.DataFrame(columns=TARGET_COLUMNS)

    missing = [column for column in REQUIRED_SOURCE_COLUMNS if column not in df.columns]
    if missing:
        raise RuntimeError(f"EIA-930 daily region payload missing required columns: {missing}")

    normalized = pd.DataFrame()
    normalized["period"] = pd.to_datetime(df["period"], errors="coerce").dt.date
    normalized["respondent"] = _string_column(df, "respondent")
    normalized["respondent_name"] = _optional_string_column(df, "respondent-name")
    normalized["type"] = _string_column(df, "type")
    normalized["type_name"] = _optional_string_column(df, "type-name")
    normalized["timezone"] = _string_column(df, "timezone")
    normalized["timezone_description"] = _optional_string_column(
        df,
        "timezone-description",
    )
    normalized["value"] = pd.to_numeric(df["value"], errors="coerce")
    normalized["value_units"] = _optional_string_column(df, "value-units")
    normalized["scrape_run_at_utc"] = pd.Timestamp.now(tz=timezone.utc)

    normalized.dropna(subset=PRIMARY_KEY, inplace=True)
    if normalized.empty:
        return pd.DataFrame(columns=TARGET_COLUMNS)

    normalized.drop_duplicates(subset=PRIMARY_KEY, keep="last", inplace=True)
    normalized.sort_values(PRIMARY_KEY, inplace=True)
    normalized.reset_index(drop=True, inplace=True)
    return normalized[TARGET_COLUMNS]


def _upsert(
    df: pd.DataFrame,
    database: str | None = TARGET_DATABASE,
    schema: str = TARGET_SCHEMA,
    table_name: str = TARGET_TABLE,
    primary_key: list[str] | None = None,
) -> None:
    """Upsert normalized EIA-930 daily region rows into Azure Postgres."""
    if df.empty:
        logger.info("Skipping empty upsert into %s.%s", schema, table_name)
        return

    primary_key = primary_key or PRIMARY_KEY
    missing_keys = [column for column in primary_key if column not in df.columns]
    if missing_keys:
        raise ValueError(
            f"Missing primary key columns for {schema}.{table_name}: {missing_keys}"
        )

    db.upsert_dataframe(
        database=database,
        schema=schema,
        table_name=table_name,
        df=df[TARGET_COLUMNS],
        columns=TARGET_COLUMNS,
        data_types=TARGET_DATA_TYPES,
        primary_key=primary_key,
    )


def main(
    start_date: date | datetime | str | None = None,
    end_date: date | datetime | str | None = None,
    timezones: tuple[str, ...] = DEFAULT_TIMEZONES,
    types: tuple[str, ...] = DEFAULT_TYPES,
    respondents: tuple[str, ...] | None = DEFAULT_RESPONDENTS,
    database: str | None = None,
    run_mode: str = "manual",
    metadata: dict[str, Any] | None = None,
) -> pd.DataFrame | None:
    """Run the EIA-930 daily region-data scrape."""
    database = database or credentials.AZURE_POSTGRESQL_DB_NAME
    run_logger = script_logging.init_logging(
        name=API_SCRAPE_NAME,
        log_dir=script_logging.get_log_dir(Path(__file__).parent / "logs"),
        log_to_file=True,
        delete_if_no_errors=True,
    )
    run_id = str(uuid4())

    try:
        run_logger.header(API_SCRAPE_NAME)
        run_logger.info(f"Run ID: {run_id}")
        run_logger.info(f"Run mode: {run_mode}")
        df = _pull(
            start_date=start_date,
            end_date=end_date,
            timezones=timezones,
            types=types,
            respondents=respondents,
            run_id=run_id,
            database=database,
            metadata={"run_mode": run_mode, **(metadata or {})},
        )

        if df.empty:
            run_logger.section("No data returned.")
        else:
            run_logger.section(f"Upserting {len(df)} rows...")
            _upsert(df=df, database=database)
            run_logger.success(
                f"{API_SCRAPE_NAME} completed; {len(df)} rows processed."
            )
            return df
    except Exception as exc:
        run_logger.exception(f"Pipeline failed: {redact_secrets(str(exc))}")
        raise
    finally:
        script_logging.close_logging()

    return None


def _default_window(
    *,
    start_date: date | datetime | str | None,
    end_date: date | datetime | str | None,
) -> tuple[str, str]:
    now = datetime.now(tz=timezone.utc).date()
    resolved_start = start_date or (now - timedelta(days=DEFAULT_LOOKBACK_DAYS))
    resolved_end = end_date or now
    return _format_date_param(resolved_start), _format_date_param(resolved_end)


def _format_date_param(value: date | datetime | str) -> str:
    if isinstance(value, str):
        return pd.to_datetime(value).strftime("%Y-%m-%d")
    if isinstance(value, datetime):
        return value.date().isoformat()
    return value.isoformat()


def _string_column(df: pd.DataFrame, column: str) -> pd.Series:
    return df[column].astype("string").str.strip().replace({"": pd.NA})


def _optional_string_column(df: pd.DataFrame, column: str) -> pd.Series:
    if column not in df.columns:
        return pd.Series([None] * len(df), index=df.index, dtype="object")
    values = df[column].astype("string").str.strip()
    return values.replace({"": pd.NA}).astype("object")


if __name__ == "__main__":
    main()
