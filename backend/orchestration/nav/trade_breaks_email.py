"""Orchestrate NAV trade break workbook email delivery."""

from __future__ import annotations

import os
import time
from pathlib import Path
from typing import Any

from backend.scrapes.nav import trade_breaks as scrape
from backend.utils import script_logging
from backend.utils.ops_logging import log_api_fetch, redact_secrets

PIPELINE_NAME = scrape.API_SCRAPE_NAME
PROVIDER = scrape.SOURCE_SYSTEM
OPERATION_NAME = scrape.API_SCRAPE_NAME
DEFAULT_LOOKBACK_DAYS = scrape.DEFAULT_LOOKBACK_DAYS


def main(
    *,
    lookback_days: int = DEFAULT_LOOKBACK_DAYS,
    local_dir: str | Path | None = None,
    database: str | None = None,
    run_mode: str = "manual",
    metadata: dict[str, Any] | None = None,
) -> int:
    """Download the latest NAV trade break workbook and email it."""
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

        summary = scrape.run_nav_trade_breaks_email(
            lookback_days=lookback_days,
            local_dir=local_dir,
        )
        emails_sent = int(summary.get("emails_sent", 0))
        rows_processed = int(summary.get("rows_processed", 0))
        run_logger.success(
            f"{PIPELINE_NAME} completed; {rows_processed:,} rows summarized "
            f"and {emails_sent:,} emails sent."
        )
        return 0
    except Exception as exc:
        status = "failure"
        error_type = type(exc).__name__
        error_message = redact_secrets(str(exc))
        run_logger.exception(f"NAV trade breaks email failed: {error_message}")
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
            local_dir=local_dir,
        )
        script_logging.close_logging()


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
    local_dir: str | Path | None,
) -> None:
    telemetry_metadata: dict[str, Any] = {
        "run_mode": run_mode,
        "lookback_days": lookback_days,
        "local_dir": str(scrape.resolve_local_dir(local_dir)),
        **(metadata or {}),
    }
    if summary:
        telemetry_metadata.update(summary)

    log_api_fetch(
        actor_type="backend",
        provider=PROVIDER,
        pipeline_name=PIPELINE_NAME,
        operation_name=OPERATION_NAME,
        target_table=scrape.TARGET_NAME,
        method="SFTP_EMAIL",
        target_host=os.environ.get("NAV_SFTP_HOST") or "nav-sftp",
        target_path=os.environ.get("NAV_SFTP_REMOTE_DIR") or "/",
        status=status,
        http_status=None,
        elapsed_ms=elapsed_ms,
        rows_returned=(
            int(summary.get("rows_processed", 0)) if summary else None
        ),
        rows_written=(
            int(summary.get("emails_sent", 0)) if summary else None
        ),
        error_type=error_type,
        error_message=error_message,
        metadata=telemetry_metadata,
        database=database,
    )


if __name__ == "__main__":
    raise SystemExit(main())
