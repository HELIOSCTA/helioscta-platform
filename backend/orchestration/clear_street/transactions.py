"""Orchestrate local Clear Street end-of-day transaction SFTP pulls."""

from __future__ import annotations

import os
import time
from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

from backend.orchestration.positions_and_trades import (
    clear_street_mufg_upload,
    clear_street_nav_email,
)
from backend.scrapes.clear_street import transactions as scrape
from backend.utils import email_notifications, script_logging, slack_notifications
from backend.utils.ops_logging import log_api_fetch, redact_secrets

PIPELINE_NAME = scrape.API_SCRAPE_NAME
PROVIDER = scrape.SOURCE_SYSTEM
DEFAULT_LOOKBACK_DAYS = scrape.DEFAULT_LOOKBACK_DAYS
DEFAULT_SCHEDULED_LOOKBACK_DAYS = 1
DEFAULT_POLL_WAIT_SECONDS = 300
DEFAULT_WINDOW_START_HOUR = 19
DEFAULT_WINDOW_END_HOUR = 5
SCHEDULED_OPERATION_NAME = f"{PIPELINE_NAME}_poll"


class DataNotYetAvailable(RuntimeError):
    """Raised when the expected Clear Street target file misses its window."""


@dataclass(frozen=True)
class PollingWindow:
    start_at: datetime
    deadline_at: datetime
    target_trade_date: str


def main(
    *,
    lookback_days: int = DEFAULT_LOOKBACK_DAYS,
    local_dir: str | Path | None = None,
    database: str | None = None,
    run_mode: str = "manual",
    metadata: dict[str, Any] | None = None,
    send_email: bool = True,
) -> int:
    """Run the local Clear Street transaction scrape and write telemetry."""
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

        summary = scrape.run_clear_street_transactions(
            lookback_days=lookback_days,
            local_dir=local_dir,
            database=database,
        )
        rows_processed = int(summary.get("rows_processed", 0))
        _notify_clear_street_slack_success(
            summary=summary,
            database=database,
            run_logger=run_logger,
        )
        if send_email:
            _notify_clear_street_email_success(
                summary=summary,
                database=database,
                run_logger=run_logger,
            )
        run_logger.success(
            f"{PIPELINE_NAME} completed; {rows_processed:,} rows processed."
        )
        return 0
    except Exception as exc:
        status = "failure"
        error_type = type(exc).__name__
        error_message = redact_secrets(str(exc))
        run_logger.exception(
            f"Clear Street transactions orchestration failed: {error_message}"
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
            lookback_days=lookback_days,
            metadata=metadata,
            database=database,
        )
        script_logging.close_logging()


def scheduled_main(
    *,
    target_trade_date: str | None = None,
    lookback_days: int = DEFAULT_SCHEDULED_LOOKBACK_DAYS,
    local_dir: str | Path | None = None,
    database: str | None = None,
    poll_wait_seconds: int = DEFAULT_POLL_WAIT_SECONDS,
    window_start_hour: int = DEFAULT_WINDOW_START_HOUR,
    window_end_hour: int = DEFAULT_WINDOW_END_HOUR,
    run_mode: str = "scheduler",
    metadata: dict[str, Any] | None = None,
    now_fn: Callable[[], datetime] | None = None,
    sleep_fn: Callable[[float], None] = time.sleep,
    upload_mufg: bool = True,
    mufg_local_dir: str | Path | None = None,
    email_nav: bool = True,
    nav_email_local_dir: str | Path | None = None,
    send_email: bool = True,
) -> int:
    """Poll Clear Street overnight until the target trade-date file arrives."""
    if poll_wait_seconds < 1:
        raise ValueError("poll_wait_seconds must be at least 1.")

    run_logger = script_logging.init_logging(
        name=PIPELINE_NAME,
        log_dir=script_logging.get_log_dir(Path(__file__).parent / "logs"),
        log_to_file=True,
        delete_if_no_errors=True,
    )
    now = now_fn or _now_local
    window = _resolve_polling_window(
        now=now(),
        start_hour=window_start_hour,
        end_hour=window_end_hour,
    )
    resolved_target_trade_date = (
        scrape.normalize_trade_date_for_sftp(target_trade_date)
        if target_trade_date is not None
        else window.target_trade_date
    )
    started_at = time.perf_counter()
    summary: dict[str, object] | None = None
    status = "failure"
    error_type: str | None = "DataNotYetAvailable"
    error_message: str | None = None
    poll_count = 0
    downstream_failures: list[str] = []

    try:
        run_logger.header(f"{PIPELINE_NAME} scheduled poll")
        run_logger.info(f"Run mode: {run_mode}")
        run_logger.info(f"Target trade date: {resolved_target_trade_date}")
        run_logger.info(f"Polling every {poll_wait_seconds:,} seconds.")
        run_logger.info(
            "Polling window: "
            f"{window.start_at.isoformat()} to {window.deadline_at.isoformat()}"
        )

        while True:
            current_time = now()
            if current_time >= window.deadline_at:
                raise DataNotYetAvailable(
                    "Clear Street target file was not available by the "
                    f"polling deadline: {resolved_target_trade_date}"
                )

            poll_count += 1
            run_logger.info(
                f"Poll {poll_count}: checking Clear Street target "
                f"{resolved_target_trade_date}."
            )
            summary = scrape.run_clear_street_transactions(
                lookback_days=lookback_days,
                local_dir=local_dir,
                database=database,
                target_trade_date=resolved_target_trade_date,
            )
            if _summary_has_target_trade_date(
                summary=summary,
                target_trade_date=resolved_target_trade_date,
            ):
                status = "success"
                error_type = None
                error_message = None
                rows_processed = int(summary.get("rows_processed", 0) or 0)
                _notify_clear_street_slack_success(
                    summary=summary,
                    database=database,
                    run_logger=run_logger,
                )
                if send_email:
                    _notify_clear_street_email_success(
                        summary=summary,
                        database=database,
                        run_logger=run_logger,
                    )
                run_logger.success(
                    f"{PIPELINE_NAME} scheduled poll completed; "
                    f"{rows_processed:,} rows processed."
                )
                downstream_metadata = {
                    "clear_street_operation_name": SCHEDULED_OPERATION_NAME,
                    "clear_street_target_trade_date": resolved_target_trade_date,
                    "clear_street_rows_processed": rows_processed,
                }
                if upload_mufg:
                    try:
                        clear_street_mufg_upload.main(
                            expected_trade_date=resolved_target_trade_date,
                            local_dir=mufg_local_dir,
                            database=database,
                            run_mode=run_mode,
                            metadata=downstream_metadata,
                            run_logger=run_logger,
                        )
                    except Exception as exc:
                        downstream_failures.append("mufg_upload")
                        run_logger.error(
                            "Clear Street source file loaded, but MUFG upload "
                            f"failed: {redact_secrets(str(exc))}"
                        )
                if email_nav:
                    try:
                        clear_street_nav_email.main(
                            expected_trade_date=resolved_target_trade_date,
                            source_summary=summary,
                            local_dir=nav_email_local_dir,
                            database=database,
                            run_mode=run_mode,
                            metadata=downstream_metadata,
                            run_logger=run_logger,
                        )
                    except Exception as exc:
                        downstream_failures.append("nav_email")
                        run_logger.error(
                            "Clear Street source file loaded, but NAV email "
                            f"failed: {redact_secrets(str(exc))}"
                        )
                if downstream_failures:
                    return 1
                return 0

            current_time = now()
            if current_time >= window.deadline_at:
                raise DataNotYetAvailable(
                    "Clear Street target file was not available by the "
                    f"polling deadline: {resolved_target_trade_date}"
                )

            seconds_until_deadline = (
                window.deadline_at - current_time
            ).total_seconds()
            sleep_seconds = min(float(poll_wait_seconds), seconds_until_deadline)
            run_logger.info(
                "Clear Street target file not available yet; "
                f"sleeping {sleep_seconds:.0f} seconds."
            )
            sleep_fn(max(0.0, sleep_seconds))
    except DataNotYetAvailable as exc:
        error_type = type(exc).__name__
        error_message = redact_secrets(str(exc))
        run_logger.error(error_message)
        _notify_clear_street_slack_timeout(
            target_trade_date=resolved_target_trade_date,
            window=window,
            poll_count=poll_count,
            poll_wait_seconds=poll_wait_seconds,
            database=database,
            run_logger=run_logger,
        )
        return 1
    except Exception as exc:
        error_type = type(exc).__name__
        error_message = redact_secrets(str(exc))
        run_logger.exception(
            f"Clear Street scheduled polling failed: {error_message}"
        )
        raise
    finally:
        elapsed_ms = round((time.perf_counter() - started_at) * 1000)
        scheduled_metadata = {
            "target_trade_date": resolved_target_trade_date,
            "poll_count": poll_count,
            "poll_wait_seconds": poll_wait_seconds,
            "window_start_at": window.start_at.isoformat(),
            "window_end_at": window.deadline_at.isoformat(),
            "window_start_hour": window_start_hour,
            "window_end_hour": window_end_hour,
            "mufg_upload_enabled": upload_mufg,
            "nav_email_enabled": email_nav,
            "email_notifications_enabled": send_email,
            "downstream_failures": downstream_failures,
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
            operation_name=SCHEDULED_OPERATION_NAME,
            attempt=max(1, poll_count),
            max_attempts=max(1, poll_count),
        )
        script_logging.close_logging()


def _notify_clear_street_slack_success(
    *,
    summary: dict[str, object],
    database: str | None,
    run_logger: Any,
) -> int:
    rows_processed = int(summary.get("rows_processed", 0) or 0)
    if rows_processed <= 0:
        run_logger.info("Skipping Clear Street Slack notification for 0 rows.")
        return 0
    if not slack_notifications.positions_trades_alerts_channel_id():
        run_logger.info(
            "Skipping Clear Street Slack notification; no Slack channel configured."
        )
        return 0

    try:
        message = slack_notifications.build_clear_street_eod_transactions_slack(
            summary=summary,
        )
        enqueued = slack_notifications.enqueue_slack_notification(
            database=database,
            **message,
        )
        queued = 1 if enqueued.get("created") else 0

        if not slack_notifications.notifications_enabled():
            run_logger.info(
                f"Clear Street Slack notification queued={queued}; "
                "sending is disabled."
            )
            return queued

        processed = slack_notifications.send_due_slack_notifications(
            limit=20,
            database=database,
        )
        run_logger.info(
            "Clear Street Slack notification "
            f"queued={queued}, processed={len(processed)}."
        )
        return queued
    except Exception:
        run_logger.exception(
            "Clear Street Slack notification handling failed; "
            "scrape data and fetch telemetry remain committed."
        )
        return 0


def _notify_clear_street_email_success(
    *,
    summary: dict[str, object],
    database: str | None,
    run_logger: Any,
) -> int:
    rows_processed = int(summary.get("rows_processed", 0) or 0)
    if rows_processed <= 0:
        run_logger.info("Skipping Clear Street email notification for 0 rows.")
        return 0

    try:
        attachment_path = _source_summary_file_path(summary)
    except Exception:
        run_logger.exception(
            "Skipping Clear Street email notification; source CSV could not "
            "be resolved."
        )
        return 0

    queued = 0
    try:
        for recipient_email in email_notifications.credentials.HELIOS_EMAIL_RECIPIENTS:
            recipient_email = recipient_email.strip().lower()
            if not recipient_email:
                continue
            message = (
                email_notifications.build_clear_street_eod_transactions_file_email(
                    summary=summary,
                    recipient_email=recipient_email,
                    attachment_path=attachment_path,
                )
            )
            enqueued = email_notifications.enqueue_email_notification(
                database=database,
                **message,
            )
            queued += 1 if enqueued.get("created") else 0

        if not email_notifications.notifications_enabled():
            run_logger.info(
                f"Clear Street email notification queued={queued}; "
                "sending is disabled."
            )
            return queued

        processed = email_notifications.send_due_email_notifications(
            limit=20,
            database=database,
        )
        run_logger.info(
            "Clear Street email notification "
            f"queued={queued}, processed={len(processed)}."
        )
        return queued
    except Exception:
        run_logger.exception(
            "Clear Street email notification handling failed; "
            "scrape data and fetch telemetry remain committed."
        )
        return 0


def _source_summary_file_path(summary: dict[str, object]) -> Path:
    latest = summary.get("latest_trade_file")
    if not isinstance(latest, dict):
        raise FileNotFoundError("Clear Street summary has no latest_trade_file.")
    local_filename = latest.get("local_filename")
    local_dir = summary.get("local_dir")
    if not local_filename or not local_dir:
        raise FileNotFoundError(
            "Clear Street summary is missing local_dir or local_filename."
        )
    path = Path(str(local_dir)) / str(local_filename)
    if not path.exists():
        raise FileNotFoundError(f"Clear Street source CSV not found: {path}")
    return path


def _notify_clear_street_slack_timeout(
    *,
    target_trade_date: str,
    window: PollingWindow,
    poll_count: int,
    poll_wait_seconds: int,
    database: str | None,
    run_logger: Any,
) -> int:
    if not slack_notifications.positions_trades_alerts_channel_id():
        run_logger.info(
            "Skipping Clear Street timeout Slack notification; "
            "no Slack channel configured."
        )
        return 0

    try:
        message = slack_notifications.build_clear_street_eod_transactions_timeout_slack(
            target_trade_date=target_trade_date,
            window_start_at=window.start_at,
            window_end_at=window.deadline_at,
            poll_count=poll_count,
            poll_wait_seconds=poll_wait_seconds,
        )
        enqueued = slack_notifications.enqueue_slack_notification(
            database=database,
            **message,
        )
        queued = 1 if enqueued.get("created") else 0

        if not slack_notifications.notifications_enabled():
            run_logger.info(
                f"Clear Street timeout Slack notification queued={queued}; "
                "sending is disabled."
            )
            return queued

        processed = slack_notifications.send_due_slack_notifications(
            limit=20,
            database=database,
        )
        run_logger.info(
            "Clear Street timeout Slack notification "
            f"queued={queued}, processed={len(processed)}."
        )
        return queued
    except Exception:
        run_logger.exception(
            "Clear Street timeout Slack notification handling failed; "
            "fetch telemetry remains committed."
        )
        return 0


def _summary_has_target_trade_date(
    *,
    summary: dict[str, object],
    target_trade_date: str,
) -> bool:
    if summary.get("target_file_found") is True:
        return True

    target = scrape.normalize_trade_date_for_sftp(target_trade_date)
    min_trade_date = summary.get("min_trade_date_from_sftp")
    max_trade_date = summary.get("max_trade_date_from_sftp")
    if min_trade_date is None or max_trade_date is None:
        return False
    return str(min_trade_date) <= target <= str(max_trade_date)


def _now_local() -> datetime:
    return datetime.now().astimezone()


def _resolve_polling_window(
    *,
    now: datetime,
    start_hour: int,
    end_hour: int,
) -> PollingWindow:
    if not 0 <= start_hour <= 23:
        raise ValueError("start_hour must be between 0 and 23.")
    if not 0 <= end_hour <= 23:
        raise ValueError("end_hour must be between 0 and 23.")

    if now.tzinfo is None:
        now = now.astimezone()

    start_today = now.replace(
        hour=start_hour,
        minute=0,
        second=0,
        microsecond=0,
    )
    end_today = now.replace(
        hour=end_hour,
        minute=0,
        second=0,
        microsecond=0,
    )

    if start_hour > end_hour:
        if now >= start_today:
            start_at = start_today
            deadline_at = end_today + timedelta(days=1)
        elif now < end_today:
            start_at = start_today - timedelta(days=1)
            deadline_at = end_today
        else:
            start_at = start_today
            deadline_at = end_today + timedelta(days=1)
    else:
        if now < start_today:
            start_at = start_today
            deadline_at = end_today
        elif now >= end_today:
            start_at = start_today + timedelta(days=1)
            deadline_at = end_today + timedelta(days=1)
        else:
            start_at = start_today
            deadline_at = end_today

    return PollingWindow(
        start_at=start_at,
        deadline_at=deadline_at,
        target_trade_date=start_at.date().strftime("%Y%m%d"),
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
    attempt: int = 1,
    max_attempts: int = 1,
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
        target_host=os.environ.get("CLEAR_STREET_SFTP_HOST") or "clear-street-sftp",
        target_path=os.environ.get("CLEAR_STREET_SFTP_REMOTE_DIR") or "/",
        status=status,
        http_status=None,
        elapsed_ms=elapsed_ms,
        rows_returned=rows_processed,
        rows_written=rows_processed,
        error_type=error_type,
        error_message=error_message,
        attempt=attempt,
        max_attempts=max_attempts,
        metadata=telemetry_metadata,
        database=database,
    )


if __name__ == "__main__":
    raise SystemExit(main())
