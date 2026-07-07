"""Clear Street end-of-day transaction SFTP scrape."""

from __future__ import annotations

import fnmatch
import io
import os
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
from backend.utils import db

API_SCRAPE_NAME = "clear_street_eod_transactions"
SOURCE_SYSTEM = "clear_street_sftp"
SOURCE_REPORT_NAME = "Helios_Transactions"
TARGET_SCHEMA = "clear_street"
TARGET_TABLE = "eod_transactions"
TARGET_TABLE_FQN = f"{TARGET_SCHEMA}.{TARGET_TABLE}"
DEFAULT_LOOKBACK_DAYS = 5
DEFAULT_SFTP_PORT = 22
DEFAULT_FILE_PATTERN = "Helios_Transactions_*.csv"
DEFAULT_LOCAL_DIR = Path(__file__).resolve().parent / "downloads" / "transactions"

RAW_CSV_COLUMNS = [
    "RECORD_ID",
    "FIRM",
    "ORGANIZATION",
    "ACCOUNT_NUMBER",
    "ACCOUNT_TYPE",
    "CURRENCY_SYMBOL",
    "RR",
    "TRADE_DATE",
    "BUY_SELL",
    "QUANTITY",
    "EXCHANGE",
    "FUTURES_CODE",
    "SYMBOL",
    "CONTRACT_YEAR_MONTH",
    "PROMPT_DAY",
    "STRIKE_PRICE",
    "PUT_CALL",
    "SECURITY_DESCRIPTION",
    "TRADE_PRICE",
    "PRINTABLE_PRICE",
    "TRADE_TYPE",
    "ORDER_NUMBER",
    "SECURITY_TYPE_CODE",
    "CUSIP",
    "COMMENT_CODE",
    "GIVE_IN_OUT_CODE",
    "GIVE_IN_OUT_FIRM_NUM",
    "SPREAD_CODE",
    "OPEN_CLOSE_CODE",
    "TRACE_NUM_OR_UNIQUE_IDENTIFIER",
    "ROUND_TURN_HALF_TURN_ACCOUNT",
    "EXECUTING_BROKER",
    "OPPOSING_BROKER",
    "OPPOS_FIRM",
    "COMMISSION",
    "COMM_ACT_TYPE",
    "FEE_AMT_1",
    "FEE_1_ATYPE",
    "FEE_AMT_2",
    "FEE_2_ATYPE",
    "FEE_AMT_3",
    "FEE_3_ATYPE",
    "BROKERAGE",
    "BRKRAGE_ATYPE",
    "GIVE_IO_CHARGE",
    "GIVE_IO_ATYPE",
    "OTHER_CHARGES",
    "OTHER_ATYPE",
    "WIRE_CHARGE",
    "WIRE_CHG_ATYPE",
    "FEE_TYPE_6",
    "FEE_TYPE_6_ATYPE",
    "DATE",
    "OPTION_EXP_DATE",
    "LAST_TRD_DATE",
    "NET_AMOUNT",
    "TRADED_EXCHG",
    "SUB_EXCHANGE",
    "EXCHANGE_NAME",
    "EXCH_COMM_CD",
    "MULTIPLICATION_FACTOR",
    "SUBACCOUNT",
    "INSTR_TYPE",
    "CASH_SETTLED",
    "INSTRUMENT_DESCRIPTION",
    "FEE_AMT_4",
    "FEE_4_ATYPE",
    "FEE_AMT_5",
    "FEE_5_ATYPE",
    "FEE_AMT_7",
    "FEE_7_ATYPE",
    "FEE_AMT_8",
    "FEE_8_ATYPE",
    "FEE_AMT_9",
    "FEE_9_ATYPE",
    "FEE_AMT_10",
    "FEE_10_ATYPE",
    "FEE_AMT_11",
    "FEE_11_ATYPE",
    "FEE_AMT_12",
    "FEE_12_ATYPE",
    "FEE_AMT_13",
    "FEE_13_ATYPE",
    "CLEARING_TIME_HHMMSS",
    "SETTLEMENT_PRICE",
    "BROKER",
    "ISIN",
    "MIC",
]

CSV_DTYPES = {column: str for column in RAW_CSV_COLUMNS}
SOURCE_COLUMNS = [column.lower() for column in RAW_CSV_COLUMNS]

PRIMARY_KEY = [
    "trade_date_from_sftp",
    "sftp_upload_timestamp",
    "row_number_for_trades",
]

OUTPUT_COLUMNS = PRIMARY_KEY + [
    column for column in SOURCE_COLUMNS if column not in PRIMARY_KEY
]

STRING_COLUMNS = [
    "record_id",
    "firm",
    "organization",
    "account_number",
    "account_type",
    "currency_symbol",
    "rr",
    "trade_date",
    "date",
    "exchange",
    "sub_exchange",
    "exchange_name",
    "exch_comm_cd",
    "futures_code",
    "symbol",
    "security_description",
    "security_type_code",
    "instrument_description",
    "instr_type",
    "cash_settled",
    "cusip",
    "isin",
    "mic",
    "order_number",
    "trace_num_or_unique_identifier",
    "trade_type",
    "open_close_code",
    "buy_sell",
    "put_call",
    "printable_price",
    "comment_code",
    "give_in_out_code",
    "give_in_out_firm_num",
    "spread_code",
    "round_turn_half_turn_account",
    "executing_broker",
    "opposing_broker",
    "oppos_firm",
    "broker",
    "traded_exchg",
    "comm_act_type",
    "fee_1_atype",
    "fee_2_atype",
    "fee_3_atype",
    "brkrage_atype",
    "give_io_atype",
    "other_atype",
    "wire_chg_atype",
    "fee_type_6_atype",
    "fee_4_atype",
    "fee_5_atype",
    "fee_7_atype",
    "fee_8_atype",
    "fee_9_atype",
    "fee_10_atype",
    "fee_11_atype",
    "fee_12_atype",
    "fee_13_atype",
    "option_exp_date",
    "last_trd_date",
    "clearing_time_hhmmss",
    "net_amount",
    "multiplication_factor",
    "subaccount",
]

FLOAT_COLUMNS = [
    "strike_price",
    "trade_price",
    "commission",
    "brokerage",
    "give_io_charge",
    "other_charges",
    "wire_charge",
    "fee_type_6",
    "fee_amt_1",
    "fee_amt_2",
    "fee_amt_3",
    "fee_amt_4",
    "fee_amt_5",
    "fee_amt_7",
    "fee_amt_8",
    "fee_amt_9",
    "fee_amt_10",
    "fee_amt_11",
    "fee_amt_12",
    "fee_amt_13",
    "settlement_price",
]

INTEGER_COLUMNS = [
    "contract_year_month",
    "prompt_day",
    "quantity",
    "row_number_for_trades",
]

SQL_DATA_TYPES_BY_COLUMN = {
    "trade_date_from_sftp": "VARCHAR",
    "sftp_upload_timestamp": "TIMESTAMPTZ",
    **{column: "VARCHAR" for column in STRING_COLUMNS},
    **{column: "DOUBLE PRECISION" for column in FLOAT_COLUMNS},
    **{column: "INTEGER" for column in INTEGER_COLUMNS},
}
SQL_DATA_TYPES = [SQL_DATA_TYPES_BY_COLUMN[column] for column in OUTPUT_COLUMNS]

SOURCE_FILENAME_RE = re.compile(
    r"^Helios_Transactions_"
    r"(?P<trade_date>\d{8})\."
    r"(?P<upload_date>\d{8})_"
    r"(?P<upload_time>\d{6})\.csv$",
    re.IGNORECASE,
)


@dataclass(frozen=True)
class DownloadedClearStreetFile:
    remote_filename: str
    local_path: Path
    sftp_upload_timestamp: pd.Timestamp


def resolve_local_dir(local_dir: str | Path | None = None) -> Path:
    """Resolve the ignored Clear Street transaction CSV cache directory."""
    if local_dir is not None:
        return Path(local_dir)

    return DEFAULT_LOCAL_DIR


def pull_recent_transaction_files(
    *,
    lookback_days: int = DEFAULT_LOOKBACK_DAYS,
    local_dir: str | Path | None = None,
    trade_file_pattern: str = DEFAULT_FILE_PATTERN,
    target_trade_date: str | date | datetime | None = None,
    sftp_host: str | None = None,
    sftp_port: int | None = None,
    sftp_user: str | None = None,
    ssh_key_content: str | None = None,
    sftp_remote_dir: str | None = None,
) -> list[DownloadedClearStreetFile]:
    """Download recent Clear Street end-of-day transaction files."""
    if lookback_days < 1:
        raise ValueError("lookback_days must be at least 1.")

    resolved_dir = resolve_local_dir(local_dir)
    resolved_dir.mkdir(parents=True, exist_ok=True)
    normalized_target_trade_date = (
        normalize_trade_date_for_sftp(target_trade_date)
        if target_trade_date is not None
        else None
    )
    if normalized_target_trade_date is not None:
        trade_file_pattern = transaction_file_pattern_for_trade_date(
            normalized_target_trade_date
        )

    sftp_host = sftp_host or credentials.CLEAR_STREET_SFTP_HOST
    sftp_port = sftp_port or credentials.CLEAR_STREET_SFTP_PORT or DEFAULT_SFTP_PORT
    sftp_user = sftp_user or credentials.CLEAR_STREET_SFTP_USER
    ssh_key_content = ssh_key_content or credentials.CLEAR_STREET_SSH_KEY_CONTENT
    sftp_remote_dir = (
        sftp_remote_dir
        or os.environ.get("CLEAR_STREET_SFTP_REMOTE_DIR")
        or credentials.CLEAR_STREET_SFTP_REMOTE_DIR
        or "/"
    )

    _validate_sftp_config(
        host=sftp_host,
        username=sftp_user,
        ssh_key_content=ssh_key_content,
    )

    sftp: paramiko.SFTPClient | None = None
    transport: paramiko.Transport | None = None
    try:
        sftp, transport = _connect_to_clear_street_sftp(
            host=str(sftp_host),
            port=int(sftp_port),
            username=str(sftp_user),
            ssh_key_content=str(ssh_key_content),
        )
        matching_attrs = _matching_remote_attrs(
            attrs=sftp.listdir_attr(sftp_remote_dir),
            pattern=trade_file_pattern,
        )[:lookback_days]
        downloaded: list[DownloadedClearStreetFile] = []
        for attr in matching_attrs:
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
            downloaded.append(
                DownloadedClearStreetFile(
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


def parse_transaction_file(filepath: str | Path) -> pd.DataFrame:
    """Parse one downloaded Clear Street end-of-day transaction CSV."""
    path = Path(filepath)
    parsed = parse_transaction_filename(path.name)
    raw_df = pd.read_csv(path, dtype=CSV_DTYPES)
    normalized = _normalize_source_dataframe(raw_df)
    if normalized.empty:
        return pd.DataFrame(columns=OUTPUT_COLUMNS)

    formatted = _format_transaction_dataframe(normalized)
    formatted.insert(0, "row_number_for_trades", raw_df.index.astype(int).to_list())
    formatted.insert(0, "sftp_upload_timestamp", parsed["sftp_upload_timestamp"])
    formatted.insert(0, "trade_date_from_sftp", parsed["trade_date_from_sftp"])

    return formatted[OUTPUT_COLUMNS].reset_index(drop=True)


def parse_transaction_filename(filename: str) -> dict[str, object]:
    """Parse trade date and SFTP upload timestamp from a local CSV filename."""
    match = SOURCE_FILENAME_RE.match(filename)
    if not match:
        raise ValueError(
            "Clear Street transaction filename does not match expected shape: "
            f"{filename}"
        )

    upload_value = f"{match.group('upload_date')}_{match.group('upload_time')}"
    return {
        "trade_date_from_sftp": match.group("trade_date"),
        "sftp_upload_timestamp": pd.Timestamp(
            datetime.strptime(upload_value, "%Y%m%d_%H%M%S"),
            tz="UTC",
        ),
    }


def normalize_trade_date_for_sftp(value: str | date | datetime) -> str:
    """Normalize a Clear Street trade date to the YYYYMMDD SFTP filename form."""
    if isinstance(value, datetime):
        return value.date().strftime("%Y%m%d")
    if isinstance(value, date):
        return value.strftime("%Y%m%d")

    text = str(value).strip()
    if re.fullmatch(r"\d{8}", text):
        return text
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}", text):
        return text.replace("-", "")

    raise ValueError(f"Invalid Clear Street trade date: {value!r}")


def transaction_file_pattern_for_trade_date(value: str | date | datetime) -> str:
    trade_date = normalize_trade_date_for_sftp(value)
    return f"Helios_Transactions_{trade_date}.csv"


def run_clear_street_transactions(
    *,
    lookback_days: int = DEFAULT_LOOKBACK_DAYS,
    local_dir: str | Path | None = None,
    database: str | None = None,
    target_trade_date: str | date | datetime | None = None,
) -> dict[str, object]:
    """Download, parse, and upsert recent Clear Street EOD transaction files."""
    resolved_dir = resolve_local_dir(local_dir)
    normalized_target_trade_date = (
        normalize_trade_date_for_sftp(target_trade_date)
        if target_trade_date is not None
        else None
    )
    downloaded_files = pull_recent_transaction_files(
        lookback_days=lookback_days,
        local_dir=resolved_dir,
        target_trade_date=normalized_target_trade_date,
    )
    frames = []
    source_files = []
    for downloaded in downloaded_files:
        frame = parse_transaction_file(downloaded.local_path)
        frames.append(frame)
        source_files.append(
            _build_source_file_summary(
                downloaded=downloaded,
                rows_processed=len(frame),
            )
        )
    df = (
        pd.concat(frames, ignore_index=True)
        if frames
        else pd.DataFrame(columns=OUTPUT_COLUMNS)
    )
    rows_processed = int(len(df))
    if not df.empty:
        _upsert_transactions(df=df, database=database)

    min_trade_date_from_sftp = None
    max_trade_date_from_sftp = None
    latest_sftp_upload_timestamp = None
    if not df.empty:
        min_trade_date_from_sftp = str(df["trade_date_from_sftp"].min())
        max_trade_date_from_sftp = str(df["trade_date_from_sftp"].max())
        latest_sftp_upload_timestamp = pd.Timestamp(
            df["sftp_upload_timestamp"].max()
        ).to_pydatetime()

    return {
        "target_table": TARGET_TABLE_FQN,
        "lookback_days": lookback_days,
        "local_dir": str(resolved_dir),
        "files_downloaded": len(downloaded_files),
        "files_processed": len(frames),
        "rows_processed": rows_processed,
        "source_files": source_files,
        "latest_trade_file": _latest_trade_file_summary(source_files),
        "target_trade_date_from_sftp": normalized_target_trade_date,
        "target_file_found": bool(downloaded_files)
        if normalized_target_trade_date is not None
        else None,
        "min_trade_date_from_sftp": min_trade_date_from_sftp,
        "max_trade_date_from_sftp": max_trade_date_from_sftp,
        "latest_sftp_upload_timestamp": latest_sftp_upload_timestamp,
    }


def _build_source_file_summary(
    *,
    downloaded: DownloadedClearStreetFile,
    rows_processed: int,
) -> dict[str, object]:
    parsed = parse_transaction_filename(downloaded.local_path.name)
    return {
        "remote_filename": downloaded.remote_filename,
        "local_filename": downloaded.local_path.name,
        "trade_date_from_sftp": parsed["trade_date_from_sftp"],
        "sftp_upload_timestamp": pd.Timestamp(
            parsed["sftp_upload_timestamp"]
        ).to_pydatetime(),
        "rows_processed": int(rows_processed),
    }


def _latest_trade_file_summary(
    source_files: list[dict[str, object]],
) -> dict[str, object] | None:
    if not source_files:
        return None
    return max(
        source_files,
        key=lambda file_summary: (
            str(file_summary.get("trade_date_from_sftp") or ""),
            str(file_summary.get("sftp_upload_timestamp") or ""),
            str(file_summary.get("remote_filename") or ""),
        ),
    )


def _connect_to_clear_street_sftp(
    *,
    host: str,
    port: int,
    username: str,
    ssh_key_content: str,
) -> tuple[paramiko.SFTPClient, paramiko.Transport]:
    key_content = _normalize_private_key_content(ssh_key_content)
    private_key = paramiko.RSAKey.from_private_key(io.StringIO(key_content))
    transport = paramiko.Transport((host, port))
    transport.connect(username=username, pkey=private_key)
    return paramiko.SFTPClient.from_transport(transport), transport


def _validate_sftp_config(
    *,
    host: str | None,
    username: str | None,
    ssh_key_content: str | None,
) -> None:
    missing = [
        name
        for name, value in {
            "CLEAR_STREET_SFTP_HOST": host,
            "CLEAR_STREET_SFTP_USER": username,
            "CLEAR_STREET_SSH_KEY_CONTENT": ssh_key_content,
        }.items()
        if not value
    ]
    if missing:
        raise RuntimeError(
            "Missing Clear Street SFTP environment variables: "
            + ", ".join(missing)
        )


def _matching_remote_attrs(*, attrs: Iterable[Any], pattern: str) -> list[Any]:
    return sorted(
        [
            attr
            for attr in attrs
            if fnmatch.fnmatchcase(attr.filename.upper(), pattern.upper())
        ],
        key=lambda attr: attr.filename,
        reverse=True,
    )


def _downloaded_filename(*, filename: str, upload_timestamp: pd.Timestamp) -> str:
    path = Path(filename)
    timestamp = pd.Timestamp(upload_timestamp).strftime("%Y%m%d_%H%M%S")
    return f"{path.stem}.{timestamp}{path.suffix.lower()}"


def _normalize_source_dataframe(raw_df: pd.DataFrame) -> pd.DataFrame:
    normalized_columns = [_normalize_column_name(column) for column in raw_df.columns]
    duplicates = sorted(
        {
            column
            for column in normalized_columns
            if normalized_columns.count(column) > 1
        }
    )
    if duplicates:
        raise ValueError(
            f"Clear Street transaction file has duplicate columns: {duplicates}"
        )

    missing = sorted(set(SOURCE_COLUMNS) - set(normalized_columns))
    unexpected = sorted(set(normalized_columns) - set(SOURCE_COLUMNS))
    if missing or unexpected:
        raise ValueError(
            "Clear Street transaction columns do not match expected contract; "
            f"missing={missing}, unexpected={unexpected}"
        )

    df = raw_df.copy()
    df.columns = normalized_columns
    return df[SOURCE_COLUMNS]


def _format_transaction_dataframe(df: pd.DataFrame) -> pd.DataFrame:
    formatted = df.copy()
    for column in STRING_COLUMNS:
        formatted[column] = formatted[column].fillna("").astype(str).str.strip()

    for column in FLOAT_COLUMNS:
        formatted[column] = pd.to_numeric(formatted[column], errors="coerce")
        formatted[column] = formatted[column].fillna(0.0).astype(float)

    for column in [column for column in INTEGER_COLUMNS if column != "row_number_for_trades"]:
        formatted[column] = pd.to_numeric(formatted[column], errors="coerce")
        formatted[column] = formatted[column].fillna(0).astype(int)

    return formatted


def _normalize_column_name(column: object) -> str:
    text = str(column)
    text = re.sub(r"_x000a_", " ", text, flags=re.IGNORECASE)
    text = text.replace("\n", " ")
    text = re.sub(r"[^0-9A-Za-z]+", "_", text)
    return re.sub(r"_+", "_", text).strip("_").lower()


def _normalize_private_key_content(key_content: str) -> str:
    if "\\n" in key_content and "\n" not in key_content:
        return key_content.replace("\\n", "\n")
    return key_content


def _upsert_transactions(df: pd.DataFrame, database: str | None = None) -> None:
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
