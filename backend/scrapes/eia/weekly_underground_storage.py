"""EIA weekly natural gas underground storage.

Source contract:
- Source system: EIA Open Data API v2, Natural Gas Weekly Underground Storage.
- Endpoint: /natural-gas/stor/wkly
- Frequency: weekly
- Grain: eia_week_ending x series
- Destination: eia.weekly_underground_storage
- Safe rerun: idempotent upsert on the source grain.
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


API_SCRAPE_NAME = "weekly_underground_storage"
ROUTE = "natural-gas/stor/wkly"
TARGET_DATABASE: str | None = None
TARGET_SCHEMA = "eia"
TARGET_TABLE = API_SCRAPE_NAME
TARGET_TABLE_FQN = f"{TARGET_SCHEMA}.{TARGET_TABLE}"
PRIMARY_KEY = ["eia_week_ending", "series"]
TARGET_COLUMNS = [
    "eia_week_ending",
    "duoarea",
    "area_name",
    "region",
    "product",
    "product_name",
    "process",
    "process_name",
    "series",
    "series_description",
    "value_bcf",
    "units",
    "source_frequency",
    "source_period",
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
    "VARCHAR",
    "VARCHAR",
    "VARCHAR",
    "DOUBLE PRECISION",
    "VARCHAR",
    "VARCHAR",
    "VARCHAR",
    "TIMESTAMPTZ",
]
REQUIRED_SOURCE_COLUMNS = ["period", "series", "value"]
DEFAULT_LOOKBACK_DAYS = 61

logger = logging.getLogger(__name__)


def _pull(
    start_date: date | datetime | str | None = None,
    end_date: date | datetime | str | None = None,
    *,
    api_key: str | None = None,
    run_id: str | None = None,
    database: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> pd.DataFrame:
    """Pull and normalize weekly underground storage rows."""
    start_param, end_param = _default_window(
        start_date=start_date,
        end_date=end_date,
    )
    api_key = api_key if api_key is not None else credentials.EIA_API_KEY
    rows = client.get_eia_v2_data(
        ROUTE,
        api_key=api_key or "",
        frequency="weekly",
        data_fields=("value",),
        start=start_param,
        end=end_param,
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
            **(metadata or {}),
        },
        database=database,
    )
    return _format(pd.DataFrame(rows))


def _format(df: pd.DataFrame) -> pd.DataFrame:
    """Normalize EIA weekly storage API rows into the target table shape."""
    if df.empty:
        return pd.DataFrame(columns=TARGET_COLUMNS)

    missing = [column for column in REQUIRED_SOURCE_COLUMNS if column not in df.columns]
    if missing:
        raise RuntimeError(
            f"EIA weekly underground storage payload missing required columns: {missing}"
        )

    normalized = pd.DataFrame()
    normalized["source_period"] = df["period"].astype(str)
    normalized["eia_week_ending"] = pd.to_datetime(
        df["period"],
        errors="coerce",
    ).dt.date
    normalized["duoarea"] = _optional_string_column(df, "duoarea")
    normalized["area_name"] = _optional_string_column(df, "area-name")
    normalized["product"] = _optional_string_column(df, "product")
    normalized["product_name"] = _optional_string_column(df, "product-name")
    normalized["process"] = _optional_string_column(df, "process")
    normalized["process_name"] = _optional_string_column(df, "process-name")
    normalized["series"] = _string_column(df, "series")
    normalized["series_description"] = _optional_string_column(
        df,
        "series-description",
    )
    normalized["region"] = _extract_region(
        normalized["series_description"],
        fallback=normalized["duoarea"],
    )
    normalized["value_bcf"] = pd.to_numeric(df["value"], errors="coerce")
    normalized["units"] = _optional_string_column(df, "units")
    normalized["source_frequency"] = "weekly"
    normalized["scrape_run_at_utc"] = pd.Timestamp.now(tz=timezone.utc)

    normalized.dropna(subset=["eia_week_ending", "series"], inplace=True)
    if normalized.empty:
        return pd.DataFrame(columns=TARGET_COLUMNS)

    grouped = (
        normalized.groupby(PRIMARY_KEY, as_index=False, dropna=False)
        .agg(
            duoarea=("duoarea", "last"),
            area_name=("area_name", "last"),
            region=("region", "last"),
            product=("product", "last"),
            product_name=("product_name", "last"),
            process=("process", "last"),
            process_name=("process_name", "last"),
            series_description=("series_description", "last"),
            value_bcf=("value_bcf", "last"),
            units=("units", "last"),
            source_frequency=("source_frequency", "last"),
            source_period=("source_period", "last"),
            scrape_run_at_utc=("scrape_run_at_utc", "last"),
        )
        .sort_values(PRIMARY_KEY)
        .reset_index(drop=True)
    )
    return grouped[TARGET_COLUMNS]


def _upsert(
    df: pd.DataFrame,
    database: str | None = TARGET_DATABASE,
    schema: str = TARGET_SCHEMA,
    table_name: str = TARGET_TABLE,
    primary_key: list[str] | None = None,
) -> None:
    """Upsert normalized weekly storage rows into Azure Postgres."""
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
    database: str | None = None,
    run_mode: str = "manual",
    metadata: dict[str, Any] | None = None,
) -> pd.DataFrame | None:
    """Run the EIA weekly underground storage scrape."""
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


def _extract_region(series_description: pd.Series, *, fallback: pd.Series) -> pd.Series:
    region = series_description.astype("string").str.extract(
        r"Weekly\s+(.*?)\s+Natural Gas",
        expand=False,
    )
    region = region.str.replace(r"\s+(Region|States)\s*$", "", regex=True)
    return region.fillna(fallback).astype("object")


if __name__ == "__main__":
    main()
