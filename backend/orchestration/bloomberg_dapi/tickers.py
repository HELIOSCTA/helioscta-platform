from __future__ import annotations

import logging
import time
from datetime import timezone
from pathlib import Path
from typing import Any
from uuid import uuid4

import pandas as pd

from backend import credentials
from backend.scrapes.bloomberg_dapi import client, config, symbols
from backend.utils import db, script_logging
from backend.utils.ops_logging import log_api_fetch, redact_secrets

API_SCRAPE_NAME = "bbg_tickers"
PROVIDER = "bloomberg_dapi"
TARGET_DATABASE: str | None = None
TARGET_SCHEMA = "bbg_dapi"
TARGET_TABLE = API_SCRAPE_NAME
TARGET_TABLE_FQN = f"{TARGET_SCHEMA}.{TARGET_TABLE}"
PRIMARY_KEY = ["security"]
BLOOMBERG_REFERENCE_FIELDS = [
    "NAME",
    "SECURITY_DES",
    "CRNCY",
    "COUNTRY",
    "MARKET_SECTOR_DES",
]
BLOOMBERG_REFERENCE_COLUMN_MAP = {
    "NAME": "bloomberg_name",
    "SECURITY_DES": "bloomberg_security_description",
    "CRNCY": "bloomberg_currency",
    "COUNTRY": "bloomberg_country",
    "MARKET_SECTOR_DES": "bloomberg_market_sector",
}
BLOOMBERG_REFERENCE_COLUMNS = [
    *BLOOMBERG_REFERENCE_COLUMN_MAP.values(),
    "bloomberg_reference_fetched_at_utc",
]
TICKER_COLUMNS = [*symbols.METADATA_COLUMNS, *BLOOMBERG_REFERENCE_COLUMNS]
TICKER_DATA_TYPES = [
    "VARCHAR",
    "VARCHAR",
    "VARCHAR",
    "VARCHAR",
    "VARCHAR",
    "VARCHAR",
    "VARCHAR",
    "VARCHAR",
    "VARCHAR",
    "VARCHAR",
    "VARCHAR",
    "TEXT",
    "VARCHAR",
    "VARCHAR",
    "VARCHAR",
    "VARCHAR",
    "VARCHAR",
    "TIMESTAMPTZ",
]

logger = logging.getLogger(__name__)


def _pull(
    *,
    enrich_reference_data: bool = False,
    host: str = config.BBG_HOST,
    port: int = config.BBG_PORT,
    request_timeout_seconds: int = config.DEFAULT_REQUEST_TIMEOUT_SECONDS,
) -> pd.DataFrame:
    df = pd.DataFrame(symbols.get_security_metadata(), columns=symbols.METADATA_COLUMNS)
    for column in BLOOMBERG_REFERENCE_COLUMNS:
        df[column] = pd.NA

    if enrich_reference_data:
        reference_df = _fetch_reference_metadata(
            securities=df["security"].tolist(),
            host=host,
            port=port,
            request_timeout_seconds=request_timeout_seconds,
        )
        if not reference_df.empty:
            df = df.drop(columns=BLOOMBERG_REFERENCE_COLUMNS).merge(
                reference_df,
                on="security",
                how="left",
            )

    return df[TICKER_COLUMNS]


def _fetch_reference_metadata(
    *,
    securities: list[str],
    host: str = config.BBG_HOST,
    port: int = config.BBG_PORT,
    request_timeout_seconds: int = config.DEFAULT_REQUEST_TIMEOUT_SECONDS,
) -> pd.DataFrame:
    fetched_at_utc = pd.Timestamp.now(tz=timezone.utc)
    with client.bloomberg_session(host=host, port=port) as session:
        reference_df = client.fetch_reference_data(
            session=session,
            securities=securities,
            fields=BLOOMBERG_REFERENCE_FIELDS,
            request_timeout_seconds=request_timeout_seconds,
        )

    if reference_df.empty:
        return pd.DataFrame(columns=["security", *BLOOMBERG_REFERENCE_COLUMNS])

    reference_df = reference_df.rename(columns=BLOOMBERG_REFERENCE_COLUMN_MAP)
    for column in BLOOMBERG_REFERENCE_COLUMN_MAP.values():
        if column not in reference_df.columns:
            reference_df[column] = pd.NA
    reference_df["bloomberg_reference_fetched_at_utc"] = fetched_at_utc
    return reference_df[["security", *BLOOMBERG_REFERENCE_COLUMNS]]


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
        columns=TICKER_COLUMNS,
        data_types=TICKER_DATA_TYPES,
        primary_key=primary_key or PRIMARY_KEY,
    )


def main(
    *,
    database: str | None = None,
    run_mode: str = "manual",
    enrich_reference_data: bool = False,
    host: str = config.BBG_HOST,
    port: int = config.BBG_PORT,
    request_timeout_seconds: int = config.DEFAULT_REQUEST_TIMEOUT_SECONDS,
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
    df = pd.DataFrame(columns=TICKER_COLUMNS)
    telemetry_metadata = {
        "run_mode": run_mode,
        "enrich_reference_data": enrich_reference_data,
        "reference_fields": BLOOMBERG_REFERENCE_FIELDS if enrich_reference_data else [],
        **(metadata or {}),
    }

    try:
        run_logger.header(API_SCRAPE_NAME)
        run_logger.info(f"Run ID: {run_id}")
        run_logger.info(f"Run mode: {run_mode}")
        run_logger.info(f"Enrich reference data: {enrich_reference_data}")

        run_logger.section("Loading fixed Bloomberg ticker universe ...")
        df = _pull(
            enrich_reference_data=enrich_reference_data,
            host=host,
            port=port,
            request_timeout_seconds=request_timeout_seconds,
        )

        run_logger.section(f"Upserting {len(df)} ticker rows ...")
        if not df.empty:
            _upsert(df=df, database=database)

        elapsed_ms = round((time.perf_counter() - started) * 1000)
        log_api_fetch(
            actor_type="scrape",
            provider=PROVIDER,
            pipeline_name=API_SCRAPE_NAME,
            run_id=run_id,
            operation_name="bbg_tickers_upsert",
            target_table=TARGET_TABLE_FQN,
            method="BLPAPI" if enrich_reference_data else "LOCAL",
            target_host=host if enrich_reference_data else "local",
            target_path=config.REFDATA_SERVICE
            if enrich_reference_data
            else "backend.scrapes.bloomberg_dapi.symbols",
            status="success",
            elapsed_ms=elapsed_ms,
            rows_returned=len(df),
            rows_written=len(df),
            metadata={
                **telemetry_metadata,
                "source": "fixed_repo_symbol_list",
            },
            database=database,
        )
        run_logger.success(f"{API_SCRAPE_NAME} completed; {len(df)} rows processed.")
        return df

    except Exception as exc:
        elapsed_ms = round((time.perf_counter() - started) * 1000)
        log_api_fetch(
            actor_type="scrape",
            provider=PROVIDER,
            pipeline_name=API_SCRAPE_NAME,
            run_id=run_id,
            operation_name="bbg_tickers_upsert",
            target_table=TARGET_TABLE_FQN,
            method="BLPAPI" if enrich_reference_data else "LOCAL",
            target_host=host if enrich_reference_data else "local",
            target_path=config.REFDATA_SERVICE
            if enrich_reference_data
            else "backend.scrapes.bloomberg_dapi.symbols",
            status="failure",
            elapsed_ms=elapsed_ms,
            rows_returned=len(df),
            rows_written=0,
            error_type=type(exc).__name__,
            error_message=redact_secrets(str(exc)),
            metadata=telemetry_metadata,
            database=database,
        )
        run_logger.exception(f"Bloomberg ticker universe load failed: {redact_secrets(str(exc))}")
        raise

    finally:
        script_logging.close_logging()


if __name__ == "__main__":
    raise SystemExit(0 if main() is not None else 1)
