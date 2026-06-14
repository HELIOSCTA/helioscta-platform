from __future__ import annotations

from io import BytesIO
import zipfile

import pandas as pd

from backend.scrapes.power.isone import external_interface_metered_data


def test_isone_external_interface_metered_data_target_contract():
    assert (
        external_interface_metered_data.API_SCRAPE_NAME
        == "external_interface_metered_data"
    )
    assert external_interface_metered_data.TARGET_SCHEMA == "isone"
    assert (
        external_interface_metered_data.TARGET_TABLE_FQN
        == "isone.external_interface_metered_data"
    )
    assert external_interface_metered_data.PRIMARY_KEY == [
        "local_date",
        "local_hour_ending",
        "entity_type",
        "interface_name",
    ]


def test_isone_external_interface_metered_data_format_workbook():
    document = external_interface_metered_data.SourceDocument(
        report_year=2026,
        path="/static-assets/documents/100032/smd_interchange_2026.xlsx",
        publish_datetime="05/15/2026 03:44 PM EDT",
    )

    df = external_interface_metered_data._format_workbook(
        _minimal_workbook(),
        document=document,
        start_date=pd.Timestamp("2026-01-01").date(),
        end_date=pd.Timestamp("2026-01-01").date(),
    )

    records = df.astype(object).where(pd.notna(df), None).to_dict("records")

    assert records == [
        {
            "local_date": pd.Timestamp("2026-01-01").date(),
            "local_hour_ending": 1,
            "entity_type": "control_area",
            "interface_name": "ISO NE CA",
            "net_interchange_mwh": 10.0,
            "import_mwh": 12.0,
            "export_mwh": -2.0,
            "da_lmp": None,
            "da_energy_component": None,
            "da_congestion_component": None,
            "da_marginal_loss_component": None,
            "rt_lmp": None,
            "rt_energy_component": None,
            "rt_congestion_component": None,
            "rt_marginal_loss_component": None,
            "report_year": 2026,
            "source_document_path": (
                "/static-assets/documents/100032/smd_interchange_2026.xlsx"
            ),
            "source_published_at": "05/15/2026 03:44 PM EDT",
        },
        {
            "local_date": pd.Timestamp("2026-01-01").date(),
            "local_hour_ending": 1,
            "entity_type": "interface",
            "interface_name": "SALBRYNB",
            "net_interchange_mwh": -10.0,
            "import_mwh": None,
            "export_mwh": None,
            "da_lmp": 21.1,
            "da_energy_component": 20.0,
            "da_congestion_component": 0.5,
            "da_marginal_loss_component": 0.6,
            "rt_lmp": 22.1,
            "rt_energy_component": 21.0,
            "rt_congestion_component": 0.4,
            "rt_marginal_loss_component": 0.7,
            "report_year": 2026,
            "source_document_path": (
                "/static-assets/documents/100032/smd_interchange_2026.xlsx"
            ),
            "source_published_at": "05/15/2026 03:44 PM EDT",
        },
    ]


def test_isone_external_interface_metered_data_pull_uses_documents_and_workbook(
    monkeypatch,
):
    captured: list[dict[str, object]] = []

    class FakeResponse:
        def __init__(self, *, payload=None, content=b""):
            self._payload = payload
            self.content = content

        def json(self):
            return self._payload

    def fake_make_request(url, **kwargs):
        captured.append({"url": url, **kwargs})
        if "docWidgetGetMore" in url:
            return FakeResponse(
                payload={
                    "data": [
                        {
                            "path": (
                                "/static-assets/documents/100032/"
                                "smd_interchange_2026.xlsx"
                            ),
                            "descriptionFormatted": "2026 SMD Interchange",
                            "publishDate": "05/15/2026 03:44 PM EDT",
                        }
                    ]
                }
            )
        return FakeResponse(content=_minimal_workbook())

    monkeypatch.setattr(
        external_interface_metered_data.isone_api,
        "make_request",
        fake_make_request,
    )

    df = external_interface_metered_data._pull(
        start_date="2026-01-01",
        end_date="2026-01-01",
        run_id="run-1",
        database="stage_db",
        metadata={"run_mode": "test"},
    )

    assert len(df) == 2
    assert captured[0]["url"].endswith(
        "/isoexpress/web/reports/download/docWidgetGetMore"
        "?treenode=external-interface-metered-data&start=0&limit=40"
    )
    assert captured[0]["expected_content_types"] == ("application/json",)
    assert captured[0]["pipeline_name"] == "external_interface_metered_data"
    assert captured[0]["run_id"] == "run-1"
    assert captured[0]["target_table"] == "isone.external_interface_metered_data"
    assert captured[0]["database"] == "stage_db"
    assert captured[1]["url"].endswith(
        "/static-assets/documents/100032/smd_interchange_2026.xlsx"
    )
    assert captured[1]["expected_content_types"] == (
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/octet-stream",
    )


def _minimal_workbook() -> bytes:
    workbook = BytesIO()
    with zipfile.ZipFile(workbook, "w") as archive:
        archive.writestr(
            "xl/workbook.xml",
            """<?xml version="1.0" encoding="UTF-8"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="Notes" sheetId="1" r:id="rId1"/>
    <sheet name="ISO NE CA" sheetId="2" r:id="rId2"/>
    <sheet name="SALBRYNB" sheetId="3" r:id="rId3"/>
  </sheets>
</workbook>""",
        )
        archive.writestr(
            "xl/_rels/workbook.xml.rels",
            """<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="worksheet" Target="worksheets/sheet2.xml"/>
  <Relationship Id="rId3" Type="worksheet" Target="worksheets/sheet3.xml"/>
</Relationships>""",
        )
        archive.writestr(
            "xl/worksheets/sheet1.xml",
            _sheet_xml([["Notes"], ["ignored"]]),
        )
        archive.writestr(
            "xl/worksheets/sheet2.xml",
            _sheet_xml(
                [
                    ["Date", "Hr_End", "NetInt_MWh", "Import_MWh", "Export_MWh"],
                    ["46023", "01", "10", "12", "-2"],
                ]
            ),
        )
        archive.writestr(
            "xl/worksheets/sheet3.xml",
            _sheet_xml(
                [
                    [
                        "Date",
                        "Hr_End",
                        "NetInt_MWh",
                        "DA_LMP",
                        "DA_EC",
                        "DA_CC",
                        "DA_MLC",
                        "RT_LMP",
                        "RT_EC",
                        "RT_CC",
                        "RT_MLC",
                    ],
                    [
                        "46023",
                        "01",
                        "-10",
                        "21.1",
                        "20.0",
                        "0.5",
                        "0.6",
                        "22.1",
                        "21.0",
                        "0.4",
                        "0.7",
                    ],
                ]
            ),
        )
    return workbook.getvalue()


def _sheet_xml(rows: list[list[str]]) -> str:
    rendered_rows = []
    for row_index, row in enumerate(rows, start=1):
        cells = []
        for column_index, value in enumerate(row, start=1):
            cell_ref = f"{_column_name(column_index)}{row_index}"
            cells.append(
                f'<c r="{cell_ref}" t="inlineStr"><is><t>{value}</t></is></c>'
            )
        rendered_rows.append(f'<row r="{row_index}">{"".join(cells)}</row>')
    return (
        '<?xml version="1.0" encoding="UTF-8"?>'
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        f'<sheetData>{"".join(rendered_rows)}</sheetData>'
        "</worksheet>"
    )


def _column_name(index: int) -> str:
    name = ""
    while index:
        index, remainder = divmod(index - 1, 26)
        name = chr(ord("A") + remainder) + name
    return name
