"""PJM Western Hub DA price forecasts from Meteologica."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

import pandas as pd
from psycopg2 import sql

from backend import credentials
from backend.scrapes.power.meteologica import client
from backend.utils import db, retention, script_logging
from backend.utils.ops_logging import redact_secrets

API_SCRAPE_NAME = "pjm_meteologica_da_price_forecast"
SOURCE_SYSTEM = "meteologica"
TARGET_SCHEMA = "meteologica"
DEFAULT_RETENTION_DAYS = 90
DEFAULT_FORECAST_HORIZON_DAYS = 14
PRIMARY_KEY = ["content_id", "update_id", "forecast_period_start"]

DET_TABLE = "usa_pjm_western_hub_da_power_price_forecast_hourly"
ENS_TABLE = "usa_pjm_western_hub_da_power_price_forecast_ecmwf_ens_hourly"
DET_TABLE_FQN = f"{TARGET_SCHEMA}.{DET_TABLE}"
ENS_TABLE_FQN = f"{TARGET_SCHEMA}.{ENS_TABLE}"


@dataclass(frozen=True)
class MeteologicaDaPriceFeed:
    content_id: int
    content_name: str
    feed_name: str
    target_table: str
    series_type: str

    @property
    def target_table_fqn(self) -> str:
        return f"{TARGET_SCHEMA}.{self.target_table}"


FEED_DETERMINISTIC = MeteologicaDaPriceFeed(
    content_id=4397,
    content_name="USA PJM Western-HUB day ahead power price forecast Meteologica hourly",
    feed_name=DET_TABLE,
    target_table=DET_TABLE,
    series_type="deterministic",
)
FEED_ENSEMBLE = MeteologicaDaPriceFeed(
    content_id=4400,
    content_name="USA PJM Western-HUB day ahead power price forecast ECMWF ENS hourly",
    feed_name=ENS_TABLE,
    target_table=ENS_TABLE,
    series_type="ecmwf_ens",
)
FEEDS: tuple[MeteologicaDaPriceFeed, ...] = (FEED_DETERMINISTIC, FEED_ENSEMBLE)

BASE_COLUMNS = [
    "content_id",
    "content_name",
    "update_id",
    "issue_date",
    "forecast_period_start",
    "forecast_period_end",
    "utc_offset_from",
    "utc_offset_to",
]
COMMON_TAIL_COLUMNS = [
    "source_timezone",
    "source_unit",
    "scrape_run_at_utc",
]
DET_OUTPUT_COLUMNS = [
    *BASE_COLUMNS,
    "day_ahead_price",
    *COMMON_TAIL_COLUMNS,
]
ENS_MEMBER_COLUMNS = [f"ens_{index:02d}_price" for index in range(51)]
ENS_OUTPUT_COLUMNS = [
    *BASE_COLUMNS,
    "average_price",
    "bottom_price",
    "top_price",
    *ENS_MEMBER_COLUMNS,
    *COMMON_TAIL_COLUMNS,
]
OUTPUT_COLUMNS_BY_TABLE = {
    DET_TABLE: DET_OUTPUT_COLUMNS,
    ENS_TABLE: ENS_OUTPUT_COLUMNS,
}
SQL_DATA_TYPES_BY_TABLE = {
    DET_TABLE: [
        "INTEGER",
        "VARCHAR",
        "VARCHAR",
        "TIMESTAMPTZ",
        "TIMESTAMP",
        "TIMESTAMP",
        "VARCHAR",
        "VARCHAR",
        "DOUBLE PRECISION",
        "VARCHAR",
        "VARCHAR",
        "TIMESTAMPTZ",
    ],
    ENS_TABLE: [
        "INTEGER",
        "VARCHAR",
        "VARCHAR",
        "TIMESTAMPTZ",
        "TIMESTAMP",
        "TIMESTAMP",
        "VARCHAR",
        "VARCHAR",
        "DOUBLE PRECISION",
        "DOUBLE PRECISION",
        "DOUBLE PRECISION",
        *(["DOUBLE PRECISION"] * len(ENS_MEMBER_COLUMNS)),
        "VARCHAR",
        "VARCHAR",
        "TIMESTAMPTZ",
    ],
}

_COLUMN_RENAME_MAP = {
    "From yyyy-mm-dd hh:mm": "forecast_period_start",
    "To yyyy-mm-dd hh:mm": "forecast_period_end",
    "UTC offset from (UTC+/-hhmm)": "utc_offset_from",
    "UTC offset to (UTC+/-hhmm)": "utc_offset_to",
    "DayAhead": "day_ahead_price",
    "Average": "average_price",
    "Bottom": "bottom_price",
    "Top": "top_price",
}

logger = logging.getLogger(__name__)


def configured_feeds() -> tuple[MeteologicaDaPriceFeed, ...]:
    return FEEDS


def pull_feed(
    feed: MeteologicaDaPriceFeed,
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
        target_table=feed.target_table_fqn,
        operation_name="contents_data",
        database=database,
        metadata={
            "series_type": feed.series_type,
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


def normalize_da_price_frame(
    df: pd.DataFrame,
    *,
    feed: MeteologicaDaPriceFeed,
    metadata: dict,
    scrape_run_at_utc: datetime,
    forecast_horizon_days: int = DEFAULT_FORECAST_HORIZON_DAYS,
) -> pd.DataFrame:
    """Normalize one Meteologica DA price feed response into source-table columns."""
    _validate_forecast_horizon_days(forecast_horizon_days)
    output_columns = OUTPUT_COLUMNS_BY_TABLE[feed.target_table]
    if df.empty:
        return pd.DataFrame(columns=output_columns)

    normalized = df.rename(columns=_ens_rename_map(df)).rename(columns=_COLUMN_RENAME_MAP).copy()
    normalized["content_id"] = int(metadata.get("content_id") or feed.content_id)
    normalized["content_name"] = str(metadata.get("content_name") or feed.content_name)
    normalized["update_id"] = str(metadata.get("update_id") or "").strip()
    normalized["issue_date"] = pd.to_datetime(
        metadata.get("issue_date"),
        errors="coerce",
        utc=True,
    )
    normalized["source_timezone"] = metadata.get("source_timezone")
    normalized["source_unit"] = metadata.get("source_unit")
    normalized["scrape_run_at_utc"] = pd.Timestamp(scrape_run_at_utc)

    for column in ["forecast_period_start", "forecast_period_end"]:
        normalized[column] = pd.to_datetime(
            normalized.get(column),
            format="%Y-%m-%d %H:%M",
            errors="coerce",
        )

    for column in _numeric_columns(feed):
        normalized[column] = pd.to_numeric(normalized.get(column), errors="coerce")

    for column in output_columns:
        if column not in normalized:
            normalized[column] = pd.NA

    normalized = normalized.dropna(subset=["content_id", "forecast_period_start"]).copy()
    normalized = normalized[normalized["update_id"] != ""].copy()
    normalized = _filter_forecast_horizon(
        normalized,
        forecast_horizon_days=forecast_horizon_days,
    )
    return (
        normalized[output_columns]
        .drop_duplicates(subset=PRIMARY_KEY, keep="last")
        .sort_values(PRIMARY_KEY)
        .reset_index(drop=True)
    )


def pull_all(
    *,
    feeds: tuple[MeteologicaDaPriceFeed, ...] = FEEDS,
    run_id: str | None = None,
    database: str | None = None,
    scrape_run_at_utc: datetime | None = None,
    forecast_horizon_days: int = DEFAULT_FORECAST_HORIZON_DAYS,
    metadata: dict | None = None,
) -> dict[str, pd.DataFrame]:
    _validate_forecast_horizon_days(forecast_horizon_days)
    scrape_run_at_utc = scrape_run_at_utc or _utc_now()
    frames_by_table: dict[str, list[pd.DataFrame]] = {}
    for feed in feeds:
        raw, feed_metadata = pull_feed(
            feed,
            run_id=run_id,
            database=database,
            metadata=metadata,
        )
        frame = normalize_da_price_frame(
            raw,
            feed=feed,
            metadata=feed_metadata,
            scrape_run_at_utc=scrape_run_at_utc,
            forecast_horizon_days=forecast_horizon_days,
        )
        frames_by_table.setdefault(feed.target_table, []).append(frame)

    return {
        table: _combine_frames(frames, table)
        for table, frames in frames_by_table.items()
    }


def upsert_table(table_name: str, df: pd.DataFrame, database: str | None = None) -> None:
    if df.empty:
        logger.info("Skipping empty upsert into %s.%s", TARGET_SCHEMA, table_name)
        return
    db.upsert_dataframe(
        database=database,
        schema=TARGET_SCHEMA,
        table_name=table_name,
        df=df[OUTPUT_COLUMNS_BY_TABLE[table_name]],
        columns=OUTPUT_COLUMNS_BY_TABLE[table_name],
        data_types=SQL_DATA_TYPES_BY_TABLE[table_name],
        primary_key=PRIMARY_KEY,
    )


def purge_old_rows(
    table_name: str,
    *,
    retention_days: int = DEFAULT_RETENTION_DAYS,
    database: str | None = None,
) -> int:
    return retention.purge_rows_older_than(
        schema=TARGET_SCHEMA,
        table_name=table_name,
        timestamp_column="issue_date",
        retention_days=retention_days,
        database=database,
    )


def purge_forecast_horizon_rows(
    table_name: str,
    *,
    forecast_horizon_days: int = DEFAULT_FORECAST_HORIZON_DAYS,
    database: str | None = None,
) -> int:
    _validate_forecast_horizon_days(forecast_horizon_days)
    connection = None
    cursor = None
    try:
        connection = db.connect(database=database)
        cursor = connection.cursor()
        query = sql.SQL(
            """
            WITH deleted AS (
                DELETE FROM {}.{}
                WHERE issue_date IS NOT NULL
                  AND source_timezone IS NOT NULL
                  AND forecast_period_start >= (
                      issue_date AT TIME ZONE source_timezone
                  ) + (%s::int * INTERVAL '1 day')
                RETURNING 1
            )
            SELECT COUNT(*) AS deleted_rows
            FROM deleted;
            """
        ).format(sql.Identifier(TARGET_SCHEMA), sql.Identifier(table_name))
        cursor.execute(query, (forecast_horizon_days,))
        deleted_rows = int(cursor.fetchone()[0])
        connection.commit()
        return deleted_rows
    except Exception:
        if connection:
            connection.rollback()
        raise
    finally:
        if cursor:
            cursor.close()
        if connection:
            connection.close()


def main(
    *,
    database: str | None = None,
    run_mode: str = "manual",
    feeds: tuple[MeteologicaDaPriceFeed, ...] = FEEDS,
    retention_days: int = DEFAULT_RETENTION_DAYS,
    forecast_horizon_days: int = DEFAULT_FORECAST_HORIZON_DAYS,
    metadata: dict | None = None,
) -> dict[str, pd.DataFrame] | None:
    """Pull and upsert configured PJM Meteologica DA price forecast feeds."""
    database = database or credentials.AZURE_POSTGRESQL_DB_NAME
    _validate_forecast_horizon_days(forecast_horizon_days)
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
        run_logger.info(f"Forecast horizon days: {forecast_horizon_days}")
        fetch_metadata = {"run_mode": run_mode, **(metadata or {})}
        frames_by_table = pull_all(
            feeds=feeds,
            run_id=run_id,
            database=database,
            scrape_run_at_utc=scrape_run_at_utc,
            forecast_horizon_days=forecast_horizon_days,
            metadata=fetch_metadata,
        )
        total_rows = sum(len(frame) for frame in frames_by_table.values())
        if total_rows == 0:
            run_logger.section("No Meteologica DA price rows returned; skipping upsert.")
            return None

        for table_name, frame in frames_by_table.items():
            run_logger.section(f"Upserting {len(frame)} rows into {TARGET_SCHEMA}.{table_name}...")
            upsert_table(table_name, frame, database=database)
            horizon_deleted_rows = purge_forecast_horizon_rows(
                table_name,
                forecast_horizon_days=forecast_horizon_days,
                database=database,
            )
            run_logger.section(
                f"{TARGET_SCHEMA}.{table_name} horizon purge removed "
                f"{horizon_deleted_rows} rows beyond {forecast_horizon_days} days forward."
            )
            deleted_rows = purge_old_rows(
                table_name,
                retention_days=retention_days,
                database=database,
            )
            run_logger.section(
                f"{TARGET_SCHEMA}.{table_name} retention purge removed "
                f"{deleted_rows} rows older than {retention_days} days."
            )

        run_logger.success(f"{API_SCRAPE_NAME} completed; {total_rows} rows processed.")
        return frames_by_table
    except Exception as exc:
        run_logger.exception(f"Pipeline failed: {redact_secrets(str(exc))}")
        raise
    finally:
        script_logging.close_logging()


def _combine_frames(frames: list[pd.DataFrame], table_name: str) -> pd.DataFrame:
    output_columns = OUTPUT_COLUMNS_BY_TABLE[table_name]
    if not frames:
        return pd.DataFrame(columns=output_columns)
    return (
        pd.concat(frames, ignore_index=True)
        .drop_duplicates(subset=PRIMARY_KEY, keep="last")
        .sort_values(PRIMARY_KEY)
        .reset_index(drop=True)
    )


def _ens_rename_map(df: pd.DataFrame) -> dict[str, str]:
    return {
        column: f"ens_{column[3:]}_price"
        for column in df.columns
        if column.startswith("ENS") and column[3:].isdigit()
    }


def _numeric_columns(feed: MeteologicaDaPriceFeed) -> list[str]:
    if feed.target_table == DET_TABLE:
        return ["day_ahead_price"]
    return ["average_price", "bottom_price", "top_price", *ENS_MEMBER_COLUMNS]


def _filter_forecast_horizon(
    df: pd.DataFrame,
    *,
    forecast_horizon_days: int,
) -> pd.DataFrame:
    cutoff = _forecast_horizon_cutoff(
        issue_date=df["issue_date"].dropna().iloc[0] if df["issue_date"].notna().any() else None,
        source_timezone=df["source_timezone"].dropna().iloc[0]
        if df["source_timezone"].notna().any()
        else None,
        forecast_horizon_days=forecast_horizon_days,
    )
    if cutoff is None:
        return df
    return df[df["forecast_period_start"] < cutoff].copy()


def _forecast_horizon_cutoff(
    *,
    issue_date: object,
    source_timezone: object,
    forecast_horizon_days: int,
) -> pd.Timestamp | None:
    if pd.isna(issue_date):
        return None
    issue = pd.Timestamp(issue_date)
    if issue.tzinfo is None:
        issue = issue.tz_localize("UTC")
    source_tz = _source_timezone(source_timezone)
    return issue.tz_convert(source_tz).tz_localize(None) + pd.Timedelta(
        days=forecast_horizon_days,
    )


def _source_timezone(source_timezone: object) -> ZoneInfo:
    if isinstance(source_timezone, str) and source_timezone.strip():
        try:
            return ZoneInfo(source_timezone.strip())
        except ZoneInfoNotFoundError:
            logger.warning("Unknown Meteologica source timezone %r; using UTC.", source_timezone)
    return ZoneInfo("UTC")


def _validate_forecast_horizon_days(forecast_horizon_days: int) -> None:
    if forecast_horizon_days < 1:
        raise ValueError("forecast_horizon_days must be >= 1")


def _utc_now() -> datetime:
    return datetime.now(tz=timezone.utc).replace(microsecond=0)


if __name__ == "__main__":
    main()
