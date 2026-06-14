"""Orchestrate ISO-NE forecast feeds."""
from __future__ import annotations

from datetime import datetime
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

import pandas as pd
from dateutil.relativedelta import relativedelta

from backend import credentials
from backend.scrapes.power.isone import forecast_feeds
from backend.utils import script_logging
from backend.utils.ops_logging import PipelineRunLogger, redact_secrets


API_SCRAPE_NAME = "isone_forecast_batch"
LOCAL_MARKET_TIMEZONE = "America/New_York"
DEFAULT_DELTA = relativedelta(days=1)
DEFAULT_LOOKBACK_DAYS = 0
DEFAULT_FEEDS = tuple(forecast_feeds.FEED_CONFIGS.keys())


def _local_now() -> datetime:
    return datetime.now(ZoneInfo(LOCAL_MARKET_TIMEZONE)).replace(tzinfo=None)


def main(
    start_date: datetime | None = None,
    end_date: datetime | None = None,
    delta: relativedelta = DEFAULT_DELTA,
    feed_names: tuple[str, ...] = DEFAULT_FEEDS,
    database: str | None = None,
    run_mode: str = "scheduled",
    metadata: dict[str, Any] | None = None,
) -> dict[str, pd.DataFrame]:
    """Run ISO-NE forecast feed workflows."""
    target_day = _local_now() - relativedelta(days=DEFAULT_LOOKBACK_DAYS)
    start_date = start_date or target_day
    end_date = end_date or target_day
    database = database or credentials.AZURE_POSTGRESQL_DB_NAME
    run_logger = script_logging.init_logging(
        name=API_SCRAPE_NAME,
        log_dir=script_logging.get_log_dir(Path(__file__).parent / "logs"),
        log_to_file=True,
        delete_if_no_errors=True,
    )
    results: dict[str, pd.DataFrame] = {}

    try:
        run_logger.header(API_SCRAPE_NAME)
        run_logger.info(f"Run mode: {run_mode}")

        for feed_name in feed_names:
            config = forecast_feeds.FEED_CONFIGS[feed_name]
            pipeline_run = PipelineRunLogger(
                pipeline_name=feed_name,
                source="power",
                target_table=config.target_table_fqn,
                operation_type="upsert",
                log_file_path=run_logger.log_file_path,
                database=database,
            )
            pipeline_run.start()
            rows_processed = 0
            frames: list[pd.DataFrame] = []

            try:
                fetch_metadata = {"run_mode": run_mode, **(metadata or {})}
                current_date = start_date
                while current_date <= end_date:
                    run_logger.section(
                        f"Pulling {feed_name} for {current_date:%Y-%m-%d}..."
                    )
                    df = forecast_feeds._pull(
                        config=config,
                        start_date=current_date,
                        run_id=pipeline_run.run_id,
                        database=database,
                        metadata=fetch_metadata,
                    )
                    if not df.empty:
                        forecast_feeds._upsert(
                            df=df,
                            config=config,
                            database=database,
                        )
                        rows_processed += len(df)
                        frames.append(df)
                    current_date += delta

                combined = (
                    pd.concat(frames, ignore_index=True) if frames else pd.DataFrame()
                )
                results[feed_name] = combined
                pipeline_run.success(rows_processed=rows_processed)
                run_logger.success(
                    f"{feed_name} completed; {rows_processed} rows processed."
                )
            except Exception as exc:
                run_logger.exception(
                    f"{feed_name} failed: {redact_secrets(str(exc))}"
                )
                pipeline_run.failure(error=exc, rows_processed=rows_processed)
                raise

    finally:
        script_logging.close_logging()

    return results


if __name__ == "__main__":
    main()
