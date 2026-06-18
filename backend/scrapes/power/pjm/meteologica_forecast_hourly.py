"""PJM hourly load, solar, and wind forecasts from Meteologica."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

import pandas as pd

from backend import credentials
from backend.scrapes.power.meteologica import client
from backend.utils import db, retention, script_logging
from backend.utils.ops_logging import redact_secrets

API_SCRAPE_NAME = "pjm_meteologica_forecast_hourly"
SOURCE_SYSTEM = "meteologica"
TARGET_SCHEMA = "meteologica"
TARGET_TABLE = "pjm_forecast_hourly"
TARGET_TABLE_FQN = f"{TARGET_SCHEMA}.{TARGET_TABLE}"
PRIMARY_KEY = ["content_id", "update_id", "forecast_period_start"]
DEFAULT_RETENTION_DAYS = 90

METRIC_LOAD = "load"
METRIC_SOLAR = "solar"
METRIC_WIND = "wind"


@dataclass(frozen=True)
class MeteologicaForecastFeed:
    content_id: int
    content_name: str
    metric: str
    region: str
    forecast_area: str
    feed_name: str


FEEDS: tuple[MeteologicaForecastFeed, ...] = (
    MeteologicaForecastFeed(
        2706,
        "USA PJM power demand forecast Meteologica hourly",
        METRIC_LOAD,
        "PJM",
        "RTO",
        "usa_pjm_power_demand_forecast_hourly",
    ),
    MeteologicaForecastFeed(
        2553,
        "USA PJM photovoltaic power generation forecast Meteologica hourly",
        METRIC_SOLAR,
        "PJM",
        "RTO",
        "usa_pjm_pv_power_generation_forecast_hourly",
    ),
    MeteologicaForecastFeed(
        2604,
        "USA PJM wind power generation forecast Meteologica hourly",
        METRIC_WIND,
        "PJM",
        "RTO",
        "usa_pjm_wind_power_generation_forecast_hourly",
    ),
    MeteologicaForecastFeed(
        2688,
        "USA PJM MidAtlantic power demand forecast Meteologica hourly",
        METRIC_LOAD,
        "PJM",
        "MIDATL",
        "usa_pjm_midatlantic_power_demand_forecast_hourly",
    ),
    MeteologicaForecastFeed(
        2554,
        "USA PJM MidAtlantic photovoltaic power generation forecast Meteologica hourly",
        METRIC_SOLAR,
        "PJM",
        "MIDATL",
        "usa_pjm_midatlantic_pv_power_generation_forecast_hourly",
    ),
    MeteologicaForecastFeed(
        2602,
        "USA PJM MidAtlantic wind power generation forecast Meteologica hourly",
        METRIC_WIND,
        "PJM",
        "MIDATL",
        "usa_pjm_midatlantic_wind_power_generation_forecast_hourly",
    ),
    MeteologicaForecastFeed(
        2722,
        "USA PJM South power demand forecast Meteologica hourly",
        METRIC_LOAD,
        "PJM",
        "SOUTH",
        "usa_pjm_south_power_demand_forecast_hourly",
    ),
    MeteologicaForecastFeed(
        2556,
        "USA PJM South photovoltaic power generation forecast Meteologica hourly",
        METRIC_SOLAR,
        "PJM",
        "SOUTH",
        "usa_pjm_south_pv_power_generation_forecast_hourly",
    ),
    MeteologicaForecastFeed(
        2599,
        "USA PJM South wind power generation forecast Meteologica hourly",
        METRIC_WIND,
        "PJM",
        "SOUTH",
        "usa_pjm_south_wind_power_generation_forecast_hourly",
    ),
    MeteologicaForecastFeed(
        2707,
        "USA PJM West power demand forecast Meteologica hourly",
        METRIC_LOAD,
        "PJM",
        "WEST",
        "usa_pjm_west_power_demand_forecast_hourly",
    ),
    MeteologicaForecastFeed(
        2555,
        "USA PJM West photovoltaic power generation forecast Meteologica hourly",
        METRIC_SOLAR,
        "PJM",
        "WEST",
        "usa_pjm_west_pv_power_generation_forecast_hourly",
    ),
    MeteologicaForecastFeed(
        2597,
        "USA PJM West wind power generation forecast Meteologica hourly",
        METRIC_WIND,
        "PJM",
        "WEST",
        "usa_pjm_west_wind_power_generation_forecast_hourly",
    ),
)

OUTPUT_COLUMNS = [
    "content_id",
    "content_name",
    "update_id",
    "issue_date",
    "metric",
    "region",
    "forecast_area",
    "forecast_period_start",
    "forecast_period_end",
    "utc_offset_from",
    "utc_offset_to",
    "forecast_mw",
    "perc10_mw",
    "perc90_mw",
    "arpege_run",
    "ecmwf_ens_run",
    "ecmwf_hres_run",
    "gfs_run",
    "nam_run",
    "source_timezone",
    "source_unit",
    "scrape_run_at_utc",
]
SQL_DATA_TYPES = [
    "INTEGER",
    "VARCHAR",
    "VARCHAR",
    "TIMESTAMPTZ",
    "VARCHAR",
    "VARCHAR",
    "VARCHAR",
    "TIMESTAMP",
    "TIMESTAMP",
    "VARCHAR",
    "VARCHAR",
    "DOUBLE PRECISION",
    "DOUBLE PRECISION",
    "DOUBLE PRECISION",
    "VARCHAR",
    "VARCHAR",
    "VARCHAR",
    "VARCHAR",
    "VARCHAR",
    "VARCHAR",
    "VARCHAR",
    "TIMESTAMPTZ",
]

_COLUMN_RENAME_MAP = {
    "From yyyy-mm-dd hh:mm": "forecast_period_start",
    "To yyyy-mm-dd hh:mm": "forecast_period_end",
    "UTC offset from (UTC+/-hhmm)": "utc_offset_from",
    "UTC offset to (UTC+/-hhmm)": "utc_offset_to",
    "ARPEGE RUN": "arpege_run",
    "ECMWF ENS RUN": "ecmwf_ens_run",
    "ECMWF HRES RUN": "ecmwf_hres_run",
    "GFS RUN": "gfs_run",
    "NAM RUN": "nam_run",
    "forecast": "forecast_mw",
    "perc10": "perc10_mw",
    "perc90": "perc90_mw",
}

logger = logging.getLogger(__name__)


def configured_feeds() -> tuple[MeteologicaForecastFeed, ...]:
    return FEEDS


def _pull_feed(
    feed: MeteologicaForecastFeed,
    *,
    run_id: str | None = None,
    database: str | None = None,
    metadata: dict | None = None,
) -> tuple[pd.DataFrame, dict]:
    response = client.make_get_request(
        f"contents/{feed.content_id}/data",
        account="iso",
        pipeline_name=API_SCRAPE_NAME,
        run_id=run_id,
        content_id=feed.content_id,
        feed_name=feed.feed_name,
        target_table=TARGET_TABLE_FQN,
        operation_name="contents_data",
        database=database,
        metadata={
            "metric": feed.metric,
            "region": feed.region,
            "forecast_area": feed.forecast_area,
            **(metadata or {}),
        },
    )
    payload = client.parse_json_response(response)
    data = payload.get("data") or []
    if not isinstance(data, list):
        raise RuntimeError(f"Meteologica content_id={feed.content_id} data was not a list.")
    frame = pd.DataFrame(data)
    metadata_out = {
        "content_id": int(payload.get("content_id") or feed.content_id),
        "content_name": str(payload.get("content_name") or feed.content_name),
        "update_id": payload.get("update_id"),
        "issue_date": payload.get("issue_date"),
        "source_timezone": payload.get("timezone"),
        "source_unit": payload.get("unit"),
    }
    logger.info(
        "Pulled %s rows for content_id=%s update_id=%s",
        len(frame),
        feed.content_id,
        metadata_out["update_id"],
    )
    return frame, metadata_out


def normalize_forecast_frame(
    df: pd.DataFrame,
    *,
    feed: MeteologicaForecastFeed,
    metadata: dict,
    scrape_run_at_utc: datetime,
) -> pd.DataFrame:
    """Normalize one Meteologica feed response into canonical table columns."""
    if df.empty:
        return pd.DataFrame(columns=OUTPUT_COLUMNS)

    normalized = df.rename(columns=_COLUMN_RENAME_MAP).copy()
    normalized["content_id"] = int(metadata.get("content_id") or feed.content_id)
    normalized["content_name"] = str(metadata.get("content_name") or feed.content_name)
    normalized["update_id"] = str(metadata.get("update_id") or "").strip()
    normalized["issue_date"] = pd.to_datetime(
        metadata.get("issue_date"),
        errors="coerce",
        utc=True,
    )
    normalized["metric"] = feed.metric
    normalized["region"] = feed.region
    normalized["forecast_area"] = feed.forecast_area
    normalized["source_timezone"] = metadata.get("source_timezone")
    normalized["source_unit"] = metadata.get("source_unit")
    normalized["scrape_run_at_utc"] = pd.Timestamp(scrape_run_at_utc)

    for column in ["forecast_period_start", "forecast_period_end"]:
        normalized[column] = pd.to_datetime(
            normalized.get(column),
            format="%Y-%m-%d %H:%M",
            errors="coerce",
        )

    for column in ["forecast_mw", "perc10_mw", "perc90_mw"]:
        normalized[column] = pd.to_numeric(normalized.get(column), errors="coerce")

    for column in ["arpege_run", "ecmwf_ens_run", "ecmwf_hres_run", "gfs_run", "nam_run"]:
        if column not in normalized:
            normalized[column] = pd.NA
        normalized[column] = normalized[column].astype("string")

    for column in ["utc_offset_from", "utc_offset_to"]:
        if column not in normalized:
            normalized[column] = pd.NA
        normalized[column] = normalized[column].astype("string")

    normalized = normalized.dropna(
        subset=["content_id", "forecast_period_start"]
    ).copy()
    normalized = normalized[normalized["update_id"] != ""].copy()
    return (
        normalized[OUTPUT_COLUMNS]
        .drop_duplicates(subset=PRIMARY_KEY, keep="last")
        .sort_values(PRIMARY_KEY)
        .reset_index(drop=True)
    )


def _pull(
    *,
    feeds: tuple[MeteologicaForecastFeed, ...] = FEEDS,
    run_id: str | None = None,
    database: str | None = None,
    scrape_run_at_utc: datetime | None = None,
    metadata: dict | None = None,
) -> pd.DataFrame:
    scrape_run_at_utc = scrape_run_at_utc or _utc_now()
    frames: list[pd.DataFrame] = []
    for feed in feeds:
        raw, feed_metadata = _pull_feed(
            feed,
            run_id=run_id,
            database=database,
            metadata=metadata,
        )
        frames.append(
            normalize_forecast_frame(
                raw,
                feed=feed,
                metadata=feed_metadata,
                scrape_run_at_utc=scrape_run_at_utc,
            )
        )
    if not frames:
        return pd.DataFrame(columns=OUTPUT_COLUMNS)
    return (
        pd.concat(frames, ignore_index=True)
        .drop_duplicates(subset=PRIMARY_KEY, keep="last")
        .sort_values(PRIMARY_KEY)
        .reset_index(drop=True)
    )


def _upsert(df: pd.DataFrame, database: str | None = None) -> None:
    if df.empty:
        logger.info("Skipping empty upsert into %s", TARGET_TABLE_FQN)
        return
    db.upsert_dataframe(
        database=database,
        schema=TARGET_SCHEMA,
        table_name=TARGET_TABLE,
        df=df[OUTPUT_COLUMNS],
        columns=OUTPUT_COLUMNS,
        data_types=SQL_DATA_TYPES,
        primary_key=PRIMARY_KEY,
    )


def _purge_old_rows(
    *,
    retention_days: int = DEFAULT_RETENTION_DAYS,
    database: str | None = None,
) -> int:
    return retention.purge_rows_older_than(
        schema=TARGET_SCHEMA,
        table_name=TARGET_TABLE,
        timestamp_column="issue_date",
        retention_days=retention_days,
        database=database,
    )


def main(
    *,
    database: str | None = None,
    run_mode: str = "manual",
    feeds: tuple[MeteologicaForecastFeed, ...] = FEEDS,
    retention_days: int = DEFAULT_RETENTION_DAYS,
    metadata: dict | None = None,
) -> pd.DataFrame | None:
    """Pull and upsert all configured PJM Meteologica hourly forecast feeds."""
    database = database or credentials.AZURE_POSTGRESQL_DB_NAME
    run_logger = script_logging.init_logging(
        name=API_SCRAPE_NAME,
        log_dir=script_logging.get_log_dir(Path(__file__).parent / "logs"),
        log_to_file=True,
        delete_if_no_errors=True,
    )
    run_id = str(uuid4())
    scrape_run_at_utc = _utc_now()

    try:
        run_logger.header(API_SCRAPE_NAME)
        run_logger.info(f"Run ID: {run_id}")
        run_logger.info(f"Run mode: {run_mode}")
        run_logger.info(f"Feed count: {len(feeds)}")
        fetch_metadata = {"run_mode": run_mode, **(metadata or {})}
        df = _pull(
            feeds=feeds,
            run_id=run_id,
            database=database,
            scrape_run_at_utc=scrape_run_at_utc,
            metadata=fetch_metadata,
        )
        if df.empty:
            run_logger.section("No Meteologica forecast rows returned; skipping upsert.")
            return None
        run_logger.section(f"Upserting {len(df)} rows...")
        _upsert(df, database=database)
        deleted_rows = _purge_old_rows(
            retention_days=retention_days,
            database=database,
        )
        run_logger.section(
            f"Retention purge removed {deleted_rows} rows older than {retention_days} days."
        )
        run_logger.success(f"{API_SCRAPE_NAME} completed; {len(df)} rows processed.")
        return df
    except Exception as exc:
        run_logger.exception(f"Pipeline failed: {redact_secrets(str(exc))}")
        raise
    finally:
        script_logging.close_logging()


def _utc_now() -> datetime:
    return datetime.now(tz=timezone.utc).replace(microsecond=0)


if __name__ == "__main__":
    main()
