"""Export latest Clear Street trade rows and upload them to MUFG SFTP."""

from __future__ import annotations

import os
import posixpath
from datetime import date, datetime
from pathlib import Path
from typing import Any

import pandas as pd
import paramiko

from backend import credentials
from backend.utils import db
from backend.utils import dbt_compiled_sql

API_SCRAPE_NAME = "clear_street_trades_mufg_upload"
SOURCE_SYSTEM = "mufg_sftp"
SOURCE_FEED = "clear_street_trades"
SOURCE_TABLE_FQN = "clear_street.eod_transactions"
TARGET_NAME = "mufg_sftp.clear_street_trades"
DEFAULT_SQL_FILENAME = "clear_street_trades/mufg/latest.sql"
DEFAULT_DBT_MODEL_PATH = Path(
    "clear_street_eod_transactions/marts/cs_v3_80_mufg_latest.sql"
)
DEFAULT_CSV_FILENAME_PATTERN = "Helios_Transactions"
DEFAULT_SFTP_PORT = 22
PACKAGE_ROOT = Path(__file__).resolve().parent
DEFAULT_LOCAL_DIR = PACKAGE_ROOT / "exports" / "mufg"
PRODUCT_CODE_NULL_REQUIRED_COLUMNS: tuple[str, ...] = (
    "product_code_grouping",
    "product_code_region",
)
PRODUCT_CODE_NULL_VENDOR_CODE_COLUMNS: tuple[str, ...] = (
    "ice_product_code",
    "cme_product_code",
    "bbg_product_code",
)
PRODUCT_CODE_NULL_CHECK_COLUMNS: tuple[str, ...] = (
    *PRODUCT_CODE_NULL_REQUIRED_COLUMNS,
    *PRODUCT_CODE_NULL_VENDOR_CODE_COLUMNS,
)
PRODUCT_CODE_NULL_CRITERIA = (
    "product_code_grouping is blank/null and product_code_region is blank/null "
    "and at least one of ice_product_code, cme_product_code, or bbg_product_code "
    "is blank/null"
)
PRODUCT_CODE_NULL_PRODUCT_ID_COLUMNS: tuple[str, ...] = (
    "security_description",
    "instrument_description",
    "symbol",
    "futures_code",
    "exch_comm_cd",
    "exchange_name",
)
PRODUCT_CODE_NULL_PRODUCT_DETAIL_COLUMNS: tuple[str, ...] = (
    "contract_year_month",
    "put_call",
    "trade_status",
)
PRODUCT_CODE_NULL_MAX_PRODUCT_SUMMARIES = 10


def run_clear_street_trades_mufg_upload(
    *,
    expected_trade_date: str | date | datetime | None = None,
    local_dir: str | Path | None = None,
    database: str | None = None,
    sql_filename: str = DEFAULT_SQL_FILENAME,
    sql_dir: str | Path | None = None,
    csv_filename_pattern: str = DEFAULT_CSV_FILENAME_PATTERN,
    mufg_host: str | None = None,
    mufg_username: str | None = None,
    mufg_password: str | None = None,
    mufg_port: int | None = None,
    mufg_remote_dir: str | None = None,
) -> dict[str, object]:
    """Build the latest MUFG Clear Street CSV and upload it to MUFG SFTP."""
    df = pull_mufg_extract_from_db(
        sql_filename=sql_filename,
        sql_dir=sql_dir,
        database=database,
    )
    expected = (
        normalize_trade_date(expected_trade_date)
        if expected_trade_date is not None
        else None
    )
    sftp_date = None if df.empty else latest_sftp_date(df)
    export_date = _resolve_export_date(expected=expected, sftp_date=sftp_date)

    local_path = write_mufg_extract_csv(
        df=df,
        sftp_date=export_date,
        local_dir=local_dir,
        csv_filename_pattern=csv_filename_pattern,
    )

    remote_dir = _resolve_remote_dir(mufg_remote_dir)
    remote_path = upload_mufg_extract_csv(
        local_path=local_path,
        remote_dir=remote_dir,
        mufg_host=mufg_host,
        mufg_username=mufg_username,
        mufg_password=mufg_password,
        mufg_port=mufg_port,
    )

    return {
        "target_table": TARGET_NAME,
        "source_table": SOURCE_TABLE_FQN,
        "sql_filename": sql_filename,
        "rows_exported": int(len(df)),
        "rows_uploaded": int(len(df)),
        "trade_date": export_date.isoformat(),
        "export_trade_date": export_date.isoformat(),
        "sftp_date": sftp_date.isoformat() if sftp_date is not None else None,
        "sftp_date_from_sql": (
            sftp_date.strftime("%Y%m%d") if sftp_date is not None else None
        ),
        "expected_trade_date_from_sftp": expected,
        "sql_extract_empty": bool(df.empty),
        "sql_extract_sftp_date_mismatch": _sql_extract_sftp_date_mismatch(
            expected=expected,
            sftp_date=sftp_date,
        ),
        "local_file_path": str(local_path),
        "filename": local_path.name,
        "remote_filename": local_path.name,
        "remote_dir": remote_dir,
        "remote_path": remote_path,
        "trade_status_counts": _trade_status_counts(df),
        "non_ok_trade_status_rows": _non_ok_trade_status_rows(df),
        "product_code_null_check": summarize_product_code_nulls(df),
    }


def pull_mufg_extract_from_db(
    *,
    sql_filename: str = DEFAULT_SQL_FILENAME,
    sql_dir: str | Path | None = None,
    database: str | None = None,
) -> pd.DataFrame:
    query = load_mufg_extract_sql(sql_filename=sql_filename, sql_dir=sql_dir)
    return db.fetch_df(query=query, database=database)


def load_mufg_extract_sql(
    *,
    sql_filename: str = DEFAULT_SQL_FILENAME,
    sql_dir: str | Path | None = None,
) -> str:
    if sql_dir is not None:
        sql_path = Path(sql_dir) / sql_filename
        if not sql_path.exists():
            raise FileNotFoundError(f"MUFG Clear Street SQL file not found: {sql_path}")
        return _normalize_sql(sql_path.read_text(encoding="utf-8"))

    if sql_filename != DEFAULT_SQL_FILENAME:
        raise FileNotFoundError(
            "Custom MUFG Clear Street SQL filenames require an explicit sql_dir. "
            f"Got sql_filename={sql_filename!r}."
        )

    return dbt_compiled_sql.load_positions_trades_v3_model_sql(
        DEFAULT_DBT_MODEL_PATH,
        compile_before_load=True,
    )


def latest_sftp_date(df: pd.DataFrame, column: str = "sftp_date") -> date:
    if column not in df.columns:
        raise ValueError(f"MUFG Clear Street extract is missing column: {column}")
    latest_value = df[column].max()
    if pd.isna(latest_value):
        raise ValueError("MUFG Clear Street extract has no non-null sftp_date.")
    return _coerce_date(latest_value)


def write_mufg_extract_csv(
    *,
    df: pd.DataFrame,
    sftp_date: date,
    local_dir: str | Path | None = None,
    csv_filename_pattern: str = DEFAULT_CSV_FILENAME_PATTERN,
) -> Path:
    resolved_dir = resolve_local_dir(local_dir)
    resolved_dir.mkdir(parents=True, exist_ok=True)
    filename = f"{csv_filename_pattern}_{sftp_date:%Y%m%d}_filtered.csv"
    local_path = resolved_dir / filename
    df.to_csv(local_path, index=False)
    return local_path


def summarize_product_code_nulls(df: pd.DataFrame) -> dict[str, object]:
    overall_counts: dict[str, int] = {}
    masks: dict[str, pd.Series] = {}
    missing_columns: list[str] = []

    for column in PRODUCT_CODE_NULL_CHECK_COLUMNS:
        if column not in df.columns:
            null_mask = pd.Series(True, index=df.index)
            overall_counts[column] = int(len(df))
            missing_columns.append(column)
        else:
            null_mask = _blank_or_null_mask(df[column])
            overall_counts[column] = int(null_mask.sum())
        masks[column] = null_mask

    required_null_mask = pd.Series(True, index=df.index)
    for column in PRODUCT_CODE_NULL_REQUIRED_COLUMNS:
        required_null_mask = required_null_mask & masks[column]

    vendor_code_null_mask = pd.Series(False, index=df.index)
    for column in PRODUCT_CODE_NULL_VENDOR_CODE_COLUMNS:
        vendor_code_null_mask = vendor_code_null_mask | masks[column]

    alert_mask = required_null_mask & vendor_code_null_mask
    alert_counts = {
        column: int((masks[column] & alert_mask).sum())
        for column in PRODUCT_CODE_NULL_CHECK_COLUMNS
    }
    null_columns = [
        column for column, count in alert_counts.items() if count > 0
    ]
    affected_products = _summarize_product_code_null_products(df.loc[alert_mask])

    return {
        "checked_columns": list(PRODUCT_CODE_NULL_CHECK_COLUMNS),
        "criteria": PRODUCT_CODE_NULL_CRITERIA,
        "required_null_columns": list(PRODUCT_CODE_NULL_REQUIRED_COLUMNS),
        "vendor_code_columns": list(PRODUCT_CODE_NULL_VENDOR_CODE_COLUMNS),
        "overall_null_counts": overall_counts,
        "null_counts": alert_counts,
        "null_columns": null_columns,
        "null_rows": int(alert_mask.sum()),
        "missing_columns": missing_columns,
        "has_nulls": bool(alert_mask.any()),
        "affected_products": affected_products,
        "affected_product_count": len(affected_products),
    }


def resolve_local_dir(local_dir: str | Path | None = None) -> Path:
    if local_dir is not None:
        return Path(local_dir)
    return DEFAULT_LOCAL_DIR


def upload_mufg_extract_csv(
    *,
    local_path: str | Path,
    remote_dir: str,
    mufg_host: str | None = None,
    mufg_username: str | None = None,
    mufg_password: str | None = None,
    mufg_port: int | None = None,
) -> str:
    host = mufg_host or credentials.MUFG_SFTP_HOST
    username = mufg_username or credentials.MUFG_SFTP_USER
    password = mufg_password or credentials.MUFG_SFTP_PASSWORD
    port = mufg_port or credentials.MUFG_SFTP_PORT or DEFAULT_SFTP_PORT
    _validate_mufg_sftp_config(
        host=host,
        username=username,
        password=password,
    )

    sftp: paramiko.SFTPClient | None = None
    transport: paramiko.Transport | None = None
    path = Path(local_path)
    remote_path = posixpath.join(remote_dir, path.name)
    try:
        sftp, transport = _connect_to_mufg_sftp(
            host=str(host),
            port=int(port),
            username=str(username),
            password=str(password),
        )
        with path.open("rb") as file_obj:
            sftp.putfo(file_obj, remote_path)
        return remote_path
    finally:
        if sftp is not None:
            sftp.close()
        if transport is not None:
            transport.close()


def normalize_trade_date(value: str | date | datetime) -> str:
    if isinstance(value, datetime):
        return value.date().strftime("%Y%m%d")
    if isinstance(value, date):
        return value.strftime("%Y%m%d")

    text = str(value).strip()
    if len(text) == 8 and text.isdigit():
        return text
    if len(text) == 10 and text[4] == "-" and text[7] == "-":
        return text.replace("-", "")
    raise ValueError(f"Invalid MUFG Clear Street trade date: {value!r}")


def _connect_to_mufg_sftp(
    *,
    host: str,
    port: int,
    username: str,
    password: str,
) -> tuple[paramiko.SFTPClient, paramiko.Transport]:
    transport = paramiko.Transport((host, port))
    transport.connect(username=username, password=password)
    return paramiko.SFTPClient.from_transport(transport), transport


def _validate_mufg_sftp_config(
    *,
    host: str | None,
    username: str | None,
    password: str | None,
) -> None:
    missing = [
        name
        for name, value in {
            "MUFG_SFTP_HOST": host,
            "MUFG_SFTP_USER": username,
            "MUFG_SFTP_PASSWORD": password,
        }.items()
        if not value
    ]
    if missing:
        raise RuntimeError(
            "Missing MUFG SFTP environment variables: " + ", ".join(missing)
        )


def _resolve_remote_dir(remote_dir: str | None = None) -> str:
    value = remote_dir or credentials.MUFG_SFTP_REMOTE_DIR or "/"
    value = value.strip() or "/"
    if value == "/":
        return value
    return value.rstrip("/")


def _coerce_date(value: Any) -> date:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    return pd.Timestamp(value).date()


def _normalize_sql(value: str) -> str:
    return value.strip().rstrip(";").strip()


def _resolve_export_date(*, expected: str | None, sftp_date: date | None) -> date:
    if expected is not None:
        return _date_from_yyyymmdd(expected)
    if sftp_date is not None:
        return sftp_date
    raise ValueError(
        "Cannot determine MUFG Clear Street export date; expected_trade_date "
        "is required when the SQL extract returns 0 rows."
    )


def _date_from_yyyymmdd(value: str) -> date:
    return date(
        int(value[:4]),
        int(value[4:6]),
        int(value[6:8]),
    )


def _sql_extract_sftp_date_mismatch(
    *,
    expected: str | None,
    sftp_date: date | None,
) -> bool:
    return bool(
        expected is not None
        and sftp_date is not None
        and sftp_date.strftime("%Y%m%d") != expected
    )


def _trade_status_counts(df: pd.DataFrame) -> dict[str, int]:
    if "trade_status" not in df.columns:
        return {}
    counts = df["trade_status"].fillna("null").astype(str).value_counts()
    return {str(status): int(count) for status, count in counts.items()}


def _non_ok_trade_status_rows(df: pd.DataFrame) -> int:
    if "trade_status" not in df.columns:
        return 0
    statuses = df["trade_status"].fillna("null").astype(str)
    return int((statuses != "ok").sum())


def _blank_or_null_mask(series: pd.Series) -> pd.Series:
    text = series.astype("string").str.strip()
    return series.isna() | text.fillna("").eq("")


def _summarize_product_code_null_products(df: pd.DataFrame) -> list[dict[str, object]]:
    if df.empty:
        return []

    groups: dict[tuple[str | None, ...], dict[str, object]] = {}
    for _, row in df.iterrows():
        source_fields = {
            column: _clean_cell(row.get(column))
            for column in PRODUCT_CODE_NULL_PRODUCT_ID_COLUMNS
        }
        key = tuple(source_fields.get(column) for column in PRODUCT_CODE_NULL_PRODUCT_ID_COLUMNS)
        group = groups.setdefault(
            key,
            {
                "product": _source_product_label(source_fields),
                "row_count": 0,
                "source_fields": source_fields,
                "contract_year_months": set(),
                "put_calls": set(),
                "trade_statuses": set(),
            },
        )
        group["row_count"] = int(group["row_count"]) + 1
        _add_optional_set_value(
            group,
            "contract_year_months",
            _clean_cell(row.get("contract_year_month")),
        )
        _add_optional_set_value(group, "put_calls", _clean_cell(row.get("put_call")))
        _add_optional_set_value(
            group,
            "trade_statuses",
            _clean_cell(row.get("trade_status")),
        )

    summaries: list[dict[str, object]] = []
    for group in groups.values():
        summaries.append(
            {
                "product": group["product"],
                "row_count": int(group["row_count"]),
                "source_fields": group["source_fields"],
                "contract_year_months": sorted(group["contract_year_months"]),
                "put_calls": sorted(group["put_calls"]),
                "trade_statuses": sorted(group["trade_statuses"]),
            }
        )

    summaries.sort(
        key=lambda item: (-int(item["row_count"]), str(item["product"]).lower())
    )
    return summaries[:PRODUCT_CODE_NULL_MAX_PRODUCT_SUMMARIES]


def _clean_cell(value: object) -> str | None:
    if pd.isna(value):
        return None
    text = str(value).strip()
    return text or None


def _source_product_label(source_fields: dict[str, str | None]) -> str:
    for column in [
        "security_description",
        "instrument_description",
        "symbol",
        "futures_code",
        "exch_comm_cd",
    ]:
        value = source_fields.get(column)
        if value:
            return value
    return "unknown"


def _add_optional_set_value(
    group: dict[str, object],
    key: str,
    value: str | None,
) -> None:
    if value:
        group[key].add(value)
