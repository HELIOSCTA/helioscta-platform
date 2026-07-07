from __future__ import annotations

import json
import logging
import re
from datetime import datetime, timedelta, timezone
from typing import Any
from urllib.parse import urlencode

import requests

from backend import credentials
from backend.utils import db

logger = logging.getLogger(__name__)

SLACK_POST_MESSAGE_URL = "https://slack.com/api/chat.postMessage"
DEFAULT_PJM_DA_HRL_LMP_HUB = "WESTERN HUB"
DEFAULT_PJM_DA_HRL_LMP_COMPONENT = "all"
DEFAULT_PJM_RT_HRL_LMP_HUB = "WESTERN HUB"
DEFAULT_PJM_RT_HRL_LMP_COMPONENT = "all"
PJM_DA_HRL_LMP_SOURCE_LABEL = "PJM Data Miner 2"
PJM_DA_HRL_LMP_SOURCE_FEED = "da_hrl_lmps"
PJM_DA_HRL_LMP_SOURCE_URL = "https://dataminer2.pjm.com/feed/da_hrl_lmps/definition"
PJM_RT_HRL_LMP_SOURCE_LABEL = "PJM Data Miner 2"
PJM_RT_HRL_LMP_SOURCE_FEED = "rt_hrl_lmps"
PJM_RT_HRL_LMP_SOURCE_URL = "https://dataminer2.pjm.com/feed/rt_hrl_lmps/definition"
PJM_RT_FIVEMIN_HRL_LMP_SOURCE_LABEL = "PJM Data Miner 2"
PJM_RT_FIVEMIN_HRL_LMP_SOURCE_FEED = "rt_fivemin_hrl_lmps"
PJM_RT_FIVEMIN_HRL_LMP_SOURCE_URL = (
    "https://dataminer2.pjm.com/feed/rt_fivemin_hrl_lmps/definition"
)
PJM_DA_RESERVE_MARKET_RESULTS_SOURCE_LABEL = "PJM Data Miner 2"
PJM_DA_RESERVE_MARKET_RESULTS_SOURCE_FEED = "da_reserve_market_results"
PJM_DA_RESERVE_MARKET_RESULTS_SOURCE_URL = (
    "https://dataminer2.pjm.com/feed/da_reserve_market_results/definition"
)
CLEAR_STREET_EOD_TRANSACTIONS_DATASET = "clear_street_eod_transactions"
CLEAR_STREET_EOD_TRANSACTIONS_SOURCE_LABEL = "Clear Street SFTP"
CLEAR_STREET_EOD_TRANSACTIONS_SOURCE_FEED = "Helios_Transactions"
CLEAR_STREET_MUFG_UPLOAD_DATASET = "clear_street_trades_mufg_upload"
CLEAR_STREET_MUFG_UPLOAD_SOURCE_LABEL = "MUFG SFTP"
CLEAR_STREET_MUFG_UPLOAD_SOURCE_FEED = "clear_street_trades"
MAX_ERROR_MESSAGE_LENGTH = 2000


def notifications_enabled() -> bool:
    return credentials.HELIOS_SLACK_NOTIFICATIONS_ENABLED


def default_channel_id() -> str | None:
    channel_id = credentials.SLACK_DEFAULT_CHANNEL_ID
    if channel_id and channel_id[:1] in {"C", "G", "D"}:
        return channel_id
    return credentials.SLACK_DEFAULT_CHANNEL_NAME


def power_alerts_channel_id() -> str | None:
    return credentials.SLACK_POWER_ALERTS_CHANNEL_ID or default_channel_id()


def positions_trades_alerts_channel_id() -> str | None:
    return credentials.SLACK_POSITIONS_TRADES_ALERTS_CHANNEL_ID or default_channel_id()


def build_pjm_da_hrl_lmp_report_url(
    *,
    business_date: str,
    hub: str = DEFAULT_PJM_DA_HRL_LMP_HUB,
    component: str = DEFAULT_PJM_DA_HRL_LMP_COMPONENT,
    base_url: str | None = None,
) -> str:
    params = urlencode(
        {
            "section": "pjm-da-lmps",
            "view": "single-day",
            "product": "da",
            "date": business_date,
            "hub": hub,
            "component": component,
            "refresh": "1",
        }
    )
    root = (base_url or credentials.HELIOS_EMAIL_FRONTEND_BASE_URL).rstrip("/")
    return f"{root}/?{params}"


def build_pjm_rt_hrl_lmp_report_url(
    *,
    business_date: str,
    hub: str = DEFAULT_PJM_RT_HRL_LMP_HUB,
    component: str = DEFAULT_PJM_RT_HRL_LMP_COMPONENT,
    base_url: str | None = None,
) -> str:
    params = urlencode(
        {
            "section": "pjm-da-lmps",
            "view": "single-day",
            "product": "rt",
            "source": "verified",
            "date": business_date,
            "hub": hub,
            "component": component,
            "refresh": "1",
        }
    )
    root = (base_url or credentials.HELIOS_EMAIL_FRONTEND_BASE_URL).rstrip("/")
    return f"{root}/?{params}"


def build_pjm_da_hrl_lmp_release_slack(
    *,
    event: dict[str, Any],
    base_url: str | None = None,
    hub: str = DEFAULT_PJM_DA_HRL_LMP_HUB,
    channel_id: str | None = None,
    channel_name: str | None = None,
) -> dict[str, Any]:
    event_key = str(event["event_key"])
    business_date = _business_date_from_event(event)
    report_url = build_pjm_da_hrl_lmp_report_url(
        business_date=business_date,
        hub=hub,
        base_url=base_url,
    )
    return _build_pjm_lmp_release_slack(
        event_key=event_key,
        event_id=event.get("id"),
        business_date=business_date,
        title="PJM DA HRL LMPs Available",
        sentence=f"PJM DA hourly LMPs are available for {business_date}.",
        dataset="pjm_da_hrl_lmps",
        dataset_label="Day-ahead hourly LMPs",
        source_label=PJM_DA_HRL_LMP_SOURCE_LABEL,
        source_feed=PJM_DA_HRL_LMP_SOURCE_FEED,
        source_url=PJM_DA_HRL_LMP_SOURCE_URL,
        report_url=report_url,
        channel_id=channel_id,
        channel_name=channel_name,
        payload={
            "business_date": business_date,
            "report_url": report_url,
            "hub": hub,
            "component": DEFAULT_PJM_DA_HRL_LMP_COMPONENT,
            "source_system": PJM_DA_HRL_LMP_SOURCE_LABEL,
            "source_feed": PJM_DA_HRL_LMP_SOURCE_FEED,
            "source_url": PJM_DA_HRL_LMP_SOURCE_URL,
        },
    )


def build_pjm_rt_hrl_lmp_release_slack(
    *,
    event: dict[str, Any],
    base_url: str | None = None,
    hub: str = DEFAULT_PJM_RT_HRL_LMP_HUB,
    channel_id: str | None = None,
    channel_name: str | None = None,
) -> dict[str, Any]:
    event_key = str(event["event_key"])
    business_date = _business_date_from_event(event)
    report_url = build_pjm_rt_hrl_lmp_report_url(
        business_date=business_date,
        hub=hub,
        base_url=base_url,
    )
    return _build_pjm_lmp_release_slack(
        event_key=event_key,
        event_id=event.get("id"),
        business_date=business_date,
        title="PJM RT HRL LMPs Available",
        sentence=f"PJM verified RT hourly LMPs are available for {business_date}.",
        dataset="pjm_rt_hrl_lmps",
        dataset_label="Verified RT hourly LMPs",
        source_label=PJM_RT_HRL_LMP_SOURCE_LABEL,
        source_feed=PJM_RT_HRL_LMP_SOURCE_FEED,
        source_url=PJM_RT_HRL_LMP_SOURCE_URL,
        report_url=report_url,
        channel_id=channel_id,
        channel_name=channel_name,
        payload={
            "business_date": business_date,
            "report_url": report_url,
            "hub": hub,
            "component": DEFAULT_PJM_RT_HRL_LMP_COMPONENT,
            "rt_source": "verified",
            "source_system": PJM_RT_HRL_LMP_SOURCE_LABEL,
            "source_feed": PJM_RT_HRL_LMP_SOURCE_FEED,
            "source_url": PJM_RT_HRL_LMP_SOURCE_URL,
        },
    )


def build_pjm_rt_fivemin_hrl_lmp_release_slack(
    *,
    event: dict[str, Any],
    channel_id: str | None = None,
    channel_name: str | None = None,
) -> dict[str, Any]:
    event_key = str(event["event_key"])
    business_date = _business_date_from_event(event)
    return _build_pjm_lmp_release_slack(
        event_key=event_key,
        event_id=event.get("id"),
        business_date=business_date,
        title="PJM RT 5-Min HRL LMPs Available",
        sentence=(
            f"PJM verified RT five-minute LMPs are available for {business_date}."
        ),
        dataset="pjm_rt_fivemin_hrl_lmps",
        dataset_label="Verified RT five-minute LMPs",
        source_label=PJM_RT_FIVEMIN_HRL_LMP_SOURCE_LABEL,
        source_feed=PJM_RT_FIVEMIN_HRL_LMP_SOURCE_FEED,
        source_url=PJM_RT_FIVEMIN_HRL_LMP_SOURCE_URL,
        channel_id=channel_id,
        channel_name=channel_name,
        payload={
            "business_date": business_date,
            "source_system": PJM_RT_FIVEMIN_HRL_LMP_SOURCE_LABEL,
            "source_feed": PJM_RT_FIVEMIN_HRL_LMP_SOURCE_FEED,
            "source_url": PJM_RT_FIVEMIN_HRL_LMP_SOURCE_URL,
            "pricing_node_scope": "hub_zone_interface",
            "interval_minutes": 5,
        },
    )


def build_pjm_da_reserve_market_results_release_slack(
    *,
    event: dict[str, Any],
    channel_id: str | None = None,
    channel_name: str | None = None,
) -> dict[str, Any]:
    event_key = str(event["event_key"])
    business_date = _business_date_from_event(event)
    return _build_pjm_lmp_release_slack(
        event_key=event_key,
        event_id=event.get("id"),
        business_date=business_date,
        title="PJM DA Reserve Market Results Available",
        sentence=(
            f"PJM DA reserve market results are available for {business_date}."
        ),
        dataset="pjm_da_reserve_market_results",
        dataset_label="Day-ahead reserve market results",
        source_label=PJM_DA_RESERVE_MARKET_RESULTS_SOURCE_LABEL,
        source_feed=PJM_DA_RESERVE_MARKET_RESULTS_SOURCE_FEED,
        source_url=PJM_DA_RESERVE_MARKET_RESULTS_SOURCE_URL,
        channel_id=channel_id,
        channel_name=channel_name,
        payload={
            "business_date": business_date,
            "source_system": PJM_DA_RESERVE_MARKET_RESULTS_SOURCE_LABEL,
            "source_feed": PJM_DA_RESERVE_MARKET_RESULTS_SOURCE_FEED,
            "source_url": PJM_DA_RESERVE_MARKET_RESULTS_SOURCE_URL,
            "scope": "locale_service",
        },
    )


def build_clear_street_eod_transactions_slack(
    *,
    summary: dict[str, Any],
    channel_id: str | None = None,
    channel_name: str | None = None,
) -> dict[str, Any]:
    """Build a Slack outbox payload for a successful Clear Street EOD pull."""
    target_table = str(summary.get("target_table") or "clear_street.eod_transactions")
    latest_trade_file = _latest_clear_street_trade_file(summary)
    latest_file_rows = latest_trade_file.get("rows_processed")
    rows_processed = int(
        latest_file_rows
        if latest_file_rows is not None
        else summary.get("rows_processed", 0) or 0
    )
    source_filename = str(
        latest_trade_file.get("remote_filename")
        or latest_trade_file.get("local_filename")
        or "unknown"
    )
    latest_trade_date = _format_yyyymmdd_date(
        latest_trade_file.get("trade_date_from_sftp")
        or summary.get("max_trade_date_from_sftp")
    )
    latest_upload = _coerce_utc_datetime(
        latest_trade_file.get("sftp_upload_timestamp")
        or summary.get("latest_sftp_upload_timestamp")
    )
    latest_upload_display = _format_machine_local_datetime(latest_upload)
    upload_key = latest_upload.strftime("%Y%m%dT%H%M%SZ")
    event_key = (
        f"{CLEAR_STREET_EOD_TRANSACTIONS_DATASET}:data_ready:"
        f"{latest_trade_date}:{upload_key}"
    )

    message_text = (
        "Clear Street EOD trade file loaded for "
        f"{latest_trade_date}: {rows_processed:,} rows from "
        f"{source_filename}. SFTP upload: {latest_upload_display}."
    )

    message_blocks = [
        {
            "type": "header",
            "text": {
                "type": "plain_text",
                "text": "Clear Street EOD Transactions Loaded",
                "emoji": True,
            },
        },
        {
            "type": "section",
            "fields": [
                {
                    "type": "mrkdwn",
                    "text": f"*Trade date*\n{latest_trade_date}",
                },
                {
                    "type": "mrkdwn",
                    "text": f"*Rows loaded*\n{rows_processed:,}",
                },
                {
                    "type": "mrkdwn",
                    "text": f"*Source file*\n`{source_filename}`",
                },
                {
                    "type": "mrkdwn",
                    "text": f"*SFTP upload*\n{latest_upload_display}",
                },
            ],
        },
        {
            "type": "context",
            "elements": [
                {
                    "type": "mrkdwn",
                    "text": (
                        "Source: "
                        f"{CLEAR_STREET_EOD_TRANSACTIONS_SOURCE_LABEL} "
                        f"`{CLEAR_STREET_EOD_TRANSACTIONS_SOURCE_FEED}`"
                    ),
                }
            ],
        },
    ]

    payload = {
        "dataset": CLEAR_STREET_EOD_TRANSACTIONS_DATASET,
        "target_table": target_table,
        "latest_trade_date": latest_trade_date,
        "latest_sftp_upload_timestamp": latest_upload.isoformat(),
        "latest_sftp_upload_timestamp_local": (
            latest_upload.astimezone().isoformat()
        ),
        "source_filename": source_filename,
        "local_filename": latest_trade_file.get("local_filename"),
        "rows_processed": rows_processed,
        "run_rows_processed": int(summary.get("rows_processed", 0) or 0),
        "files_processed": int(summary.get("files_processed", 0) or 0),
        "files_downloaded": int(summary.get("files_downloaded", 0) or 0),
        "lookback_days": int(summary.get("lookback_days", 0) or 0),
        "source_system": CLEAR_STREET_EOD_TRANSACTIONS_SOURCE_LABEL,
        "source_feed": CLEAR_STREET_EOD_TRANSACTIONS_SOURCE_FEED,
    }

    return {
        "notification_key": f"{event_key}:slack:release",
        "channel_id": channel_id or positions_trades_alerts_channel_id(),
        "channel_name": (
            channel_name or credentials.SLACK_POSITIONS_TRADES_ALERTS_CHANNEL_NAME
        ),
        "message_text": message_text,
        "message_blocks": message_blocks,
        "dataset": CLEAR_STREET_EOD_TRANSACTIONS_DATASET,
        "source_event_key": event_key,
        "source_event_id": None,
        "payload": payload,
    }


def build_clear_street_eod_transactions_timeout_slack(
    *,
    target_trade_date: str,
    window_start_at: datetime,
    window_end_at: datetime,
    poll_count: int,
    poll_wait_seconds: int,
    channel_id: str | None = None,
    channel_name: str | None = None,
) -> dict[str, Any]:
    """Build a Slack outbox payload for a missing Clear Street EOD file."""
    target_trade_date_display = _format_yyyymmdd_date(target_trade_date)
    window_start_display = _format_local_datetime(window_start_at)
    window_end_display = _format_local_datetime(window_end_at)
    event_key = (
        f"{CLEAR_STREET_EOD_TRANSACTIONS_DATASET}:data_missing:"
        f"{target_trade_date_display}"
    )
    message_text = (
        "Clear Street EOD transactions were not available for "
        f"{target_trade_date_display} by {window_end_display} after "
        f"{poll_count:,} poll attempt(s)."
    )
    message_blocks = [
        {
            "type": "header",
            "text": {
                "type": "plain_text",
                "text": "Clear Street EOD Transactions Missing",
                "emoji": True,
            },
        },
        {
            "type": "section",
            "fields": [
                {
                    "type": "mrkdwn",
                    "text": f"*Target trade date*\n{target_trade_date_display}",
                },
                {
                    "type": "mrkdwn",
                    "text": f"*Poll attempts*\n{poll_count:,}",
                },
                {
                    "type": "mrkdwn",
                    "text": f"*Window start*\n{window_start_display}",
                },
                {
                    "type": "mrkdwn",
                    "text": f"*Window end*\n{window_end_display}",
                },
                {
                    "type": "mrkdwn",
                    "text": f"*Poll cadence*\n{poll_wait_seconds:,} seconds",
                },
            ],
        },
        {
            "type": "context",
            "elements": [
                {
                    "type": "mrkdwn",
                    "text": (
                        "Source: "
                        f"{CLEAR_STREET_EOD_TRANSACTIONS_SOURCE_LABEL} "
                        f"`{CLEAR_STREET_EOD_TRANSACTIONS_SOURCE_FEED}`"
                    ),
                }
            ],
        },
    ]
    payload = {
        "dataset": CLEAR_STREET_EOD_TRANSACTIONS_DATASET,
        "target_table": "clear_street.eod_transactions",
        "target_trade_date": target_trade_date_display,
        "window_start_at": window_start_at.isoformat(),
        "window_end_at": window_end_at.isoformat(),
        "poll_count": poll_count,
        "poll_wait_seconds": poll_wait_seconds,
        "source_system": CLEAR_STREET_EOD_TRANSACTIONS_SOURCE_LABEL,
        "source_feed": CLEAR_STREET_EOD_TRANSACTIONS_SOURCE_FEED,
    }
    return {
        "notification_key": f"{event_key}:slack:timeout",
        "channel_id": channel_id or positions_trades_alerts_channel_id(),
        "channel_name": (
            channel_name or credentials.SLACK_POSITIONS_TRADES_ALERTS_CHANNEL_NAME
        ),
        "message_text": message_text,
        "message_blocks": message_blocks,
        "dataset": CLEAR_STREET_EOD_TRANSACTIONS_DATASET,
        "source_event_key": event_key,
        "source_event_id": None,
        "payload": payload,
    }


def build_clear_street_mufg_upload_success_slack(
    *,
    summary: dict[str, Any],
    channel_id: str | None = None,
    channel_name: str | None = None,
    now: datetime | None = None,
) -> dict[str, Any]:
    """Build a Slack outbox payload for a successful Clear Street MUFG upload."""
    trade_date = _clear_street_mufg_trade_date(summary)
    rows_uploaded = int(
        summary.get("rows_uploaded")
        or summary.get("rows_exported", 0)
        or 0
    )
    filename = str(
        summary.get("remote_filename")
        or summary.get("filename")
        or "unknown"
    )
    uploaded_at = (now or datetime.now(timezone.utc)).astimezone(timezone.utc)
    uploaded_at_display = _format_machine_local_datetime(uploaded_at)
    event_key = (
        f"{CLEAR_STREET_MUFG_UPLOAD_DATASET}:data_ready:{trade_date}"
    )
    message_text = (
        "Clear Street MUFG trade file uploaded for "
        f"{trade_date}: {rows_uploaded:,} rows in {filename}. "
        f"Uploaded: {uploaded_at_display}."
    )
    message_blocks = [
        {
            "type": "header",
            "text": {
                "type": "plain_text",
                "text": "Clear Street MUFG Upload Complete",
                "emoji": True,
            },
        },
        {
            "type": "section",
            "fields": [
                {"type": "mrkdwn", "text": f"*Trade date*\n{trade_date}"},
                {"type": "mrkdwn", "text": f"*Rows uploaded*\n{rows_uploaded:,}"},
                {"type": "mrkdwn", "text": f"*File*\n`{filename}`"},
                {"type": "mrkdwn", "text": f"*Uploaded*\n{uploaded_at_display}"},
            ],
        },
        {
            "type": "context",
            "elements": [
                {
                    "type": "mrkdwn",
                    "text": (
                        "Destination: "
                        f"{CLEAR_STREET_MUFG_UPLOAD_SOURCE_LABEL} "
                        f"`{CLEAR_STREET_MUFG_UPLOAD_SOURCE_FEED}`"
                    ),
                }
            ],
        },
    ]
    payload = {
        "dataset": CLEAR_STREET_MUFG_UPLOAD_DATASET,
        "target_table": summary.get("target_table"),
        "source_table": summary.get("source_table"),
        "trade_date": trade_date,
        "rows_uploaded": rows_uploaded,
        "rows_exported": int(summary.get("rows_exported", rows_uploaded) or 0),
        "filename": filename,
        "remote_dir": summary.get("remote_dir"),
        "remote_path": summary.get("remote_path"),
        "sql_filename": summary.get("sql_filename"),
        "sftp_date": summary.get("sftp_date"),
        "sftp_date_from_sql": summary.get("sftp_date_from_sql"),
        "expected_trade_date_from_sftp": summary.get("expected_trade_date_from_sftp"),
        "sql_extract_empty": bool(summary.get("sql_extract_empty", False)),
        "sql_extract_sftp_date_mismatch": bool(
            summary.get("sql_extract_sftp_date_mismatch", False)
        ),
        "uploaded_at": uploaded_at.isoformat(),
        "uploaded_at_local": uploaded_at.astimezone().isoformat(),
        "source_system": CLEAR_STREET_MUFG_UPLOAD_SOURCE_LABEL,
        "source_feed": CLEAR_STREET_MUFG_UPLOAD_SOURCE_FEED,
        "trade_status_counts": summary.get("trade_status_counts", {}),
        "non_ok_trade_status_rows": int(
            summary.get("non_ok_trade_status_rows", 0) or 0
        ),
    }
    return {
        "notification_key": f"{event_key}:slack:release",
        "channel_id": channel_id or positions_trades_alerts_channel_id(),
        "channel_name": (
            channel_name or credentials.SLACK_POSITIONS_TRADES_ALERTS_CHANNEL_NAME
        ),
        "message_text": message_text,
        "message_blocks": message_blocks,
        "dataset": CLEAR_STREET_MUFG_UPLOAD_DATASET,
        "source_event_key": event_key,
        "source_event_id": None,
        "payload": payload,
    }


def build_clear_street_mufg_upload_failure_slack(
    *,
    summary: dict[str, Any],
    error_type: str,
    error_message: str,
    channel_id: str | None = None,
    channel_name: str | None = None,
) -> dict[str, Any]:
    """Build a Slack outbox payload for a failed Clear Street MUFG upload."""
    trade_date = _clear_street_mufg_trade_date(summary)
    filename = summary.get("remote_filename") or summary.get("filename")
    short_error = _truncate_slack_text(error_message, max_length=400)
    event_key = (
        f"{CLEAR_STREET_MUFG_UPLOAD_DATASET}:data_failed:{trade_date}"
    )
    message_text = (
        "Clear Street MUFG trade upload failed for "
        f"{trade_date}: {error_type} - {short_error}"
    )
    fields = [
        {"type": "mrkdwn", "text": f"*Trade date*\n{trade_date}"},
        {"type": "mrkdwn", "text": f"*Error type*\n`{error_type}`"},
        {"type": "mrkdwn", "text": f"*Error*\n{short_error}"},
    ]
    if filename:
        fields.append({"type": "mrkdwn", "text": f"*File*\n`{filename}`"})

    message_blocks = [
        {
            "type": "header",
            "text": {
                "type": "plain_text",
                "text": "Clear Street MUFG Upload Failed",
                "emoji": True,
            },
        },
        {"type": "section", "fields": fields},
        {
            "type": "context",
            "elements": [
                {
                    "type": "mrkdwn",
                    "text": (
                        "Destination: "
                        f"{CLEAR_STREET_MUFG_UPLOAD_SOURCE_LABEL} "
                        f"`{CLEAR_STREET_MUFG_UPLOAD_SOURCE_FEED}`"
                    ),
                }
            ],
        },
    ]
    payload = {
        "dataset": CLEAR_STREET_MUFG_UPLOAD_DATASET,
        "target_table": summary.get("target_table"),
        "source_table": summary.get("source_table"),
        "trade_date": trade_date,
        "filename": filename,
        "remote_dir": summary.get("remote_dir"),
        "remote_path": summary.get("remote_path"),
        "sql_filename": summary.get("sql_filename"),
        "sftp_date": summary.get("sftp_date"),
        "sftp_date_from_sql": summary.get("sftp_date_from_sql"),
        "expected_trade_date_from_sftp": summary.get("expected_trade_date_from_sftp"),
        "sql_extract_empty": bool(summary.get("sql_extract_empty", False)),
        "sql_extract_sftp_date_mismatch": bool(
            summary.get("sql_extract_sftp_date_mismatch", False)
        ),
        "rows_exported": int(summary.get("rows_exported", 0) or 0),
        "error_type": error_type,
        "error_message": error_message,
        "source_system": CLEAR_STREET_MUFG_UPLOAD_SOURCE_LABEL,
        "source_feed": CLEAR_STREET_MUFG_UPLOAD_SOURCE_FEED,
    }
    return {
        "notification_key": f"{event_key}:slack:failure",
        "channel_id": channel_id or positions_trades_alerts_channel_id(),
        "channel_name": (
            channel_name or credentials.SLACK_POSITIONS_TRADES_ALERTS_CHANNEL_NAME
        ),
        "message_text": message_text,
        "message_blocks": message_blocks,
        "dataset": CLEAR_STREET_MUFG_UPLOAD_DATASET,
        "source_event_key": event_key,
        "source_event_id": None,
        "payload": payload,
    }


def _build_pjm_lmp_release_slack(
    *,
    event_key: str,
    event_id: int | None,
    business_date: str,
    title: str,
    sentence: str,
    dataset: str,
    dataset_label: str,
    source_label: str,
    source_feed: str,
    source_url: str,
    payload: dict[str, Any],
    report_url: str | None = None,
    channel_id: str | None = None,
    channel_name: str | None = None,
) -> dict[str, Any]:
    message_text = sentence
    if report_url:
        message_text += f" Open report: {report_url}"
    message_text += f"\nSource: {source_label} - {source_feed} ({source_url})"

    action_elements = []
    if report_url:
        action_elements.append(
            {
                "type": "button",
                "text": {
                    "type": "plain_text",
                    "text": "Open report",
                    "emoji": True,
                },
                "url": report_url,
                "style": "primary",
            }
        )
    action_elements.append(
        {
            "type": "button",
            "text": {
                "type": "plain_text",
                "text": "PJM source",
                "emoji": True,
            },
            "url": source_url,
        }
    )

    message_blocks = [
        {
            "type": "header",
            "text": {
                "type": "plain_text",
                "text": title,
                "emoji": True,
            },
        },
        {
            "type": "section",
            "fields": [
                {"type": "mrkdwn", "text": f"*Market date*\n{business_date}"},
                {"type": "mrkdwn", "text": f"*Dataset*\n{dataset_label}"},
                {
                    "type": "mrkdwn",
                    "text": (
                        "*Data source*\n"
                        f"<{source_url}|"
                        f"{source_label} - "
                        f"{source_feed}>"
                    ),
                },
            ],
        },
        {
            "type": "actions",
            "elements": action_elements,
        },
        {
            "type": "context",
            "elements": [
                {
                    "type": "mrkdwn",
                    "text": (
                        "Source definition: "
                        f"<{source_url}|"
                        f"{source_label} "
                        f"`{source_feed}`>"
                    ),
                }
            ],
        },
    ]
    return {
        "notification_key": f"{event_key}:slack:release",
        "channel_id": channel_id or power_alerts_channel_id(),
        "channel_name": channel_name or credentials.SLACK_POWER_ALERTS_CHANNEL_NAME,
        "message_text": message_text,
        "message_blocks": message_blocks,
        "dataset": dataset,
        "source_event_key": event_key,
        "source_event_id": event_id,
        "payload": payload,
    }


def enqueue_slack_notification(
    *,
    notification_key: str,
    message_text: str,
    channel_id: str | None = None,
    channel_name: str | None = None,
    message_blocks: list[dict[str, Any]] | None = None,
    dataset: str | None = None,
    source_event_key: str | None = None,
    source_event_id: int | None = None,
    payload: dict[str, Any] | None = None,
    max_attempts: int | None = None,
    database: str | None = None,
) -> dict[str, Any]:
    channel_id = (channel_id or default_channel_id() or "").strip()
    if not channel_id:
        raise RuntimeError("Missing required Slack channel id/name")

    message_text = message_text.strip()
    if not message_text:
        raise ValueError("Slack message_text cannot be empty")

    sql = """
        WITH inserted AS (
            INSERT INTO ops.slack_notification_outbox (
                notification_key,
                channel_id,
                channel_name,
                dataset,
                source_event_key,
                source_event_id,
                message_text,
                message_blocks,
                max_attempts,
                payload
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s::jsonb, %s, %s::jsonb)
            ON CONFLICT (notification_key, channel_id) DO NOTHING
            RETURNING
                id,
                notification_key,
                channel_id,
                status,
                attempts,
                max_attempts,
                TRUE AS created
        )
        SELECT
            id,
            notification_key,
            channel_id,
            status,
            attempts,
            max_attempts,
            created
        FROM inserted
        UNION ALL
        SELECT
            id,
            notification_key,
            channel_id,
            status,
            attempts,
            max_attempts,
            FALSE AS created
        FROM ops.slack_notification_outbox
        WHERE notification_key = %s
          AND channel_id = %s
          AND NOT EXISTS (SELECT 1 FROM inserted)
        LIMIT 1;
    """
    rows = db.execute_sql(
        sql,
        params=(
            notification_key,
            channel_id,
            channel_name,
            dataset,
            source_event_key,
            source_event_id,
            message_text,
            json.dumps(message_blocks) if message_blocks is not None else None,
            max_attempts or credentials.HELIOS_SLACK_MAX_ATTEMPTS,
            json.dumps(payload or {}, default=str),
            notification_key,
            channel_id,
        ),
        database=database,
        fetch=True,
    )
    if not rows:
        raise RuntimeError(
            "Failed to enqueue Slack notification "
            f"{notification_key} for {channel_id}"
        )
    return rows[0]


def send_due_slack_notifications(
    *,
    limit: int = 20,
    database: str | None = None,
    now: datetime | None = None,
) -> list[dict[str, Any]]:
    if limit <= 0:
        return []
    if not notifications_enabled():
        logger.info("Slack notifications are disabled; no outbox rows claimed")
        return []

    claimed = _claim_due_notifications(
        limit=limit,
        database=database,
        stale_sending_minutes=credentials.HELIOS_SLACK_STALE_SENDING_MINUTES,
        now=now,
    )
    results = []
    for row in claimed:
        try:
            provider_result = send_slack_message(
                channel_id=row["channel_id"],
                message_text=row["message_text"],
                message_blocks=row.get("message_blocks"),
            )
        except Exception as exc:
            failed = _mark_notification_failed(
                notification_id=row["id"],
                attempts=int(row["attempts"]),
                max_attempts=int(row["max_attempts"]),
                error_type=type(exc).__name__,
                error_message=str(exc),
                database=database,
                now=now,
            )
            results.append(failed)
            logger.warning(
                "Slack notification %s failed for %s: %s",
                row["notification_key"],
                row["channel_id"],
                exc,
            )
            continue

        sent = _mark_notification_sent(
            notification_id=row["id"],
            provider=str(provider_result.get("provider") or "slack"),
            provider_message_id=provider_result.get("provider_message_id"),
            provider_channel_id=provider_result.get("provider_channel_id"),
            database=database,
        )
        results.append(sent)
        logger.info(
            "Slack notification %s sent to %s",
            row["notification_key"],
            row["channel_id"],
        )
    return results


def send_slack_message(
    *,
    channel_id: str,
    message_text: str,
    message_blocks: list[dict[str, Any]] | None = None,
    timeout_seconds: int = 30,
    unfurl_links: bool = False,
    unfurl_media: bool = False,
) -> dict[str, str | None]:
    bot_token = credentials.SLACK_BOT_TOKEN
    if bot_token:
        payload: dict[str, Any] = {
            "channel": channel_id,
            "text": message_text,
            "unfurl_links": unfurl_links,
            "unfurl_media": unfurl_media,
        }
        if message_blocks is not None:
            payload["blocks"] = message_blocks

        response = requests.post(
            SLACK_POST_MESSAGE_URL,
            headers={
                "Authorization": f"Bearer {bot_token}",
                "Content-Type": "application/json; charset=utf-8",
            },
            json=payload,
            timeout=timeout_seconds,
        )
        if response.status_code != 200:
            raise RuntimeError(
                "Slack chat.postMessage failed with "
                f"HTTP {response.status_code}: {response.text[:500]}"
            )
        response_payload = response.json()
        if not response_payload.get("ok"):
            raise RuntimeError(
                "Slack chat.postMessage failed: "
                f"{response_payload.get('error', 'unknown_error')}"
            )
        return {
            "provider": "slack_chat_post_message",
            "provider_message_id": response_payload.get("ts"),
            "provider_channel_id": response_payload.get("channel"),
        }

    webhook_url = credentials.SLACK_DEFAULT_WEBHOOK_URL
    if webhook_url:
        payload = {
            "text": message_text,
            "unfurl_links": unfurl_links,
            "unfurl_media": unfurl_media,
        }
        if message_blocks is not None:
            payload["blocks"] = message_blocks
        response = requests.post(
            webhook_url,
            json=payload,
            timeout=timeout_seconds,
        )
        if response.status_code != 200:
            raise RuntimeError(
                "Slack webhook send failed with "
                f"HTTP {response.status_code}: {response.text[:500]}"
            )
        return {
            "provider": "slack_incoming_webhook",
            "provider_message_id": None,
            "provider_channel_id": None,
        }

    raise RuntimeError("Missing required Slack setting: SLACK_BOT_TOKEN")


def _claim_due_notifications(
    *,
    limit: int,
    database: str | None,
    stale_sending_minutes: int,
    now: datetime | None = None,
) -> list[dict[str, Any]]:
    now = now or datetime.now(timezone.utc)
    stale_cutoff = now - timedelta(minutes=stale_sending_minutes)
    connection = None
    cursor = None
    try:
        connection = db.connect(database=database)
        cursor = connection.cursor()
        cursor.execute(
            """
            WITH candidates AS (
                SELECT id
                FROM ops.slack_notification_outbox
                WHERE (
                        status IN ('pending', 'failed')
                    AND attempts < max_attempts
                    AND next_attempt_at <= now()
                )
                   OR (
                        status = 'sending'
                    AND attempts < max_attempts
                    AND updated_at <= %s
                )
                ORDER BY created_at
                LIMIT %s
                FOR UPDATE SKIP LOCKED
            )
            UPDATE ops.slack_notification_outbox AS outbox
            SET
                status = 'sending',
                attempts = outbox.attempts + 1,
                last_attempt_at = now(),
                updated_at = now()
            FROM candidates
            WHERE outbox.id = candidates.id
            RETURNING
                outbox.id,
                outbox.notification_key,
                outbox.channel_id,
                outbox.message_text,
                outbox.message_blocks,
                outbox.attempts,
                outbox.max_attempts;
            """,
            (stale_cutoff, limit),
        )
        rows = _dict_rows(cursor)
        connection.commit()
        return rows
    except Exception:
        if connection:
            connection.rollback()
        logger.exception("Failed to claim due Slack notifications")
        raise
    finally:
        if cursor:
            cursor.close()
        if connection:
            connection.close()


def _mark_notification_sent(
    *,
    notification_id: int,
    provider: str,
    provider_message_id: str | None,
    provider_channel_id: str | None,
    database: str | None,
) -> dict[str, Any]:
    rows = db.execute_sql(
        """
        UPDATE ops.slack_notification_outbox
        SET
            status = 'sent',
            sent_at = now(),
            provider = %s,
            provider_message_id = %s,
            provider_channel_id = %s,
            last_error_type = NULL,
            last_error_message = NULL,
            updated_at = now()
        WHERE id = %s
        RETURNING id, notification_key, channel_id, status, attempts;
        """,
        params=(provider, provider_message_id, provider_channel_id, notification_id),
        database=database,
        fetch=True,
    )
    return rows[0]


def _mark_notification_failed(
    *,
    notification_id: int,
    attempts: int,
    max_attempts: int,
    error_type: str,
    error_message: str,
    database: str | None,
    now: datetime | None = None,
) -> dict[str, Any]:
    now = now or datetime.now(timezone.utc)
    exhausted = attempts >= max_attempts
    status = "dead" if exhausted else "failed"
    next_attempt_at = now if exhausted else now + timedelta(
        minutes=_retry_delay_minutes(attempts)
    )
    rows = db.execute_sql(
        """
        UPDATE ops.slack_notification_outbox
        SET
            status = %s,
            next_attempt_at = %s,
            last_error_type = %s,
            last_error_message = %s,
            updated_at = now()
        WHERE id = %s
        RETURNING id, notification_key, channel_id, status, attempts;
        """,
        params=(
            status,
            next_attempt_at,
            error_type[:255],
            error_message[:MAX_ERROR_MESSAGE_LENGTH],
            notification_id,
        ),
        database=database,
        fetch=True,
    )
    return rows[0]


def _retry_delay_minutes(attempts: int) -> int:
    return min(60, 2 ** max(0, attempts - 1))


def _business_date_from_event(event: dict[str, Any]) -> str:
    payload = event.get("payload")
    if isinstance(payload, dict) and payload.get("business_date"):
        return str(payload["business_date"])
    event_key = str(event["event_key"])
    parts = event_key.split(":")
    if len(parts) >= 3 and parts[2]:
        return parts[2]
    raise ValueError(f"Cannot derive business date from event_key: {event_key}")


def _format_yyyymmdd_date(value: Any) -> str:
    if value is None:
        raise ValueError("Missing YYYYMMDD date value")
    text = str(value).strip()
    if re.fullmatch(r"\d{8}", text):
        return f"{text[:4]}-{text[4:6]}-{text[6:8]}"
    return text


def _clear_street_mufg_trade_date(summary: dict[str, Any]) -> str:
    for key in [
        "expected_trade_date_from_sftp",
        "trade_date",
        "sftp_date_from_sql",
        "sftp_date",
    ]:
        value = summary.get(key)
        if value:
            return _format_yyyymmdd_date(value)
    return "unknown"


def _truncate_slack_text(value: Any, *, max_length: int) -> str:
    text = str(value or "").strip()
    if len(text) <= max_length:
        return text
    return text[: max_length - 3].rstrip() + "..."


def _coerce_utc_datetime(value: Any) -> datetime:
    if value is None:
        raise ValueError("Missing UTC timestamp value")
    if isinstance(value, datetime):
        timestamp = value
    else:
        timestamp = datetime.fromisoformat(str(value).replace("Z", "+00:00"))

    if timestamp.tzinfo is None:
        return timestamp.replace(tzinfo=timezone.utc)
    return timestamp.astimezone(timezone.utc)


def _format_machine_local_datetime(value: datetime) -> str:
    local_value = value.astimezone()
    timezone_label = _compact_timezone_label(local_value.tzname() or "")
    if timezone_label:
        timezone_label = f" {timezone_label}"
    return local_value.strftime("%Y-%m-%d %H:%M") + timezone_label


def _compact_timezone_label(value: str) -> str:
    if " " not in value:
        return value
    abbreviation = "".join(
        word[0]
        for word in value.split()
        if word and word[0].isalpha()
    )
    if 2 <= len(abbreviation) <= 5:
        return abbreviation.upper()
    return value


def _latest_clear_street_trade_file(summary: dict[str, Any]) -> dict[str, Any]:
    latest_trade_file = summary.get("latest_trade_file")
    if isinstance(latest_trade_file, dict):
        return latest_trade_file

    source_files = summary.get("source_files")
    if isinstance(source_files, list):
        dict_files = [file for file in source_files if isinstance(file, dict)]
        if dict_files:
            return max(
                dict_files,
                key=lambda file_summary: (
                    str(file_summary.get("trade_date_from_sftp") or ""),
                    str(file_summary.get("sftp_upload_timestamp") or ""),
                    str(file_summary.get("remote_filename") or ""),
                ),
            )

    return {
        "remote_filename": summary.get("latest_source_filename"),
        "local_filename": summary.get("latest_local_filename"),
        "trade_date_from_sftp": summary.get("max_trade_date_from_sftp"),
        "sftp_upload_timestamp": summary.get("latest_sftp_upload_timestamp"),
        "rows_processed": summary.get("rows_processed"),
    }


def _format_local_datetime(value: datetime) -> str:
    timezone_label = value.tzname() or ""
    if timezone_label:
        timezone_label = f" {timezone_label}"
    return value.strftime("%Y-%m-%d %H:%M") + timezone_label


def _dict_rows(cursor: Any) -> list[dict[str, Any]]:
    column_names = [desc[0] for desc in cursor.description]
    return [dict(zip(column_names, row)) for row in cursor.fetchall()]
