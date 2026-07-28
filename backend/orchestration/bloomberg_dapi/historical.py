from __future__ import annotations

import logging
import time
from datetime import date, timedelta, timezone
from pathlib import Path
from typing import Any
from uuid import uuid4

import pandas as pd

from backend import credentials
from backend.scrapes.bloomberg_dapi import client, config, symbols
from backend.utils import db, script_logging
from backend.utils.ops_logging import log_api_fetch, redact_secrets

API_SCRAPE_NAME = "bbg_historical"
PROVIDER = "bloomberg_dapi"
TARGET_DATABASE: str | None = None
TARGET_SCHEMA = "bbg_dapi"
TARGET_TABLE = API_SCRAPE_NAME
TARGET_TABLE_FQN = f"{TARGET_SCHEMA}.{TARGET_TABLE}"
PRIMARY_KEY = ["security", "date", "data_type"]
DEFAULT_LOOKBACK_DAYS = 60
DEFAULT_FIELDS = [config.DEFAULT_FIELD]

logger = logging.getLogger(__name__)


def _resolve_universe(
    securities: list[str] | list[tuple[str, str]] | None,
    fields: list[str] | None,
) -> tuple[list[str], list[str]]:
    if securities is None:
        security_fields = symbols.get_security_fields()
        return (
            [security for security, _ in security_fields],
            sorted({data_type for _, data_type in security_fields}),
        )

    if securities and isinstance(securities[0], tuple):
        security_fields = [(str(security), str(data_type)) for security, data_type in securities]
        return (
            [security for security, _ in security_fields],
            sorted({data_type for _, data_type in security_fields}),
        )

    return (
        [str(security) for security in securities],
        [str(field) for field in (fields or DEFAULT_FIELDS)],
    )


def _format_historical(
    df: pd.DataFrame,
    *,
    fields: list[str],
    fetched_at_utc: pd.Timestamp | None = None,
) -> pd.DataFrame:
    columns = ["security", "date", "data_type", "value", "source_fetched_at_utc"]
    if df.empty:
        return pd.DataFrame(columns=columns)

    missing = {"security", "date"} - set(df.columns)
    if missing:
        raise ValueError(f"Bloomberg historical response missing columns: {sorted(missing)}")

    fetched_at_utc = fetched_at_utc or pd.Timestamp.now(tz=timezone.utc)
    value_fields = [field for field in fields if field in df.columns]
    if not value_fields:
        return pd.DataFrame(columns=columns)

    formatted = df.copy()
    formatted["date"] = pd.to_datetime(formatted["date"]).dt.date
    formatted["source_fetched_at_utc"] = fetched_at_utc
    formatted = formatted.melt(
        id_vars=["security", "date", "source_fetched_at_utc"],
        value_vars=value_fields,
        var_name="data_type",
        value_name="value",
    )
    formatted = formatted.dropna(subset=["value"]).reset_index(drop=True)
    return formatted[columns]


def _pull(
    *,
    securities: list[str] | list[tuple[str, str]] | None = None,
    fields: list[str] | None = None,
    start_date: date | None = None,
    end_date: date | None = None,
    host: str = config.BBG_HOST,
    port: int = config.BBG_PORT,
    request_timeout_seconds: int = config.DEFAULT_REQUEST_TIMEOUT_SECONDS,
) -> pd.DataFrame:
    resolved_securities, resolved_fields = _resolve_universe(securities, fields)
    if end_date is None:
        end_date = date.today()
    if start_date is None:
        start_date = end_date - timedelta(days=DEFAULT_LOOKBACK_DAYS)
    if start_date > end_date:
        raise ValueError(f"start_date {start_date} cannot be after end_date {end_date}")

    with client.bloomberg_session(host=host, port=port) as session:
        raw = client.fetch_historical_data(
            session=session,
            securities=resolved_securities,
            fields=resolved_fields,
            start_date=start_date,
            end_date=end_date,
            request_timeout_seconds=request_timeout_seconds,
        )

    return _format_historical(raw, fields=resolved_fields)


def _upsert(
    df: pd.DataFrame,
    *,
    database: str | None = TARGET_DATABASE,
    schema: str = TARGET_SCHEMA,
    table_name: str = TARGET_TABLE,
    primary_key: list[str] | None = None,
) -> None:
    db.upsert_dataframe(
        database=database,
        schema=schema,
        table_name=table_name,
        df=df,
        columns=[
            "security",
            "date",
            "data_type",
            "value",
            "source_fetched_at_utc",
        ],
        data_types=["VARCHAR", "DATE", "VARCHAR", "DOUBLE PRECISION", "TIMESTAMPTZ"],
        primary_key=primary_key or PRIMARY_KEY,
    )


def main(
    *,
    securities: list[str] | list[tuple[str, str]] | None = None,
    fields: list[str] | None = None,
    start_date: date | None = None,
    end_date: date | None = None,
    host: str = config.BBG_HOST,
    port: int = config.BBG_PORT,
    request_timeout_seconds: int = config.DEFAULT_REQUEST_TIMEOUT_SECONDS,
    database: str | None = None,
    run_mode: str = "manual",
    dry_run: bool = False,
    metadata: dict[str, Any] | None = None,
) -> pd.DataFrame:
    database = database or credentials.AZURE_POSTGRESQL_DB_NAME
    run_logger = script_logging.init_logging(
        name=API_SCRAPE_NAME,
        log_dir=script_logging.get_log_dir(Path(__file__).parent / "logs"),
        log_to_file=True,
        delete_if_no_errors=True,
    )
    run_id = str(uuid4())
    started = time.perf_counter()
    df = pd.DataFrame(
        columns=["security", "date", "data_type", "value", "source_fetched_at_utc"]
    )
    resolved_securities, resolved_fields = _resolve_universe(securities, fields)
    resolved_end_date = end_date or date.today()
    resolved_start_date = start_date or (
        resolved_end_date - timedelta(days=DEFAULT_LOOKBACK_DAYS)
    )
    telemetry_metadata = {
        "run_mode": run_mode,
        "dry_run": dry_run,
        "start_date": resolved_start_date.isoformat(),
        "end_date": resolved_end_date.isoformat(),
        "security_count": len(resolved_securities),
        "field_count": len(resolved_fields),
        "fields": resolved_fields,
        "host": host,
        "port": port,
        **(metadata or {}),
    }

    try:
        run_logger.header(API_SCRAPE_NAME)
        run_logger.info(f"Run ID: {run_id}")
        run_logger.info(f"Run mode: {run_mode}")
        run_logger.info(f"Dry run: {dry_run}")

        run_logger.section("Pulling Bloomberg historical data ...")
        df = _pull(
            securities=resolved_securities,
            fields=resolved_fields,
            start_date=resolved_start_date,
            end_date=resolved_end_date,
            host=host,
            port=port,
            request_timeout_seconds=request_timeout_seconds,
        )

        rows_written = 0
        if df.empty:
            run_logger.info("Bloomberg returned no non-null historical values; skipping upsert.")
        elif dry_run:
            run_logger.info(f"Dry run requested; skipping upsert for {len(df)} rows.")
        else:
            run_logger.section(f"Upserting {len(df)} Bloomberg historical rows ...")
            _upsert(df=df, database=database)
            rows_written = len(df)

        elapsed_ms = round((time.perf_counter() - started) * 1000)
        log_api_fetch(
            actor_type="scrape",
            provider=PROVIDER,
            pipeline_name=API_SCRAPE_NAME,
            run_id=run_id,
            operation_name="bbg_historical_pull",
            target_table=TARGET_TABLE_FQN,
            method="BLPAPI",
            target_host=host,
            target_path=config.REFDATA_SERVICE,
            status="success",
            elapsed_ms=elapsed_ms,
            rows_returned=len(df),
            rows_written=rows_written,
            metadata=telemetry_metadata,
            database=database,
        )
        run_logger.success(f"{API_SCRAPE_NAME} completed; {len(df)} rows returned.")
        return df

    except Exception as exc:
        elapsed_ms = round((time.perf_counter() - started) * 1000)
        log_api_fetch(
            actor_type="scrape",
            provider=PROVIDER,
            pipeline_name=API_SCRAPE_NAME,
            run_id=run_id,
            operation_name="bbg_historical_pull",
            target_table=TARGET_TABLE_FQN,
            method="BLPAPI",
            target_host=host,
            target_path=config.REFDATA_SERVICE,
            status="failure",
            elapsed_ms=elapsed_ms,
            rows_returned=len(df),
            rows_written=0,
            error_type=type(exc).__name__,
            error_message=redact_secrets(str(exc)),
            metadata=telemetry_metadata,
            database=database,
        )
        run_logger.exception(f"Bloomberg historical pull failed: {redact_secrets(str(exc))}")
        raise

    finally:
        script_logging.close_logging()


def scheduled_main(
    *,
    lookback_days: int = DEFAULT_LOOKBACK_DAYS,
    host: str = config.BBG_HOST,
    port: int = config.BBG_PORT,
    request_timeout_seconds: int = config.DEFAULT_REQUEST_TIMEOUT_SECONDS,
    database: str | None = None,
) -> int:
    from backend.orchestration.bloomberg_dapi import tickers

    target_end_date = date.today()
    target_start_date = target_end_date - timedelta(days=lookback_days)
    tickers.main(
        database=database,
        run_mode="scheduled",
        enrich_reference_data=True,
        host=host,
        port=port,
        request_timeout_seconds=request_timeout_seconds,
        metadata={"scheduled_workflow": API_SCRAPE_NAME},
    )
    main(
        start_date=target_start_date,
        end_date=target_end_date,
        host=host,
        port=port,
        request_timeout_seconds=request_timeout_seconds,
        database=database,
        run_mode="scheduled",
        metadata={"lookback_days": lookback_days},
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(0 if main() is not None else 1)
