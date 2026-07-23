from __future__ import annotations

import base64
from datetime import datetime, timezone
from pathlib import Path

from backend.utils import email_notifications


def _da_lmp_rows(
    hub: str,
    *,
    total_offset: float = 0.0,
    greenhouse_gas: float | None = None,
):
    return [
        {
            "hub": hub,
            "hour_ending": hour,
            "datetime_beginning": f"2026-07-01T{hour - 1:02d}:00:00",
            "system_energy": 20.0 + hour,
            "total": 30.0 + hour + total_offset,
            "congestion": 2.0,
            "marginal_loss": 1.0,
            "greenhouse_gas": greenhouse_gas,
            "updated_at": "2026-07-01T12:10:00",
        }
        for hour in range(1, 25)
    ]


def test_pjm_da_release_email_targets_single_day_report(monkeypatch):
    monkeypatch.setattr(
        email_notifications.credentials,
        "HELIOS_EMAIL_FRONTEND_BASE_URL",
        "https://frontend-helioscta.vercel.app",
    )

    snapshot = email_notifications._build_da_lmp_snapshot(
        iso="pjm",
        rows=_da_lmp_rows("WESTERN HUB"),
        target_date="2026-07-01",
        latest_date="2026-07-01",
        hubs=["WESTERN HUB"],
    )
    assert snapshot["peak_start_he"] == 8
    assert snapshot["peak_end_he"] == 23
    assert snapshot["peak_label"] == "Peak HE8-23"
    assert snapshot["off_peak_label"] == "OffPeak HE1-7,24"
    assert snapshot["hubs"][0]["on_peak_avg"] == 45.5
    assert snapshot["hubs"][0]["off_peak_avg"] == 36.5
    message = email_notifications.build_pjm_da_hrl_lmp_release_email(
        event={
            "id": 10,
            "event_key": "pjm_da_hrl_lmps:data_ready:2026-07-01:hub",
        },
        recipient_email="aidan.keaveny@helioscta.com",
        snapshot=snapshot,
    )

    assert message["notification_key"] == (
        "pjm_da_hrl_lmps:data_ready:2026-07-01:hub:email:release"
    )
    assert message["recipient_email"] == "aidan.keaveny@helioscta.com"
    assert message["source_event_id"] == 10
    assert message["subject"] == (
        "PJM DA LMPs released for Wed Jul-01 | "
        "HeliosCTA | PJM | DA LMPs | Posted"
    )
    assert "PJM DA LMPs Available" in message["body_html"]
    assert "Open PJM DA LMP report" in message["body_html"]
    assert "Market date" in message["body_html"]
    assert "pjm_da_hrl_lmps" in message["body_html"]
    assert "Hub Summary" in message["body_html"]
    assert "All Hubs Hourly Tables" in message["body_html"]
    assert "WESTERN HUB" in message["body_html"]
    assert "Peak HE8-23" in message["body_html"]
    assert "OffPeak HE1-7,24" in message["body_html"]
    assert "HE24" in message["body_html"]
    assert "Congestion" in message["body_html"]
    report_url = message["payload"]["report_url"]
    assert report_url.startswith("https://frontend-helioscta.vercel.app/?")
    assert "section=pjm-da-lmps" in report_url
    assert "view=single-day" in report_url
    assert "product=da" in report_url
    assert "iso=pjm" in report_url
    assert "date=2026-07-01" in report_url
    assert "hub=WESTERN+HUB" in report_url
    assert "component=all" in report_url
    assert "refresh=1" in report_url


def test_da_lmp_release_email_template_supports_ercot_total_only():
    rows = [
        {
            "hub": "HB_NORTH",
            "hour_ending": hour,
            "datetime_beginning": f"2026-07-01T{hour - 1:02d}:00:00",
            "system_energy": None,
            "total": 40.0 + hour,
            "congestion": None,
            "marginal_loss": None,
            "updated_at": "2026-07-01T13:10:00",
        }
        for hour in range(1, 25)
    ]
    snapshot = email_notifications._build_da_lmp_snapshot(
        iso="ercot",
        rows=rows,
        target_date="2026-07-01",
        latest_date="2026-07-01",
        hubs=["HB_NORTH"],
    )
    assert snapshot["peak_start_he"] == 7
    assert snapshot["peak_end_he"] == 22
    assert snapshot["peak_label"] == "Peak HE7-22"
    assert snapshot["off_peak_label"] == "OffPeak HE1-6,23-24"
    assert snapshot["hubs"][0]["on_peak_avg"] == 54.5
    assert snapshot["hubs"][0]["off_peak_avg"] == 48.5

    message = email_notifications.build_da_lmp_release_email(
        iso="ercot",
        event={
            "id": 11,
            "event_key": "ercot_dam_stlmnt_pnt_prices:data_ready:2026-07-01:hub",
        },
        recipient_email="ops@example.test",
        snapshot=snapshot,
    )

    assert message["dataset"] == "ercot_dam_stlmnt_pnt_prices"
    assert message["subject"] == (
        "ERCOT DA LMPs released for Wed Jul-01 | "
        "HeliosCTA | ERCOT | DA LMPs | Posted"
    )
    assert "ERCOT DA LMPs Available" in message["body_html"]
    assert "HB_NORTH" in message["body_html"]
    assert "Peak HE7-22" in message["body_html"]
    assert "OffPeak HE1-6,23-24" in message["body_html"]
    assert "HE24" in message["body_html"]
    assert "Total" in message["body_html"]
    assert "Energy" not in message["body_html"]
    assert "iso=ercot" in message["payload"]["report_url"]


def test_da_lmp_release_email_template_supports_nepool_components():
    snapshot = email_notifications._build_da_lmp_snapshot(
        iso="isone",
        rows=_da_lmp_rows(".H.INTERNAL_HUB"),
        target_date="2026-07-01",
        latest_date="2026-07-01",
        hubs=[".H.INTERNAL_HUB"],
    )
    assert snapshot["peak_start_he"] == 8
    assert snapshot["peak_end_he"] == 23
    assert snapshot["hubs"][0]["on_peak_avg"] == 45.5
    assert snapshot["hubs"][0]["off_peak_avg"] == 36.5

    message = email_notifications.build_da_lmp_release_email(
        iso="isone",
        event={
            "id": 12,
            "event_key": "isone_da_hrl_lmps:data_ready:2026-07-01:internal_hub",
        },
        recipient_email="ops@example.test",
        snapshot=snapshot,
    )

    assert message["dataset"] == "isone_da_hrl_lmps"
    assert message["subject"] == (
        "NEPOOL DA LMPs released for Wed Jul-01 | "
        "HeliosCTA | NEPOOL | DA LMPs | Posted"
    )
    assert "NEPOOL DA LMPs Available" in message["body_html"]
    assert ".H.INTERNAL_HUB" in message["body_html"]
    assert "Peak HE8-23" in message["body_html"]
    assert "OffPeak HE1-7,24" in message["body_html"]
    assert "Energy" in message["body_html"]
    assert "Congestion" in message["body_html"]
    assert "Loss" in message["body_html"]
    assert "iso=isone" in message["payload"]["report_url"]


def test_da_lmp_release_email_template_supports_caiso_components():
    snapshot = email_notifications._build_da_lmp_snapshot(
        iso="caiso",
        rows=_da_lmp_rows("TH_SP15_GEN-APND", greenhouse_gas=0.75),
        target_date="2026-07-18",
        latest_date="2026-07-18",
        hubs=["TH_SP15_GEN-APND"],
    )
    assert snapshot["peak_start_he"] == 7
    assert snapshot["peak_end_he"] == 22
    assert snapshot["hubs"][0]["on_peak_avg"] == 44.5
    assert snapshot["hubs"][0]["off_peak_avg"] == 38.5

    message = email_notifications.build_da_lmp_release_email(
        iso="caiso",
        event={
            "id": 13,
            "event_key": (
                "caiso_da_lmps:data_ready:2026-07-18:"
                "trading_hubs_np15_sp15"
            ),
        },
        recipient_email="ops@example.test",
        snapshot=snapshot,
    )

    assert message["dataset"] == "caiso_da_lmps"
    assert message["subject"] == (
        "CAISO DA LMPs released for Sat Jul-18 | "
        "HeliosCTA | CAISO | DA LMPs | Posted"
    )
    assert "CAISO DA LMPs Available" in message["body_html"]
    assert "TH_SP15_GEN-APND" in message["body_html"]
    assert "Peak HE7-22" in message["body_html"]
    assert "OffPeak HE1-6,23-24" in message["body_html"]
    assert "Energy" in message["body_html"]
    assert "$34.50" in message["body_html"]
    assert "$28.50" in message["body_html"]
    assert "Congestion" in message["body_html"]
    assert "Loss" in message["body_html"]
    assert "GHG" in message["body_html"]
    assert "Total" in message["body_html"]
    assert message["payload"]["iso"] == "caiso"
    assert "iso=caiso" in message["payload"]["report_url"]


def test_fetch_da_lmp_email_snapshot_supports_caiso_sql(monkeypatch):
    calls: list[dict[str, object]] = []

    def fake_execute_sql(query, params=None, database=None, fetch=False):
        calls.append(
            {
                "query": query,
                "params": params,
                "database": database,
                "fetch": fetch,
            }
        )
        if "MAX(operating_date)" in query:
            return [{"latest_date": "2026-07-18"}]
        assert "greenhouse_gas_component AS greenhouse_gas" in query
        return [
            {
                "hub": "TH_NP15_GEN-APND",
                "hour_ending": 1,
                "datetime_beginning": "2026-07-18T00:00:00",
                "system_energy": 41.0,
                "total": 44.5,
                "congestion": 1.5,
                "marginal_loss": 1.5,
                "greenhouse_gas": 0.5,
                "updated_at": "2026-07-17T13:05:00",
            }
        ]

    monkeypatch.setattr(email_notifications.db, "execute_sql", fake_execute_sql)

    snapshot = email_notifications.fetch_da_lmp_email_snapshot(
        iso="caiso",
        business_date="2026-07-18",
        database="stage_db",
        hubs=["TH_NP15_GEN-APND"],
    )

    assert calls[0]["params"] == (["TH_NP15_GEN-APND"],)
    assert calls[1]["params"] == (
        ["TH_NP15_GEN-APND"],
        "2026-07-18",
        ["TH_NP15_GEN-APND"],
    )
    assert all(call["database"] == "stage_db" for call in calls)
    assert snapshot["iso"] == "caiso"
    assert snapshot["latest_date"] == "2026-07-18"
    assert snapshot["hubs"][0]["hub"] == "TH_NP15_GEN-APND"
    assert snapshot["hubs"][0]["hours"] == 1
    assert snapshot["hubs"][0]["hourly"][0]["greenhouse_gas"] == 0.5


def test_enqueue_email_notification_is_idempotent(monkeypatch):
    captured: dict[str, object] = {}

    def fake_execute_sql(query, params=None, database=None, fetch=False):
        captured["query"] = query
        captured["params"] = params
        captured["database"] = database
        captured["fetch"] = fetch
        return [
            {
                "id": 42,
                "notification_key": params[0],
                "recipient_email": params[1],
                "status": "pending",
                "attempts": 0,
                "max_attempts": 6,
                "created": False,
            }
        ]

    monkeypatch.setattr(email_notifications.db, "execute_sql", fake_execute_sql)

    row = email_notifications.enqueue_email_notification(
        notification_key="event-1:email:release",
        recipient_email="aidan.keaveny@helioscta.com",
        subject="Subject",
        body_text="Body",
        dataset="pjm_da_hrl_lmps",
        source_event_key="event-1",
        source_event_id=10,
        payload={"report_url": "https://example.test"},
        database="stage_db",
    )

    assert row["created"] is False
    assert "ON CONFLICT (notification_key, recipient_email) DO NOTHING" in captured["query"]
    assert captured["database"] == "stage_db"
    assert captured["fetch"] is True
    assert captured["params"][0] == "event-1:email:release"
    assert captured["params"][1] == "aidan.keaveny@helioscta.com"


def test_clear_street_file_email_includes_attachment_payload(tmp_path):
    attachment = tmp_path / "Helios_Transactions_20260706.20260707_020817.csv"
    attachment.write_text("RECORD_ID\n1\n", encoding="utf-8")

    message = email_notifications.build_clear_street_eod_transactions_file_email(
        summary={
            "target_table": "clear_street.eod_transactions",
            "rows_processed": 3,
            "latest_sftp_upload_timestamp": datetime(
                2026,
                7,
                7,
                2,
                8,
                17,
                tzinfo=timezone.utc,
            ),
            "latest_trade_file": {
                "remote_filename": "Helios_Transactions_20260706.csv",
                "local_filename": attachment.name,
                "trade_date_from_sftp": "20260706",
                "sftp_upload_timestamp": datetime(
                    2026,
                    7,
                    7,
                    2,
                    8,
                    17,
                    tzinfo=timezone.utc,
                ),
                "rows_processed": 3,
            },
        },
        recipient_email="ops@example.test",
        attachment_path=attachment,
    )

    assert message["notification_key"] == (
        "clear_street_eod_transactions:data_ready:"
        "2026-07-06:20260707T020817Z:email:file_available"
    )
    assert message["recipient_email"] == "ops@example.test"
    assert message["subject"] == (
        "Clear Street file available for Mon Jul-06 | "
        "HeliosCTA | Clear Street | File Available"
    )
    assert "Attached CSV" in message["body_text"]
    assert "HeliosCTA Alerts" in message["body_html"]
    assert "Clear Street File Available" in message["body_html"]
    assert "<table role=\"presentation\"" in message["body_html"]
    assert message["payload"]["attachment_paths"] == [str(attachment)]


def test_nav_positions_file_email_includes_workbook_attachments(tmp_path):
    agr_attachment = (
        tmp_path
        / "Position Valuation Detail Report_20260708_AGR Trading II, LLC.20260709_125500.xlsx"
    )
    pnt_attachment = (
        tmp_path
        / "Position Valuation Detail Report_20260708_PNT Trading, LLC.20260709_125700.xlsx"
    )
    agr_attachment.write_text("xlsx", encoding="utf-8")
    pnt_attachment.write_text("xlsx", encoding="utf-8")

    message = email_notifications.build_nav_positions_file_email(
        summary={
            "target_table": "nav.positions",
            "target_nav_date": "2026-07-08",
            "rows_processed": 1842,
            "loaded_fund_codes": ["agr", "pnt"],
            "source_files": [
                {
                    "fund_code": "agr",
                    "remote_filename": (
                        "Position Valuation Detail Report_20260708_AGR Trading II, LLC.XLSX"
                    ),
                    "local_filename": agr_attachment.name,
                    "local_path": str(agr_attachment),
                    "sftp_upload_timestamp": datetime(
                        2026,
                        7,
                        9,
                        12,
                        55,
                        tzinfo=timezone.utc,
                    ),
                },
                {
                    "fund_code": "pnt",
                    "remote_filename": (
                        "Position Valuation Detail Report_20260708_PNT Trading, LLC.XLSX"
                    ),
                    "local_filename": pnt_attachment.name,
                    "local_path": str(pnt_attachment),
                    "sftp_upload_timestamp": datetime(
                        2026,
                        7,
                        9,
                        12,
                        57,
                        tzinfo=timezone.utc,
                    ),
                },
            ],
        },
        recipient_email="ops@example.test",
        attachment_paths=[agr_attachment, pnt_attachment],
    )

    assert message["notification_key"] == (
        "nav_positions:data_ready:2026-07-08:"
        "20260709T125700Z:email:file_available"
    )
    assert message["recipient_email"] == "ops@example.test"
    assert message["subject"] == (
        "NAV positions ready for review for Wed Jul-08 | "
        "HeliosCTA | NAV | Positions"
    )
    assert "Attached workbooks" in message["body_text"]
    assert "Source system: NAV SFTP" in message["body_text"]
    assert "ready for review" in message["body_text"]
    assert "HeliosCTA Alerts" in message["body_html"]
    assert "NAV Positions Ready for Review" in message["body_html"]
    assert "Review Notes" in message["body_html"]
    assert "<table role=\"presentation\"" in message["body_html"]
    assert message["payload"]["attachment_paths"] == [
        str(agr_attachment),
        str(pnt_attachment),
    ]
    assert message["payload"]["loaded_fund_codes"] == ["agr", "pnt"]


def test_nav_trade_breaks_file_email_includes_workbook_attachment(tmp_path):
    attachment = (
        tmp_path
        / "Trade Breaks Detail Report_20260224_HELIOS COMMODITY ADVISORS LTD.20260225_123456.xlsx"
    )
    attachment.write_text("xlsx", encoding="utf-8")

    message = email_notifications.build_nav_trade_breaks_file_email(
        summary={
            "target_table": "nav_email.nav_trade_breaks",
            "source_filename": (
                "Trade Breaks Detail Report_20260224_"
                "HELIOS COMMODITY ADVISORS LTD.XLSX"
            ),
            "downloaded_filename": attachment.name,
            "source_file_path": str(attachment),
            "nav_date": "2026-02-24",
            "sftp_upload_timestamp": datetime(
                2026,
                2,
                25,
                12,
                34,
                56,
                tzinfo=timezone.utc,
            ),
            "rows_processed": 3,
            "by_add_del": {"ADD": 2, "DEL": 1},
        },
        recipient_email="ops@example.test",
        attachment_path=attachment,
    )

    assert message["notification_key"] == (
        "nav_trade_breaks:data_ready:2026-02-24:"
        "20260225T123456Z:email:file_available"
    )
    assert message["recipient_email"] == "ops@example.test"
    assert message["subject"] == (
        "NAV trade breaks ready for review for Tue Feb-24 | "
        "HeliosCTA | NAV | Trade Breaks"
    )
    assert "Attached workbook" in message["body_text"]
    assert "Source system: NAV SFTP" in message["body_text"]
    assert "ADD=2, DEL=1" in message["body_text"]
    assert "HeliosCTA Alerts" in message["body_html"]
    assert "NAV Trade Breaks Ready for Review" in message["body_html"]
    assert "Attachments" in message["body_html"]
    assert "Source Files" in message["body_html"]
    assert "Review Notes" in message["body_html"]
    assert "<table role=\"presentation\"" in message["body_html"]
    assert message["payload"]["attachment_paths"] == [str(attachment)]
    assert message["payload"]["add_del_counts"] == {"ADD": 2, "DEL": 1}


def test_nav_trade_breaks_file_email_states_when_no_breaks_found(tmp_path):
    attachment = (
        tmp_path
        / "Trade Breaks Detail Report_20260708_HELIOS COMMODITY ADVISORS LTD.20260709_091643.xlsx"
    )
    attachment.write_text("xlsx", encoding="utf-8")

    message = email_notifications.build_nav_trade_breaks_file_email(
        summary={
            "target_table": "nav_email.nav_trade_breaks",
            "source_filename": (
                "Trade Breaks Detail Report_20260708_"
                "HELIOS COMMODITY ADVISORS LTD.XLSX"
            ),
            "downloaded_filename": attachment.name,
            "source_file_path": str(attachment),
            "nav_date": "2026-07-08",
            "sftp_upload_timestamp": datetime(
                2026,
                7,
                9,
                9,
                16,
                43,
                tzinfo=timezone.utc,
            ),
            "rows_processed": 0,
            "by_add_del": {},
        },
        recipient_email="ops@example.test",
        attachment_path=attachment,
    )

    assert message["subject"] == (
        "No NAV trade breaks found for Wed Jul-08 | "
        "HeliosCTA | NAV | Trade Breaks"
    )
    assert "No NAV trade breaks were found for 2026-07-08." in message["body_text"]
    assert "No NAV Trade Breaks Found" in message["body_html"]
    assert "No trade breaks found" in message["body_html"]
    assert "Attachments" in message["body_html"]
    assert "Source Files" in message["body_html"]
    assert "NAV reported no trade break detail rows" in message["body_html"]
    assert message["payload"]["rows_processed"] == 0


def test_clear_street_mufg_upload_email_includes_warnings_and_attachment(tmp_path):
    attachment = tmp_path / "helios_transactions_v3_20260706_filtered.csv"
    attachment.write_text("record_id\n1\n", encoding="utf-8")

    message = email_notifications.build_clear_street_mufg_upload_success_email(
        summary={
            "target_table": "mufg_sftp.clear_street_trades",
            "source_table": "clear_street.eod_transactions",
            "expected_trade_date_from_sftp": "20260706",
            "rows_exported": 2,
            "rows_uploaded": 2,
            "filename": attachment.name,
            "remote_path": f"/{attachment.name}",
            "expected_trade_status": "New",
            "trade_status_counts": {"Rejected": 2},
            "unexpected_trade_status_rows": 2,
            "non_ok_trade_status_rows": 2,
            "product_code_null_check": {
                "null_rows": 2,
                "has_nulls": True,
                "affected_product_count": 1,
                "affected_products": [
                    {
                        "product": "ALQ-Algonquin Citygates Basis Future",
                        "row_count": 2,
                        "source_fields": {
                            "futures_code": "H9",
                            "exch_comm_cd": "ALQ",
                            "exchange_name": "IPE",
                        },
                        "contract_year_months": ["202611"],
                        "trade_statuses": ["New"],
                    }
                ],
            },
        },
        recipient_email="ops@example.test",
        attachment_path=attachment,
    )

    assert message["notification_key"] == (
        "clear_street_trades_mufg_upload:data_ready:"
        "2026-07-06:email:upload_complete"
    )
    assert message["subject"] == (
        "Clear Street MUFG upload complete for Mon Jul-06 | "
        "HeliosCTA | Clear Street | MUFG Upload | Warning"
    )
    assert "Warnings:" in message["body_text"]
    assert "unexpected trade_status" in message["body_text"]
    assert "expected New" in message["body_text"]
    assert "Vendor code mapping needed" in message["body_text"]
    assert "ALQ-Algonquin Citygates Basis Future" in message["body_text"]
    assert "HeliosCTA Alerts" in message["body_html"]
    assert "Clear Street MUFG Upload Complete" in message["body_html"]
    assert "Affected Source Products" in message["body_html"]
    assert "<table role=\"presentation\"" in message["body_html"]
    assert message["payload"]["attachment_paths"] == [str(attachment)]
    assert message["payload"]["warnings"]


def test_clear_street_mufg_upload_email_subject_omits_warning_tag_without_warnings(
    tmp_path,
):
    attachment = tmp_path / "helios_transactions_v3_20260706_filtered.csv"
    attachment.write_text("record_id\n1\n", encoding="utf-8")

    message = email_notifications.build_clear_street_mufg_upload_success_email(
        summary={
            "expected_trade_date_from_sftp": "20260706",
            "rows_exported": 1,
            "rows_uploaded": 1,
            "filename": attachment.name,
            "remote_path": f"/{attachment.name}",
        },
        recipient_email="ops@example.test",
        attachment_path=attachment,
    )

    assert message["subject"] == (
        "Clear Street MUFG upload complete for Mon Jul-06 | "
        "HeliosCTA | Clear Street | MUFG Upload"
    )


def test_send_due_email_notifications_skips_when_disabled(monkeypatch):
    claimed = False

    def fake_claim_due_notifications(**_kwargs):
        nonlocal claimed
        claimed = True
        return []

    monkeypatch.setattr(
        email_notifications.credentials,
        "HELIOS_EMAIL_NOTIFICATIONS_ENABLED",
        False,
    )
    monkeypatch.setattr(
        email_notifications,
        "_claim_due_notifications",
        fake_claim_due_notifications,
    )

    assert email_notifications.send_due_email_notifications(database="stage_db") == []
    assert claimed is False


def test_send_due_email_notifications_marks_failed_for_retry(monkeypatch):
    now = datetime(2026, 7, 1, tzinfo=timezone.utc)
    calls: list[dict[str, object]] = []

    monkeypatch.setattr(
        email_notifications.credentials,
        "HELIOS_EMAIL_NOTIFICATIONS_ENABLED",
        True,
    )
    monkeypatch.setattr(
        email_notifications,
        "_claim_due_notifications",
        lambda **_kwargs: [
            {
                "id": 7,
                "notification_key": "event-1:email:release",
                "recipient_email": "aidan.keaveny@helioscta.com",
                "subject": "Subject",
                "body_text": "Body",
                "body_html": None,
                "attempts": 1,
                "max_attempts": 6,
            }
        ],
    )
    monkeypatch.setattr(
        email_notifications,
        "send_email_via_graph",
        lambda **_kwargs: (_ for _ in ()).throw(RuntimeError("provider down")),
    )

    def fake_mark_failed(**kwargs):
        calls.append(kwargs)
        return {
            "id": kwargs["notification_id"],
            "notification_key": "event-1:email:release",
            "recipient_email": "aidan.keaveny@helioscta.com",
            "status": "failed",
            "attempts": kwargs["attempts"],
        }

    monkeypatch.setattr(email_notifications, "_mark_notification_failed", fake_mark_failed)

    results = email_notifications.send_due_email_notifications(
        database="stage_db",
        now=now,
    )

    assert results[0]["status"] == "failed"
    assert calls[0]["notification_id"] == 7
    assert calls[0]["attempts"] == 1
    assert calls[0]["max_attempts"] == 6
    assert calls[0]["error_type"] == "RuntimeError"
    assert calls[0]["database"] == "stage_db"


def test_send_due_email_notifications_uses_payload_attachment_paths(
    monkeypatch,
    tmp_path,
):
    attachment = tmp_path / "Helios_Transactions_20260706.csv"
    attachment.write_text("RECORD_ID\n1\n", encoding="utf-8")
    sent_calls: list[dict[str, object]] = []

    monkeypatch.setattr(
        email_notifications.credentials,
        "HELIOS_EMAIL_NOTIFICATIONS_ENABLED",
        True,
    )
    monkeypatch.setattr(
        email_notifications,
        "_claim_due_notifications",
        lambda **_kwargs: [
            {
                "id": 8,
                "notification_key": "event-1:email:file_available",
                "recipient_email": "ops@example.test",
                "subject": "Subject",
                "body_text": "Body",
                "body_html": None,
                "payload": {"attachment_paths": [str(attachment)]},
                "attempts": 1,
                "max_attempts": 6,
            }
        ],
    )
    monkeypatch.setattr(
        email_notifications,
        "send_email_via_graph",
        lambda **kwargs: sent_calls.append(kwargs),
    )
    monkeypatch.setattr(
        email_notifications,
        "_mark_notification_sent",
        lambda **kwargs: {
            "id": kwargs["notification_id"],
            "notification_key": "event-1:email:file_available",
            "recipient_email": "ops@example.test",
            "status": "sent",
            "attempts": 1,
        },
    )

    results = email_notifications.send_due_email_notifications(database="stage_db")

    assert results[0]["status"] == "sent"
    assert sent_calls[0]["attachments"] == [str(attachment)]


def test_send_email_via_graph_supports_file_attachments(monkeypatch, tmp_path):
    attachment = tmp_path / "Helios_Transactions_20260706.csv"
    attachment.write_text("record_id\n1\n", encoding="utf-8")
    posts: list[dict[str, object]] = []

    class FakeResponse:
        def __init__(self, status_code: int, payload: dict[str, str] | None = None):
            self.status_code = status_code
            self._payload = payload or {}
            self.text = "ok"

        def json(self):
            return self._payload

    def fake_post(url, **kwargs):
        posts.append({"url": url, **kwargs})
        if "login.microsoftonline.com" in url:
            return FakeResponse(200, {"access_token": "token"})
        return FakeResponse(202)

    monkeypatch.setattr(
        email_notifications.credentials,
        "AZURE_OUTLOOK_CLIENT_ID",
        "client-id",
    )
    monkeypatch.setattr(
        email_notifications.credentials,
        "AZURE_OUTLOOK_TENANT_ID",
        "tenant-id",
    )
    monkeypatch.setattr(
        email_notifications.credentials,
        "AZURE_OUTLOOK_CLIENT_SECRET",
        "secret",
    )
    monkeypatch.setattr(email_notifications.requests, "post", fake_post)

    email_notifications.send_email_via_graph(
        sender_email="admin@helioscta.com",
        recipient_email="nav@example.test",
        subject="Clear Street",
        body_text="Attached.",
        attachments=[attachment],
    )

    assert len(posts) == 2
    send_payload = posts[1]["json"]
    assert posts[1]["url"].endswith("/users/admin@helioscta.com/sendMail")
    assert send_payload["message"]["toRecipients"] == [
        {"emailAddress": {"address": "nav@example.test"}}
    ]
    assert send_payload["message"]["attachments"] == [
        {
            "@odata.type": "#microsoft.graph.fileAttachment",
            "name": attachment.name,
            "contentBytes": base64.b64encode(attachment.read_bytes()).decode(
                "utf-8"
            ),
        }
    ]
