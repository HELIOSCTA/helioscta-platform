"""NAV SFTP trade break workbook download and email helper."""

from __future__ import annotations

import fnmatch
import posixpath
import re
from collections.abc import Iterable
from dataclasses import dataclass
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any

import pandas as pd
import paramiko

from backend import credentials

API_SCRAPE_NAME = "nav_trade_breaks_email"
SOURCE_SYSTEM = "nav_sftp"
SOURCE_REPORT_NAME = "Trade Breaks Detail Report"
TARGET_NAME = "nav_email.nav_trade_breaks"
DEFAULT_LOOKBACK_DAYS = 1
DEFAULT_SFTP_PORT = 22
DEFAULT_LOCAL_DIR = Path(__file__).resolve().parent / "downloads" / "trade_breaks"
DEFAULT_REMOTE_PATTERN = (
    "Trade Breaks Detail Report_*_HELIOS COMMODITY ADVISORS LTD.XLSX"
)
NO_TRADE_BREAK_PHRASES = (
    "No Trade Break found in Reconciliation",
    "Color Scheme & Notation reference",
    "Current Day Trade Breaks",
    "Previous Day Trade Breaks",
)

SOURCE_FILENAME_RE = re.compile(
    r"^Trade Breaks Detail Report_"
    r"(?P<nav_date>\d{8})_"
    r"HELIOS COMMODITY ADVISORS LTD\."
    r"(?P<upload_date>\d{8})_"
    r"(?P<upload_time>\d{6})\.xlsx$",
    re.IGNORECASE,
)
REMOTE_FILENAME_RE = re.compile(
    r"^Trade Breaks Detail Report_"
    r"(?P<nav_date>\d{8})_"
    r"HELIOS COMMODITY ADVISORS LTD\.XLSX$",
    re.IGNORECASE,
)


@dataclass(frozen=True)
class DownloadedNavTradeBreakFile:
    remote_filename: str
    local_path: Path
    nav_date: date
    sftp_upload_timestamp: pd.Timestamp


def run_nav_trade_breaks(
    *,
    lookback_days: int = DEFAULT_LOOKBACK_DAYS,
    local_dir: str | Path | None = None,
    target_nav_date: str | date | datetime | pd.Timestamp | None = None,
    require_target_file: bool = False,
    sftp_host: str | None = None,
    sftp_port: int | None = None,
    sftp_user: str | None = None,
    sftp_password: str | None = None,
    sftp_remote_dir: str | None = None,
    trade_file_pattern: str = DEFAULT_REMOTE_PATTERN,
) -> dict[str, object]:
    """Download recent NAV trade break workbooks and summarize the latest one."""
    normalized_target_nav_date = (
        normalize_nav_date(target_nav_date) if target_nav_date is not None else None
    )
    downloaded_files = pull_recent_trade_break_files(
        lookback_days=lookback_days,
        local_dir=local_dir,
        target_nav_date=normalized_target_nav_date,
        sftp_host=sftp_host,
        sftp_port=sftp_port,
        sftp_user=sftp_user,
        sftp_password=sftp_password,
        sftp_remote_dir=sftp_remote_dir,
        trade_file_pattern=trade_file_pattern,
    )
    if not downloaded_files:
        if normalized_target_nav_date is not None and require_target_file:
            return {
                "target_table": TARGET_NAME,
                "source_system": SOURCE_SYSTEM,
                "source_report_name": SOURCE_REPORT_NAME,
                "lookback_days": lookback_days,
                "local_dir": str(resolve_local_dir(local_dir)),
                "target_nav_date": normalized_target_nav_date.isoformat(),
                "target_file_found": False,
                "source_file_path": None,
                "source_filename": None,
                "downloaded_filename": None,
                "nav_date": normalized_target_nav_date.isoformat(),
                "nav_date_from_sftp": normalized_target_nav_date.strftime("%Y%m%d"),
                "attachments": [],
                "files_downloaded": 0,
                "files_processed": 0,
                "rows_processed": 0,
                "by_add_del": {},
            }
        raise FileNotFoundError(
            "No NAV trade break files were downloaded from SFTP matching "
            f"{trade_file_pattern}"
        )

    latest = max(
        downloaded_files,
        key=lambda item: (item.nav_date, item.sftp_upload_timestamp, item.local_path.name),
    )
    summary = summarize_trade_break_file(latest.local_path)
    return {
        "target_table": TARGET_NAME,
        "source_system": SOURCE_SYSTEM,
        "source_report_name": SOURCE_REPORT_NAME,
        "lookback_days": lookback_days,
        "source_file_path": str(latest.local_path),
        "source_filename": latest.remote_filename,
        "downloaded_filename": latest.local_path.name,
        "target_nav_date": (
            normalized_target_nav_date.isoformat()
            if normalized_target_nav_date is not None
            else None
        ),
        "target_file_found": True if normalized_target_nav_date is not None else None,
        "nav_date": latest.nav_date.isoformat(),
        "nav_date_from_sftp": latest.nav_date.strftime("%Y%m%d"),
        "sftp_upload_timestamp": latest.sftp_upload_timestamp.isoformat(),
        "attachments": [latest.local_path.name],
        "files_downloaded": len(downloaded_files),
        "files_processed": 1,
        "rows_processed": summary["rows_processed"],
        "by_add_del": summary["by_add_del"],
        "local_dir": str(resolve_local_dir(local_dir)),
    }


def run_nav_trade_breaks_email(
    *,
    lookback_days: int = DEFAULT_LOOKBACK_DAYS,
    local_dir: str | Path | None = None,
    sender_email: str | None = None,
    recipient_emails: list[str] | tuple[str, ...] | None = None,
    target_nav_date: str | date | datetime | pd.Timestamp | None = None,
    require_target_file: bool = False,
    sftp_host: str | None = None,
    sftp_port: int | None = None,
    sftp_user: str | None = None,
    sftp_password: str | None = None,
    sftp_remote_dir: str | None = None,
    trade_file_pattern: str = DEFAULT_REMOTE_PATTERN,
) -> dict[str, object]:
    """Backward-compatible wrapper for preparing NAV trade break emails."""
    _ = (sender_email, recipient_emails)
    return run_nav_trade_breaks(
        lookback_days=lookback_days,
        local_dir=local_dir,
        target_nav_date=target_nav_date,
        require_target_file=require_target_file,
        sftp_host=sftp_host,
        sftp_port=sftp_port,
        sftp_user=sftp_user,
        sftp_password=sftp_password,
        sftp_remote_dir=sftp_remote_dir,
        trade_file_pattern=trade_file_pattern,
    )


def pull_recent_trade_break_files(
    *,
    lookback_days: int = DEFAULT_LOOKBACK_DAYS,
    local_dir: str | Path | None = None,
    target_nav_date: str | date | datetime | pd.Timestamp | None = None,
    sftp_host: str | None = None,
    sftp_port: int | None = None,
    sftp_user: str | None = None,
    sftp_password: str | None = None,
    sftp_remote_dir: str | None = None,
    trade_file_pattern: str = DEFAULT_REMOTE_PATTERN,
) -> list[DownloadedNavTradeBreakFile]:
    """Download recent NAV trade break files from SFTP into the local cache."""
    if lookback_days < 1:
        raise ValueError("lookback_days must be at least 1.")

    resolved_dir = resolve_local_dir(local_dir)
    resolved_dir.mkdir(parents=True, exist_ok=True)
    normalized_target_nav_date = (
        normalize_nav_date(target_nav_date) if target_nav_date is not None else None
    )
    sftp_host = sftp_host or credentials.NAV_SFTP_HOST
    sftp_port = sftp_port or credentials.NAV_SFTP_PORT or DEFAULT_SFTP_PORT
    sftp_user = sftp_user or credentials.NAV_SFTP_USER
    sftp_password = sftp_password or credentials.NAV_SFTP_PASSWORD
    sftp_remote_dir = sftp_remote_dir or credentials.NAV_SFTP_REMOTE_DIR or "/"

    _validate_sftp_config(
        host=sftp_host,
        username=sftp_user,
        password=sftp_password,
    )

    sftp: paramiko.SFTPClient | None = None
    transport: paramiko.Transport | None = None
    try:
        sftp, transport = _connect_to_nav_sftp(
            host=str(sftp_host),
            port=int(sftp_port),
            username=str(sftp_user),
            password=str(sftp_password),
        )
        attrs = _matching_remote_attrs(
            attrs=sftp.listdir_attr(sftp_remote_dir),
            pattern=trade_file_pattern,
        )
        if normalized_target_nav_date is not None:
            attrs = [
                attr
                for attr in attrs
                if _remote_filename_nav_date(attr.filename)
                == normalized_target_nav_date
            ]
        attrs = attrs[:lookback_days]
        downloaded: list[DownloadedNavTradeBreakFile] = []
        for attr in attrs:
            upload_timestamp = pd.Timestamp(
                datetime.fromtimestamp(attr.st_mtime, tz=timezone.utc)
            )
            local_path = resolved_dir / _downloaded_filename(
                filename=attr.filename,
                upload_timestamp=upload_timestamp,
            )
            if not local_path.exists():
                download_path = local_path.with_name(f"{local_path.name}.download")
                if download_path.exists():
                    download_path.unlink()
                sftp.get(
                    posixpath.join(sftp_remote_dir, attr.filename),
                    str(download_path),
                )
                download_path.replace(local_path)

            parsed = parse_trade_break_filename(local_path.name)
            downloaded.append(
                DownloadedNavTradeBreakFile(
                    remote_filename=attr.filename,
                    local_path=local_path,
                    nav_date=parsed["nav_date"],
                    sftp_upload_timestamp=parsed["sftp_upload_timestamp"],
                )
            )
        return downloaded
    finally:
        if sftp is not None:
            sftp.close()
        if transport is not None:
            transport.close()


def summarize_trade_break_file(filepath: str | Path) -> dict[str, object]:
    """Parse a NAV trade break workbook and return email-summary fields."""
    path = Path(filepath)
    parsed = parse_trade_break_filename(path.name)
    df = parse_trade_break_file(path)
    by_add_del: dict[str, int] = {}
    if "add_del" in df.columns and not df.empty:
        by_add_del = {
            str(key): int(value)
            for key, value in df["add_del"].fillna("").value_counts().items()
        }
    return {
        "source_file_path": str(path),
        "downloaded_filename": path.name,
        "nav_date": parsed["nav_date"].isoformat(),
        "nav_date_from_sftp": parsed["nav_date"].strftime("%Y%m%d"),
        "sftp_upload_timestamp": parsed["sftp_upload_timestamp"].isoformat(),
        "rows_processed": int(len(df)),
        "by_add_del": by_add_del,
    }


def parse_trade_break_file(filepath: str | Path) -> pd.DataFrame:
    """Parse one NAV trade break workbook for validation and email summary."""
    df = pd.read_excel(
        filepath,
        sheet_name="Trade Breaks",
        skiprows=2,
        engine="openpyxl",
    )
    if df.empty:
        return pd.DataFrame()

    df.columns = [_normalize_column_name(column) for column in df.columns]
    df = df.dropna(how="all")
    for phrase in NO_TRADE_BREAK_PHRASES:
        df = df[
            ~df.apply(
                lambda row: any(
                    isinstance(cell, str) and phrase in cell for cell in row
                ),
                axis=1,
            )
        ]
    return df.reset_index(drop=True)


def parse_trade_break_filename(filename: str) -> dict[str, Any]:
    """Parse NAV date and SFTP upload timestamp from a downloaded filename."""
    match = SOURCE_FILENAME_RE.match(filename)
    if not match:
        raise ValueError(
            "NAV trade breaks filename does not match expected shape: "
            f"{filename}"
        )

    upload_value = f"{match.group('upload_date')}_{match.group('upload_time')}"
    return {
        "nav_date": datetime.strptime(match.group("nav_date"), "%Y%m%d").date(),
        "sftp_upload_timestamp": pd.Timestamp(
            datetime.strptime(upload_value, "%Y%m%d_%H%M%S"),
            tz="UTC",
        ),
    }


def normalize_nav_date(value: str | date | datetime | pd.Timestamp) -> date:
    """Normalize a NAV date input to a Python date."""
    if isinstance(value, pd.Timestamp):
        return value.date()
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    text = str(value).strip()
    if re.fullmatch(r"\d{8}", text):
        return datetime.strptime(text, "%Y%m%d").date()
    return datetime.strptime(text, "%Y-%m-%d").date()


def resolve_local_dir(local_dir: str | Path | None = None) -> Path:
    """Resolve the ignored local NAV trade breaks workbook cache directory."""
    if local_dir is not None:
        return Path(local_dir)
    return DEFAULT_LOCAL_DIR


def _connect_to_nav_sftp(
    *,
    host: str,
    port: int,
    username: str,
    password: str,
) -> tuple[paramiko.SFTPClient, paramiko.Transport]:
    transport = paramiko.Transport((host, port))
    transport.connect(username=username, password=password)
    return paramiko.SFTPClient.from_transport(transport), transport


def _validate_sftp_config(
    *,
    host: str | None,
    username: str | None,
    password: str | None,
) -> None:
    missing = [
        name
        for name, value in {
            "NAV_SFTP_HOST": host,
            "NAV_SFTP_USER": username,
            "NAV_SFTP_PASSWORD": password,
        }.items()
        if not value
    ]
    if missing:
        raise RuntimeError(
            "Missing NAV SFTP environment variables: " + ", ".join(missing)
        )


def _matching_remote_attrs(
    *,
    attrs: Iterable[Any],
    pattern: str,
) -> list[Any]:
    return sorted(
        [
            attr
            for attr in attrs
            if fnmatch.fnmatchcase(attr.filename.upper(), pattern.upper())
        ],
        key=lambda attr: attr.filename,
        reverse=True,
    )


def _remote_filename_nav_date(filename: str) -> date | None:
    match = REMOTE_FILENAME_RE.match(filename)
    if not match:
        return None
    return datetime.strptime(match.group("nav_date"), "%Y%m%d").date()


def _downloaded_filename(
    *,
    filename: str,
    upload_timestamp: pd.Timestamp,
) -> str:
    path = Path(filename)
    timestamp = pd.Timestamp(upload_timestamp).strftime("%Y%m%d_%H%M%S")
    return f"{path.stem}.{timestamp}.xlsx"


def _normalize_column_name(column: object) -> str:
    text = str(column)
    text = re.sub(r"_x000a_", " ", text, flags=re.IGNORECASE)
    text = text.replace("\n", " ")
    text = re.sub(r"[^0-9A-Za-z]+", "_", text)
    return re.sub(r"_+", "_", text).strip("_").lower()
