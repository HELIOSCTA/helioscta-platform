"""ISO-NE Hourly Day-Ahead LMPs.

Source definition:
https://www.iso-ne.com/isoexpress/web/reports/pricing/-/tree/lmps-da-hourly

Feed metadata reviewed from ISO-NE ISO Express on 2026-06-13:
- Feed short name: da_hrl_lmps
- Display name: Hourly Day-Ahead LMPs
- Category: Pricing Reports
- Description: Locational marginal prices published before the operating day
  with the Day-Ahead Energy Market clearing. LMPs are presented by hour for
  the Hub, load zones, and network nodes, with energy, congestion, and loss
  components.
- Posting frequency: Daily CSV reports
- Retention time: Hourly reports are available for the past seven years.
"""
from __future__ import annotations

import logging
from datetime import datetime
from pathlib import Path
from uuid import uuid4

import pandas as pd
from dateutil.relativedelta import relativedelta

from backend import credentials
from backend.scrapes.power.isone import isone_api_utils as isone_api
from backend.utils import db, script_logging


API_SCRAPE_NAME = "da_hrl_lmps"
TARGET_DATABASE: str | None = None
TARGET_SCHEMA = "isone"
TARGET_TABLE = API_SCRAPE_NAME
TARGET_TABLE_FQN = f"{TARGET_SCHEMA}.{TARGET_TABLE}"
PRIMARY_KEY = [
    "date",
    "hour_ending",
    "location_id",
    "location_name",
    "location_type",
]
DEFAULT_DELTA = relativedelta(days=1)

logger = logging.getLogger(__name__)


def _resolve_default_start_date() -> datetime:
    return datetime.now() - relativedelta(days=7)


def _resolve_default_end_date() -> datetime:
    return datetime.now() + relativedelta(days=1)


def _build_url(start_date: datetime) -> str:
    endpoint = (
        "static-transform/csv/histRpts/da-lmp/"
        f"WW_DALMP_ISO_{start_date.strftime('%Y%m%d')}.csv"
    )
    return f"{isone_api.ISONE_BASE_URL}/{endpoint}"


def _pull(
    *,
    start_date: datetime,
    request_retries: int = 3,
    run_id: str | None = None,
    database: str | None = None,
    metadata: dict | None = None,
) -> pd.DataFrame:
    """Pull ISO-NE day-ahead hourly LMPs for one operating date."""
    url = _build_url(start_date=start_date)
    response = isone_api.make_request(
        url,
        logger=logger,
        retries=request_retries,
        pipeline_name=API_SCRAPE_NAME,
        run_id=run_id,
        feed_name=API_SCRAPE_NAME,
        target_table=TARGET_TABLE_FQN,
        metadata={"operating_date": start_date.strftime("%Y-%m-%d"), **(metadata or {})},
        database=database,
    )
    return _format(isone_api.parse_csv_response(response))


def _format(df: pd.DataFrame) -> pd.DataFrame:
    if df.empty:
        return df

    df = df.copy()
    df.columns = (
        df.columns.str.strip()
        .str.replace(" ", "_")
        .str.replace("-", "_")
        .str.lower()
    )

    if "h" in df.columns:
        df = df[df["h"].astype(str).str.strip().eq("D")].copy()
        df.drop(columns=["h"], inplace=True)

    if df.empty:
        return df

    df["date"] = pd.to_datetime(df["date"]).dt.date
    df["hour_ending"] = df["hour_ending"].astype(str).str.strip()
    df = df[~df["hour_ending"].str.endswith("X")].copy()
    df["hour_ending"] = pd.to_numeric(df["hour_ending"], errors="raise").astype(int)
    df["location_id"] = pd.to_numeric(df["location_id"], errors="raise").astype(int)

    for col in ["location_name", "location_type"]:
        df[col] = df[col].astype(str).str.strip()

    for col in [
        "locational_marginal_price",
        "energy_component",
        "congestion_component",
        "marginal_loss_component",
    ]:
        df[col] = pd.to_numeric(df[col], errors="coerce")

    df.dropna(subset=PRIMARY_KEY, inplace=True)
    df.drop_duplicates(subset=PRIMARY_KEY, keep="last", inplace=True)
    df.sort_values(PRIMARY_KEY, inplace=True)
    df.reset_index(drop=True, inplace=True)
    return df


def _upsert(
    df: pd.DataFrame,
    database: str | None = TARGET_DATABASE,
    schema: str = TARGET_SCHEMA,
    table_name: str = TARGET_TABLE,
    primary_key: list[str] | None = None,
) -> None:
    if df.empty:
        logger.info("Skipping empty upsert into %s.%s", schema, table_name)
        return

    primary_key = primary_key or PRIMARY_KEY
    missing_keys = [col for col in primary_key if col not in df.columns]
    if missing_keys:
        raise ValueError(
            f"Missing primary key columns for {schema}.{table_name}: {missing_keys}"
        )

    db.upsert_dataframe(
        database=database,
        schema=schema,
        table_name=table_name,
        df=df,
        columns=df.columns.tolist(),
        data_types=db.infer_sql_data_types(df=df),
        primary_key=primary_key,
    )


def main(
    start_date: datetime | None = None,
    end_date: datetime | None = None,
    delta: relativedelta = DEFAULT_DELTA,
    database: str | None = None,
) -> pd.DataFrame | None:
    """Run the ISO-NE day-ahead hourly LMP scrape."""
    start_date = start_date or _resolve_default_start_date()
    end_date = end_date or _resolve_default_end_date()
    database = database or credentials.AZURE_POSTGRESQL_DB_NAME
    run_logger = script_logging.init_logging(
        name=API_SCRAPE_NAME,
        log_dir=script_logging.get_log_dir(Path(__file__).parent / "logs"),
        log_to_file=True,
        delete_if_no_errors=True,
    )
    run_id = str(uuid4())
    rows_processed = 0
    frames: list[pd.DataFrame] = []

    try:
        run_logger.header(API_SCRAPE_NAME)
        run_logger.info(f"Run ID: {run_id}")

        current_date = start_date
        while current_date <= end_date:
            run_logger.section(f"Pulling data for {current_date:%Y-%m-%d}...")
            df = _pull(start_date=current_date, run_id=run_id, database=database)

            if df.empty:
                run_logger.section(f"No data returned for {current_date:%Y-%m-%d}.")
            else:
                run_logger.section(f"Upserting {len(df)} rows...")
                _upsert(df=df, database=database)
                rows_processed += len(df)
                frames.append(df)
                run_logger.success(
                    f"Successfully pulled and upserted data for "
                    f"{current_date:%Y-%m-%d}."
                )

            current_date += delta

        run_logger.success(
            f"{API_SCRAPE_NAME} completed; {rows_processed} rows processed."
        )

    except Exception as exc:
        run_logger.exception(f"Pipeline failed: {exc}")
        raise

    finally:
        script_logging.close_logging()

    return pd.concat(frames, ignore_index=True) if frames else None


if __name__ == "__main__":
    main()
