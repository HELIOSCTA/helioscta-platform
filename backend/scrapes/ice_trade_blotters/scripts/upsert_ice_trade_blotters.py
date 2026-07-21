"""Import manually downloaded ICE trade blotter files."""
from __future__ import annotations

import csv
import hashlib
import logging
import re
from datetime import date
from html.parser import HTMLParser
from pathlib import Path

import pandas as pd

from backend.scrapes.ice_trade_blotters import settings
from backend.utils import db


API_SCRAPE_NAME = settings.IMPORT_OPERATION_NAME
SOURCE_SYSTEM = settings.SOURCE_SYSTEM
SOURCE_REPORT_NAME = settings.SOURCE_REPORT_NAME
DEFAULT_TRADE_BLOTTER_FILEPATH = settings.DEFAULT_MONTHLY_TRADE_BLOTTER_FILE
DEFAULT_CSV_FILEPATH = DEFAULT_TRADE_BLOTTER_FILEPATH
DEFAULT_FORMATTED_FILES_DIR = settings.CSV_FORMATTED_FILES_DIR
DEFAULT_SCHEMA = settings.TRADE_BLOTTERS_SCHEMA
DEFAULT_TABLE_NAME = settings.TRADE_BLOTTERS_TABLE
DEFAULT_MANIFEST_TABLE = settings.FILE_MANIFEST_TABLE
TARGET_TABLE_FQN = settings.TRADE_BLOTTERS_TARGET_TABLE

TRADE_UNIQUE_KEY: list[str] = [
    "deal_id",
    "trade_date",
    "user_id",
    "leg_id",
    "b_s",
    "hub",
    "contract",
    "begin_date",
    "end_date",
    "lots",
    "total_quantity",
    "price",
    "option",
    "strike",
    "strike_2",
]

PRIMARY_KEYS: list[str] = TRADE_UNIQUE_KEY

COLUMNS: list[str] = [
    "trade_date",
    "trade_time",
    "deal_id",
    "leg_id",
    "orig_id",
    "b_s",
    "product",
    "hub",
    "contract",
    "begin_date",
    "end_date",
    "clearing_acct",
    "cust_acct",
    "clearing_firm",
    "price",
    "price_units",
    "option",
    "strike",
    "strike_2",
    "style",
    "lots",
    "total_quantity",
    "qty_units",
    "tt",
    "brk",
    "trader",
    "memo",
    "clearing_venue",
    "user_id",
    "source",
    "link_id",
    "usi",
    "authorized_trader_id",
    "location",
    "meter",
    "lead_time",
    "waiver_ind",
    "trade_time_micros",
    "cdi_override",
    "by_pass_mqr",
    "broker_name",
    "trading_company",
    "mic",
    "cc",
    "strip",
    "counterparty",
    "qty_per_period",
    "periods",
    "counterparty_user",
    "report_date",
    "deal_section",
    "file_hash",
    "source_row_number",
    "source_row_hash",
]

SQL_DATA_TYPES_BY_COLUMN: dict[str, str] = {
    "trade_date": "DATE",
    "trade_time": "VARCHAR",
    "deal_id": "VARCHAR",
    "leg_id": "VARCHAR",
    "orig_id": "VARCHAR",
    "b_s": "VARCHAR",
    "product": "VARCHAR",
    "hub": "VARCHAR",
    "contract": "VARCHAR",
    "begin_date": "VARCHAR",
    "end_date": "VARCHAR",
    "clearing_acct": "VARCHAR",
    "cust_acct": "VARCHAR",
    "clearing_firm": "VARCHAR",
    "price": "DOUBLE PRECISION",
    "price_units": "VARCHAR",
    "option": "VARCHAR",
    "strike": "DOUBLE PRECISION",
    "strike_2": "DOUBLE PRECISION",
    "style": "VARCHAR",
    "lots": "INTEGER",
    "total_quantity": "DOUBLE PRECISION",
    "qty_units": "VARCHAR",
    "tt": "VARCHAR",
    "brk": "VARCHAR",
    "trader": "VARCHAR",
    "memo": "TEXT",
    "clearing_venue": "VARCHAR",
    "user_id": "VARCHAR",
    "source": "VARCHAR",
    "link_id": "VARCHAR",
    "usi": "VARCHAR",
    "authorized_trader_id": "VARCHAR",
    "location": "VARCHAR",
    "meter": "VARCHAR",
    "lead_time": "VARCHAR",
    "waiver_ind": "VARCHAR",
    "trade_time_micros": "VARCHAR",
    "cdi_override": "VARCHAR",
    "by_pass_mqr": "VARCHAR",
    "broker_name": "VARCHAR",
    "trading_company": "VARCHAR",
    "mic": "VARCHAR",
    "cc": "VARCHAR",
    "strip": "VARCHAR",
    "counterparty": "VARCHAR",
    "qty_per_period": "DOUBLE PRECISION",
    "periods": "INTEGER",
    "counterparty_user": "VARCHAR",
    "report_date": "DATE",
    "deal_section": "VARCHAR",
    "file_hash": "VARCHAR",
    "source_row_number": "INTEGER",
    "source_row_hash": "VARCHAR",
}
DATA_TYPES: list[str] = [SQL_DATA_TYPES_BY_COLUMN[column] for column in COLUMNS]

STRING_COLUMNS = [
    column
    for column in COLUMNS
    if SQL_DATA_TYPES_BY_COLUMN[column] in {"VARCHAR", "TEXT"}
]
TRADE_IDENTIFIER_COLUMNS = ["deal_id", "leg_id", "orig_id", "link_id"]
LOSSY_IDENTIFIER_PATTERN = re.compile(r"^[0-9]+(?:\.[0-9]+)?[eE]\+[0-9]+$")
DATE_COLUMNS = ["report_date", "trade_date"]
FLOAT_COLUMNS = [
    column for column in COLUMNS if SQL_DATA_TYPES_BY_COLUMN[column] == "DOUBLE PRECISION"
]
INTEGER_COLUMNS = [
    column for column in COLUMNS if SQL_DATA_TYPES_BY_COLUMN[column] == "INTEGER"
]

logger = logging.getLogger(__name__)


class _HtmlTableParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.rows: list[list[str]] = []
        self._current_row: list[str] | None = None
        self._current_cell: list[str] | None = None

    def handle_starttag(
        self,
        tag: str,
        attrs: list[tuple[str, str | None]],
    ) -> None:
        if tag.lower() == "tr":
            self._current_row = []
        elif tag.lower() in {"td", "th"} and self._current_row is not None:
            self._current_cell = []

    def handle_data(self, data: str) -> None:
        if self._current_cell is not None:
            self._current_cell.append(data)

    def handle_endtag(self, tag: str) -> None:
        if tag.lower() in {"td", "th"} and self._current_cell is not None:
            if self._current_row is not None:
                self._current_row.append("".join(self._current_cell).strip())
            self._current_cell = None
        elif tag.lower() == "tr" and self._current_row is not None:
            if any(cell.strip() for cell in self._current_row):
                self.rows.append(self._current_row)
            self._current_row = None


def _clean_column_name(value: str) -> str:
    """Normalize ICE report headers into stable PostgreSQL column names."""
    name = value.strip().lower()
    name = name.replace("b/s", "b_s")
    name = re.sub(r"[^a-z0-9]+", "_", name)
    name = re.sub(r"_+", "_", name).strip("_")
    replacements = {
        "strike2": "strike_2",
        "strike_2": "strike_2",
        "counter_party": "counterparty",
    }
    return replacements.get(name, name)


def _dedupe_headers(headers: list[str]) -> list[str]:
    seen: dict[str, int] = {}
    cleaned = []
    for header in headers:
        name = _clean_column_name(header)
        if not name:
            cleaned.append("")
            continue
        count = seen.get(name, 0)
        seen[name] = count + 1
        cleaned.append(name if count == 0 else f"{name}_{count + 1}")
    return cleaned


def _is_section_title(row: list[str]) -> bool:
    non_empty = [cell.strip() for cell in row if cell.strip()]
    return len(non_empty) == 1 and non_empty[0].lower().endswith("deals")


def _section_name(row: list[str]) -> str:
    title = next(cell.strip() for cell in row if cell.strip())
    return _clean_column_name(title.replace(" Deals", ""))


def _row_hash(values: list[str]) -> str:
    normalized = "\x1f".join(cell.strip() for cell in values)
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()


def _rows_from_html_table(table_html: str) -> list[list[str]]:
    parser = _HtmlTableParser()
    parser.feed(table_html)
    return parser.rows


def _html_section_name(title: str) -> str:
    title = re.sub(r"\s+Deals\s*$", "", title.strip(), flags=re.IGNORECASE)
    return _clean_column_name(title)


def _html_table_sections(text: str) -> list[tuple[str, str]]:
    pattern = re.compile(
        r"(?P<title>[^<>]*?\bDeals)\s*(?:<br\s*/?>\s*)+"
        r"(?P<table><table\b.*?</table>)",
        flags=re.IGNORECASE | re.DOTALL,
    )
    sections = []
    for match in pattern.finditer(text):
        title = re.sub(r"\s+", " ", match.group("title")).strip()
        sections.append((_html_section_name(title), match.group("table")))
    return sections


def _lossy_identifier_columns(df: pd.DataFrame) -> list[str]:
    lossy_columns = []
    for column in TRADE_IDENTIFIER_COLUMNS:
        if column in df.columns and (
            df[column]
            .fillna("")
            .astype(str)
            .str.strip()
            .str.match(LOSSY_IDENTIFIER_PATTERN)
            .any()
        ):
            lossy_columns.append(column)
    return lossy_columns


def has_lossy_trade_identifiers(df: pd.DataFrame) -> bool:
    return bool(_lossy_identifier_columns(df))


def file_hash(filepath: str | Path) -> str:
    path = Path(filepath)
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _file_hash(filepath: Path) -> str:
    return file_hash(filepath)


def _records_to_dataframe(
    rows: list[dict[str, object]],
    filepath: Path,
) -> pd.DataFrame:
    df = pd.DataFrame(rows)
    if not df.empty:
        parsed_trade_dates = pd.to_datetime(df["trade_date"], errors="coerce")
        if parsed_trade_dates.isna().any():
            raise ValueError(f"Could not parse one or more trade dates in {filepath}")
        df["report_date"] = parsed_trade_dates.max().date()
    logger.info("Parsed %s deal rows from %s", len(df), filepath.name)
    return df


def _read_csv_file(filepath: Path, file_hash: str) -> pd.DataFrame:
    rows: list[dict[str, object]] = []
    current_section = ""
    current_headers: list[str] = []

    with filepath.open("r", newline="", encoding="utf-8-sig") as csv_file:
        reader = csv.reader(csv_file)
        for source_row_number, row in enumerate(reader, start=1):
            if _is_section_title(row):
                current_section = _section_name(row)
                current_headers = []
                continue

            if not current_section or not any(cell.strip() for cell in row):
                continue

            first_cell = row[0].strip().lower() if row else ""
            if first_cell == "trade date":
                current_headers = _dedupe_headers(row)
                continue

            if not current_headers:
                continue

            values = row[: len(current_headers)]
            values.extend([""] * (len(current_headers) - len(values)))
            record = {
                header: value.strip()
                for header, value in zip(current_headers, values)
                if header
            }
            if not record.get("trade_date"):
                continue

            record.update(
                {
                    "file_hash": file_hash,
                    "source_row_number": source_row_number,
                    "source_row_hash": _row_hash(values),
                    "deal_section": current_section,
                }
            )
            rows.append(record)

    return _records_to_dataframe(rows=rows, filepath=filepath)


def _read_html_xls_file(filepath: Path, text: str, file_hash: str) -> pd.DataFrame:
    sections = _html_table_sections(text)
    if not sections:
        raise ValueError(
            f"{filepath} is not a supported ICE HTML .xls export; no deal "
            "section tables were found."
        )

    rows: list[dict[str, object]] = []
    source_row_number = 1
    for section_name, table_html in sections:
        table_rows = _rows_from_html_table(table_html)
        if not table_rows:
            continue

        headers = _dedupe_headers(table_rows[0])
        for table_row in table_rows[1:]:
            values = table_row[: len(headers)]
            values.extend([""] * (len(headers) - len(values)))
            record = {
                header: value.strip()
                for header, value in zip(headers, values)
                if header
            }
            if not record.get("trade_date"):
                continue

            record.update(
                {
                    "file_hash": file_hash,
                    "source_row_number": source_row_number,
                    "source_row_hash": _row_hash(values),
                    "deal_section": section_name,
                }
            )
            rows.append(record)
            source_row_number += 1

    return _records_to_dataframe(rows=rows, filepath=filepath)


def _read_file(filepath: str | Path = DEFAULT_TRADE_BLOTTER_FILEPATH) -> pd.DataFrame:
    path = Path(filepath)
    if not path.exists():
        raise FileNotFoundError(f"ICE trade blotter file not found: {path}")

    digest = file_hash(path)
    raw_bytes = path.read_bytes()
    text = raw_bytes.decode("utf-8-sig", errors="replace")
    if path.suffix.lower() == ".xls" or "<table" in text[:4096].lower():
        return _read_html_xls_file(filepath=path, text=text, file_hash=digest)

    return _read_csv_file(filepath=path, file_hash=digest)


def parse_trade_blotter_file(filepath: str | Path) -> pd.DataFrame:
    """Parse and format one ICE trade blotter file into the table contract."""
    return _format(_read_file(filepath))


def _latest_managed_csv_filepath(
    schema: str = DEFAULT_SCHEMA,
    manifest_table: str = DEFAULT_MANIFEST_TABLE,
    formatted_files_dir: str | Path = DEFAULT_FORMATTED_FILES_DIR,
    database: str | None = settings.TARGET_DATABASE,
) -> Path | None:
    _validate_identifier(schema)
    _validate_identifier(manifest_table)
    rows = db.execute_sql(
        f"""
        SELECT stored_filename
        FROM {schema}.{manifest_table}
        WHERE status = 'managed'
        ORDER BY max_trade_date DESC, row_count DESC, managed_at DESC
        LIMIT 1;
        """,
        fetch=True,
        database=database,
    )
    if not rows:
        return None

    filepath = Path(formatted_files_dir) / rows[0]["stored_filename"]
    return filepath if filepath.exists() else None


def _resolve_csv_filepath(
    csv_filepath: str | Path | None,
    schema: str = DEFAULT_SCHEMA,
    manifest_table: str = DEFAULT_MANIFEST_TABLE,
    formatted_files_dir: str | Path = DEFAULT_FORMATTED_FILES_DIR,
    database: str | None = settings.TARGET_DATABASE,
) -> Path:
    if csv_filepath:
        filepath = Path(csv_filepath)
        if filepath.exists():
            return filepath
        if filepath != DEFAULT_TRADE_BLOTTER_FILEPATH:
            raise FileNotFoundError(f"ICE trade blotter file not found: {filepath}")

    if DEFAULT_TRADE_BLOTTER_FILEPATH.exists():
        return DEFAULT_TRADE_BLOTTER_FILEPATH

    managed_filepath = _latest_managed_csv_filepath(
        schema=schema,
        manifest_table=manifest_table,
        formatted_files_dir=formatted_files_dir,
        database=database,
    )
    if managed_filepath:
        return managed_filepath

    raise FileNotFoundError(
        "No ICE trade blotter file found. Put .xls files in "
        f"{settings.CSV_INBOX_DIR} and run the ICE trade blotter orchestration first."
    )


def _format(df: pd.DataFrame) -> pd.DataFrame:
    if df.empty:
        return pd.DataFrame(columns=COLUMNS)

    allowed_columns = set(COLUMNS)
    unexpected_columns = sorted(set(df.columns) - allowed_columns)
    if unexpected_columns:
        raise ValueError(
            "ICE blotter contains unmodelled columns. "
            f"Add them to COLUMNS/DATA_TYPES before loading: {unexpected_columns}"
        )

    formatted = df.copy()
    for column in sorted(allowed_columns):
        if column not in formatted.columns:
            formatted[column] = ""

    for column in STRING_COLUMNS:
        formatted[column] = formatted[column].fillna("").astype(str).str.strip()

    lossy_identifier_columns = _lossy_identifier_columns(formatted)
    if lossy_identifier_columns:
        raise ValueError(
            "ICE blotter contains lossy scientific-notation trade identifiers "
            f"in columns {lossy_identifier_columns}. Re-export the file with IDs "
            "preserved as text instead of loading false deal IDs."
        )

    for column in FLOAT_COLUMNS:
        numeric_values = (
            formatted[column]
            .astype(str)
            .str.replace(",", "", regex=False)
            .str.strip()
        )
        formatted[column] = (
            pd.to_numeric(numeric_values.mask(numeric_values == "", "0"), errors="coerce")
            .fillna(0.0)
            .astype(float)
        )

    for column in INTEGER_COLUMNS:
        numeric_values = (
            formatted[column]
            .astype(str)
            .str.replace(",", "", regex=False)
            .str.strip()
        )
        formatted[column] = (
            pd.to_numeric(numeric_values.mask(numeric_values == "", "0"), errors="coerce")
            .fillna(0)
            .astype("int64")
        )

    for column in DATE_COLUMNS:
        formatted[column] = pd.to_datetime(formatted[column], errors="coerce").dt.date
        if formatted[column].isna().any():
            raise ValueError(f"Column {column} contains blank or invalid dates.")

    return formatted[COLUMNS]


def _validate_identifier(identifier: str) -> None:
    if not re.fullmatch(r"[a-zA-Z_][a-zA-Z0-9_]*", identifier):
        raise ValueError(f"Invalid SQL identifier: {identifier}")


def _upsert(
    df: pd.DataFrame,
    schema: str = DEFAULT_SCHEMA,
    table_name: str = DEFAULT_TABLE_NAME,
    database: str | None = settings.TARGET_DATABASE,
) -> None:
    _upsert_trade_rows(
        df=df,
        schema=schema,
        table_name=table_name,
        database=database,
    )


def _upsert_trade_rows(
    df: pd.DataFrame,
    schema: str = DEFAULT_SCHEMA,
    table_name: str = DEFAULT_TABLE_NAME,
    database: str | None = settings.TARGET_DATABASE,
) -> None:
    _validate_identifier(schema)
    _validate_identifier(table_name)
    upsert_df = (
        df[COLUMNS]
        .drop_duplicates(subset=PRIMARY_KEYS, keep="last")
        .where(pd.notna(df[COLUMNS]), None)
        .reset_index(drop=True)
    )
    if upsert_df.empty:
        return

    db.upsert_dataframe(
        schema=schema,
        table_name=table_name,
        df=upsert_df,
        columns=COLUMNS,
        primary_key=PRIMARY_KEYS,
        data_types=DATA_TYPES,
        database=database,
    )


def _dedupe_trade_rows(df: pd.DataFrame) -> pd.DataFrame:
    if df.empty:
        return df

    missing_columns = [column for column in TRADE_UNIQUE_KEY if column not in df.columns]
    if missing_columns:
        raise ValueError(
            "Cannot dedupe ICE trade rows because business-key columns are missing: "
            f"{missing_columns}"
        )

    deduped = df.drop_duplicates(subset=TRADE_UNIQUE_KEY, keep="last").copy()
    removed_rows = len(df) - len(deduped)
    if removed_rows:
        logger.info("Removed %s duplicate row(s) by ICE trade business key", removed_rows)
    return deduped


def _table_exists(
    schema: str,
    table_name: str,
    database: str | None = settings.TARGET_DATABASE,
) -> bool:
    rows = db.execute_sql(
        "SELECT to_regclass(%s) AS table_name;",
        params=(f"{schema}.{table_name}",),
        fetch=True,
        database=database,
    )
    return bool(rows and rows[0]["table_name"])


def _manifest_record_for_file_hash(
    file_hash: str,
    schema: str = DEFAULT_SCHEMA,
    manifest_table: str = DEFAULT_MANIFEST_TABLE,
    database: str | None = settings.TARGET_DATABASE,
) -> dict[str, object] | None:
    _validate_identifier(schema)
    _validate_identifier(manifest_table)
    if not _table_exists(schema=schema, table_name=manifest_table, database=database):
        raise RuntimeError(
            f"Required manifest table missing: {schema}.{manifest_table}. "
            "Apply the ICE trade blotter operator DDL before loading files."
        )

    rows = db.execute_sql(
        f"""
        SELECT file_hash, stored_filename, status
        FROM {schema}.{manifest_table}
        WHERE file_hash = %s
        LIMIT 1;
        """,
        params=(file_hash,),
        fetch=True,
        database=database,
    )
    return rows[0] if rows else None


def _assert_registered_manifest_file(
    df: pd.DataFrame,
    csv_filepath: str | Path,
    schema: str = DEFAULT_SCHEMA,
    manifest_table: str = DEFAULT_MANIFEST_TABLE,
    database: str | None = settings.TARGET_DATABASE,
) -> dict[str, object]:
    if df.empty:
        raise ValueError("Cannot validate manifest registration for an empty DataFrame.")

    digest = str(df["file_hash"].iloc[0])
    record = _manifest_record_for_file_hash(
        file_hash=digest,
        schema=schema,
        manifest_table=manifest_table,
        database=database,
    )
    if not record:
        raise ValueError(
            f"{Path(csv_filepath).name} is not registered in {schema}.{manifest_table}. "
            "Run the ICE trade blotter file manager before loading trade rows."
        )
    if record["status"] != "managed":
        raise ValueError(
            f"{Path(csv_filepath).name} has manifest status '{record['status']}', "
            "not 'managed'."
        )
    return record


def _recompute_manifest_load_state(
    df: pd.DataFrame,
    schema: str = DEFAULT_SCHEMA,
    table_name: str = DEFAULT_TABLE_NAME,
    manifest_table: str = DEFAULT_MANIFEST_TABLE,
    database: str | None = settings.TARGET_DATABASE,
) -> None:
    _validate_identifier(schema)
    _validate_identifier(table_name)
    _validate_identifier(manifest_table)
    if (
        df.empty
        or not _table_exists(schema=schema, table_name=table_name, database=database)
        or not _table_exists(schema=schema, table_name=manifest_table, database=database)
    ):
        return

    digest = str(df["file_hash"].iloc[0])
    db.execute_sql(
        f"""
        WITH loaded_files AS (
            SELECT file_hash, COUNT(*)::INTEGER AS loaded_row_count
            FROM {schema}.{table_name}
            GROUP BY file_hash
        )
        UPDATE {schema}.{manifest_table} AS manifest
        SET is_loaded = loaded_state.loaded_file_hash IS NOT NULL,
            loaded_at = CASE
                WHEN loaded_state.loaded_file_hash IS NULL THEN NULL
                WHEN manifest.file_hash = %s THEN now()
                ELSE COALESCE(manifest.loaded_at, now())
            END,
            loaded_row_count = loaded_state.loaded_row_count,
            updated_at = now()
        FROM (
            SELECT
                manifest_inner.file_hash,
                loaded_files.file_hash AS loaded_file_hash,
                loaded_files.loaded_row_count
            FROM {schema}.{manifest_table} AS manifest_inner
            LEFT JOIN loaded_files
                ON loaded_files.file_hash = manifest_inner.file_hash
        ) AS loaded_state
        WHERE manifest.file_hash = loaded_state.file_hash;
        """,
        params=(digest,),
        database=database,
    )


def run_import(
    csv_filepath: str | Path | None = DEFAULT_CSV_FILEPATH,
    schema: str = DEFAULT_SCHEMA,
    table_name: str = DEFAULT_TABLE_NAME,
    manifest_table: str = DEFAULT_MANIFEST_TABLE,
    formatted_files_dir: str | Path = DEFAULT_FORMATTED_FILES_DIR,
    database: str | None = settings.TARGET_DATABASE,
) -> dict[str, object]:
    """Parse and upsert one registered ICE trade blotter file."""
    resolved_path = _resolve_csv_filepath(
        csv_filepath=csv_filepath,
        schema=schema,
        manifest_table=manifest_table,
        formatted_files_dir=formatted_files_dir,
        database=database,
    )
    df = _format(_read_file(filepath=resolved_path))
    if df.empty:
        logger.warning("No deal rows found in %s", resolved_path)
        return {
            "rows_processed": 0,
            "source_rows_read": 0,
            "duplicate_rows_dropped": 0,
            "files_processed": 1,
            "source_file": resolved_path.name,
            "manifest_file": None,
            "min_trade_date": None,
            "max_trade_date": None,
            "target_table": f"{schema}.{table_name}",
        }

    source_row_count = len(df)
    df = _dedupe_trade_rows(df=df)
    duplicate_rows_dropped = source_row_count - len(df)
    manifest_record = _assert_registered_manifest_file(
        df=df,
        csv_filepath=resolved_path,
        schema=schema,
        manifest_table=manifest_table,
        database=database,
    )

    _upsert_trade_rows(
        df=df,
        schema=schema,
        table_name=table_name,
        database=database,
    )
    _recompute_manifest_load_state(
        df=df,
        schema=schema,
        table_name=table_name,
        manifest_table=manifest_table,
        database=database,
    )

    return {
        "rows_processed": len(df),
        "source_rows_read": source_row_count,
        "duplicate_rows_dropped": duplicate_rows_dropped,
        "files_processed": 1,
        "source_file": resolved_path.name,
        "manifest_file": manifest_record["stored_filename"],
        "file_hash": str(df["file_hash"].iloc[0]),
        "min_trade_date": str(df["trade_date"].min()),
        "max_trade_date": str(df["trade_date"].max()),
        "target_table": f"{schema}.{table_name}",
    }


def main(
    csv_filepath: str | Path | None = DEFAULT_CSV_FILEPATH,
    schema: str = DEFAULT_SCHEMA,
    table_name: str = DEFAULT_TABLE_NAME,
    manifest_table: str = DEFAULT_MANIFEST_TABLE,
    formatted_files_dir: str | Path = DEFAULT_FORMATTED_FILES_DIR,
    database: str | None = settings.TARGET_DATABASE,
) -> int:
    summary = run_import(
        csv_filepath=csv_filepath,
        schema=schema,
        table_name=table_name,
        manifest_table=manifest_table,
        formatted_files_dir=formatted_files_dir,
        database=database,
    )
    logger.info("Upserted %s rows into %s", summary["rows_processed"], summary["target_table"])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
