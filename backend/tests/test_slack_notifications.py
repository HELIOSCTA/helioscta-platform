from __future__ import annotations

from datetime import datetime, timezone

from backend.utils import slack_notifications


def test_pjm_da_release_slack_targets_power_channel_and_single_day_report(monkeypatch):
    monkeypatch.setattr(
        slack_notifications.credentials,
        "HELIOS_EMAIL_FRONTEND_BASE_URL",
        "https://frontend-helioscta.vercel.app",
    )
    monkeypatch.setattr(
        slack_notifications.credentials,
        "SLACK_POWER_ALERTS_CHANNEL_ID",
        "CPOWER",
    )
    monkeypatch.setattr(
        slack_notifications.credentials,
        "SLACK_POWER_ALERTS_CHANNEL_NAME",
        "#helios-alerts-power",
    )

    message = slack_notifications.build_pjm_da_hrl_lmp_release_slack(
        event={
            "id": 9,
            "event_key": "pjm_da_hrl_lmps:data_ready:2026-07-02:hub",
        },
    )

    assert message["notification_key"] == (
        "pjm_da_hrl_lmps:data_ready:2026-07-02:hub:slack:release"
    )
    assert message["channel_id"] == "CPOWER"
    assert message["channel_name"] == "#helios-alerts-power"
    assert message["source_event_id"] == 9
    assert message["dataset"] == "pjm_da_hrl_lmps"
    assert message["message_text"].startswith(
        "PJM DA hourly LMPs are available for 2026-07-02."
    )
    report_url = message["payload"]["report_url"]
    assert report_url.startswith("https://frontend-helioscta.vercel.app/?")
    assert "section=pjm-da-lmps" in report_url
    assert "view=single-day" in report_url
    assert "product=da" in report_url
    assert "date=2026-07-02" in report_url
    assert "hub=WESTERN+HUB" in report_url
    assert "component=all" in report_url
    assert "refresh=1" in report_url
    assert message["message_blocks"][0]["text"]["text"] == "PJM DA HRL LMPs Available"
    assert message["message_blocks"][1]["fields"] == [
        {"type": "mrkdwn", "text": "*Market date*\n2026-07-02"},
        {"type": "mrkdwn", "text": "*Dataset*\nDay-ahead hourly LMPs"},
        {
            "type": "mrkdwn",
            "text": (
                "*Data source*\n"
                "<https://dataminer2.pjm.com/feed/da_hrl_lmps/definition|"
                "PJM Data Miner 2 - da_hrl_lmps>"
            ),
        },
    ]
    button = message["message_blocks"][2]["elements"][0]
    assert button["text"]["text"] == "Open report"
    assert button["url"] == report_url
    source_button = message["message_blocks"][2]["elements"][1]
    assert source_button["text"]["text"] == "PJM source"
    assert (
        source_button["url"]
        == "https://dataminer2.pjm.com/feed/da_hrl_lmps/definition"
    )
    assert message["payload"]["source_feed"] == "da_hrl_lmps"


def test_pjm_rt_release_slack_targets_power_channel_and_single_day_report(monkeypatch):
    monkeypatch.setattr(
        slack_notifications.credentials,
        "HELIOS_EMAIL_FRONTEND_BASE_URL",
        "https://frontend-helioscta.vercel.app",
    )
    monkeypatch.setattr(
        slack_notifications.credentials,
        "SLACK_POWER_ALERTS_CHANNEL_ID",
        "CPOWER",
    )
    monkeypatch.setattr(
        slack_notifications.credentials,
        "SLACK_POWER_ALERTS_CHANNEL_NAME",
        "#helios-alerts-power",
    )

    message = slack_notifications.build_pjm_rt_hrl_lmp_release_slack(
        event={
            "id": 10,
            "event_key": "pjm_rt_hrl_lmps:data_ready:2026-06-30:hub",
        },
    )

    assert message["notification_key"] == (
        "pjm_rt_hrl_lmps:data_ready:2026-06-30:hub:slack:release"
    )
    assert message["channel_id"] == "CPOWER"
    assert message["channel_name"] == "#helios-alerts-power"
    assert message["source_event_id"] == 10
    assert message["dataset"] == "pjm_rt_hrl_lmps"
    assert message["message_text"].startswith(
        "PJM verified RT hourly LMPs are available for 2026-06-30."
    )
    report_url = message["payload"]["report_url"]
    assert report_url.startswith("https://frontend-helioscta.vercel.app/?")
    assert "section=pjm-da-lmps" in report_url
    assert "view=single-day" in report_url
    assert "product=rt" in report_url
    assert "source=verified" in report_url
    assert "date=2026-06-30" in report_url
    assert "hub=WESTERN+HUB" in report_url
    assert "component=all" in report_url
    assert "refresh=1" in report_url
    assert message["message_blocks"][0] == {
        "type": "header",
        "text": {
            "type": "plain_text",
            "text": "PJM RT HRL LMPs Available",
            "emoji": True,
        },
    }
    assert message["message_blocks"][1]["fields"] == [
        {"type": "mrkdwn", "text": "*Market date*\n2026-06-30"},
        {"type": "mrkdwn", "text": "*Dataset*\nVerified RT hourly LMPs"},
        {
            "type": "mrkdwn",
            "text": (
                "*Data source*\n"
                "<https://dataminer2.pjm.com/feed/rt_hrl_lmps/definition|"
                "PJM Data Miner 2 - rt_hrl_lmps>"
            ),
        },
    ]
    button = message["message_blocks"][2]["elements"][0]
    assert button["text"]["text"] == "Open report"
    assert button["url"] == report_url
    source_button = message["message_blocks"][2]["elements"][1]
    assert source_button["text"]["text"] == "PJM source"
    assert (
        source_button["url"]
        == "https://dataminer2.pjm.com/feed/rt_hrl_lmps/definition"
    )
    assert message["message_blocks"][3]["elements"][0]["text"] == (
        "Source definition: "
        "<https://dataminer2.pjm.com/feed/rt_hrl_lmps/definition|"
        "PJM Data Miner 2 `rt_hrl_lmps`>"
    )
    assert message["payload"]["source_system"] == "PJM Data Miner 2"
    assert message["payload"]["source_feed"] == "rt_hrl_lmps"
    assert message["payload"]["rt_source"] == "verified"
    assert (
        message["payload"]["source_url"]
        == "https://dataminer2.pjm.com/feed/rt_hrl_lmps/definition"
    )


def test_pjm_rt_fivemin_release_slack_uses_source_without_report_link(monkeypatch):
    monkeypatch.setattr(
        slack_notifications.credentials,
        "SLACK_POWER_ALERTS_CHANNEL_ID",
        "CPOWER",
    )
    monkeypatch.setattr(
        slack_notifications.credentials,
        "SLACK_POWER_ALERTS_CHANNEL_NAME",
        "#helios-alerts-power",
    )

    message = slack_notifications.build_pjm_rt_fivemin_hrl_lmp_release_slack(
        event={
            "id": 11,
            "event_key": (
                "pjm_rt_fivemin_hrl_lmps:data_ready:"
                "2026-06-30:hub_zone_interface"
            ),
        },
    )

    assert message["notification_key"] == (
        "pjm_rt_fivemin_hrl_lmps:data_ready:"
        "2026-06-30:hub_zone_interface:slack:release"
    )
    assert message["channel_id"] == "CPOWER"
    assert message["channel_name"] == "#helios-alerts-power"
    assert message["source_event_id"] == 11
    assert message["dataset"] == "pjm_rt_fivemin_hrl_lmps"
    assert message["message_text"].startswith(
        "PJM verified RT five-minute LMPs are available for 2026-06-30."
    )
    assert "report_url" not in message["payload"]
    assert message["payload"]["source_feed"] == "rt_fivemin_hrl_lmps"
    assert message["payload"]["pricing_node_scope"] == "hub_zone_interface"
    assert message["payload"]["interval_minutes"] == 5
    assert message["message_blocks"][0]["text"]["text"] == (
        "PJM RT 5-Min HRL LMPs Available"
    )
    assert message["message_blocks"][1]["fields"] == [
        {"type": "mrkdwn", "text": "*Market date*\n2026-06-30"},
        {"type": "mrkdwn", "text": "*Dataset*\nVerified RT five-minute LMPs"},
        {
            "type": "mrkdwn",
            "text": (
                "*Data source*\n"
                "<https://dataminer2.pjm.com/feed/rt_fivemin_hrl_lmps/definition|"
                "PJM Data Miner 2 - rt_fivemin_hrl_lmps>"
            ),
        },
    ]
    buttons = message["message_blocks"][2]["elements"]
    assert len(buttons) == 1
    assert buttons[0]["text"]["text"] == "PJM source"
    assert (
        buttons[0]["url"]
        == "https://dataminer2.pjm.com/feed/rt_fivemin_hrl_lmps/definition"
    )


def test_pjm_da_reserve_market_results_slack_uses_source_without_report_link(
    monkeypatch,
):
    monkeypatch.setattr(
        slack_notifications.credentials,
        "SLACK_POWER_ALERTS_CHANNEL_ID",
        "CPOWER",
    )
    monkeypatch.setattr(
        slack_notifications.credentials,
        "SLACK_POWER_ALERTS_CHANNEL_NAME",
        "#helios-alerts-power",
    )

    message = slack_notifications.build_pjm_da_reserve_market_results_release_slack(
        event={
            "id": 12,
            "event_key": (
                "pjm_da_reserve_market_results:data_ready:"
                "2026-07-02:locale_service"
            ),
        },
    )

    assert message["notification_key"] == (
        "pjm_da_reserve_market_results:data_ready:"
        "2026-07-02:locale_service:slack:release"
    )
    assert message["channel_id"] == "CPOWER"
    assert message["channel_name"] == "#helios-alerts-power"
    assert message["source_event_id"] == 12
    assert message["dataset"] == "pjm_da_reserve_market_results"
    assert message["message_text"].startswith(
        "PJM DA reserve market results are available for 2026-07-02."
    )
    assert "report_url" not in message["payload"]
    assert message["payload"]["source_feed"] == "da_reserve_market_results"
    assert message["payload"]["scope"] == "locale_service"
    assert message["message_blocks"][0]["text"]["text"] == (
        "PJM DA Reserve Market Results Available"
    )
    assert message["message_blocks"][1]["fields"] == [
        {"type": "mrkdwn", "text": "*Market date*\n2026-07-02"},
        {"type": "mrkdwn", "text": "*Dataset*\nDay-ahead reserve market results"},
        {
            "type": "mrkdwn",
            "text": (
                "*Data source*\n"
                "<https://dataminer2.pjm.com/feed/"
                "da_reserve_market_results/definition|"
                "PJM Data Miner 2 - da_reserve_market_results>"
            ),
        },
    ]
    buttons = message["message_blocks"][2]["elements"]
    assert len(buttons) == 1
    assert buttons[0]["text"]["text"] == "PJM source"
    assert (
        buttons[0]["url"]
        == "https://dataminer2.pjm.com/feed/da_reserve_market_results/definition"
    )


def test_clear_street_eod_transactions_slack_uses_positions_trades_channel(
    monkeypatch,
):
    latest_upload = datetime(
        2026,
        7,
        7,
        2,
        8,
        17,
        tzinfo=timezone.utc,
    )
    latest_upload_display = slack_notifications._format_machine_local_datetime(
        latest_upload
    )
    monkeypatch.setattr(
        slack_notifications.credentials,
        "SLACK_DEFAULT_CHANNEL_ID",
        "CDEFAULT",
    )
    monkeypatch.setattr(
        slack_notifications.credentials,
        "SLACK_DEFAULT_CHANNEL_NAME",
        "#helios-alerts",
    )
    monkeypatch.setattr(
        slack_notifications.credentials,
        "SLACK_POSITIONS_TRADES_ALERTS_CHANNEL_ID",
        "CPOSITIONS",
    )
    monkeypatch.setattr(
        slack_notifications.credentials,
        "SLACK_POSITIONS_TRADES_ALERTS_CHANNEL_NAME",
        "#helios-alerts-positions-trades",
    )

    message = slack_notifications.build_clear_street_eod_transactions_slack(
        summary={
            "target_table": "clear_street.eod_transactions",
            "lookback_days": 5,
            "files_downloaded": 5,
            "files_processed": 5,
            "rows_processed": 6321,
            "source_files": [
                {
                    "remote_filename": "Helios_Transactions_20260630.csv",
                    "local_filename": (
                        "Helios_Transactions_20260630.20260630_200100.csv"
                    ),
                    "trade_date_from_sftp": "20260630",
                    "sftp_upload_timestamp": datetime(
                        2026,
                        6,
                        30,
                        20,
                        1,
                        tzinfo=timezone.utc,
                    ),
                    "rows_processed": 1100,
                },
                {
                    "remote_filename": "Helios_Transactions_20260706.csv",
                    "local_filename": (
                        "Helios_Transactions_20260706.20260707_020817.csv"
                    ),
                    "trade_date_from_sftp": "20260706",
                    "sftp_upload_timestamp": latest_upload,
                    "rows_processed": 920,
                },
            ],
            "latest_trade_file": {
                "remote_filename": "Helios_Transactions_20260706.csv",
                "local_filename": (
                    "Helios_Transactions_20260706.20260707_020817.csv"
                ),
                "trade_date_from_sftp": "20260706",
                "sftp_upload_timestamp": latest_upload,
                "rows_processed": 920,
            },
            "min_trade_date_from_sftp": "20260630",
            "max_trade_date_from_sftp": "20260706",
            "latest_sftp_upload_timestamp": latest_upload,
        },
    )

    assert message["notification_key"] == (
        "clear_street_eod_transactions:data_ready:"
        "2026-07-06:20260707T020817Z:slack:release"
    )
    assert message["channel_id"] == "CPOSITIONS"
    assert message["channel_name"] == "#helios-alerts-positions-trades"
    assert message["dataset"] == "clear_street_eod_transactions"
    assert message["source_event_key"] == (
        "clear_street_eod_transactions:data_ready:"
        "2026-07-06:20260707T020817Z"
    )
    assert message["message_text"].startswith(
        "Clear Street EOD trade file loaded for 2026-07-06: "
        "920 rows from Helios_Transactions_20260706.csv."
    )
    assert f"SFTP upload: {latest_upload_display}." in message["message_text"]
    assert "Target table" not in message["message_text"]
    assert message["payload"]["target_table"] == "clear_street.eod_transactions"
    assert message["payload"]["latest_trade_date"] == "2026-07-06"
    assert message["payload"]["latest_sftp_upload_timestamp"] == (
        "2026-07-07T02:08:17+00:00"
    )
    assert message["payload"]["latest_sftp_upload_timestamp_local"] == (
        latest_upload.astimezone().isoformat()
    )
    assert message["payload"]["source_filename"] == "Helios_Transactions_20260706.csv"
    assert message["payload"]["rows_processed"] == 920
    assert message["payload"]["run_rows_processed"] == 6321
    assert message["message_blocks"][0]["text"]["text"] == (
        "Clear Street EOD Transactions Loaded"
    )
    assert message["message_blocks"][1]["fields"] == [
        {"type": "mrkdwn", "text": "*Trade date*\n2026-07-06"},
        {"type": "mrkdwn", "text": "*Rows loaded*\n920"},
        {
            "type": "mrkdwn",
            "text": "*Source file*\n`Helios_Transactions_20260706.csv`",
        },
        {"type": "mrkdwn", "text": f"*SFTP upload*\n{latest_upload_display}"},
    ]


def test_clear_street_eod_transactions_slack_preserves_latest_zero_rows():
    message = slack_notifications.build_clear_street_eod_transactions_slack(
        summary={
            "target_table": "clear_street.eod_transactions",
            "files_downloaded": 2,
            "files_processed": 2,
            "rows_processed": 1200,
            "latest_trade_file": {
                "remote_filename": "Helios_Transactions_20260706.csv",
                "local_filename": (
                    "Helios_Transactions_20260706.20260707_020817.csv"
                ),
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
                "rows_processed": 0,
            },
        },
        channel_id="CPOSITIONS",
        channel_name="#helios-alerts-positions-trades",
    )

    assert message["payload"]["rows_processed"] == 0
    assert message["payload"]["run_rows_processed"] == 1200
    assert message["message_text"].startswith(
        "Clear Street EOD trade file loaded for 2026-07-06: "
        "0 rows from Helios_Transactions_20260706.csv."
    )


def test_clear_street_eod_transactions_timeout_slack_uses_positions_channel(
    monkeypatch,
):
    monkeypatch.setattr(
        slack_notifications.credentials,
        "SLACK_POSITIONS_TRADES_ALERTS_CHANNEL_ID",
        "CPOSITIONS",
    )
    monkeypatch.setattr(
        slack_notifications.credentials,
        "SLACK_POSITIONS_TRADES_ALERTS_CHANNEL_NAME",
        "#helios-alerts-positions-trades",
    )

    message = slack_notifications.build_clear_street_eod_transactions_timeout_slack(
        target_trade_date="20260706",
        window_start_at=datetime(2026, 7, 6, 19, tzinfo=timezone.utc),
        window_end_at=datetime(2026, 7, 7, 5, tzinfo=timezone.utc),
        poll_count=121,
        poll_wait_seconds=300,
    )

    assert message["notification_key"] == (
        "clear_street_eod_transactions:data_missing:"
        "2026-07-06:slack:timeout"
    )
    assert message["channel_id"] == "CPOSITIONS"
    assert message["channel_name"] == "#helios-alerts-positions-trades"
    assert message["dataset"] == "clear_street_eod_transactions"
    assert message["source_event_key"] == (
        "clear_street_eod_transactions:data_missing:2026-07-06"
    )
    assert message["message_text"].startswith(
        "Clear Street EOD transactions were not available for 2026-07-06"
    )
    assert message["payload"]["target_trade_date"] == "2026-07-06"
    assert message["payload"]["poll_count"] == 121
    assert message["payload"]["poll_wait_seconds"] == 300
    assert message["message_blocks"][0]["text"]["text"] == (
        "Clear Street EOD Transactions Missing"
    )
    assert message["message_blocks"][1]["fields"] == [
        {"type": "mrkdwn", "text": "*Target trade date*\n2026-07-06"},
        {"type": "mrkdwn", "text": "*Poll attempts*\n121"},
        {"type": "mrkdwn", "text": "*Window start*\n2026-07-06 19:00 UTC"},
        {"type": "mrkdwn", "text": "*Window end*\n2026-07-07 05:00 UTC"},
        {"type": "mrkdwn", "text": "*Poll cadence*\n300 seconds"},
    ]


def test_clear_street_mufg_upload_success_slack_uses_positions_channel(
    monkeypatch,
):
    uploaded_at = datetime(2026, 7, 7, 16, 30, tzinfo=timezone.utc)
    uploaded_at_display = slack_notifications._format_machine_local_datetime(
        uploaded_at
    )
    monkeypatch.setattr(
        slack_notifications.credentials,
        "SLACK_POSITIONS_TRADES_ALERTS_CHANNEL_ID",
        "CPOSITIONS",
    )
    monkeypatch.setattr(
        slack_notifications.credentials,
        "SLACK_POSITIONS_TRADES_ALERTS_CHANNEL_NAME",
        "#helios-alerts-positions-trades",
    )

    message = slack_notifications.build_clear_street_mufg_upload_success_slack(
        summary={
            "target_table": "mufg_sftp.clear_street_trades",
            "source_table": "clear_street.eod_transactions",
            "expected_trade_date_from_sftp": "20260706",
            "sftp_date_from_sql": "20260705",
            "sql_extract_sftp_date_mismatch": True,
            "rows_exported": 74,
            "rows_uploaded": 74,
            "filename": "Helios_Transactions_20260706_filtered.csv",
            "remote_dir": "/",
            "remote_path": "/Helios_Transactions_20260706_filtered.csv",
            "sql_filename": "clear_street_trades/mufg/latest.sql",
            "trade_status_counts": {"ok": 74},
            "non_ok_trade_status_rows": 0,
        },
        now=uploaded_at,
    )

    assert message["notification_key"] == (
        "clear_street_trades_mufg_upload:data_ready:"
        "2026-07-06:slack:release"
    )
    assert message["channel_id"] == "CPOSITIONS"
    assert message["channel_name"] == "#helios-alerts-positions-trades"
    assert message["dataset"] == "clear_street_trades_mufg_upload"
    assert message["message_text"] == (
        "Clear Street MUFG trade file uploaded for 2026-07-06: "
        "74 rows in Helios_Transactions_20260706_filtered.csv. "
        f"Uploaded: {uploaded_at_display}."
    )
    assert message["payload"]["rows_uploaded"] == 74
    assert message["payload"]["expected_trade_date_from_sftp"] == "20260706"
    assert message["payload"]["sftp_date_from_sql"] == "20260705"
    assert message["payload"]["sql_extract_sftp_date_mismatch"] is True
    assert message["payload"]["trade_status_counts"] == {"ok": 74}
    assert message["message_blocks"][1]["fields"] == [
        {"type": "mrkdwn", "text": "*Trade date*\n2026-07-06"},
        {"type": "mrkdwn", "text": "*Rows uploaded*\n74"},
        {
            "type": "mrkdwn",
            "text": "*File*\n`Helios_Transactions_20260706_filtered.csv`",
        },
        {"type": "mrkdwn", "text": f"*Uploaded*\n{uploaded_at_display}"},
    ]


def test_clear_street_mufg_product_code_nulls_slack_uses_positions_channel(
    monkeypatch,
):
    monkeypatch.setattr(
        slack_notifications.credentials,
        "SLACK_POSITIONS_TRADES_ALERTS_CHANNEL_ID",
        "CPOSITIONS",
    )
    monkeypatch.setattr(
        slack_notifications.credentials,
        "SLACK_POSITIONS_TRADES_ALERTS_CHANNEL_NAME",
        "#helios-alerts-positions-trades",
    )

    message = slack_notifications.build_clear_street_mufg_product_code_nulls_slack(
        summary={
            "target_table": "mufg_sftp.clear_street_trades",
            "source_table": "clear_street.eod_transactions",
            "expected_trade_date_from_sftp": "20260706",
            "rows_exported": 74,
            "rows_uploaded": 74,
            "filename": "Helios_Transactions_20260706_filtered.csv",
            "remote_dir": "/",
            "remote_path": "/Helios_Transactions_20260706_filtered.csv",
            "sql_filename": "clear_street_trades/mufg/latest.sql",
            "product_code_null_check": {
                "criteria": (
                    "product_code_grouping is blank/null and "
                    "product_code_region is blank/null and at least one of "
                    "ice_product_code, cme_product_code, or bbg_product_code "
                    "is blank/null"
                ),
                "overall_null_counts": {
                    "product_code_grouping": 4,
                    "product_code_region": 4,
                    "ice_product_code": 2,
                    "cme_product_code": 12,
                    "bbg_product_code": 16,
                },
                "null_counts": {
                    "product_code_grouping": 2,
                    "product_code_region": 2,
                    "ice_product_code": 2,
                    "cme_product_code": 1,
                    "bbg_product_code": 0,
                },
                "null_columns": [
                    "product_code_grouping",
                    "product_code_region",
                    "ice_product_code",
                    "cme_product_code",
                ],
                "null_rows": 2,
                "has_nulls": True,
                "missing_columns": [],
                "affected_products": [
                    {
                        "product": "ALQ-Algonquin Citygates Basis Future",
                        "row_count": 2,
                        "source_fields": {
                            "security_description": (
                                "ALQ-Algonquin Citygates Basis Future"
                            ),
                            "futures_code": "H9",
                            "exch_comm_cd": "ALQ",
                            "exchange_name": "IPE",
                        },
                        "contract_year_months": ["202611"],
                        "put_calls": [],
                        "trade_statuses": ["New"],
                    }
                ],
                "affected_product_count": 1,
            },
        },
    )

    assert message["notification_key"] == (
        "clear_street_trades_mufg_upload:product_code_nulls:"
        "2026-07-06:slack:warning"
    )
    assert message["channel_id"] == "CPOSITIONS"
    assert message["channel_name"] == "#helios-alerts-positions-trades"
    assert message["dataset"] == "clear_street_trades_mufg_upload"
    assert message["message_text"] == (
        "Clear Street MUFG product mapping needs review for 2026-07-06: "
        "2 affected rows across 1 source product in "
        "Helios_Transactions_20260706_filtered.csv."
    )
    assert message["payload"]["product_code_null_rows"] == 2
    assert message["payload"]["product_code_null_counts"] == {
        "product_code_grouping": 2,
        "product_code_region": 2,
        "ice_product_code": 2,
        "cme_product_code": 1,
    }
    assert message["payload"]["product_code_affected_product_count"] == 1
    assert message["payload"]["product_code_affected_products"] == [
        {
            "product": "ALQ-Algonquin Citygates Basis Future",
            "row_count": 2,
            "source_fields": {
                "security_description": "ALQ-Algonquin Citygates Basis Future",
                "futures_code": "H9",
                "exch_comm_cd": "ALQ",
                "exchange_name": "IPE",
            },
            "contract_year_months": ["202611"],
            "put_calls": [],
            "trade_statuses": ["New"],
        }
    ]
    assert message["payload"]["product_code_null_columns"] == [
        "product_code_grouping",
        "product_code_region",
        "ice_product_code",
        "cme_product_code",
    ]
    assert message["payload"]["product_code_overall_null_counts"] == {
        "product_code_grouping": 4,
        "product_code_region": 4,
        "ice_product_code": 2,
        "cme_product_code": 12,
        "bbg_product_code": 16,
    }
    assert message["message_blocks"][1]["fields"] == [
        {"type": "mrkdwn", "text": "*Trade date*\n2026-07-06"},
        {"type": "mrkdwn", "text": "*Rows affected*\n2"},
        {"type": "mrkdwn", "text": "*Products affected*\n1"},
        {
            "type": "mrkdwn",
            "text": "*File*\n`Helios_Transactions_20260706_filtered.csv`",
        },
    ]
    assert "`ALQ-Algonquin Citygates Basis Future`: 2 rows" in message[
        "message_blocks"
    ][2]["text"]["text"]
    assert "futures `H9`" in message["message_blocks"][2]["text"]["text"]
    assert "Add or fix the product alias/catalog rule" in message[
        "message_blocks"
    ][3]["text"]["text"]
    visible_text = str(message["message_blocks"])
    assert "Criteria" not in visible_text
    assert "Null counts by field" not in visible_text
    assert "product_code_grouping is blank/null" not in visible_text
    assert "`product_code_grouping`: 2" not in visible_text


def test_clear_street_mufg_upload_failure_slack_uses_positions_channel(
    monkeypatch,
):
    monkeypatch.setattr(
        slack_notifications.credentials,
        "SLACK_POSITIONS_TRADES_ALERTS_CHANNEL_ID",
        "CPOSITIONS",
    )
    monkeypatch.setattr(
        slack_notifications.credentials,
        "SLACK_POSITIONS_TRADES_ALERTS_CHANNEL_NAME",
        "#helios-alerts-positions-trades",
    )

    message = slack_notifications.build_clear_street_mufg_upload_failure_slack(
        summary={
            "target_table": "mufg_sftp.clear_street_trades",
            "source_table": "clear_street.eod_transactions",
            "expected_trade_date_from_sftp": "20260706",
            "filename": "Helios_Transactions_20260706_filtered.csv",
            "remote_dir": "/",
            "sql_filename": "clear_street_trades/mufg/latest.sql",
        },
        error_type="RuntimeError",
        error_message="SFTP unavailable",
    )

    assert message["notification_key"] == (
        "clear_street_trades_mufg_upload:data_failed:"
        "2026-07-06:slack:failure"
    )
    assert message["channel_id"] == "CPOSITIONS"
    assert message["message_text"] == (
        "Clear Street MUFG trade upload failed for 2026-07-06: "
        "RuntimeError - SFTP unavailable"
    )
    assert message["payload"]["error_type"] == "RuntimeError"
    assert message["payload"]["trade_date"] == "2026-07-06"
    assert message["message_blocks"][1]["fields"] == [
        {"type": "mrkdwn", "text": "*Trade date*\n2026-07-06"},
        {"type": "mrkdwn", "text": "*Error type*\n`RuntimeError`"},
        {
            "type": "mrkdwn",
            "text": "*Error*\nSFTP unavailable",
        },
        {
            "type": "mrkdwn",
            "text": "*File*\n`Helios_Transactions_20260706_filtered.csv`",
        },
    ]


def test_enqueue_slack_notification_is_idempotent(monkeypatch):
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
                "channel_id": params[1],
                "status": "pending",
                "attempts": 0,
                "max_attempts": 6,
                "created": False,
            }
        ]

    monkeypatch.setattr(slack_notifications.db, "execute_sql", fake_execute_sql)

    row = slack_notifications.enqueue_slack_notification(
        notification_key="event-1:slack:release",
        channel_id="C123",
        channel_name="#alerts",
        message_text="Message",
        dataset="pjm_da_hrl_lmps",
        source_event_key="event-1",
        source_event_id=10,
        payload={"report_url": "https://example.test"},
        database="stage_db",
    )

    assert row["created"] is False
    assert "ON CONFLICT (notification_key, channel_id) DO NOTHING" in captured["query"]
    assert captured["database"] == "stage_db"
    assert captured["fetch"] is True
    assert captured["params"][0] == "event-1:slack:release"
    assert captured["params"][1] == "C123"


def test_send_due_slack_notifications_skips_when_disabled(monkeypatch):
    claimed = False

    def fake_claim_due_notifications(**_kwargs):
        nonlocal claimed
        claimed = True
        return []

    monkeypatch.setattr(
        slack_notifications.credentials,
        "HELIOS_SLACK_NOTIFICATIONS_ENABLED",
        False,
    )
    monkeypatch.setattr(
        slack_notifications,
        "_claim_due_notifications",
        fake_claim_due_notifications,
    )

    assert slack_notifications.send_due_slack_notifications(database="stage_db") == []
    assert claimed is False


def test_send_due_slack_notifications_marks_failed_for_retry(monkeypatch):
    now = datetime(2026, 7, 1, tzinfo=timezone.utc)
    calls: list[dict[str, object]] = []

    monkeypatch.setattr(
        slack_notifications.credentials,
        "HELIOS_SLACK_NOTIFICATIONS_ENABLED",
        True,
    )
    monkeypatch.setattr(
        slack_notifications,
        "_claim_due_notifications",
        lambda **_kwargs: [
            {
                "id": 7,
                "notification_key": "event-1:slack:release",
                "channel_id": "C123",
                "message_text": "Message",
                "message_blocks": None,
                "attempts": 1,
                "max_attempts": 6,
            }
        ],
    )
    monkeypatch.setattr(
        slack_notifications,
        "send_slack_message",
        lambda **_kwargs: (_ for _ in ()).throw(RuntimeError("provider down")),
    )

    def fake_mark_failed(**kwargs):
        calls.append(kwargs)
        return {
            "id": kwargs["notification_id"],
            "notification_key": "event-1:slack:release",
            "channel_id": "C123",
            "status": "failed",
            "attempts": kwargs["attempts"],
        }

    monkeypatch.setattr(slack_notifications, "_mark_notification_failed", fake_mark_failed)

    results = slack_notifications.send_due_slack_notifications(
        database="stage_db",
        now=now,
    )

    assert results[0]["status"] == "failed"
    assert calls[0]["notification_id"] == 7
    assert calls[0]["attempts"] == 1
    assert calls[0]["max_attempts"] == 6
    assert calls[0]["error_type"] == "RuntimeError"
    assert calls[0]["database"] == "stage_db"


def test_send_slack_message_uses_bot_token(monkeypatch):
    captured: dict[str, object] = {}

    class FakeResponse:
        status_code = 200
        text = '{"ok": true}'

        def json(self):
            return {"ok": True, "ts": "123.456", "channel": "C123"}

    def fake_post(url, headers=None, json=None, timeout=None):
        captured["url"] = url
        captured["headers"] = headers
        captured["json"] = json
        captured["timeout"] = timeout
        return FakeResponse()

    monkeypatch.setattr(slack_notifications.credentials, "SLACK_BOT_TOKEN", "xoxb-test")
    monkeypatch.setattr(slack_notifications.requests, "post", fake_post)

    result = slack_notifications.send_slack_message(
        channel_id="C123",
        message_text="Message",
        timeout_seconds=5,
    )

    assert captured["url"] == slack_notifications.SLACK_POST_MESSAGE_URL
    assert captured["headers"]["Authorization"] == "Bearer xoxb-test"
    assert captured["json"] == {
        "channel": "C123",
        "text": "Message",
        "unfurl_links": False,
        "unfurl_media": False,
    }
    assert captured["timeout"] == 5
    assert result == {
        "provider": "slack_chat_post_message",
        "provider_message_id": "123.456",
        "provider_channel_id": "C123",
    }
