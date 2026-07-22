"""Orchestrate Clear Street trade CSV email delivery to NAV."""

from __future__ import annotations

import time
from datetime import date, datetime
from pathlib import Path
from typing import Any

from backend.scrapes.clear_street import nav_email as scrape
from backend.utils import script_logging
from backend.utils.ops_logging import log_api_fetch, redact_secrets

PIPELINE_NAME = scrape.API_SCRAPE_NAME
PROVIDER = scrape.SOURCE_SYSTEM
OPERATION_NAME = scrape.API_SCRAPE_NAME


def main(
    *,
    expected_trade_date: str | date | datetime | None = None,
    source_summary: dict[str, object] | None = None,
    local_dir: str | Path | None = None,
    database: str | None = None,
    run_mode: str = "manual",
    metadata: dict[str, Any] | None = None,
    run_logger: Any | None = None,
) -> int:
    """Email the latest raw Clear Street transaction file to NAV."""
    owns_logger = run_logger is None
    if run_logger is None:
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
        if expected_trade_date is not None:
            run_logger.info(f"Expected trade date: {expected_trade_date}")

        summary = scrape.run_clear_street_trades_nav_email(
            expected_trade_date=expected_trade_date,
            source_summary=source_summary,
            local_dir=local_dir,
        )
        emails_sent = int(summary.get("emails_sent", 0) or 0)
        run_logger.success(
            f"{PIPELINE_NAME} completed; {emails_sent:,} NAV emails sent."
        )
        return 0
    except Exception as exc:
        status = "failure"
        error_type = type(exc).__name__
        error_message = redact_secrets(str(exc))
        run_logger.exception(
            f"Clear Street NAV email orchestration failed: {error_message}"
        )
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
            metadata=metadata,
            database=database,
            expected_trade_date=expected_trade_date,
            source_summary=source_summary,
            local_dir=local_dir,
        )
        if owns_logger:
            script_logging.close_logging()


def _log_fetch(
    *,
    status: str,
    elapsed_ms: int,
    summary: dict[str, object] | None,
    error_type: str | None,
    error_message: str | None,
    run_mode: str,
    metadata: dict[str, Any] | None,
    database: str | None,
    expected_trade_date: str | date | datetime | None,
    source_summary: dict[str, object] | None,
    local_dir: str | Path | None,
) -> None:
    expected = _expected_trade_date_metadata(expected_trade_date)
    resolved_dir = scrape.resolve_local_dir(
        local_dir=local_dir,
        source_summary=source_summary,
    )
    telemetry_metadata: dict[str, Any] = {
        "run_mode": run_mode,
        "expected_trade_date": expected,
        "local_dir": str(resolved_dir),
        **(metadata or {}),
    }
    if summary:
        telemetry_metadata.update(summary)

    emails_sent = int(summary.get("emails_sent", 0)) if summary else None
    sender = str(summary.get("sender_email")) if summary else None
    log_api_fetch(
        actor_type="backend",
        provider=PROVIDER,
        pipeline_name=PIPELINE_NAME,
        operation_name=OPERATION_NAME,
        target_table=scrape.TARGET_NAME,
        method="EMAIL",
        target_host="graph.microsoft.com",
        target_path=(
            f"/v1.0/users/{sender}/sendMail" if sender else "/v1.0/users/sendMail"
        ),
        status=status,
        http_status=None,
        elapsed_ms=elapsed_ms,
        rows_returned=1 if summary else None,
        rows_written=emails_sent,
        error_type=error_type,
        error_message=error_message,
        metadata=telemetry_metadata,
        database=database,
    )


def _expected_trade_date_metadata(
    value: str | date | datetime | None,
) -> str | None:
    if value is None:
        return None
    return scrape.normalize_trade_date(value)


if __name__ == "__main__":
    raise SystemExit(main())
