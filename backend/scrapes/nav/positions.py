"""NAV SFTP position valuation report scrape."""

from __future__ import annotations

import fnmatch
import os
import posixpath
import re
from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any

import pandas as pd
import paramiko

from backend import credentials
from backend.utils import db

API_SCRAPE_NAME = "nav_positions"
SOURCE_SYSTEM = "nav_sftp"
SOURCE_REPORT_NAME = "Position Valuation Detail Report"
TARGET_SCHEMA = "nav"
TARGET_TABLE = "positions"
TARGET_TABLE_FQN = f"{TARGET_SCHEMA}.{TARGET_TABLE}"
DEFAULT_LOOKBACK_DAYS = 5
DEFAULT_SFTP_PORT = 22
EXCEL_DATA_START_ROW = 5
DEFAULT_LOCAL_ROOT = Path(__file__).resolve().parent / "downloads"


@dataclass(frozen=True)
class NavPositionFundConfig:
    fund_code: str
    legal_entity: str
    local_subdir: str

    @property
    def remote_pattern(self) -> str:
        return f"{SOURCE_REPORT_NAME}_*_{self.legal_entity}.XLSX"


@dataclass(frozen=True)
class DownloadedNavFile:
    fund_code: str
    remote_filename: str
    local_path: Path
    sftp_upload_timestamp: pd.Timestamp


FUND_CONFIGS: dict[str, NavPositionFundConfig] = {
    "agr": NavPositionFundConfig(
        fund_code="agr",
        legal_entity="AGR Trading II, LLC",
        local_subdir="agr",
    ),
    "moross": NavPositionFundConfig(
        fund_code="moross",
        legal_entity="Moross Limited Partnership",
        local_subdir="moross",
    ),
    "pnt": NavPositionFundConfig(
        fund_code="pnt",
        legal_entity="PNT Trading, LLC",
        local_subdir="pnt",
    ),
    "titan": NavPositionFundConfig(
        fund_code="titan",
        legal_entity="ESKER POINT LP",
        local_subdir="titan",
    ),
}

PRIMARY_KEY = [
    "fund_code",
    "nav_date",
    "sftp_upload_timestamp",
    "source_file_name",
    "source_file_row_number",
]

REPORT_COLUMNS = [
    "broker_name",
    "account_group",
    "account",
    "trade_date",
    "product_id_internal",
    "product",
    "type",
    "month_year",
    "client_symbol",
    "strike_price",
    "call_put",
    "product_currency_1",
    "long_short",
    "quantity_1",
    "counter_currency_ccy2",
    "ccy2_long_short",
    "ccy2_quantity_2",
    "trade_price",
    "multiplier_and_tick_value",
    "cost_in_native_currency",
    "open_exchange_rate",
    "cost_in_base_currency",
    "market_settlement_price",
    "market_value_in_native_currency",
    "close_exchange_rate",
    "market_value_in_base_currency",
    "sector",
    "sub_sector",
    "country",
    "exchange_name",
    "source_1_symbol",
    "source_3_symbol",
    "one_chicago_symbol",
    "fas_level",
    "option_style",
]

METADATA_COLUMNS = [
    "fund_code",
    "source_legal_entity",
    "source_file_name",
    "source_file_row_number",
    "nav_date",
    "sftp_upload_timestamp",
]

OUTPUT_COLUMNS = METADATA_COLUMNS + REPORT_COLUMNS

NUMERIC_COLUMNS = [
    "strike_price",
    "quantity_1",
    "ccy2_quantity_2",
    "trade_price",
    "multiplier_and_tick_value",
    "cost_in_native_currency",
    "open_exchange_rate",
    "cost_in_base_currency",
    "market_settlement_price",
    "market_value_in_native_currency",
    "close_exchange_rate",
    "market_value_in_base_currency",
]

DATE_COLUMNS = ["trade_date"]
STRING_REPORT_COLUMNS = [
    column
    for column in REPORT_COLUMNS
    if column not in NUMERIC_COLUMNS and column not in DATE_COLUMNS
]

SQL_DATA_TYPES_BY_COLUMN = {
    "fund_code": "VARCHAR",
    "source_legal_entity": "VARCHAR",
    "source_file_name": "VARCHAR",
    "source_file_row_number": "INTEGER",
    "nav_date": "DATE",
    "sftp_upload_timestamp": "TIMESTAMPTZ",
    "broker_name": "VARCHAR",
    "account_group": "VARCHAR",
    "account": "VARCHAR",
    "trade_date": "DATE",
    "product_id_internal": "VARCHAR",
    "product": "VARCHAR",
    "type": "VARCHAR",
    "month_year": "VARCHAR",
    "client_symbol": "VARCHAR",
    "strike_price": "DOUBLE PRECISION",
    "call_put": "VARCHAR",
    "product_currency_1": "VARCHAR",
    "long_short": "VARCHAR",
    "quantity_1": "DOUBLE PRECISION",
    "counter_currency_ccy2": "VARCHAR",
    "ccy2_long_short": "VARCHAR",
    "ccy2_quantity_2": "DOUBLE PRECISION",
    "trade_price": "DOUBLE PRECISION",
    "multiplier_and_tick_value": "DOUBLE PRECISION",
    "cost_in_native_currency": "DOUBLE PRECISION",
    "open_exchange_rate": "DOUBLE PRECISION",
    "cost_in_base_currency": "DOUBLE PRECISION",
    "market_settlement_price": "DOUBLE PRECISION",
    "market_value_in_native_currency": "DOUBLE PRECISION",
    "close_exchange_rate": "DOUBLE PRECISION",
    "market_value_in_base_currency": "DOUBLE PRECISION",
    "sector": "VARCHAR",
    "sub_sector": "VARCHAR",
    "country": "VARCHAR",
    "exchange_name": "VARCHAR",
    "source_1_symbol": "VARCHAR",
    "source_3_symbol": "VARCHAR",
    "one_chicago_symbol": "VARCHAR",
    "fas_level": "VARCHAR",
    "option_style": "VARCHAR",
}
SQL_DATA_TYPES = [SQL_DATA_TYPES_BY_COLUMN[column] for column in OUTPUT_COLUMNS]

COLUMN_ALIASES = {
    "faslevel": "fas_level",
}

SOURCE_FILENAME_RE = re.compile(
    r"^Position Valuation Detail Report_"
    r"(?P<nav_date>\d{8})_"
    r"(?P<legal_entity>.+)\."
    r"(?P<upload_date>\d{8})_"
    r"(?P<upload_time>\d{6})\.xlsx$",
    re.IGNORECASE,
)
REMOTE_FILENAME_RE = re.compile(
    r"^Position Valuation Detail Report_"
    r"(?P<nav_date>\d{8})_"
    r"(?P<legal_entity>.+)\.xlsx$",
    re.IGNORECASE,
)

def resolve_local_root(local_dir: str | Path | None = None) -> Path:
    """Resolve the local ignored NAV position workbook cache directory."""
    if local_dir is not None:
        return Path(local_dir)

    return DEFAULT_LOCAL_ROOT


def resolve_fund_configs(
    fund_codes: Sequence[str] | None = None,
) -> list[NavPositionFundConfig]:
    """Return selected fund configs in stable fund-code order."""
    if fund_codes is None:
        return [FUND_CONFIGS[key] for key in sorted(FUND_CONFIGS)]

    selected: list[NavPositionFundConfig] = []
    for fund_code in fund_codes:
        key = fund_code.lower().strip()
        if key not in FUND_CONFIGS:
            raise ValueError(
                f"Unsupported NAV fund_code {fund_code!r}. "
                f"Expected one of: {', '.join(sorted(FUND_CONFIGS))}"
            )
        selected.append(FUND_CONFIGS[key])
    return selected


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


def pull_recent_position_files(
    *,
    fund_configs: Sequence[NavPositionFundConfig],
    lookback_days: int = DEFAULT_LOOKBACK_DAYS,
    local_root: str | Path | None = None,
    target_nav_date: str | date | datetime | pd.Timestamp | None = None,
    sftp_host: str | None = None,
    sftp_port: int | None = None,
    sftp_user: str | None = None,
    sftp_password: str | None = None,
    sftp_remote_dir: str | None = None,
) -> list[DownloadedNavFile]:
    """Download recent NAV position files for the selected funds."""
    if lookback_days < 1:
        raise ValueError("lookback_days must be at least 1.")

    resolved_root = resolve_local_root(local_root)
    normalized_target_nav_date = (
        normalize_nav_date(target_nav_date) if target_nav_date is not None else None
    )
    sftp_host = sftp_host or credentials.NAV_SFTP_HOST
    sftp_port = sftp_port or credentials.NAV_SFTP_PORT or DEFAULT_SFTP_PORT
    sftp_user = sftp_user or credentials.NAV_SFTP_USER
    sftp_password = sftp_password or credentials.NAV_SFTP_PASSWORD
    sftp_remote_dir = sftp_remote_dir or os.environ.get("NAV_SFTP_REMOTE_DIR") or "/"

    _validate_sftp_config(
        host=sftp_host,
        username=sftp_user,
        password=sftp_password,
    )

    sftp: paramiko.SFTPClient | None = None
    transport: paramiko.Transport | None = None
    try:
        sftp, transport = _connect_to_nav_sftp(
            host=sftp_host,
            port=int(sftp_port),
            username=str(sftp_user),
            password=str(sftp_password),
        )
        attrs = list(sftp.listdir_attr(sftp_remote_dir))
        downloaded: list[DownloadedNavFile] = []
        for config in fund_configs:
            fund_dir = resolved_root / config.local_subdir
            fund_dir.mkdir(parents=True, exist_ok=True)
            matching_attrs = _matching_remote_attrs(
                attrs=attrs,
                pattern=config.remote_pattern,
            )
            if normalized_target_nav_date is not None:
                matching_attrs = [
                    attr
                    for attr in matching_attrs
                    if _remote_filename_nav_date(attr.filename)
                    == normalized_target_nav_date
                ]
            matching_attrs = matching_attrs[:lookback_days]
            for attr in matching_attrs:
                upload_timestamp = pd.Timestamp(
                    datetime.fromtimestamp(attr.st_mtime, tz=timezone.utc)
                )
                local_path = fund_dir / _downloaded_filename(
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
                downloaded.append(
                    DownloadedNavFile(
                        fund_code=config.fund_code,
                        remote_filename=attr.filename,
                        local_path=local_path,
                        sftp_upload_timestamp=upload_timestamp,
                    )
                )
        return downloaded
    finally:
        if sftp is not None:
            sftp.close()
        if transport is not None:
            transport.close()


def parse_position_file(
    filepath: str | Path,
    fund_config: NavPositionFundConfig,
) -> pd.DataFrame:
    """Parse one downloaded NAV position valuation workbook."""
    path = Path(filepath)
    parsed = parse_position_filename(path.name, expected_config=fund_config)

    raw_df = pd.read_excel(path, skiprows=3, engine="openpyxl")
    if raw_df.empty:
        return pd.DataFrame(columns=OUTPUT_COLUMNS)

    row_numbers = pd.Series(raw_df.index + EXCEL_DATA_START_ROW, index=raw_df.index)
    total_mask = raw_df.apply(_row_contains_total, axis=1)
    raw_df = raw_df.loc[~total_mask].copy()
    if raw_df.empty:
        return pd.DataFrame(columns=OUTPUT_COLUMNS)

    normalized = _normalize_report_dataframe(raw_df)
    formatted = _format_report_dataframe(normalized)
    formatted.insert(0, "sftp_upload_timestamp", parsed["sftp_upload_timestamp"])
    formatted.insert(0, "nav_date", parsed["nav_date"])
    formatted.insert(
        0,
        "source_file_row_number",
        row_numbers.loc[raw_df.index].astype(int).to_list(),
    )
    formatted.insert(0, "source_file_name", path.name)
    formatted.insert(0, "source_legal_entity", parsed["source_legal_entity"])
    formatted.insert(0, "fund_code", fund_config.fund_code)

    return formatted[OUTPUT_COLUMNS].reset_index(drop=True)


def parse_position_filename(
    filename: str,
    expected_config: NavPositionFundConfig | None = None,
) -> dict[str, object]:
    """Parse NAV date, legal entity, and upload timestamp from a local filename."""
    match = SOURCE_FILENAME_RE.match(filename)
    if not match:
        raise ValueError(f"NAV position filename does not match expected shape: {filename}")

    legal_entity = match.group("legal_entity").strip()
    if (
        expected_config is not None
        and legal_entity.lower() != expected_config.legal_entity.lower()
    ):
        raise ValueError(
            f"NAV position filename legal entity {legal_entity!r} does not match "
            f"fund {expected_config.fund_code!r} ({expected_config.legal_entity!r})."
        )

    upload_value = f"{match.group('upload_date')}_{match.group('upload_time')}"
    return {
        "nav_date": datetime.strptime(match.group("nav_date"), "%Y%m%d").date(),
        "source_legal_entity": legal_entity,
        "sftp_upload_timestamp": pd.Timestamp(
            datetime.strptime(upload_value, "%Y%m%d_%H%M%S"),
            tz="UTC",
        ),
    }


def run_nav_positions(
    *,
    lookback_days: int = DEFAULT_LOOKBACK_DAYS,
    fund_codes: Sequence[str] | None = None,
    local_dir: str | Path | None = None,
    database: str | None = None,
    target_nav_date: str | date | datetime | pd.Timestamp | None = None,
    require_complete_target: bool = False,
    sftp_host: str | None = None,
    sftp_port: int | None = None,
    sftp_user: str | None = None,
    sftp_password: str | None = None,
    sftp_remote_dir: str | None = None,
) -> dict[str, object]:
    """Download, parse, and upsert recent NAV position valuation reports."""
    selected_configs = resolve_fund_configs(fund_codes)
    local_root = resolve_local_root(local_dir)
    normalized_target_nav_date = (
        normalize_nav_date(target_nav_date) if target_nav_date is not None else None
    )
    downloaded_files = pull_recent_position_files(
        fund_configs=selected_configs,
        lookback_days=lookback_days,
        local_root=local_root,
        target_nav_date=normalized_target_nav_date,
        sftp_host=sftp_host,
        sftp_port=sftp_port,
        sftp_user=sftp_user,
        sftp_password=sftp_password,
        sftp_remote_dir=sftp_remote_dir,
    )
    downloaded_fund_codes = sorted({downloaded.fund_code for downloaded in downloaded_files})
    expected_fund_codes = [config.fund_code for config in selected_configs]
    missing_fund_codes = sorted(set(expected_fund_codes) - set(downloaded_fund_codes))
    target_file_found = not missing_fund_codes if normalized_target_nav_date else None
    source_files = [_downloaded_file_summary(downloaded) for downloaded in downloaded_files]

    if (
        normalized_target_nav_date is not None
        and require_complete_target
        and missing_fund_codes
    ):
        return {
            "target_table": TARGET_TABLE_FQN,
            "fund_codes": expected_fund_codes,
            "lookback_days": lookback_days,
            "local_root": str(local_root),
            "target_nav_date": normalized_target_nav_date.isoformat(),
            "target_file_found": False,
            "loaded_fund_codes": downloaded_fund_codes,
            "missing_fund_codes": missing_fund_codes,
            "source_files": source_files,
            "files_downloaded": len(downloaded_files),
            "files_processed": 0,
            "rows_processed": 0,
        }

    config_by_fund = {config.fund_code: config for config in selected_configs}
    frames = [
        parse_position_file(
            downloaded.local_path,
            fund_config=config_by_fund[downloaded.fund_code],
        )
        for downloaded in downloaded_files
    ]
    df = (
        pd.concat(frames, ignore_index=True)
        if frames
        else pd.DataFrame(columns=OUTPUT_COLUMNS)
    )
    rows_processed = int(len(df))
    if not df.empty:
        _upsert_positions(df=df, database=database)

    return {
        "target_table": TARGET_TABLE_FQN,
        "fund_codes": expected_fund_codes,
        "lookback_days": lookback_days,
        "local_root": str(local_root),
        "target_nav_date": (
            normalized_target_nav_date.isoformat()
            if normalized_target_nav_date is not None
            else None
        ),
        "target_file_found": target_file_found,
        "loaded_fund_codes": downloaded_fund_codes,
        "missing_fund_codes": missing_fund_codes,
        "source_files": source_files,
        "files_downloaded": len(downloaded_files),
        "files_processed": len(frames),
        "rows_processed": rows_processed,
    }


def backfill_position_normalization(
    *,
    database: str | None = None,
    limit: int | None = None,
) -> dict[str, object]:
    """Deprecated: NAV rule outputs are query-time derived fields, not table columns."""
    raise RuntimeError(
        "nav.positions is raw-only. Product/contract normalization must be "
        "computed in read-only SQL, not backfilled into the source table."
    )


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


def _downloaded_file_summary(downloaded: DownloadedNavFile) -> dict[str, object]:
    return {
        "fund_code": downloaded.fund_code,
        "remote_filename": downloaded.remote_filename,
        "local_filename": downloaded.local_path.name,
        "local_path": str(downloaded.local_path),
        "sftp_upload_timestamp": downloaded.sftp_upload_timestamp.to_pydatetime(),
    }


def _normalize_report_dataframe(raw_df: pd.DataFrame) -> pd.DataFrame:
    normalized_columns = [_normalize_column_name(column) for column in raw_df.columns]
    duplicates = sorted(
        {
            column
            for column in normalized_columns
            if normalized_columns.count(column) > 1
        }
    )
    if duplicates:
        raise ValueError(f"NAV position report has duplicate columns: {duplicates}")

    missing = sorted(set(REPORT_COLUMNS) - set(normalized_columns))
    unexpected = sorted(set(normalized_columns) - set(REPORT_COLUMNS))
    if missing or unexpected:
        raise ValueError(
            "NAV position report columns do not match expected contract; "
            f"missing={missing}, unexpected={unexpected}"
        )

    df = raw_df.copy()
    df.columns = normalized_columns
    return df[REPORT_COLUMNS]


def _format_report_dataframe(df: pd.DataFrame) -> pd.DataFrame:
    formatted = df.copy()
    for column in NUMERIC_COLUMNS:
        formatted[column] = pd.to_numeric(formatted[column], errors="coerce")

    for column in DATE_COLUMNS:
        parsed = pd.to_datetime(formatted[column], errors="coerce")
        formatted[column] = parsed.dt.date

    for column in STRING_REPORT_COLUMNS:
        formatted[column] = formatted[column].map(_clean_string)

    return formatted


def _normalize_column_name(column: object) -> str:
    text = str(column)
    text = re.sub(r"_x000a_", " ", text, flags=re.IGNORECASE)
    text = text.replace("\n", " ")
    text = re.sub(r"[^0-9A-Za-z]+", "_", text)
    text = re.sub(r"_+", "_", text).strip("_").lower()
    return COLUMN_ALIASES.get(text, text)


def _clean_string(value: object) -> str | None:
    if pd.isna(value):
        return None
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    text = str(value).strip()
    return text or None


def _row_contains_total(row: pd.Series) -> bool:
    return any(isinstance(value, str) and "total" in value.lower() for value in row)


def _upsert_positions(df: pd.DataFrame, database: str | None = None) -> None:
    upsert_df = (
        df[OUTPUT_COLUMNS]
        .drop_duplicates(subset=PRIMARY_KEY, keep="last")
        .where(pd.notna(df[OUTPUT_COLUMNS]), None)
        .reset_index(drop=True)
    )
    if upsert_df.empty:
        return

    db.upsert_dataframe(
        database=database,
        schema=TARGET_SCHEMA,
        table_name=TARGET_TABLE,
        df=upsert_df,
        columns=OUTPUT_COLUMNS,
        data_types=SQL_DATA_TYPES,
        primary_key=PRIMARY_KEY,
    )
