"""Email the latest raw Clear Street trade CSV to NAV."""

from __future__ import annotations

from datetime import date, datetime
from pathlib import Path
from typing import Any

from backend import credentials
from backend.scrapes.clear_street import transactions as clear_street_transactions
from backend.utils import email_notifications

API_SCRAPE_NAME = "clear_street_trades_nav_email"
SOURCE_SYSTEM = "microsoft_graph"
SOURCE_FEED = "clear_street_trades"
SOURCE_TABLE_FQN = clear_street_transactions.TARGET_TABLE_FQN
TARGET_NAME = "nav_email.clear_street_trades"
DEFAULT_LOCAL_DIR = clear_street_transactions.DEFAULT_LOCAL_DIR
DEFAULT_TRADE_FILE_PATTERN = "Helios_Transactions_*.*.csv"
DEFAULT_EMAIL_SUBJECT_PREFIX = "Clear Street - Helios Transactions"


def run_clear_street_trades_nav_email(
    *,
    expected_trade_date: str | date | datetime | None = None,
    source_summary: dict[str, object] | None = None,
    local_dir: str | Path | None = None,
    sender_email: str | None = None,
    recipient_emails: list[str] | tuple[str, ...] | None = None,
    trade_file_pattern: str = DEFAULT_TRADE_FILE_PATTERN,
    email_subject_prefix: str = DEFAULT_EMAIL_SUBJECT_PREFIX,
) -> dict[str, object]:
    """Send the latest raw Clear Street transaction file to NAV by email."""
    expected = (
        normalize_trade_date(expected_trade_date)
        if expected_trade_date is not None
        else None
    )
    resolved_dir = resolve_local_dir(
        local_dir=local_dir,
        source_summary=source_summary,
    )
    trade_file_path = resolve_trade_file(
        expected_trade_date=expected,
        source_summary=source_summary,
        local_dir=resolved_dir,
        trade_file_pattern=trade_file_pattern,
    )
    parsed = clear_street_transactions.parse_transaction_filename(
        trade_file_path.name
    )
    trade_date_from_sftp = str(parsed["trade_date_from_sftp"])
    if expected is not None and trade_date_from_sftp != expected:
        raise ValueError(
            "Clear Street NAV email source file trade date does not match "
            f"expected date: file={trade_date_from_sftp}, expected={expected}"
        )

    recipients = _resolve_recipient_emails(recipient_emails)
    sender = sender_email or credentials.CLEAR_STREET_NAV_EMAIL_SENDER
    if not sender:
        raise RuntimeError("Missing Clear Street NAV email sender.")

    trade_date = _date_from_yyyymmdd(trade_date_from_sftp)
    subject = (
        f"{email_subject_prefix} - "
        f"{trade_date.strftime('%a %b-%d %Y')}"
    )
    body_text = (
        "Attached is the Clear Street Helios Transactions file for "
        f"{trade_date.isoformat()}."
    )

    for recipient_email in recipients:
        email_notifications.send_email_via_graph(
            sender_email=sender,
            recipient_email=recipient_email,
            subject=subject,
            body_text=body_text,
            attachments=[trade_file_path],
        )

    return {
        "target_table": TARGET_NAME,
        "source_table": SOURCE_TABLE_FQN,
        "source_feed": SOURCE_FEED,
        "source_file_path": str(trade_file_path),
        "source_filename": trade_file_path.name,
        "trade_date": trade_date.isoformat(),
        "trade_date_from_sftp": trade_date_from_sftp,
        "email_subject": subject,
        "sender_email": sender,
        "recipient_count": len(recipients),
        "recipient_emails": recipients,
        "attachments": [trade_file_path.name],
        "emails_sent": len(recipients),
        "local_dir": str(resolved_dir),
    }


def resolve_local_dir(
    *,
    local_dir: str | Path | None = None,
    source_summary: dict[str, object] | None = None,
) -> Path:
    """Resolve the directory containing downloaded raw Clear Street files."""
    if local_dir is not None:
        return Path(local_dir)
    if source_summary and source_summary.get("local_dir"):
        return Path(str(source_summary["local_dir"]))
    return DEFAULT_LOCAL_DIR


def resolve_trade_file(
    *,
    expected_trade_date: str | None = None,
    source_summary: dict[str, object] | None = None,
    local_dir: str | Path | None = None,
    trade_file_pattern: str = DEFAULT_TRADE_FILE_PATTERN,
) -> Path:
    """Find the raw Clear Street file to attach to the NAV email."""
    resolved_dir = Path(local_dir) if local_dir is not None else DEFAULT_LOCAL_DIR
    source_file = _source_summary_file(
        source_summary=source_summary,
        local_dir=resolved_dir,
    )
    if source_file is not None:
        return source_file

    pattern = (
        f"Helios_Transactions_{expected_trade_date}.*.csv"
        if expected_trade_date is not None
        else trade_file_pattern
    )
    matches = [path for path in resolved_dir.glob(pattern) if path.is_file()]
    if not matches:
        raise FileNotFoundError(
            "No Clear Street transaction file found for NAV email in "
            f"{resolved_dir} matching {pattern}"
        )
    return max(matches, key=_trade_file_sort_key)


def normalize_trade_date(value: str | date | datetime) -> str:
    return clear_street_transactions.normalize_trade_date_for_sftp(value)


def _source_summary_file(
    *,
    source_summary: dict[str, object] | None,
    local_dir: Path,
) -> Path | None:
    if not source_summary:
        return None
    latest = source_summary.get("latest_trade_file")
    if not isinstance(latest, dict):
        return None
    local_filename = latest.get("local_filename")
    if not local_filename:
        return None
    candidate = local_dir / str(local_filename)
    if candidate.exists():
        return candidate
    raise FileNotFoundError(
        "Clear Street NAV email source file from scrape summary was not found: "
        f"{candidate}"
    )


def _trade_file_sort_key(path: Path) -> tuple[str, str, str]:
    try:
        parsed = clear_street_transactions.parse_transaction_filename(path.name)
    except ValueError:
        return ("", "", path.name)
    return (
        str(parsed["trade_date_from_sftp"]),
        str(parsed["sftp_upload_timestamp"]),
        path.name,
    )


def _resolve_recipient_emails(
    recipient_emails: list[str] | tuple[str, ...] | None,
) -> list[str]:
    recipients = list(
        recipient_emails
        if recipient_emails is not None
        else credentials.CLEAR_STREET_NAV_EMAIL_RECIPIENTS
    )
    resolved = [recipient.strip() for recipient in recipients if recipient.strip()]
    if not resolved:
        raise ValueError("At least one Clear Street NAV email recipient is required.")
    return resolved


def _date_from_yyyymmdd(value: str) -> date:
    return date(
        int(value[:4]),
        int(value[4:6]),
        int(value[6:8]),
    )
