from __future__ import annotations

from datetime import date, datetime
from io import BytesIO
from zipfile import ZipFile

from backend.scrapes.power.caiso import bulk_oasis


def _zip_bytes(files: dict[str, str]) -> bytes:
    buffer = BytesIO()
    with ZipFile(buffer, "w") as archive:
        for filename, content in files.items():
            archive.writestr(filename, content)
    return buffer.getvalue()


def _component_csv(price_column: str, value: float, node_id: str) -> str:
    return "\n".join(
        [
            ",".join(
                [
                    "INTERVALSTARTTIME_GMT",
                    "INTERVALENDTIME_GMT",
                    "OPR_DT",
                    "OPR_HR",
                    "OPR_INTERVAL",
                    "NODE_ID_XML",
                    "NODE_ID",
                    "NODE",
                    "MARKET_RUN_ID",
                    "PNODE_RESMRID",
                    "GRP_TYPE",
                    price_column,
                ]
            ),
            ",".join(
                [
                    "2020-01-01T08:00:00-00:00",
                    "2020-01-01T09:00:00-00:00",
                    "2020-01-01",
                    "1",
                    "1",
                    node_id,
                    node_id,
                    node_id,
                    "DAM",
                    "resm",
                    "ALL",
                    str(value),
                ]
            ),
        ]
    )


def test_parse_bulk_lmp_zip_filters_nodes_and_pivots_components():
    content = _zip_bytes(
        {
            "bulk_LMP.csv": _component_csv("MW", 10.5, "TH_NP15_GEN-APND"),
            "bulk_MCE.csv": _component_csv("MW", 7.0, "TH_NP15_GEN-APND"),
            "bulk_MCC.csv": _component_csv("MW", 2.0, "TH_NP15_GEN-APND"),
            "bulk_MCL.csv": _component_csv("MW", 1.0, "TH_NP15_GEN-APND"),
            "bulk_MGHG.csv": _component_csv("MW", 0.5, "TH_NP15_GEN-APND"),
            "other_LMP.csv": _component_csv("MW", 99.0, "OTHER_NODE"),
        }
    )

    frame = bulk_oasis.parse_bulk_lmp_zip(
        content,
        nodes=("TH_NP15_GEN-APND", "TH_SP15_GEN-APND"),
        source_query_name="DAM_LMP",
        source_version=12,
    )

    assert len(frame) == 1
    row = frame.iloc[0].to_dict()
    assert row["node_id"] == "TH_NP15_GEN-APND"
    assert row["locational_marginal_price"] == 10.5
    assert row["energy_component"] == 7.0
    assert row["congestion_component"] == 2.0
    assert row["loss_component"] == 1.0
    assert row["greenhouse_gas_component"] == 0.5
    assert row["source_query_name"] == "DAM_LMP"
    assert row["source_version"] == 12


def test_search_bulk_files_parses_public_search_rows(monkeypatch):
    class FakeResponse:
        status_code = 200

        def raise_for_status(self):
            return None

        def json(self):
            return [
                {
                    "key": "DAM_LMP/2020/01/file.zip",
                    "size": 123,
                    "fileName": "file.zip",
                    "groupName": "DAM_LMP",
                    "oprDate": "01-Jan-2020",
                    "oprHour": None,
                    "lastModified": "12-Mar-2026 18:47:19",
                }
            ]

    calls: list[dict[str, object]] = []

    def fake_get(url, params=None, timeout=None, verify=None):
        calls.append(
            {"url": url, "params": params, "timeout": timeout, "verify": verify}
        )
        return FakeResponse()

    monkeypatch.setattr(bulk_oasis.requests, "get", fake_get)
    monkeypatch.setattr(bulk_oasis, "_log_bulk_attempt", lambda **_kwargs: None)

    files = bulk_oasis.search_bulk_files(
        prefix="DAM_LMP",
        start_date=date(2020, 1, 1),
        end_date=date(2020, 1, 1),
    )

    assert calls[0]["url"] == bulk_oasis.BULK_SEARCH_URL
    assert calls[0]["params"] == {
        "prefix": "DAM_LMP",
        "startDate": "2020-01-01",
        "endDate": "2020-01-01",
    }
    assert calls[0]["verify"] is True
    assert files == (
        bulk_oasis.BulkOasisFile(
            key="DAM_LMP/2020/01/file.zip",
            size=123,
            file_name="file.zip",
            group_name="DAM_LMP",
            operating_date="01-Jan-2020",
            operating_hour=None,
            last_modified="12-Mar-2026 18:47:19",
        ),
    )


def test_signed_s3_headers_include_request_payer_and_session_token():
    headers = bulk_oasis._signed_s3_headers(
        method="GET",
        key="DAM_LMP/2020/01/file.zip",
        credentials=bulk_oasis.AwsCredentials(
            access_key_id="AKIAEXAMPLE",
            secret_access_key="secret",
            session_token="session",
        ),
        region="us-west-1",
        request_time=datetime(2026, 7, 17, 18, 0, 0),
    )

    assert headers["host"] == (
        "caiso-oasis-s3-prod-groupzips.s3.us-west-1.amazonaws.com"
    )
    assert headers["x-amz-request-payer"] == "requester"
    assert headers["x-amz-security-token"] == "session"
    assert "Credential=AKIAEXAMPLE/20260717/us-west-1/s3/aws4_request" in (
        headers["Authorization"]
    )
    assert "SignedHeaders=" in headers["Authorization"]


def test_requests_verify_prefers_caiso_bulk_ca_bundle(monkeypatch):
    monkeypatch.setenv("REQUESTS_CA_BUNDLE", "/tmp/system-ca.pem")
    monkeypatch.setenv("CAISO_BULK_CA_BUNDLE", "/tmp/caiso-ca.pem")

    assert bulk_oasis._requests_verify() == "/tmp/caiso-ca.pem"


def test_requests_verify_uses_requests_ca_bundle(monkeypatch):
    monkeypatch.delenv("CAISO_BULK_CA_BUNDLE", raising=False)
    monkeypatch.setenv("REQUESTS_CA_BUNDLE", "/tmp/system-ca.pem")

    assert bulk_oasis._requests_verify() == "/tmp/system-ca.pem"
