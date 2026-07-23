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

API_SCRAPE_NAME = "clear_street_trades_mufg_upload"
SOURCE_SYSTEM = "mufg_sftp"
SOURCE_FEED = "clear_street_trades"
SOURCE_TABLE_FQN = "clear_street.eod_transactions"
TARGET_NAME = "mufg_sftp.clear_street_trades"
DEFAULT_SQL_FILENAME = "clear_street_mufg_latest.sql"
DEFAULT_CSV_FILENAME_PATTERN = "helios_transactions_v3"
DEFAULT_SFTP_PORT = 22
EXPECTED_MUFG_TRADE_STATUS = "New"
PACKAGE_ROOT = Path(__file__).resolve().parent
DEFAULT_LOCAL_DIR = PACKAGE_ROOT / "exports" / "mufg"
PRODUCT_CODE_NULL_REQUIRED_COLUMNS: tuple[str, ...] = (
    "product_code_grouping",
    "exchange_name",
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
    "product records have blank/null product_code_grouping, exchange route is "
    "blank/null or unsupported, expected ICE vendor-code rows are missing "
    "ice_product_code, or NYMEX route rows are missing both cme_product_code "
    "and bbg_product_code"
)
PRODUCT_CODE_BAD_MAPPING_SQL_WHERE = (
    "not ("
    "coalesce(\"QUANTITY\"::numeric, 0) = 0 "
    "and coalesce(\"CONTRACT_YEAR_MONTH\"::numeric, 0) = 0 "
    "and upper(coalesce(\"SECURITY_DESCRIPTION\"::text, '')) = 'UNITED STATES DOLLAR' "
    "and ("
    "upper(coalesce(\"INSTRUMENT_DESCRIPTION\"::text, '')) like 'RESID ADJ%' "
    "or upper(coalesce(\"INSTRUMENT_DESCRIPTION\"::text, '')) like 'RESUD ADH%' "
    "or upper(coalesce(\"INSTRUMENT_DESCRIPTION\"::text, '')) = 'APS RES' "
    "or upper(coalesce(\"INSTRUMENT_DESCRIPTION\"::text, '')) like '%EXCHANGE FEE ADJ%'"
    ")"
    ") "
    "and ("
    "nullif(trim(product_code_grouping::text), '') is null "
    "or coalesce(nullif(trim(\"EXCHANGE_NAME\"::text), ''), "
    "nullif(trim(\"EXCHANGE\"::text), '')) is null "
    "or upper(trim(coalesce(nullif(trim(\"EXCHANGE_NAME\"::text), ''), "
    "nullif(trim(\"EXCHANGE\"::text), '')))) not in ('IFED', 'IFE', 'IPE', 'NYME', 'NYM', 'NYMEX', 'NMY') "
    "or ("
    "upper(trim(coalesce(nullif(trim(\"EXCHANGE_NAME\"::text), ''), "
    "nullif(trim(\"EXCHANGE\"::text), '')))) in ('IFED', 'IFE', 'IPE') "
    "and nullif(trim(ice_product_code::text), '') is null"
    ") "
    "or ("
    "upper(trim(coalesce(nullif(trim(\"EXCHANGE_NAME\"::text), ''), "
    "nullif(trim(\"EXCHANGE\"::text), '')))) in ('NYME', 'NYM', 'NYMEX', 'NMY') "
    "and nullif(trim(cme_product_code::text), '') is null "
    "and nullif(trim(bbg_product_code::text), '') is null"
    ")"
    ")"
)
PRODUCT_CODE_ICE_EXCHANGE_NAMES: tuple[str, ...] = (
    "IFED",
    "IFE",
    "IPE",
)
PRODUCT_CODE_CME_BBG_EXCHANGE_NAMES: tuple[str, ...] = (
    "NYME",
    "NYM",
    "NYMEX",
    "NMY",
)
PRODUCT_CODE_SUPPORTED_EXCHANGE_NAMES: tuple[str, ...] = (
    *PRODUCT_CODE_ICE_EXCHANGE_NAMES,
    *PRODUCT_CODE_CME_BBG_EXCHANGE_NAMES,
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
    sql_extract_date, sql_extract_date_source = (
        (None, None) if df.empty else latest_sql_extract_date(df)
    )
    export_date = _resolve_export_date(
        expected=expected,
        sql_extract_date=sql_extract_date,
    )

    local_path = write_mufg_extract_csv(
        df=df,
        trade_date=export_date,
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

    unexpected_trade_status_rows = _unexpected_trade_status_rows(df)

    return {
        "target_table": TARGET_NAME,
        "source_table": SOURCE_TABLE_FQN,
        "sql_filename": sql_filename,
        "sql_dir": str(sql_dir) if sql_dir is not None else None,
        "rows_exported": int(len(df)),
        "rows_uploaded": int(len(df)),
        "trade_date": export_date.isoformat(),
        "export_trade_date": export_date.isoformat(),
        "sql_extract_trade_date": (
            sql_extract_date.isoformat() if sql_extract_date is not None else None
        ),
        "sql_extract_trade_date_from_sql": (
            sql_extract_date.strftime("%Y%m%d")
            if sql_extract_date is not None
            else None
        ),
        "sql_extract_trade_date_source": sql_extract_date_source,
        "expected_trade_date": expected,
        "sftp_date": (
            sql_extract_date.isoformat()
            if sql_extract_date_source == "sftp_date"
            and sql_extract_date is not None
            else None
        ),
        "sftp_date_from_sql": (
            sql_extract_date.strftime("%Y%m%d")
            if sql_extract_date_source == "sftp_date"
            and sql_extract_date is not None
            else None
        ),
        "expected_trade_date_from_sftp": expected,
        "sql_extract_empty": bool(df.empty),
        "sql_extract_trade_date_mismatch": _sql_extract_trade_date_mismatch(
            expected=expected,
            sql_extract_date=sql_extract_date,
        ),
        "sql_extract_sftp_date_mismatch": _sql_extract_sftp_date_mismatch(
            expected=expected,
            sftp_date=(
                sql_extract_date if sql_extract_date_source == "sftp_date" else None
            ),
        ),
        "local_file_path": str(local_path),
        "filename": local_path.name,
        "remote_filename": local_path.name,
        "remote_dir": remote_dir,
        "remote_path": remote_path,
        "expected_trade_status": EXPECTED_MUFG_TRADE_STATUS,
        "trade_status_counts": _trade_status_counts(df),
        "unexpected_trade_status_rows": unexpected_trade_status_rows,
        "non_ok_trade_status_rows": unexpected_trade_status_rows,
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
    if sql_dir is None:
        raise FileNotFoundError(
            "MUFG Clear Street generated SQL requires an explicit sql_dir. "
            "The scheduled orchestration passes "
            "backend/orchestration/positions_and_trades/sql. If the generated "
            "SQL is missing, run dbt compile and "
            "python scripts/promote_positions_trades_sql.py from dbt/azure_postgres."
        )

    sql_path = Path(sql_dir) / sql_filename
    if not sql_path.exists():
        raise FileNotFoundError(
            f"MUFG Clear Street SQL file not found: {sql_path}. "
            "Run dbt compile and python scripts/promote_positions_trades_sql.py "
            "from dbt/azure_postgres."
        )
    return _normalize_sql(sql_path.read_text(encoding="utf-8"))


def latest_sftp_date(df: pd.DataFrame, column: str = "sftp_date") -> date:
    if column not in df.columns:
        raise ValueError(f"MUFG Clear Street extract is missing column: {column}")
    latest_value = df[column].max()
    if pd.isna(latest_value):
        raise ValueError("MUFG Clear Street extract has no non-null sftp_date.")
    return _coerce_date(latest_value)


def latest_sql_extract_date(df: pd.DataFrame) -> tuple[date | None, str | None]:
    for column in ("sftp_date", "SFTP_DATE", "TRADE_DATE", "trade_date", "DATE", "date"):
        if column not in df.columns:
            continue
        normalized_dates = [
            _coerce_date(value)
            for value in df[column].dropna().tolist()
            if str(value).strip()
        ]
        if normalized_dates:
            return max(normalized_dates), column
    return None, None


def write_mufg_extract_csv(
    *,
    df: pd.DataFrame,
    trade_date: date | None = None,
    sftp_date: date | None = None,
    local_dir: str | Path | None = None,
    csv_filename_pattern: str = DEFAULT_CSV_FILENAME_PATTERN,
) -> Path:
    resolved_trade_date = _resolve_write_trade_date(
        trade_date=trade_date,
        sftp_date=sftp_date,
    )
    resolved_dir = resolve_local_dir(local_dir)
    resolved_dir.mkdir(parents=True, exist_ok=True)
    filename = f"{csv_filename_pattern}_{resolved_trade_date:%Y%m%d}_filtered.csv"
    local_path = resolved_dir / filename
    df.to_csv(local_path, index=False)
    return local_path


def summarize_product_code_nulls(df: pd.DataFrame) -> dict[str, object]:
    overall_counts: dict[str, int] = {}
    masks: dict[str, pd.Series] = {}
    missing_columns: list[str] = []

    for column in PRODUCT_CODE_NULL_CHECK_COLUMNS:
        series = (
            _exchange_route_series(df)
            if column == "exchange_name"
            else _column_series(df, column)
        )
        if series is None:
            null_mask = pd.Series(True, index=df.index)
            overall_counts[column] = int(len(df))
            missing_columns.append(column)
        else:
            null_mask = _blank_or_null_mask(series)
            overall_counts[column] = int(null_mask.sum())
        masks[column] = null_mask

    issue_masks = _product_code_bad_mapping_issue_masks(df=df, masks=masks)
    alert_mask = pd.Series(False, index=df.index)
    for issue_mask in issue_masks.values():
        alert_mask = alert_mask | issue_mask
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
        "sql_where": PRODUCT_CODE_BAD_MAPPING_SQL_WHERE,
        "ice_exchange_names": list(PRODUCT_CODE_ICE_EXCHANGE_NAMES),
        "cme_bbg_exchange_names": list(PRODUCT_CODE_CME_BBG_EXCHANGE_NAMES),
        "supported_exchange_names": list(PRODUCT_CODE_SUPPORTED_EXCHANGE_NAMES),
        "required_null_columns": list(PRODUCT_CODE_NULL_REQUIRED_COLUMNS),
        "vendor_code_columns": list(PRODUCT_CODE_NULL_VENDOR_CODE_COLUMNS),
        "issue_counts": {
            name: int(mask.sum())
            for name, mask in issue_masks.items()
        },
        "overall_null_counts": overall_counts,
        "null_counts": alert_counts,
        "null_columns": null_columns,
        "null_rows": int(alert_mask.sum()),
        "missing_columns": missing_columns,
        "has_nulls": bool(alert_mask.any()),
        "affected_products": affected_products,
        "affected_product_count": len(affected_products),
    }


def _product_code_bad_mapping_issue_masks(
    *,
    df: pd.DataFrame,
    masks: dict[str, pd.Series],
) -> dict[str, pd.Series]:
    grouping_blank_mask = masks["product_code_grouping"]
    exchange_blank_mask = masks["exchange_name"]
    exchange = _normalized_exchange_route(df)
    route_family = _normalized_route_family(df, exchange=exchange)
    product_record_mask = _product_record_mask(df)

    ice_exchange_mask = route_family.eq("ice")
    cme_bbg_exchange_mask = route_family.eq("nymex")
    unsupported_exchange_mask = (
        (~exchange_blank_mask)
        & (~route_family.isin(("ice", "nymex", "missing")))
    )

    return {
        "product_code_grouping_blank": product_record_mask & grouping_blank_mask,
        "exchange_name_blank": product_record_mask & exchange_blank_mask,
        "unsupported_exchange_name": product_record_mask & unsupported_exchange_mask,
        "ice_exchange_missing_ice_product_code": (
            product_record_mask
            & ice_exchange_mask
            & masks["ice_product_code"]
        ),
        "cme_bbg_exchange_missing_cme_and_bbg_product_code": (
            product_record_mask
            & cme_bbg_exchange_mask
            & masks["cme_product_code"]
            & masks["bbg_product_code"]
        ),
    }


def _column_series(df: pd.DataFrame, column: str) -> pd.Series | None:
    for candidate in (column, column.upper(), column.lower()):
        if candidate in df.columns:
            return df[candidate]
    return None


def _normalized_exchange_route(df: pd.DataFrame) -> pd.Series:
    route = _exchange_route_series(df)
    if route is None:
        return pd.Series("", index=df.index, dtype="string")
    return route.fillna("").str.strip().str.upper()


def _normalized_route_family(
    df: pd.DataFrame,
    *,
    exchange: pd.Series,
) -> pd.Series:
    route_family = _column_series(df, "route_family")
    if route_family is not None:
        normalized = route_family.fillna("").astype("string").str.strip().str.lower()
        return normalized.mask(normalized.eq(""), "missing")

    return pd.Series(
        [
            _route_family_from_exchange(value)
            for value in exchange.fillna("").astype("string")
        ],
        index=df.index,
        dtype="string",
    )


def _route_family_from_exchange(value: object) -> str:
    route = str(value).strip().upper()
    if route in PRODUCT_CODE_ICE_EXCHANGE_NAMES:
        return "ice"
    if route in PRODUCT_CODE_CME_BBG_EXCHANGE_NAMES:
        return "nymex"
    if not route:
        return "missing"
    return "unsupported"


def _product_record_mask(df: pd.DataFrame) -> pd.Series:
    is_product_record = _column_series(df, "is_product_record")
    if is_product_record is not None:
        normalized = is_product_record.fillna(True).astype("string").str.strip().str.lower()
        return ~normalized.isin(("false", "f", "0", "no", "n"))

    return ~_non_product_cash_adjustment_mask(df)


def _non_product_cash_adjustment_mask(df: pd.DataFrame) -> pd.Series:
    quantity = _numeric_series(
        _column_series(df, "quantity"),
        index=df.index,
    )
    contract_year_month = _numeric_series(
        _column_series(df, "contract_year_month"),
        index=df.index,
    )
    security_description = _clean_string_series(
        _column_series(df, "security_description"),
        index=df.index,
    )
    instrument_description = _clean_string_series(
        _column_series(df, "instrument_description"),
        index=df.index,
    )

    return (
        quantity.eq(0)
        & contract_year_month.eq(0)
        & security_description.eq("UNITED STATES DOLLAR")
        & (
            instrument_description.str.startswith("RESID ADJ")
            | instrument_description.str.startswith("RESUD ADH")
            | instrument_description.eq("APS RES")
            | instrument_description.str.contains("EXCHANGE FEE ADJ", regex=False)
        )
    )


def _clean_string_series(
    series: pd.Series | None,
    *,
    index: pd.Index,
) -> pd.Series:
    if series is None:
        return pd.Series("", index=index, dtype="string")
    return series.fillna("").astype("string").str.strip().str.upper()


def _numeric_series(
    series: pd.Series | None,
    *,
    index: pd.Index,
) -> pd.Series:
    if series is None:
        return pd.Series(0, index=index, dtype="float64")
    return pd.to_numeric(series, errors="coerce").fillna(0)


def _exchange_route_series(df: pd.DataFrame) -> pd.Series | None:
    if (
        _column_series(df, "exchange_name") is None
        and _column_series(df, "exchange") is None
    ):
        return None
    route = pd.Series("", index=df.index, dtype="string")
    for column in ("exchange_name", "exchange"):
        series = _column_series(df, column)
        if series is None:
            continue
        candidate = series.astype("string").str.strip()
        route = route.mask(route.fillna("").eq(""), candidate)
    return route


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
    text = str(value).strip()
    if len(text) == 8 and text.isdigit():
        return _date_from_yyyymmdd(text)
    if len(text) == 10 and text[4] == "-" and text[7] == "-":
        return _date_from_yyyymmdd(text.replace("-", ""))
    return pd.Timestamp(value).date()


def _normalize_sql(value: str) -> str:
    return value.strip().rstrip(";").strip()


def _resolve_export_date(
    *,
    expected: str | None,
    sql_extract_date: date | None,
) -> date:
    if expected is not None:
        return _date_from_yyyymmdd(expected)
    if sql_extract_date is not None:
        return sql_extract_date
    raise ValueError(
        "Cannot determine MUFG Clear Street export date; expected_trade_date "
        "is required when the SQL extract returns 0 rows or no trade date."
    )


def _resolve_write_trade_date(
    *,
    trade_date: date | None,
    sftp_date: date | None,
) -> date:
    if (
        trade_date is not None
        and sftp_date is not None
        and trade_date != sftp_date
    ):
        raise ValueError("trade_date and legacy sftp_date arguments must match.")
    resolved = trade_date or sftp_date
    if resolved is None:
        raise ValueError("trade_date is required to write MUFG Clear Street CSV.")
    return resolved


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


def _sql_extract_trade_date_mismatch(
    *,
    expected: str | None,
    sql_extract_date: date | None,
) -> bool:
    return bool(
        expected is not None
        and sql_extract_date is not None
        and sql_extract_date.strftime("%Y%m%d") != expected
    )


def _trade_status_counts(df: pd.DataFrame) -> dict[str, int]:
    if "trade_status" not in df.columns:
        return {}
    counts = df["trade_status"].fillna("null").astype(str).value_counts()
    return {str(status): int(count) for status, count in counts.items()}


def _unexpected_trade_status_rows(df: pd.DataFrame) -> int:
    if "trade_status" not in df.columns:
        return 0
    statuses = df["trade_status"].fillna("null").astype(str).str.strip()
    return int((statuses != EXPECTED_MUFG_TRADE_STATUS).sum())


def _non_ok_trade_status_rows(df: pd.DataFrame) -> int:
    """Backward-compatible alias for pre-ref-table MUFG status metadata."""
    return _unexpected_trade_status_rows(df)


def _blank_or_null_mask(series: pd.Series) -> pd.Series:
    text = series.astype("string").str.strip()
    return series.isna() | text.fillna("").eq("")


def _summarize_product_code_null_products(df: pd.DataFrame) -> list[dict[str, object]]:
    if df.empty:
        return []

    groups: dict[tuple[str | None, ...], dict[str, object]] = {}
    for _, row in df.iterrows():
        source_fields = {
            column: _clean_cell(_row_value(row, column))
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
            _clean_cell(_row_value(row, "contract_year_month")),
        )
        _add_optional_set_value(
            group,
            "put_calls",
            _clean_cell(_row_value(row, "put_call")),
        )
        _add_optional_set_value(
            group,
            "trade_statuses",
            _clean_cell(_row_value(row, "trade_status")),
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


def _row_value(row: pd.Series, column: str) -> object:
    for candidate in (column, column.upper(), column.lower()):
        if candidate in row.index:
            return row.get(candidate)
    return None


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
