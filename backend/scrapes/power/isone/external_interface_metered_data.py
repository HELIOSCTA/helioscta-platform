"""ISO-NE External Interface Metered Data.

Source definition:
https://www.iso-ne.com/isoexpress/web/reports/grid/-/tree/external-interface-metered-data

ISO-NE publishes this feed as annual XLSX workbooks linked from the ISO Express
document widget. The workbook contains one ISO New England control-area sheet
and one sheet per external interface.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timedelta
import logging
from pathlib import Path
import posixpath
from uuid import uuid4
import zipfile
from io import BytesIO
import xml.etree.ElementTree as ET

import pandas as pd
from dateutil.relativedelta import relativedelta

from backend import credentials
from backend.scrapes.power.isone import isone_api_utils as isone_api
from backend.utils import db, script_logging


API_SCRAPE_NAME = "external_interface_metered_data"
TARGET_DATABASE: str | None = None
TARGET_SCHEMA = "isone"
TARGET_TABLE = API_SCRAPE_NAME
TARGET_TABLE_FQN = f"{TARGET_SCHEMA}.{TARGET_TABLE}"
PRIMARY_KEY = ["local_date", "local_hour_ending", "entity_type", "interface_name"]
DEFAULT_DELTA = relativedelta(years=1)
DOCUMENT_WIDGET_PATH = "/isoexpress/web/reports/download/docWidgetGetMore"
TREE_NODE = "external-interface-metered-data"
CONTROL_AREA_SHEET = "ISO NE CA"
NOTES_SHEET = "Notes"

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class SourceDocument:
    report_year: int
    path: str
    description: str | None = None
    publish_datetime: str | None = None


def _resolve_default_start_date() -> date:
    return date(datetime.now().year, 1, 1)


def _resolve_default_end_date() -> date:
    return datetime.now().date() - relativedelta(days=1)


def _coerce_date(value: date | datetime | str) -> date:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    return pd.Timestamp(value).date()


def _build_document_widget_url(start: int = 0, limit: int = 40) -> str:
    return (
        f"{isone_api.ISONE_BASE_URL}{DOCUMENT_WIDGET_PATH}"
        f"?treenode={TREE_NODE}&start={start}&limit={limit}"
    )


def _build_document_download_url(path: str) -> str:
    if path.startswith("http"):
        return path
    return f"{isone_api.ISONE_BASE_URL}{path}"


def _list_documents(
    *,
    request_retries: int = 3,
    run_id: str | None = None,
    database: str | None = None,
    metadata: dict | None = None,
) -> list[SourceDocument]:
    response = isone_api.make_request(
        _build_document_widget_url(),
        logger=logger,
        retries=request_retries,
        pipeline_name=API_SCRAPE_NAME,
        run_id=run_id,
        feed_name=API_SCRAPE_NAME,
        target_table=TARGET_TABLE_FQN,
        operation_name="external-interface-metered-data-documents",
        metadata=metadata,
        database=database,
        expected_content_types=("application/json",),
    )
    payload = response.json()
    documents = payload.get("data", []) if isinstance(payload, dict) else []
    parsed: list[SourceDocument] = []
    for document in documents:
        path = str(document.get("path") or "")
        report_year = _report_year_from_document(document)
        if not path or report_year is None:
            continue
        parsed.append(
            SourceDocument(
                report_year=report_year,
                path=path,
                description=document.get("descriptionFormatted")
                or document.get("description"),
                publish_datetime=document.get("publishDate"),
            )
        )
    return sorted(parsed, key=lambda document: document.report_year, reverse=True)


def _report_year_from_document(document: dict) -> int | None:
    for value in (
        document.get("descriptionFormatted"),
        document.get("description"),
        document.get("path"),
    ):
        if not value:
            continue
        digits = "".join(char if char.isdigit() else " " for char in str(value))
        for token in digits.split():
            if len(token) == 4 and token.startswith(("19", "20")):
                return int(token)
    return None


def _find_document_for_year(
    documents: list[SourceDocument],
    report_year: int,
) -> SourceDocument:
    for document in documents:
        if document.report_year == report_year:
            return document
    available_years = [document.report_year for document in documents]
    raise RuntimeError(
        f"ISO-NE external interface workbook for {report_year} was not found; "
        f"available years: {available_years}"
    )


def _download_workbook(
    document: SourceDocument,
    *,
    request_retries: int = 3,
    run_id: str | None = None,
    database: str | None = None,
    metadata: dict | None = None,
) -> bytes:
    response = isone_api.make_request(
        _build_document_download_url(document.path),
        logger=logger,
        retries=request_retries,
        pipeline_name=API_SCRAPE_NAME,
        run_id=run_id,
        feed_name=API_SCRAPE_NAME,
        target_table=TARGET_TABLE_FQN,
        operation_name="external-interface-metered-data-workbook",
        metadata={
            "report_year": document.report_year,
            "source_document_path": document.path,
            **(metadata or {}),
        },
        database=database,
        expected_content_types=(
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "application/octet-stream",
        ),
    )
    return response.content


def _pull(
    *,
    start_date: date | datetime | str,
    end_date: date | datetime | str | None = None,
    request_retries: int = 3,
    run_id: str | None = None,
    database: str | None = None,
    metadata: dict | None = None,
) -> pd.DataFrame:
    """Pull and parse ISO-NE external interface metered data for a date range."""
    start = _coerce_date(start_date)
    end = _coerce_date(end_date or start_date)
    if end < start:
        raise ValueError("end_date must be on or after start_date")

    documents = _list_documents(
        request_retries=request_retries,
        run_id=run_id,
        database=database,
        metadata={
            "start_date": start.isoformat(),
            "end_date": end.isoformat(),
            **(metadata or {}),
        },
    )
    frames: list[pd.DataFrame] = []
    for report_year in range(start.year, end.year + 1):
        document = _find_document_for_year(documents, report_year)
        workbook = _download_workbook(
            document,
            request_retries=request_retries,
            run_id=run_id,
            database=database,
            metadata=metadata,
        )
        df = _format_workbook(
            workbook,
            document=document,
            start_date=max(start, date(report_year, 1, 1)),
            end_date=min(end, date(report_year, 12, 31)),
        )
        if not df.empty:
            frames.append(df)
    return pd.concat(frames, ignore_index=True) if frames else pd.DataFrame()


def _format_workbook(
    workbook: bytes,
    *,
    document: SourceDocument,
    start_date: date | None = None,
    end_date: date | None = None,
) -> pd.DataFrame:
    rows: list[dict] = []
    with zipfile.ZipFile(BytesIO(workbook)) as archive:
        shared_strings = _shared_strings(archive)
        for sheet_name, sheet_path in _workbook_sheets(archive).items():
            if sheet_name == NOTES_SHEET:
                continue
            sheet_rows = _sheet_rows(archive, sheet_path, shared_strings)
            rows.extend(
                _normalized_sheet_rows(
                    sheet_name=sheet_name,
                    sheet_rows=sheet_rows,
                    document=document,
                    start_date=start_date,
                    end_date=end_date,
                )
            )

    df = pd.DataFrame(rows)
    if df.empty:
        return df
    df.drop_duplicates(subset=PRIMARY_KEY, keep="last", inplace=True)
    df.sort_values(PRIMARY_KEY, inplace=True)
    df.reset_index(drop=True, inplace=True)
    return df


def _shared_strings(archive: zipfile.ZipFile) -> list[str]:
    try:
        xml = archive.read("xl/sharedStrings.xml")
    except KeyError:
        return []
    root = ET.fromstring(xml)
    ns = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
    values: list[str] = []
    for item in root.findall("m:si", ns):
        texts = [node.text or "" for node in item.findall(".//m:t", ns)]
        values.append("".join(texts))
    return values


def _workbook_sheets(archive: zipfile.ZipFile) -> dict[str, str]:
    ns = {
        "m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
        "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
        "rel": "http://schemas.openxmlformats.org/package/2006/relationships",
    }
    workbook_root = ET.fromstring(archive.read("xl/workbook.xml"))
    rels_root = ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
    rel_targets = {
        rel.attrib["Id"]: rel.attrib["Target"]
        for rel in rels_root.findall("rel:Relationship", ns)
    }
    sheets: dict[str, str] = {}
    for sheet in workbook_root.findall(".//m:sheet", ns):
        rel_id = sheet.attrib[f"{{{ns['r']}}}id"]
        target = rel_targets[rel_id]
        if target.startswith("/"):
            sheet_path = target.lstrip("/")
        else:
            sheet_path = posixpath.normpath(posixpath.join("xl", target))
        sheets[sheet.attrib["name"]] = sheet_path
    return sheets


def _sheet_rows(
    archive: zipfile.ZipFile,
    sheet_path: str,
    shared_strings: list[str],
) -> list[list[object | None]]:
    ns = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
    root = ET.fromstring(archive.read(sheet_path))
    rows: list[list[object | None]] = []
    for row in root.findall(".//m:sheetData/m:row", ns):
        values: list[object | None] = []
        for cell in row.findall("m:c", ns):
            index = _column_index(cell.attrib.get("r", "A1"))
            while len(values) < index:
                values.append(None)
            values.append(_cell_value(cell, shared_strings, ns))
        rows.append(values)
    return rows


def _column_index(cell_reference: str) -> int:
    letters = "".join(char for char in cell_reference if char.isalpha())
    index = 0
    for char in letters:
        index = index * 26 + (ord(char.upper()) - ord("A") + 1)
    return max(index - 1, 0)


def _cell_value(
    cell: ET.Element,
    shared_strings: list[str],
    ns: dict[str, str],
) -> object | None:
    value_type = cell.attrib.get("t")
    if value_type == "inlineStr":
        texts = [node.text or "" for node in cell.findall(".//m:t", ns)]
        return "".join(texts)

    value = cell.find("m:v", ns)
    if value is None or value.text is None:
        return None
    if value_type == "s":
        return shared_strings[int(value.text)]
    return value.text


def _normalized_sheet_rows(
    *,
    sheet_name: str,
    sheet_rows: list[list[object | None]],
    document: SourceDocument,
    start_date: date | None,
    end_date: date | None,
) -> list[dict]:
    if not sheet_rows:
        return []
    headers = [str(value).strip() if value is not None else "" for value in sheet_rows[0]]
    normalized: list[dict] = []
    for raw_row in sheet_rows[1:]:
        row = {
            headers[index]: raw_row[index]
            for index in range(min(len(headers), len(raw_row)))
            if headers[index]
        }
        local_date = _excel_date(row.get("Date"))
        if local_date is None:
            continue
        if start_date and local_date < start_date:
            continue
        if end_date and local_date > end_date:
            continue
        hour_ending = _integer(row.get("Hr_End"))
        if hour_ending is None:
            continue

        entity_type = "control_area" if sheet_name == CONTROL_AREA_SHEET else "interface"
        normalized.append(
            {
                "local_date": local_date,
                "local_hour_ending": hour_ending,
                "entity_type": entity_type,
                "interface_name": sheet_name.strip(),
                "net_interchange_mwh": _number(row.get("NetInt_MWh")),
                "import_mwh": _number(row.get("Import_MWh")),
                "export_mwh": _number(row.get("Export_MWh")),
                "da_lmp": _number(row.get("DA_LMP")),
                "da_energy_component": _number(row.get("DA_EC")),
                "da_congestion_component": _number(row.get("DA_CC")),
                "da_marginal_loss_component": _number(row.get("DA_MLC")),
                "rt_lmp": _number(row.get("RT_LMP")),
                "rt_energy_component": _number(row.get("RT_EC")),
                "rt_congestion_component": _number(row.get("RT_CC")),
                "rt_marginal_loss_component": _number(row.get("RT_MLC")),
                "report_year": document.report_year,
                "source_document_path": document.path,
                "source_published_at": document.publish_datetime,
            }
        )
    return normalized


def _excel_date(value: object | None) -> date | None:
    if value is None or value == "":
        return None
    if isinstance(value, (date, datetime)):
        return _coerce_date(value)
    serial = _number(value)
    if serial is None:
        return pd.Timestamp(value).date()
    return date(1899, 12, 30) + timedelta(days=int(serial))


def _integer(value: object | None) -> int | None:
    numeric = _number(value)
    return int(numeric) if numeric is not None else None


def _number(value: object | None) -> float | None:
    if value is None:
        return None
    if isinstance(value, str) and not value.strip():
        return None
    return float(value)


def _upsert(
    df: pd.DataFrame,
    database: str | None = TARGET_DATABASE,
    schema: str = TARGET_SCHEMA,
    table_name: str = TARGET_TABLE,
    primary_key: list[str] | None = None,
) -> None:
    if df.empty:
        logger.info("Skipping empty upsert into %s.%s", schema, table_name)
        return

    primary_key = primary_key or PRIMARY_KEY
    missing_keys = [col for col in primary_key if col not in df.columns]
    if missing_keys:
        raise ValueError(
            f"Missing primary key columns for {schema}.{table_name}: {missing_keys}"
        )

    db.upsert_dataframe(
        database=database,
        schema=schema,
        table_name=table_name,
        df=df,
        columns=df.columns.tolist(),
        data_types=db.infer_sql_data_types(df=df),
        primary_key=primary_key,
    )


def main(
    start_date: date | datetime | str | None = None,
    end_date: date | datetime | str | None = None,
    delta: relativedelta = DEFAULT_DELTA,
    database: str | None = None,
) -> pd.DataFrame | None:
    """Run the ISO-NE External Interface Metered Data scrape."""
    del delta  # Annual workbook pulls are grouped by report year.
    start_date = _coerce_date(start_date or _resolve_default_start_date())
    end_date = _coerce_date(end_date or _resolve_default_end_date())
    database = database or credentials.AZURE_POSTGRESQL_DB_NAME
    run_logger = script_logging.init_logging(
        name=API_SCRAPE_NAME,
        log_dir=script_logging.get_log_dir(Path(__file__).parent / "logs"),
        log_to_file=True,
        delete_if_no_errors=True,
    )
    run_id = str(uuid4())

    try:
        run_logger.header(API_SCRAPE_NAME)
        run_logger.info(f"Run ID: {run_id}")
        run_logger.section(
            f"Pulling External Interface Metered Data for "
            f"{start_date:%Y-%m-%d} through {end_date:%Y-%m-%d}..."
        )
        df = _pull(
            start_date=start_date,
            end_date=end_date,
            run_id=run_id,
            database=database,
        )
        if df.empty:
            run_logger.section("No data returned.")
            return None

        run_logger.section(f"Upserting {len(df)} rows...")
        _upsert(df=df, database=database)
        run_logger.success(
            f"{API_SCRAPE_NAME} completed; {len(df)} rows processed."
        )
        return df

    except Exception as exc:
        run_logger.exception(f"Pipeline failed: {exc}")
        raise

    finally:
        script_logging.close_logging()


if __name__ == "__main__":
    main()
