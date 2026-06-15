"""Generic PJM Data Miner 2 scrape runner."""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from uuid import uuid4

import pandas as pd
from dateutil.relativedelta import relativedelta

from backend import credentials
from backend.scrapes.power.pjm import client
from backend.scrapes.power.pjm.pricing_filters import (
    DEFAULT_PRICING_NODE_TYPES,
    fetch_csv_for_pricing_node_types,
    pricing_node_type_label,
)
from backend.utils import db, script_logging


@dataclass(frozen=True)
class DataMinerFeedConfig:
    feed_name: str
    display_name: str
    category: str
    posting_frequency: str
    retention_time: str
    columns: tuple[str, ...]
    primary_key: tuple[str, ...]
    datetime_columns: tuple[str, ...] = ()
    date_columns: tuple[str, ...] = ()
    numeric_columns: tuple[str, ...] = ()
    bool_columns: tuple[str, ...] = ()
    text_columns: tuple[str, ...] = ()
    datetime_filter_field: str | None = None
    static_params: dict[str, str] = field(default_factory=dict)
    sql_data_types: dict[str, str] = field(default_factory=dict)
    default_lookback_days: int = 7
    default_lookahead_days: int = 0
    default_end_time: str = "23:55"
    pricing_node_types: tuple[str, ...] | None = None
    target_schema: str = "pjm"
    target_database: str | None = None

    @property
    def target_table(self) -> str:
        return self.feed_name

    @property
    def target_table_fqn(self) -> str:
        return f"{self.target_schema}.{self.target_table}"


def pull_feed_window(
    config: DataMinerFeedConfig,
    *,
    start_date: str | None = None,
    end_date: str | None = None,
    pnode_types: str | Iterable[str] | None = None,
    run_id: str | None = None,
    database: str | None = None,
    metadata: dict | None = None,
) -> pd.DataFrame:
    """Pull and normalize one PJM Data Miner 2 feed window."""
    params = dict(config.static_params)
    if config.datetime_filter_field:
        if not start_date or not end_date:
            raise ValueError(
                f"{config.feed_name} requires start_date and end_date for "
                f"{config.datetime_filter_field}."
            )
        params[config.datetime_filter_field] = f"{start_date} to {end_date}"

    fetch_kwargs = {
        "pipeline_name": config.feed_name,
        "run_id": run_id,
        "target_table": config.target_table_fqn,
        "database": database,
        "log_fetch": True,
        "timeout": client.DEFAULT_TIMEOUT_SECONDS,
        "metadata": metadata,
    }
    if config.pricing_node_types is not None:
        df = fetch_csv_for_pricing_node_types(
            config.feed_name,
            base_params=params,
            pnode_types=pnode_types or config.pricing_node_types,
            **fetch_kwargs,
        )
    else:
        df = client.fetch_csv(config.feed_name, params=params, **fetch_kwargs)

    if df.empty:
        return df

    return normalize_feed_frame(df, config)


def normalize_feed_frame(
    df: pd.DataFrame,
    config: DataMinerFeedConfig,
) -> pd.DataFrame:
    """Coerce Data Miner string payloads into stable database types."""
    df = df.loc[:, [column for column in config.columns if column in df.columns]].copy()

    for column in config.datetime_columns:
        if column in df:
            df[column] = _coerce_datetime(df[column])
    for column in config.date_columns:
        if column in df:
            df[column] = _coerce_date(df[column])
    for column in config.numeric_columns:
        if column in df:
            df[column] = pd.to_numeric(df[column], errors="coerce")
    for column in config.bool_columns:
        if column in df:
            df[column] = _coerce_bool(df[column])
    for column in config.text_columns:
        if column in df:
            df[column] = df[column].astype("string").str.strip()

    missing_key_columns = [column for column in config.primary_key if column not in df]
    if missing_key_columns:
        raise ValueError(
            f"{config.feed_name} result missing primary key columns: "
            f"{missing_key_columns}"
        )

    return df.drop_duplicates(subset=list(config.primary_key), keep="last")


def upsert_feed_frame(
    df: pd.DataFrame,
    config: DataMinerFeedConfig,
    *,
    database: str | None = None,
) -> None:
    data_types = db.infer_sql_data_types(df=df)
    data_types = [
        _configured_sql_data_type(config, column, inferred_type)
        for column, inferred_type in zip(df.columns, data_types)
    ]
    db.upsert_dataframe(
        database=database,
        schema=config.target_schema,
        table_name=config.target_table,
        df=df,
        columns=df.columns.tolist(),
        data_types=data_types,
        primary_key=list(config.primary_key),
    )


def _configured_sql_data_type(
    config: DataMinerFeedConfig,
    column: str,
    inferred_type: str,
) -> str:
    if column in config.sql_data_types:
        return config.sql_data_types[column]
    if column in config.datetime_columns:
        return "TIMESTAMP"
    if column in config.date_columns:
        return "DATE"
    if column in config.numeric_columns:
        return "DOUBLE PRECISION"
    if column in config.bool_columns:
        return "BOOLEAN"
    if column in config.text_columns:
        return "VARCHAR"
    return inferred_type


def run_feed(
    config: DataMinerFeedConfig,
    *,
    start_date: datetime | None = None,
    end_date: datetime | None = None,
    delta: relativedelta = relativedelta(days=1),
    pnode_types: str | Iterable[str] | None = None,
    database: str | None = None,
    metadata: dict | None = None,
) -> pd.DataFrame | None:
    """Run a configured PJM scrape with safe default lookback windows."""
    now = datetime.now()
    start_date = start_date or (now - relativedelta(days=config.default_lookback_days))
    end_date = end_date or (now + relativedelta(days=config.default_lookahead_days))
    database = database or credentials.AZURE_POSTGRESQL_DB_NAME
    run_logger = script_logging.init_logging(
        name=config.feed_name,
        log_dir=script_logging.get_log_dir(Path(__file__).parent / "logs"),
        log_to_file=True,
        delete_if_no_errors=True,
    )
    run_id = str(uuid4())
    rows_processed = 0
    df: pd.DataFrame | None = None

    try:
        run_logger.header(config.feed_name)
        run_logger.info(f"Run ID: {run_id}")
        if config.pricing_node_types is not None:
            node_scope = pricing_node_type_label(pnode_types or config.pricing_node_types)
            run_logger.info(f"Pricing node scope: {node_scope}")

        if config.datetime_filter_field:
            current_date = start_date
            while current_date <= end_date:
                window_start = current_date.strftime("%Y-%m-%d 00:00")
                window_end = current_date.strftime(f"%Y-%m-%d {config.default_end_time}")
                run_logger.section(
                    f"Pulling data for {window_start} to {window_end}..."
                )
                df = pull_feed_window(
                    config,
                    start_date=window_start,
                    end_date=window_end,
                    pnode_types=pnode_types,
                    run_id=run_id,
                    database=database,
                    metadata=metadata,
                )
                rows_processed += _upsert_if_present(df, config, database, run_logger)
                current_date += delta
        else:
            run_logger.section("Pulling data...")
            df = pull_feed_window(
                config,
                run_id=run_id,
                database=database,
                metadata=metadata,
            )
            rows_processed += _upsert_if_present(df, config, database, run_logger)

        run_logger.success(
            f"{config.feed_name} completed; {rows_processed} rows processed."
        )

    except Exception as exc:
        run_logger.exception(f"Pipeline failed: {exc}")
        raise

    finally:
        script_logging.close_logging()

    return df


def _upsert_if_present(
    df: pd.DataFrame,
    config: DataMinerFeedConfig,
    database: str | None,
    run_logger,
) -> int:
    if df.empty:
        run_logger.section("No data returned; skipping upsert.")
        return 0

    run_logger.section(f"Upserting {len(df)} rows...")
    upsert_feed_frame(df, config, database=database)
    run_logger.success("Successfully pulled and upserted data.")
    return len(df)


def _coerce_bool(values: pd.Series) -> pd.Series:
    if pd.api.types.is_bool_dtype(values):
        return values.fillna(False)
    return (
        values.astype(str)
        .str.strip()
        .str.lower()
        .isin({"true", "t", "1", "yes", "y"})
    )


def _coerce_datetime(values: pd.Series) -> pd.Series:
    """Parse PJM datetime fields without relying on pandas format inference."""
    if pd.api.types.is_datetime64_any_dtype(values):
        return values

    parsed = pd.Series(pd.NaT, index=values.index, dtype="datetime64[ns]")
    text_values = values.astype("string").str.strip()
    remaining = text_values.notna() & text_values.ne("")

    for fmt in (
        "%m/%d/%Y %I:%M:%S %p",
        "%Y-%m-%dT%H:%M:%S",
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%d %H:%M",
    ):
        if not remaining.any():
            break

        parsed_values = pd.to_datetime(text_values[remaining], format=fmt, errors="coerce")
        parsed.loc[remaining] = parsed_values
        remaining = remaining & parsed.isna()

    return parsed


def _coerce_date(values: pd.Series) -> pd.Series:
    """Parse PJM date fields into Python dates, including year 9999 sentinels."""

    def parse_one(value):
        if pd.isna(value):
            return None

        text = str(value).strip()
        if not text:
            return None

        for fmt in (
            "%Y-%m-%dT%H:%M:%S",
            "%Y-%m-%d %H:%M:%S",
            "%Y-%m-%d",
            "%m/%d/%Y %I:%M:%S %p",
            "%m/%d/%Y",
        ):
            try:
                return datetime.strptime(text.split(".")[0], fmt).date()
            except ValueError:
                continue

        return None

    return values.map(parse_one)
