"""Orchestrate local NAV SFTP position valuation pulls."""

from __future__ import annotations

import os
import time
from collections.abc import Sequence
from pathlib import Path
from typing import Any

from backend.scrapes.nav import positions as scrape
from backend.utils import script_logging
from backend.utils.ops_logging import log_api_fetch, redact_secrets

PIPELINE_NAME = "nav_positions"
PROVIDER = "nav_sftp"
DEFAULT_LOOKBACK_DAYS = scrape.DEFAULT_LOOKBACK_DAYS
DEFAULT_SCHEDULED_LOOKBACK_DAYS = scrape.DEFAULT_LOOKBACK_DAYS
SCHEDULED_OPERATION_NAME = f"{PIPELINE_NAME}_scheduled"


class DataNotAvailable(RuntimeError):
    """Raised when a scheduled NAV pull cannot load any source rows."""


def main(
    *,
    lookback_days: int = DEFAULT_LOOKBACK_DAYS,
    fund_codes: Sequence[str] | None = None,
    local_dir: str | Path | None = None,
    database: str | None = None,
    run_mode: str = "manual",
    metadata: dict[str, Any] | None = None,
    operation_name: str = PIPELINE_NAME,
    require_rows: bool = False,
) -> int:
    """Run the local NAV position scrape and write one telemetry row."""
    run_logger = script_logging.init_logging(
        name=PIPELINE_NAME,
        log_dir=script_logging.get_log_dir(Path(__file__).parent / "logs"),
        log_to_file=True,
        delete_if_no_errors=True,
    )
    started_at = time.perf_counter()
    summary: dict[str, object] | None = None
    status = "success"
    error_type: str | None = None
    error_message: str | None = None

    try:
        run_logger.header(PIPELINE_NAME)
        run_logger.info(f"Run mode: {run_mode}")
        run_logger.info(f"Lookback days: {lookback_days}")
        if fund_codes is not None:
            run_logger.info(f"Fund codes: {', '.join(fund_codes)}")

        summary = scrape.run_nav_positions(
            lookback_days=lookback_days,
            fund_codes=fund_codes,
            local_dir=local_dir,
            database=database,
        )
        rows_processed = int(summary.get("rows_processed", 0))
        if require_rows and rows_processed <= 0:
            raise DataNotAvailable(
                "NAV positions scheduled pull completed without source rows."
            )
        run_logger.success(
            f"{PIPELINE_NAME} completed; {rows_processed:,} rows processed."
        )
        return 0
    except Exception as exc:
        status = "failure"
        error_type = type(exc).__name__
        error_message = redact_secrets(str(exc))
        run_logger.exception(f"NAV positions orchestration failed: {error_message}")
        raise
    finally:
        elapsed_ms = round((time.perf_counter() - started_at) * 1000)
        _log_fetch(
            status=status,
            elapsed_ms=elapsed_ms,
            summary=summary,
            error_type=error_type,
            error_message=error_message,
            run_mode=run_mode,
            lookback_days=lookback_days,
            metadata=metadata,
            database=database,
            operation_name=operation_name,
        )
        script_logging.close_logging()


def scheduled_main(
    *,
    lookback_days: int = DEFAULT_SCHEDULED_LOOKBACK_DAYS,
    fund_codes: Sequence[str] | None = None,
    local_dir: str | Path | None = None,
    database: str | None = None,
    run_mode: str = "scheduler",
    metadata: dict[str, Any] | None = None,
) -> int:
    """Run the NAV positions scheduled path and require a non-empty source load."""
    scheduled_metadata = {
        "scheduler": "windows_task_scheduler",
        "require_rows": True,
        **(metadata or {}),
    }
    return main(
        lookback_days=lookback_days,
        fund_codes=fund_codes,
        local_dir=local_dir,
        database=database,
        run_mode=run_mode,
        metadata=scheduled_metadata,
        operation_name=SCHEDULED_OPERATION_NAME,
        require_rows=True,
    )


def _log_fetch(
    *,
    status: str,
    elapsed_ms: int,
    summary: dict[str, object] | None,
    error_type: str | None,
    error_message: str | None,
    run_mode: str,
    lookback_days: int,
    metadata: dict[str, Any] | None,
    database: str | None,
    operation_name: str = PIPELINE_NAME,
) -> None:
    rows_processed = int(summary.get("rows_processed", 0)) if summary else None
    telemetry_metadata: dict[str, Any] = {
        "run_mode": run_mode,
        "lookback_days": lookback_days,
        **(metadata or {}),
    }
    if summary:
        telemetry_metadata.update(summary)

    log_api_fetch(
        actor_type="backend",
        provider=PROVIDER,
        pipeline_name=PIPELINE_NAME,
        operation_name=operation_name,
        target_table=scrape.TARGET_TABLE_FQN,
        method="SFTP",
        target_host=os.environ.get("NAV_SFTP_HOST") or "nav-sftp",
        target_path=os.environ.get("NAV_SFTP_REMOTE_DIR") or "/",
        status=status,
        http_status=None,
        elapsed_ms=elapsed_ms,
        rows_returned=rows_processed,
        rows_written=rows_processed,
        error_type=error_type,
        error_message=error_message,
        metadata=telemetry_metadata,
        database=database,
    )


if __name__ == "__main__":
    raise SystemExit(main())
