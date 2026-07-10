"""Orchestrate NAV trade break workbook email delivery."""

from __future__ import annotations

import os
import time
from collections.abc import Callable
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any

from backend.scrapes.nav import trade_breaks as scrape
from backend.utils import email_notifications, script_logging
from backend.utils.ops_logging import log_api_fetch, redact_secrets

PIPELINE_NAME = scrape.API_SCRAPE_NAME
PROVIDER = scrape.SOURCE_SYSTEM
OPERATION_NAME = scrape.API_SCRAPE_NAME
DEFAULT_LOOKBACK_DAYS = scrape.DEFAULT_LOOKBACK_DAYS
DEFAULT_SCHEDULED_LOOKBACK_DAYS = 1
DEFAULT_POLL_WAIT_SECONDS = 300
DEFAULT_POLL_WINDOW_MINUTES = 420
DEFAULT_POLL_DEADLINE_HOUR = 11
SCHEDULED_OPERATION_NAME = f"{PIPELINE_NAME}_scheduled"


class DataNotAvailable(RuntimeError):
    """Raised when a scheduled NAV trade-break pull cannot find its source file."""


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


def scheduled_main(
    *,
    lookback_days: int = DEFAULT_SCHEDULED_LOOKBACK_DAYS,
    local_dir: str | Path | None = None,
    database: str | None = None,
    target_nav_date: str | date | datetime | None = None,
    poll_wait_seconds: int = DEFAULT_POLL_WAIT_SECONDS,
    poll_window_minutes: int = DEFAULT_POLL_WINDOW_MINUTES,
    poll_deadline_hour: int | None = DEFAULT_POLL_DEADLINE_HOUR,
    run_mode: str = "scheduler",
    metadata: dict[str, Any] | None = None,
    now_fn: Callable[[], datetime] | None = None,
    sleep_fn: Callable[[float], None] = time.sleep,
    send_email: bool = True,
) -> int:
    """Poll NAV SFTP until the target NAV trade-break workbook is available."""
    if lookback_days < 1:
        raise ValueError("lookback_days must be at least 1.")
    if poll_wait_seconds < 1:
        raise ValueError("poll_wait_seconds must be at least 1.")
    if poll_window_minutes < 1:
        raise ValueError("poll_window_minutes must be at least 1.")
    if poll_deadline_hour is not None and not 0 <= poll_deadline_hour <= 23:
        raise ValueError("poll_deadline_hour must be between 0 and 23.")

    run_logger = script_logging.init_logging(
        name=PIPELINE_NAME,
        log_dir=script_logging.get_log_dir(Path(__file__).parent / "logs"),
        log_to_file=True,
        delete_if_no_errors=True,
    )
    now = now_fn or _now_local
    window_start_at = now()
    if window_start_at.tzinfo is None:
        window_start_at = window_start_at.astimezone()
    deadline_at = _resolve_poll_deadline(
        start_at=window_start_at,
        poll_window_minutes=poll_window_minutes,
        poll_deadline_hour=poll_deadline_hour,
    )
    resolved_target_nav_date = (
        scrape.normalize_nav_date(target_nav_date)
        if target_nav_date is not None
        else _previous_business_date(window_start_at.date())
    )
    started_at = time.perf_counter()
    summary: dict[str, object] | None = None
    status = "failure"
    error_type: str | None = "DataNotAvailable"
    error_message: str | None = None
    poll_count = 0
    email_summary: dict[str, object] = {
        "email_notifications_enabled": send_email,
        "emails_queued": 0,
        "emails_processed": 0,
    }

    try:
        run_logger.header(f"{PIPELINE_NAME} scheduled poll")
        run_logger.info(f"Run mode: {run_mode}")
        run_logger.info(f"Target NAV date: {resolved_target_nav_date.isoformat()}")
        run_logger.info(f"Polling every {poll_wait_seconds:,} seconds.")
        run_logger.info(
            "Polling window: "
            f"{window_start_at.isoformat()} to {deadline_at.isoformat()}"
        )

        while True:
            current_time = now()
            if current_time.tzinfo is None:
                current_time = current_time.astimezone()
            if current_time >= deadline_at:
                raise DataNotAvailable(
                    "NAV trade break file was not available by the polling "
                    f"deadline for target NAV date {resolved_target_nav_date}."
                )

            poll_count += 1
            run_logger.info(
                f"Poll {poll_count}: checking NAV trade breaks target "
                f"{resolved_target_nav_date.isoformat()}."
            )
            summary = scrape.run_nav_trade_breaks(
                lookback_days=lookback_days,
                local_dir=local_dir,
                target_nav_date=resolved_target_nav_date,
                require_target_file=True,
            )
            if summary.get("target_file_found") is True:
                status = "success"
                error_type = None
                error_message = None
                rows_processed = int(summary.get("rows_processed", 0) or 0)
                if send_email:
                    email_summary = _notify_nav_trade_breaks_email_success(
                        summary=summary,
                        database=database,
                        run_logger=run_logger,
                    )
                    summary.update(email_summary)
                run_logger.success(
                    f"{PIPELINE_NAME} scheduled poll completed; "
                    f"{rows_processed:,} rows summarized."
                )
                return 0

            run_logger.info("NAV trade breaks target file not available yet.")
            current_time = now()
            if current_time.tzinfo is None:
                current_time = current_time.astimezone()
            if current_time >= deadline_at:
                raise DataNotAvailable(
                    "NAV trade break file was not available by the polling "
                    f"deadline for target NAV date {resolved_target_nav_date}."
                )

            seconds_until_deadline = (deadline_at - current_time).total_seconds()
            sleep_seconds = min(float(poll_wait_seconds), seconds_until_deadline)
            run_logger.info(f"Sleeping {sleep_seconds:.0f} seconds.")
            sleep_fn(max(0.0, sleep_seconds))
    except DataNotAvailable as exc:
        error_type = type(exc).__name__
        error_message = redact_secrets(str(exc))
        run_logger.error(error_message)
        return 1
    except Exception as exc:
        error_type = type(exc).__name__
        error_message = redact_secrets(str(exc))
        run_logger.exception(
            f"NAV trade breaks scheduled poll failed: {error_message}"
        )
        raise
    finally:
        elapsed_ms = round((time.perf_counter() - started_at) * 1000)
        scheduled_metadata = {
            "scheduler": "windows_task_scheduler",
            "target_nav_date": resolved_target_nav_date.isoformat(),
            "target_file_found": bool(
                summary and summary.get("target_file_found") is True
            ),
            "poll_count": poll_count,
            "poll_wait_seconds": poll_wait_seconds,
            "poll_window_minutes": poll_window_minutes,
            "poll_deadline_hour": poll_deadline_hour,
            "window_start_at": window_start_at.isoformat(),
            "window_end_at": deadline_at.isoformat(),
            **email_summary,
            **(metadata or {}),
        }
        _log_fetch(
            status=status,
            elapsed_ms=elapsed_ms,
            summary=summary,
            error_type=error_type,
            error_message=error_message,
            run_mode=run_mode,
            lookback_days=lookback_days,
            metadata=scheduled_metadata,
            database=database,
            local_dir=local_dir,
            operation_name=SCHEDULED_OPERATION_NAME,
            attempt=max(1, poll_count),
            max_attempts=max(1, poll_count),
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
    operation_name: str = OPERATION_NAME,
    attempt: int = 1,
    max_attempts: int = 1,
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
        operation_name=operation_name,
        target_table=scrape.TARGET_NAME,
        method="SFTP_EMAIL",
        target_host=os.environ.get("NAV_SFTP_HOST") or "nav-sftp",
        target_path=os.environ.get("NAV_SFTP_REMOTE_DIR") or "/",
        status=status,
        http_status=None,
        attempt=attempt,
        max_attempts=max_attempts,
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


def _now_local() -> datetime:
    return datetime.now().astimezone()


def _previous_business_date(anchor_date: date) -> date:
    candidate = anchor_date - timedelta(days=1)
    while candidate.weekday() >= 5:
        candidate -= timedelta(days=1)
    return candidate


def _resolve_poll_deadline(
    *,
    start_at: datetime,
    poll_window_minutes: int,
    poll_deadline_hour: int | None,
) -> datetime:
    if poll_deadline_hour is None:
        return start_at + timedelta(minutes=poll_window_minutes)
    return start_at.replace(
        hour=poll_deadline_hour,
        minute=0,
        second=0,
        microsecond=0,
    )


if __name__ == "__main__":
    raise SystemExit(main())
