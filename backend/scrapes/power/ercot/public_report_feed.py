"""Generic helpers for ERCOT Public Reports feed scrapes."""

from __future__ import annotations

from datetime import datetime
from pathlib import Path
from uuid import uuid4

import pandas as pd
from dateutil.relativedelta import relativedelta

from backend import credentials
from backend.scrapes.power.ercot import client
from backend.scrapes.power.ercot.feed_configs import ErcotPublicReportConfig
from backend.utils import db, script_logging


def pull_public_report(
    config: ErcotPublicReportConfig,
    *,
    params: dict[str, object] | None = None,
    run_id: str | None = None,
    database: str | None = None,
    metadata: dict | None = None,
) -> pd.DataFrame:
    """Pull and normalize one ERCOT Public Reports response."""
    request_params = {**config.default_params, **(params or {})}
    response = client.make_get_request(
        config.endpoint,
        params=request_params,
        pipeline_name=config.feed_name,
        run_id=run_id,
        feed_name=config.feed_name,
        target_table=config.target_table_fqn,
        database=database,
        metadata=metadata,
    )
    return normalize_public_report_frame(client.parse_response(response), config)


def normalize_public_report_frame(
    df: pd.DataFrame,
    config: ErcotPublicReportConfig,
) -> pd.DataFrame:
    """Coerce ERCOT Public Reports payloads into stable database types."""
    if df.empty:
        return df

    df = df.copy()
    df.columns = [_canonical_column_name(column) for column in df.columns]
    df = df.loc[:, [column for column in config.columns if column in df.columns]].copy()

    for column in config.date_columns:
        if column in df:
            df[column] = _coerce_date(df[column])
    for column in config.datetime_columns:
        if column in df:
            df[column] = _coerce_datetime(df[column])
    for column in config.numeric_columns:
        if column in df:
            df[column] = _coerce_numeric(df[column])
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


def upsert_public_report_frame(
    df: pd.DataFrame,
    config: ErcotPublicReportConfig,
    *,
    database: str | None = None,
) -> None:
    """Upsert a normalized ERCOT feed frame into its configured target table."""
    if df.empty:
        return

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


def run_public_report(
    config: ErcotPublicReportConfig,
    *,
    start_date: datetime | None = None,
    end_date: datetime | None = None,
    delta: relativedelta = relativedelta(days=1),
    database: str | None = None,
) -> pd.DataFrame | None:
    """Run a configured ERCOT report with default day-by-day windows."""
    now = datetime.now()
    start_date = start_date or (now + relativedelta(days=config.default_lookahead_days))
    end_date = end_date or start_date
    database = database or credentials.AZURE_POSTGRESQL_DB_NAME
    run_logger = script_logging.init_logging(
        name=config.feed_name,
        log_dir=script_logging.get_log_dir(Path(__file__).parent / "logs"),
        log_to_file=True,
        delete_if_no_errors=True,
    )
    run_id = str(uuid4())
    rows_processed = 0
    frames: list[pd.DataFrame] = []

    try:
        run_logger.header(config.feed_name)
        run_logger.info(f"Run ID: {run_id}")
        current_date = start_date
        while current_date <= end_date:
            params = _date_window_params(config, current_date)
            run_logger.section(f"Pulling data for {current_date:%Y-%m-%d}...")
            df = pull_public_report(
                config,
                params=params,
                run_id=run_id,
                database=database,
            )
            if df.empty:
                run_logger.section(f"No data returned for {current_date:%Y-%m-%d}.")
            else:
                run_logger.section(f"Upserting {len(df)} rows...")
                upsert_public_report_frame(df, config, database=database)
                rows_processed += len(df)
                frames.append(df)
                run_logger.success(
                    f"Successfully pulled and upserted data for {current_date:%Y-%m-%d}."
                )
            current_date += delta

        run_logger.success(
            f"{config.feed_name} completed; {rows_processed} rows processed."
        )

    except Exception as exc:
        run_logger.exception(f"Pipeline failed: {exc}")
        raise

    finally:
        script_logging.close_logging()

    return pd.concat(frames, ignore_index=True) if frames else None


def _date_window_params(
    config: ErcotPublicReportConfig,
    current_date: datetime,
) -> dict[str, object]:
    if not config.date_from_param or not config.date_to_param:
        return {}
    date_text = current_date.strftime("%Y-%m-%d")
    return {
        config.date_from_param: date_text,
        config.date_to_param: date_text,
    }


def _configured_sql_data_type(
    config: ErcotPublicReportConfig,
    column: str,
    inferred_type: str,
) -> str:
    if column in config.sql_data_types:
        return config.sql_data_types[column]
    if column in config.date_columns:
        return "DATE"
    if column in config.datetime_columns:
        return "TIMESTAMP"
    if column in config.numeric_columns:
        return "DOUBLE PRECISION"
    if column in config.text_columns:
        return "VARCHAR"
    return inferred_type


def _canonical_column_name(column: object) -> str:
    return "".join(
        character for character in str(column).strip().lower() if character.isalnum()
    )


def _coerce_date(values: pd.Series) -> pd.Series:
    return pd.to_datetime(values, errors="coerce").dt.date


def _coerce_datetime(values: pd.Series) -> pd.Series:
    return pd.to_datetime(values, errors="coerce")


def _coerce_numeric(values: pd.Series) -> pd.Series:
    text_values = values.astype("string").str.strip().str.replace(":00", "", regex=False)
    return pd.to_numeric(text_values, errors="coerce")
