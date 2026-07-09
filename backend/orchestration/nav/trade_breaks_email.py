"""Orchestrate NAV trade break workbook email delivery."""

from __future__ import annotations

import os
import time
from pathlib import Path
from typing import Any

from backend.scrapes.nav import trade_breaks as scrape
from backend.utils import email_notifications, script_logging
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

        summary = scrape.run_nav_trade_breaks(
            lookback_days=lookback_days,
            local_dir=local_dir,
        )
        email_summary = _notify_nav_trade_breaks_email_success(
            summary=summary,
            database=database,
            run_logger=run_logger,
        )
        summary.update(email_summary)
        emails_queued = int(summary.get("emails_queued", 0))
        emails_processed = int(summary.get("emails_processed", 0))
        rows_processed = int(summary.get("rows_processed", 0))
        run_logger.success(
            f"{PIPELINE_NAME} completed; {rows_processed:,} rows summarized "
            f"with {emails_queued:,} emails queued and "
            f"{emails_processed:,} outbox rows processed."
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


def _notify_nav_trade_breaks_email_success(
    *,
    summary: dict[str, object],
    database: str | None,
    run_logger: Any,
) -> dict[str, object]:
    attachment_path = _source_summary_file_path(summary)
    recipients: list[str] = []
    queued = 0
    email_subject: str | None = None

    for recipient_email in email_notifications.credentials.HELIOS_EMAIL_RECIPIENTS:
        recipient_email = recipient_email.strip().lower()
        if not recipient_email:
            continue
        recipients.append(recipient_email)
        message = email_notifications.build_nav_trade_breaks_file_email(
            summary=summary,
            recipient_email=recipient_email,
            attachment_path=attachment_path,
        )
        email_subject = str(message["subject"])
        enqueued = email_notifications.enqueue_email_notification(
            database=database,
            **message,
        )
        queued += 1 if enqueued.get("created") else 0

    if not recipients:
        raise ValueError("At least one NAV trade breaks email recipient is required.")

    notifications_enabled = email_notifications.notifications_enabled()
    processed_count = 0
    if notifications_enabled:
        processed = email_notifications.send_due_email_notifications(
            limit=20,
            database=database,
        )
        processed_count = len(processed)
        run_logger.info(
            "NAV trade breaks email notification "
            f"queued={queued}, processed={processed_count}."
        )
    else:
        run_logger.info(
            f"NAV trade breaks email notification queued={queued}; "
            "sending is disabled."
        )

    return {
        "email_notifications_enabled": notifications_enabled,
        "emails_queued": queued,
        "emails_processed": processed_count,
        "email_subject": email_subject,
        "recipient_count": len(recipients),
        "recipient_emails": recipients,
        "attachment_paths": [str(attachment_path)],
    }


def _source_summary_file_path(summary: dict[str, object]) -> Path:
    local_path = summary.get("source_file_path")
    if not local_path:
        raise FileNotFoundError("NAV trade breaks summary has no source_file_path.")
    path = Path(str(local_path))
    if not path.exists():
        raise FileNotFoundError(f"NAV trade breaks workbook not found: {path}")
    return path


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
            int(summary.get("emails_queued", 0)) if summary else None
        ),
        error_type=error_type,
        error_message=error_message,
        metadata=telemetry_metadata,
        database=database,
    )


if __name__ == "__main__":
    raise SystemExit(main())
