"""Orchestrate Clear Street trade CSV uploads to MUFG SFTP."""

from __future__ import annotations

import os
import time
from datetime import date, datetime
from pathlib import Path
from typing import Any

from backend.scrapes.clear_street import mufg_upload as scrape
from backend.utils import email_notifications, script_logging
from backend.utils.ops_logging import log_api_fetch, redact_secrets

PIPELINE_NAME = scrape.API_SCRAPE_NAME
PROVIDER = scrape.SOURCE_SYSTEM
OPERATION_NAME = scrape.API_SCRAPE_NAME
DEFAULT_SQL_DIR = Path(__file__).resolve().parent / "sql"
DEFAULT_SQL_FILENAME = scrape.DEFAULT_SQL_FILENAME


def main(
    *,
    expected_trade_date: str | date | datetime | None = None,
    local_dir: str | Path | None = None,
    database: str | None = None,
    run_mode: str = "manual",
    metadata: dict[str, Any] | None = None,
    send_email: bool = True,
    run_logger: Any | None = None,
    sql_dir: str | Path | None = None,
    sql_filename: str = DEFAULT_SQL_FILENAME,
) -> int:
    """Upload the latest generated Clear Street MUFG trade file."""
    resolved_sql_dir = _resolve_sql_dir(sql_dir)
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

        summary = scrape.run_clear_street_trades_mufg_upload(
            expected_trade_date=expected_trade_date,
            local_dir=local_dir,
            database=database,
            sql_dir=resolved_sql_dir,
            sql_filename=sql_filename,
        )
        rows_uploaded = int(summary.get("rows_uploaded", 0) or 0)
        if send_email:
            summary.update(
                _notify_mufg_email_success(
                    summary=summary,
                    database=database,
                    run_logger=run_logger,
                )
            )
        else:
            summary.update(
                _email_notification_summary(
                    status="disabled_by_call",
                    queued=0,
                    processed=0,
                )
            )
        run_logger.success(
            f"{PIPELINE_NAME} completed; {rows_uploaded:,} rows uploaded."
        )
        return 0
    except Exception as exc:
        status = "failure"
        error_type = type(exc).__name__
        error_message = redact_secrets(str(exc))
        run_logger.exception(
            f"Clear Street MUFG upload orchestration failed: {error_message}"
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
            local_dir=local_dir,
            sql_dir=resolved_sql_dir,
            sql_filename=sql_filename,
        )
        if owns_logger:
            script_logging.close_logging()


def _notify_mufg_email_success(
    *,
    summary: dict[str, object],
    database: str | None,
    run_logger: Any,
) -> dict[str, object]:
    try:
        attachment_path = _mufg_summary_file_path(summary)
    except Exception as exc:
        error_message = redact_secrets(str(exc))
        run_logger.exception(
            "Skipping MUFG upload email notification; uploaded CSV could not "
            "be resolved."
        )
        return _email_notification_summary(
            status="skipped_missing_attachment",
            queued=0,
            processed=0,
            error_type=type(exc).__name__,
            error_message=error_message,
        )

    queued = 0
    try:
        for recipient_email in email_notifications.credentials.HELIOS_EMAIL_RECIPIENTS:
            recipient_email = recipient_email.strip().lower()
            if not recipient_email:
                continue
            message = email_notifications.build_clear_street_mufg_upload_success_email(
                summary=summary,
                recipient_email=recipient_email,
                attachment_path=attachment_path,
            )
            enqueued = email_notifications.enqueue_email_notification(
                database=database,
                **message,
            )
            queued += 1 if enqueued.get("created") else 0

        if not email_notifications.notifications_enabled():
            run_logger.info(
                f"MUFG upload email notification queued={queued}; "
                "sending is disabled."
            )
            return _email_notification_summary(
                status="queued_sending_disabled",
                queued=queued,
                processed=0,
            )

        processed = email_notifications.send_due_email_notifications(
            limit=20,
            database=database,
        )
        run_logger.info(
            "MUFG upload email notification "
            f"queued={queued}, processed={len(processed)}."
        )
        return _email_notification_summary(
            status="processed",
            queued=queued,
            processed=len(processed),
        )
    except Exception as exc:
        error_message = redact_secrets(str(exc))
        run_logger.exception(
            "MUFG upload email notification handling failed; "
            "upload telemetry remains committed."
        )
        return _email_notification_summary(
            status="failure",
            queued=queued,
            processed=0,
            error_type=type(exc).__name__,
            error_message=error_message,
        )


def _email_notification_summary(
    *,
    status: str,
    queued: int,
    processed: int,
    error_type: str | None = None,
    error_message: str | None = None,
) -> dict[str, object]:
    payload: dict[str, object] = {
        "email_notification_status": status,
        "email_notifications_queued": queued,
        "email_notifications_processed": processed,
    }
    if error_type:
        payload["email_notification_error_type"] = error_type
    if error_message:
        payload["email_notification_error_message"] = error_message
    return payload


def _mufg_summary_file_path(summary: dict[str, object]) -> Path:
    local_file_path = summary.get("local_file_path")
    if local_file_path:
        path = Path(str(local_file_path))
    else:
        filename = summary.get("filename") or summary.get("remote_filename")
        local_dir = summary.get("local_dir") or scrape.DEFAULT_LOCAL_DIR
        if not filename:
            raise FileNotFoundError("MUFG summary is missing local_file_path/filename.")
        path = Path(str(local_dir)) / str(filename)
    if not path.exists():
        raise FileNotFoundError(f"MUFG upload CSV not found: {path}")
    return path


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
    local_dir: str | Path | None,
    sql_dir: str | Path,
    sql_filename: str,
) -> None:
    rows = int(summary.get("rows_uploaded", 0)) if summary else None
    telemetry_metadata: dict[str, Any] = {
        "run_mode": run_mode,
        "expected_trade_date": _expected_trade_date_metadata(expected_trade_date),
        "local_dir": str(scrape.resolve_local_dir(local_dir)),
        "sql_dir": str(sql_dir),
        "sql_filename": sql_filename,
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
        method="SFTP",
        target_host=os.environ.get("MUFG_SFTP_HOST") or "mufg-sftp",
        target_path=os.environ.get("MUFG_SFTP_REMOTE_DIR") or "/",
        status=status,
        http_status=None,
        elapsed_ms=elapsed_ms,
        rows_returned=rows,
        rows_written=rows,
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


def _resolve_sql_dir(sql_dir: str | Path | None) -> Path:
    if sql_dir is not None:
        return Path(sql_dir)
    return DEFAULT_SQL_DIR


if __name__ == "__main__":
    raise SystemExit(main())
