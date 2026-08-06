from __future__ import annotations

from datetime import datetime, timezone

import pytest

from backend.orchestration.gas_ebbs import williams_transco as orchestration
from backend.scrapes.gas_ebbs import williams_transco


LISTING_HTML = """
<html><body>
<tbody class="ui-datatable-data ui-widget-content">
<tr>
  <td>Maint</td>
  <td>08/06/2026 11:13:50 CDT</td>
  <td>08/06/2026 11:13:50 CDT</td>
  <td> </td>
  <td>17138697</td>
  <td>
    <a href="#" onclick="window.open('/1Line/wgp/download?delvid=17138697&amp;hfNoticeFlag=Y&amp;hfDownloadFlag=false&amp;hfFileName=download.html','psoWaiver','toolbar=no',false)">
      2026 Major Construction and Maintenance Projects
    </a>
  </td>
  <td> </td>
  <td><a href="/1Line/wgp/download?delvid=17138697&amp;hfNoticeFlag=Y&amp;hfDownloadFlag=true&amp;hfFileName=notice.html">download</a></td>
</tr>
<tr>
  <td>Constraint</td>
  <td>08/06/2026 07:05:30 CDT</td>
  <td>08/06/2026 07:05:30 CDT</td>
  <td>08/08/2026 09:00:00 CDT</td>
  <td>17138308</td>
  <td>
    <a href="#" onclick="window.open('/1Line/wgp/download?delvid=17138308&amp;hfNoticeFlag=Y&amp;hfDownloadFlag=false&amp;hfFileName=download.html','psoWaiver','toolbar=no',false)">
      Update - Market and Production Constraints
    </a>
  </td>
  <td> </td>
  <td><a href="/1Line/wgp/download?delvid=17138308&amp;hfNoticeFlag=Y&amp;hfDownloadFlag=true&amp;hfFileName=notice.html">download</a></td>
</tr>
</tbody>
</body></html>
"""


DETAIL_HTML = """
<HTML>
<HEAD><TITLE>Notice 17138308</TITLE><STYLE>body { font-size:10pt }</STYLE></HEAD>
<BODY>
<B>TRANSCONTINENTAL GAS PIPE LINE COMPANY, LLC</B><HR/>
<TABLE BORDER="0">
  <TR><TD>Critical:</TD><TD> Y</TD></TR>
  <TR><TD>Notice Eff Date:</TD><TD> 08/06/2026</TD></TR>
  <TR><TD>Notice Eff Time:</TD><TD> 07:05:30 CDT</TD></TR>
  <TR><TD>Notice ID:</TD><TD> 17138308</TD></TR>
  <TR><TD>Notice Stat Desc:</TD><TD> Supersede</TD></TR>
  <TR><TD>Notice Type Desc:</TD><TD> Constraint</TD></TR>
  <TR><TD>Prior Notice:</TD><TD> 17127243</TD></TR>
</TABLE>
<HR/><P><B>Notice Text: </B></P>
<P><B>Subject: </B>Update - Market and Production Constraints</P>
<p>Planned maintenance constraints are effective August 7, 2026.</p>
<table>
  <tbody>
    <tr><td colspan="9">Maintenance TSB Constraints</td></tr>
    <tr>
      <td>Loc ID</td>
      <td>Location Name</td>
      <td>ZN</td>
      <td>Del/Rec</td>
      <td>Type of TSB</td>
      <td>Available Capacity Mdt/d</td>
      <td>Highest Priority Included</td>
      <td>Flow Dir</td>
      <td>Job #</td>
    </tr>
    <tr>
      <td>9000000</td>
      <td>Compressor Station 60 MP 588.62</td>
      <td>3</td>
      <td>Rec</td>
      <td>M-L</td>
      <td>1,793</td>
      <td>PRIMARY</td>
      <td>S-N</td>
      <td>327549</td>
    </tr>
  </tbody>
</table>
</BODY>
</HTML>
"""


def test_parse_listing_page_extracts_williams_notice_rows():
    notices = williams_transco.parse_listing_page(
        LISTING_HTML,
        stream=williams_transco.STREAM_CRITICAL,
        listing_url="https://www.1line.williams.com/xhtml/notice_list.jsf?buid=80",
    )

    assert len(notices) == 2
    first = notices[0]
    assert first.source_family == "williams_1line"
    assert first.pipeline_key == "williams_transco"
    assert first.buid == 80
    assert first.notice_stream == "critical"
    assert first.critical_ind is True
    assert first.source_notice_id == "17138697"
    assert first.notice_type == "Maint"
    assert first.subject == "2026 Major Construction and Maintenance Projects"
    assert first.posted_at_utc == datetime(2026, 8, 6, 16, 13, 50, tzinfo=timezone.utc)
    assert first.end_at_utc is None
    assert first.detail_url == (
        "https://www.1line.williams.com/1Line/wgp/download?"
        "delvid=17138697&hfNoticeFlag=Y&hfDownloadFlag=false&hfFileName=download.html"
    )
    assert first.download_url is not None
    assert len(first.listing_content_hash) == 64


def test_parse_listing_page_rejects_ambiguous_zero_row_table():
    empty_html = '<tbody class="ui-datatable-data ui-widget-content"></tbody>'

    with pytest.raises(ValueError, match="zero notice rows"):
        williams_transco.parse_listing_page(
            empty_html,
            stream=williams_transco.STREAM_CRITICAL,
        )


def test_parse_detail_page_extracts_metadata_text_and_supporting_table():
    detail = williams_transco.parse_detail_page(DETAIL_HTML)

    assert detail.detail_metadata["critical"] == "Y"
    assert detail.detail_metadata["notice_id"] == "17138308"
    assert detail.detail_metadata["notice_stat_desc"] == "Supersede"
    assert "body { font-size" not in detail.detail_clean_text
    assert "Subject: Update - Market and Production Constraints" in detail.notice_text
    assert len(detail.raw_detail_sha256) == 64
    assert len(detail.detail_content_hash) == 64
    assert detail.supporting_data == [
        {
            "title": "Maintenance TSB Constraints",
            "headers": [
                "loc_id",
                "location_name",
                "zn",
                "del_rec",
                "type_of_tsb",
                "available_capacity_mdt_d",
                "highest_priority_included",
                "flow_dir",
                "job",
            ],
            "rows": [
                {
                    "loc_id": "9000000",
                    "location_name": "Compressor Station 60 MP 588.62",
                    "zn": "3",
                    "del_rec": "Rec",
                    "type_of_tsb": "M-L",
                    "available_capacity_mdt_d": "1,793",
                    "highest_priority_included": "PRIMARY",
                    "flow_dir": "S-N",
                    "job": "327549",
                }
            ],
        }
    ]


def test_parse_source_timestamp_handles_central_abbreviations_and_blank_values():
    assert williams_transco.parse_source_timestamp("08/06/2026 07:05:30 CDT") == (
        datetime(2026, 8, 6, 12, 5, 30, tzinfo=timezone.utc)
    )
    assert williams_transco.parse_source_timestamp("01/06/2026 07:05:30 CST") == (
        datetime(2026, 1, 6, 13, 5, 30, tzinfo=timezone.utc)
    )
    assert williams_transco.parse_source_timestamp(" ") is None
    assert williams_transco.parse_source_timestamp(None) is None


def test_revision_hash_dedupes_same_source_content_and_changes_on_detail_change():
    listing = williams_transco.parse_listing_page(
        LISTING_HTML,
        stream=williams_transco.STREAM_CRITICAL,
    )[1]
    detail = williams_transco.parse_detail_page(DETAIL_HTML)
    observed_at = datetime(2026, 8, 6, 17, 0, tzinfo=timezone.utc)

    revision = williams_transco.build_notice_revision(
        listing,
        detail,
        observed_at_utc=observed_at,
    )
    repeated_revision = williams_transco.build_notice_revision(
        listing,
        detail,
        observed_at_utc=datetime(2026, 8, 6, 17, 15, tzinfo=timezone.utc),
    )
    changed_detail = williams_transco.parse_detail_page(
        DETAIL_HTML.replace("1,793", "1,794")
    )
    changed_revision = williams_transco.build_notice_revision(
        listing,
        changed_detail,
        observed_at_utc=observed_at,
    )

    assert revision.source_content_hash == repeated_revision.source_content_hash
    assert revision.detail_content_hash == repeated_revision.detail_content_hash
    assert revision.source_content_hash != changed_revision.source_content_hash
    assert revision.detail_content_hash != changed_revision.detail_content_hash


def test_extract_planned_outages_from_confident_detail_table():
    listing = williams_transco.parse_listing_page(
        LISTING_HTML,
        stream=williams_transco.STREAM_CRITICAL,
    )[1]
    detail = williams_transco.parse_detail_page(DETAIL_HTML)
    revision = williams_transco.build_notice_revision(
        listing,
        detail,
        observed_at_utc=datetime(2026, 8, 6, 17, tzinfo=timezone.utc),
    )

    outages = williams_transco.extract_planned_outages(
        listing,
        detail,
        source_content_hash=revision.source_content_hash,
        derived_at_utc=datetime(2026, 8, 6, 17, tzinfo=timezone.utc),
    )

    assert len(outages) == 1
    assert outages[0]["source_notice_id"] == "17138308"
    assert outages[0]["classification"] == "maintenance_tsb_constraint"
    assert outages[0]["location_id"] == "9000000"
    assert outages[0]["location_name"] == "Compressor Station 60 MP 588.62"
    assert outages[0]["available_capacity_mdt_per_day"] == 1793.0
    assert outages[0]["job_number"] == "327549"


def test_partial_listing_failure_does_not_demote_missing_notices(monkeypatch, tmp_path):
    telemetry: list[dict[str, object]] = []
    upserted_streams: list[str] = []

    def fake_fetch_text(url, **kwargs):
        if "critical_ind=Y" in url:
            return williams_transco.FetchResult(
                url=url,
                text=LISTING_HTML,
                http_status=200,
                elapsed_ms=5,
                content_type="text/html",
                content_length=len(LISTING_HTML),
            )
        return williams_transco.FetchResult(
            url=url,
            text="<html><body>No table here</body></html>",
            http_status=200,
            elapsed_ms=5,
            content_type="text/html",
            content_length=34,
        )

    def fake_upsert_notices(listings, **kwargs):
        upserted_streams.extend(sorted({listing.notice_stream for listing in listings}))
        return len(listings)

    monkeypatch.setenv("HELIOS_LOG_DIR", str(tmp_path))
    monkeypatch.setattr(orchestration.scrape, "fetch_text", fake_fetch_text)
    monkeypatch.setattr(orchestration.scrape, "fetch_notice_state", lambda *a, **k: {})
    monkeypatch.setattr(orchestration.scrape, "upsert_notices", fake_upsert_notices)
    monkeypatch.setattr(
        orchestration.scrape,
        "mark_missing_notices",
        lambda *a, **k: (_ for _ in ()).throw(
            AssertionError("partial listing runs must not demote notices")
        ),
    )
    monkeypatch.setattr(
        orchestration.scrape,
        "purge_retention",
        lambda *a, **k: (_ for _ in ()).throw(
            AssertionError("partial listing runs must not purge retention")
        ),
    )
    monkeypatch.setattr(orchestration, "log_api_fetch", lambda **kwargs: telemetry.append(kwargs))

    with pytest.raises(RuntimeError, match="noncritical"):
        orchestration.main(
            database="stage_db",
            max_detail_fetches=0,
        )

    assert upserted_streams == ["critical"]
    assert any(
        row["operation_name"] == "parse_listing"
        and row["feed_name"] == "noncritical_listing"
        and row["status"] == "failure"
        for row in telemetry
    )
    assert any(
        row["operation_name"] == "retention"
        and row["metadata"]["skipped"] is True
        for row in telemetry
    )


def test_retention_sql_never_purges_current_notice_rows(monkeypatch):
    queries: list[str] = []

    class FakeCursor:
        def execute(self, query, params=None):
            queries.append(str(query))

        def fetchone(self):
            return [0]

        def close(self):
            pass

    class FakeConnection:
        def cursor(self):
            return FakeCursor()

        def commit(self):
            pass

        def rollback(self):
            pass

        def close(self):
            pass

    monkeypatch.setattr(
        williams_transco.db,
        "connect",
        lambda database=None: FakeConnection(),
    )

    deleted = williams_transco.purge_retention(database="stage_db")

    assert deleted == {
        "notice_details": 0,
        "planned_outages": 0,
        "notice_revisions": 0,
        "notices": 0,
    }
    delete_queries = [query for query in queries if "DELETE FROM gas_ebbs" in query]
    assert len(delete_queries) == 4
    assert all("is_current_on_ebb = FALSE" in query for query in delete_queries)
    details_delete_query = next(
        query
        for query in delete_queries
        if "DELETE FROM gas_ebbs.notice_details d" in query
    )
    assert (
        "n.stale_at_utc < NOW() - (%s::int * INTERVAL '1 day')"
        in details_delete_query
    )
    assert "d.detail_fetched_at_utc < NOW()" not in details_delete_query


def test_orchestration_module_import_smoke():
    assert orchestration.PIPELINE_NAME == "gas_ebb_williams_transco"
    assert callable(orchestration.main)
