from __future__ import annotations

import base64
import html
import json
import logging
from decimal import Decimal
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlencode

import requests

from backend import credentials
from backend.utils import db, email_templates

logger = logging.getLogger(__name__)

GRAPH_TOKEN_URL_TEMPLATE = (
    "https://login.microsoftonline.com/{tenant_id}/oauth2/v2.0/token"
)
GRAPH_SEND_MAIL_URL_TEMPLATE = "https://graph.microsoft.com/v1.0/users/{sender}/sendMail"
GRAPH_SCOPE = "https://graph.microsoft.com/.default"
DEFAULT_PJM_DA_HRL_LMP_HUB = "WESTERN HUB"
DEFAULT_CAISO_DA_LMP_HUB = "TH_SP15_GEN-APND"
DEFAULT_PJM_DA_HRL_LMP_COMPONENT = "all"
DA_LMP_COMPONENTS = [
    ("energy", "Energy", "system_energy"),
    ("congestion", "Congestion", "congestion"),
    ("loss", "Loss", "marginal_loss"),
    ("total", "Total", "total"),
]
CAISO_DA_LMP_COMPONENTS = [
    ("energy", "Energy", "system_energy"),
    ("congestion", "Congestion", "congestion"),
    ("loss", "Loss", "marginal_loss"),
    ("ghg", "GHG", "greenhouse_gas"),
    ("total", "Total", "total"),
]
DA_LMP_TOTAL_COMPONENT = [("total", "Total", "total")]
DA_LMP_HOURS = list(range(1, 25))
DA_LMP_PEAK_HE_8_23 = {
    "peak_start_he": 8,
    "peak_end_he": 23,
    "peak_label": "Peak HE8-23",
    "off_peak_label": "OffPeak HE1-7,24",
}
DA_LMP_PEAK_HE_7_22 = {
    "peak_start_he": 7,
    "peak_end_he": 22,
    "peak_label": "Peak HE7-22",
    "off_peak_label": "OffPeak HE1-6,23-24",
}
DA_LMP_EMAIL_CONFIGS: dict[str, dict[str, Any]] = {
    "pjm": {
        "label": "PJM",
        "dataset": "pjm_da_hrl_lmps",
        "source": "pjm.da_hrl_lmps",
        "default_hub": DEFAULT_PJM_DA_HRL_LMP_HUB,
        "hubs": [
            "WESTERN HUB",
            "EASTERN HUB",
            "AEP-DAYTON HUB",
            "DOMINION HUB",
            "NEW JERSEY HUB",
            "CHICAGO HUB",
            "OHIO HUB",
            "N ILLINOIS HUB",
            "AEP GEN HUB",
            "ATSI GEN HUB",
            "CHICAGO GEN HUB",
            "WEST INT HUB",
        ],
        "components": DA_LMP_COMPONENTS,
        **DA_LMP_PEAK_HE_8_23,
    },
    "isone": {
        "label": "NEPOOL",
        "dataset": "isone_da_hrl_lmps",
        "source": "isone.da_hrl_lmps",
        "default_hub": ".H.INTERNAL_HUB",
        "hubs": [".H.INTERNAL_HUB"],
        "components": DA_LMP_COMPONENTS,
        **DA_LMP_PEAK_HE_8_23,
    },
    "ercot": {
        "label": "ERCOT",
        "dataset": "ercot_dam_stlmnt_pnt_prices",
        "source": "ercot.dam_stlmnt_pnt_prices",
        "default_hub": "HB_NORTH",
        "hubs": ["HB_NORTH", "HB_SOUTH", "HB_WEST", "HB_HOUSTON"],
        "components": DA_LMP_TOTAL_COMPONENT,
        **DA_LMP_PEAK_HE_7_22,
    },
    "caiso": {
        "label": "CAISO",
        "dataset": "caiso_da_lmps",
        "source": "caiso.da_lmps",
        "default_hub": DEFAULT_CAISO_DA_LMP_HUB,
        "hubs": ["TH_NP15_GEN-APND", "TH_SP15_GEN-APND"],
        "components": CAISO_DA_LMP_COMPONENTS,
        **DA_LMP_PEAK_HE_7_22,
    },
}
MAX_ERROR_MESSAGE_LENGTH = 2000
CLEAR_STREET_EOD_TRANSACTIONS_DATASET = "clear_street_eod_transactions"
CLEAR_STREET_MUFG_UPLOAD_DATASET = "clear_street_trades_mufg_upload"
NAV_POSITIONS_DATASET = "nav_positions"
NAV_TRADE_BREAKS_DATASET = "nav_trade_breaks"


def notifications_enabled() -> bool:
    return credentials.HELIOS_EMAIL_NOTIFICATIONS_ENABLED


def build_da_lmp_report_url(
    *,
    business_date: str,
    iso: str = "pjm",
    hub: str | None = None,
    component: str = DEFAULT_PJM_DA_HRL_LMP_COMPONENT,
    base_url: str | None = None,
) -> str:
    iso = str(iso).strip().lower()
    config = _da_lmp_email_config(iso)
    params = urlencode(
        {
            "section": "pjm-da-lmps",
            "view": "single-day",
            "product": "da",
            "iso": iso,
            "date": business_date,
            "hub": hub or config["default_hub"],
            "component": component,
            "refresh": "1",
        }
    )
    root = (base_url or credentials.HELIOS_EMAIL_FRONTEND_BASE_URL).rstrip("/")
    return f"{root}/?{params}"


def build_pjm_da_hrl_lmp_report_url(
    *,
    business_date: str,
    hub: str = DEFAULT_PJM_DA_HRL_LMP_HUB,
    component: str = DEFAULT_PJM_DA_HRL_LMP_COMPONENT,
    base_url: str | None = None,
) -> str:
    return build_da_lmp_report_url(
        business_date=business_date,
        iso="pjm",
        hub=hub,
        component=component,
        base_url=base_url,
    )


def fetch_da_lmp_email_snapshot(
    *,
    iso: str,
    business_date: str,
    database: str | None = None,
    hubs: list[str] | tuple[str, ...] | None = None,
) -> dict[str, Any]:
    """Load the normalized DA LMP hub/hour shape used by inline email tables."""
    iso = str(iso).strip().lower()
    config = _da_lmp_email_config(iso)
    report_hubs = list(hubs or config["hubs"])
    latest_sql, latest_params = _da_lmp_latest_query(
        iso=iso,
        hubs=report_hubs,
    )
    rows_sql, rows_params = _da_lmp_rows_query(
        iso=iso,
        business_date=business_date,
        hubs=report_hubs,
    )
    latest_rows = db.execute_sql(
        latest_sql,
        params=latest_params,
        database=database,
        fetch=True,
    )
    rows = db.execute_sql(
        rows_sql,
        params=rows_params,
        database=database,
        fetch=True,
    )
    return _build_da_lmp_snapshot(
        iso=iso,
        rows=rows or [],
        target_date=business_date,
        latest_date=(latest_rows or [{}])[0].get("latest_date"),
        hubs=report_hubs,
    )


def fetch_pjm_da_hrl_lmp_email_snapshot(
    *,
    business_date: str,
    database: str | None = None,
    hubs: list[str] | tuple[str, ...] | None = None,
) -> dict[str, Any]:
    return fetch_da_lmp_email_snapshot(
        iso="pjm",
        business_date=business_date,
        database=database,
        hubs=hubs,
    )


def build_da_lmp_release_email(
    *,
    iso: str,
    event: dict[str, Any],
    recipient_email: str,
    base_url: str | None = None,
    hub: str | None = None,
    snapshot: dict[str, Any] | None = None,
) -> dict[str, Any]:
    iso = str(iso).strip().lower()
    config = _da_lmp_email_config(iso)
    iso_label = str(config["label"])
    dataset = str(config["dataset"])
    source = str(config["source"])
    selected_hub = hub or str(config["default_hub"])
    event_key = str(event["event_key"])
    business_date = _business_date_from_event(event)
    report_url = build_da_lmp_report_url(
        business_date=business_date,
        iso=iso,
        hub=selected_hub,
        base_url=base_url,
    )
    subject = _subject_with_tags(
        f"{iso_label} DA LMPs released for {_subject_date_label(business_date)}",
        ["HeliosCTA", iso_label, "DA LMPs", "Posted"],
    )
    body_text = (
        f"{iso_label} DA LMPs are available for {business_date}.\n\n"
        f"Email snapshot: {_da_lmp_snapshot_text_summary(snapshot)}\n"
        f"Report: {report_url}\n\n"
        f"Source event: {event_key}"
    )
    sections = [
        email_templates.link_section(
            "Report",
            label=f"Open {iso_label} DA LMP report",
            url=report_url,
        )
    ]
    sections.extend(_da_lmp_snapshot_sections(snapshot))
    body_html = email_templates.render_email(
        title=f"{iso_label} DA LMPs Available",
        preheader=f"{iso_label} day-ahead LMPs are available for {business_date}.",
        status_label="Posted",
        status_tone="success",
        intro=(
            f"{iso_label} day-ahead LMPs have posted. The inline snapshot "
            "below includes the configured hub summary and hourly tables."
        ),
        facts=[
            ("Market date", business_date),
            ("Dataset", dataset),
            ("Source", source),
            ("Hub", selected_hub),
            ("Component", DEFAULT_PJM_DA_HRL_LMP_COMPONENT),
            ("Source event", event_key),
        ],
        sections=sections,
    )
    return {
        "notification_key": f"{event_key}:email:release",
        "recipient_email": recipient_email,
        "dataset": dataset,
        "source_event_key": event_key,
        "source_event_id": event.get("id"),
        "subject": subject,
        "body_text": body_text,
        "body_html": body_html,
        "payload": {
            "business_date": business_date,
            "report_url": report_url,
            "iso": iso,
            "hub": selected_hub,
            "component": DEFAULT_PJM_DA_HRL_LMP_COMPONENT,
            "snapshot_hubs": len(snapshot.get("hubs", [])) if snapshot else 0,
        },
    }


def build_pjm_da_hrl_lmp_release_email(
    *,
    event: dict[str, Any],
    recipient_email: str,
    base_url: str | None = None,
    hub: str = DEFAULT_PJM_DA_HRL_LMP_HUB,
    snapshot: dict[str, Any] | None = None,
) -> dict[str, Any]:
    return build_da_lmp_release_email(
        iso="pjm",
        event=event,
        recipient_email=recipient_email,
        base_url=base_url,
        hub=hub,
        snapshot=snapshot,
    )


def build_clear_street_eod_transactions_file_email(
    *,
    summary: dict[str, Any],
    recipient_email: str,
    attachment_path: str | Path,
) -> dict[str, Any]:
    """Build an internal email alert for an available Clear Street source CSV."""
    latest_trade_file = _latest_clear_street_trade_file(summary)
    trade_date = _format_yyyymmdd_date(
        latest_trade_file.get("trade_date_from_sftp")
        or summary.get("max_trade_date_from_sftp")
    )
    upload_timestamp = _coerce_utc_datetime(
        latest_trade_file.get("sftp_upload_timestamp")
        or summary.get("latest_sftp_upload_timestamp")
    )
    upload_display = _format_machine_local_datetime(upload_timestamp)
    upload_key = upload_timestamp.strftime("%Y%m%dT%H%M%SZ")
    source_filename = str(
        latest_trade_file.get("remote_filename")
        or latest_trade_file.get("local_filename")
        or Path(attachment_path).name
    )
    rows_processed = int(
        latest_trade_file.get("rows_processed")
        if latest_trade_file.get("rows_processed") is not None
        else summary.get("rows_processed", 0) or 0
    )
    event_key = (
        f"{CLEAR_STREET_EOD_TRANSACTIONS_DATASET}:data_ready:"
        f"{trade_date}:{upload_key}"
    )
    attachment = str(Path(attachment_path))
    subject = _subject_with_tags(
        f"Clear Street file available for {_subject_date_label(trade_date)}",
        ["HeliosCTA", "Clear Street", "File Available"],
    )
    body_text = (
        f"Clear Street transaction file is available for {trade_date}.\n\n"
        f"Attached CSV: {Path(attachment_path).name}\n"
        f"Source file: {source_filename}\n"
        f"Rows loaded: {rows_processed:,}\n"
        f"SFTP upload: {upload_display}\n"
    )
    body_html = email_templates.render_email(
        title="Clear Street File Available",
        preheader=(
            f"Clear Street transaction file is available for {trade_date}."
        ),
        status_label="Loaded",
        status_tone="success",
        intro=f"Clear Street transaction file is available for {trade_date}.",
        facts=[
            ("Trade date", trade_date),
            ("Rows loaded", f"{rows_processed:,}"),
            ("Source file", source_filename),
            ("Attached CSV", Path(attachment_path).name),
            ("SFTP upload", upload_display),
        ],
        sections=[
            email_templates.text_section(
                "Attachment",
                "The downloaded raw Clear Street CSV is attached to this email.",
            )
        ],
    )
    return {
        "notification_key": f"{event_key}:email:file_available",
        "recipient_email": recipient_email,
        "dataset": CLEAR_STREET_EOD_TRANSACTIONS_DATASET,
        "source_event_key": event_key,
        "source_event_id": None,
        "subject": subject,
        "body_text": body_text,
        "body_html": body_html,
        "payload": {
            "trade_date": trade_date,
            "source_filename": source_filename,
            "attachment_paths": [attachment],
            "rows_processed": rows_processed,
            "latest_sftp_upload_timestamp": upload_timestamp.isoformat(),
        },
    }


def build_clear_street_mufg_upload_success_email(
    *,
    summary: dict[str, Any],
    recipient_email: str,
    attachment_path: str | Path,
) -> dict[str, Any]:
    """Build an internal email alert for a completed Clear Street MUFG upload."""
    trade_date = _clear_street_mufg_trade_date(summary)
    filename = str(
        summary.get("remote_filename")
        or summary.get("filename")
        or Path(attachment_path).name
    )
    rows_uploaded = int(
        summary.get("rows_uploaded")
        or summary.get("rows_exported", 0)
        or 0
    )
    warnings = _clear_street_mufg_warning_lines(summary)
    warning_lines = warnings or ["No warnings."]
    warning_text = "\n".join(f"- {line}" for line in warning_lines)
    null_check = summary.get("product_code_null_check")
    affected_products = []
    affected_product_count = 0
    if isinstance(null_check, dict):
        raw_products = null_check.get("affected_products")
        affected_products = raw_products if isinstance(raw_products, list) else []
        affected_product_count = int(
            null_check.get("affected_product_count") or len(affected_products)
        )
    event_key = (
        f"{CLEAR_STREET_MUFG_UPLOAD_DATASET}:data_ready:{trade_date}"
    )
    attachment = str(Path(attachment_path))
    subject_tags = ["HeliosCTA", "Clear Street", "MUFG Upload"]
    if warnings:
        subject_tags.append("Warning")
    subject = _subject_with_tags(
        f"Clear Street MUFG upload complete for {_subject_date_label(trade_date)}",
        subject_tags,
    )
    body_text = (
        f"Clear Street MUFG trade file uploaded for {trade_date}.\n\n"
        f"Attached CSV: {Path(attachment_path).name}\n"
        f"Rows uploaded: {rows_uploaded:,}\n"
        f"Remote path: {summary.get('remote_path') or 'unknown'}\n\n"
        "Warnings:\n"
        f"{warning_text}\n"
    )
    sections = []
    if affected_products:
        sections.append(
            email_templates.product_warning_section(
                products=affected_products,
                product_count=affected_product_count,
            )
        )
    sections.append(
        email_templates.bullet_section(
            "Warnings",
            warning_lines,
            tone="warning" if warnings else "success",
        )
    )
    body_html = email_templates.render_email(
        title="Clear Street MUFG Upload Complete",
        preheader=f"Clear Street MUFG trade file uploaded for {trade_date}.",
        status_label="Uploaded",
        status_tone="warning" if warnings else "success",
        intro=f"Clear Street MUFG trade file uploaded for {trade_date}.",
        facts=[
            ("Trade date", trade_date),
            ("Rows uploaded", f"{rows_uploaded:,}"),
            ("Attached CSV", Path(attachment_path).name),
            ("Remote path", summary.get("remote_path") or "unknown"),
        ],
        sections=sections,
    )
    return {
        "notification_key": f"{event_key}:email:upload_complete",
        "recipient_email": recipient_email,
        "dataset": CLEAR_STREET_MUFG_UPLOAD_DATASET,
        "source_event_key": event_key,
        "source_event_id": None,
        "subject": subject,
        "body_text": body_text,
        "body_html": body_html,
        "payload": {
            "trade_date": trade_date,
            "filename": filename,
            "attachment_paths": [attachment],
            "rows_uploaded": rows_uploaded,
            "rows_exported": int(summary.get("rows_exported", rows_uploaded) or 0),
            "remote_path": summary.get("remote_path"),
            "warnings": warning_lines,
            "product_code_null_check": summary.get("product_code_null_check", {}),
            "trade_status_counts": summary.get("trade_status_counts", {}),
        },
    }


def build_nav_positions_file_email(
    *,
    summary: dict[str, Any],
    recipient_email: str,
    attachment_paths: list[str | Path] | tuple[str | Path, ...],
) -> dict[str, Any]:
    """Build an internal email alert for loaded NAV position workbooks."""
    source_files = _nav_positions_source_files(summary)
    nav_date = _nav_positions_nav_date(summary, source_files)
    latest_upload = _latest_nav_positions_upload_timestamp(summary, source_files)
    upload_display = (
        _format_machine_local_datetime(latest_upload) if latest_upload else "unknown"
    )
    upload_key = latest_upload.strftime("%Y%m%dT%H%M%SZ") if latest_upload else "unknown"
    rows_processed = int(summary.get("rows_processed", 0) or 0)
    loaded_funds = _coerce_string_list(
        summary.get("loaded_fund_codes") or summary.get("fund_codes")
    )
    attachment_strings = [str(Path(path)) for path in attachment_paths]
    attachment_names = [Path(path).name for path in attachment_strings]
    source_names = _nav_positions_source_names(source_files, attachment_names)
    event_key = f"{NAV_POSITIONS_DATASET}:data_ready:{nav_date}:{upload_key}"
    fund_label = ", ".join(loaded_funds) if loaded_funds else "not supplied"
    attachment_label = ", ".join(attachment_names)
    source_label = ", ".join(source_names)
    subject = _subject_with_tags(
        f"NAV positions ready for review for {_subject_date_label(nav_date)}",
        ["HeliosCTA", "NAV", "Positions"],
    )
    body_text = (
        "NAV position valuation workbooks were loaded and are ready for "
        f"review for {nav_date}.\n\n"
        f"Attached workbooks: {attachment_label}\n"
        f"Source files: {source_label}\n"
        "Source system: NAV SFTP\n"
        f"Funds loaded: {fund_label}\n"
        f"Rows loaded: {rows_processed:,}\n"
        f"Latest SFTP upload: {upload_display}\n"
        "\nReview notes: The raw NAV workbooks are attached to this email. "
        "The database load completed successfully.\n"
    )
    body_html = email_templates.render_email(
        title="NAV Positions Ready for Review",
        preheader=(
            "NAV position valuation workbooks were loaded and are ready "
            f"for review for {nav_date}."
        ),
        status_label="Loaded",
        status_tone="success",
        intro=(
            "NAV position valuation workbooks were loaded and are attached "
            f"for review for {nav_date}."
        ),
        facts=[
            ("NAV date", nav_date),
            ("Funds loaded", fund_label),
            ("Rows loaded", f"{rows_processed:,}"),
            ("Workbooks", f"{len(attachment_names):,}"),
            ("Latest SFTP upload", upload_display),
            ("Source system", "NAV SFTP"),
        ],
        sections=[
            email_templates.bullet_section(
                "Attachments",
                attachment_names,
                tone="success",
            ),
            email_templates.bullet_section(
                "Source Files",
                source_names,
            ),
            email_templates.text_section(
                "Review Notes",
                "The raw NAV workbooks are attached to this email. "
                "The database load completed successfully.",
            ),
        ],
    )
    return {
        "notification_key": f"{event_key}:email:file_available",
        "recipient_email": recipient_email,
        "dataset": NAV_POSITIONS_DATASET,
        "source_event_key": event_key,
        "source_event_id": None,
        "subject": subject,
        "body_text": body_text,
        "body_html": body_html,
        "payload": {
            "nav_date": nav_date,
            "source_filenames": source_names,
            "attachment_paths": attachment_strings,
            "rows_processed": rows_processed,
            "loaded_fund_codes": loaded_funds,
            "latest_sftp_upload_timestamp": (
                latest_upload.isoformat() if latest_upload else None
            ),
        },
    }


def build_nav_trade_breaks_file_email(
    *,
    summary: dict[str, Any],
    recipient_email: str,
    attachment_path: str | Path,
) -> dict[str, Any]:
    """Build an internal email alert for a NAV trade breaks workbook."""
    nav_date = _format_yyyymmdd_date(summary.get("nav_date"))
    upload_timestamp = _coerce_utc_datetime(summary.get("sftp_upload_timestamp"))
    upload_display = _format_machine_local_datetime(upload_timestamp)
    upload_key = upload_timestamp.strftime("%Y%m%dT%H%M%SZ")
    attachment = str(Path(attachment_path))
    attachment_name = Path(attachment).name
    source_filename = str(
        summary.get("source_filename")
        or summary.get("downloaded_filename")
        or attachment_name
    )
    rows_processed = int(summary.get("rows_processed", 0) or 0)
    add_del_counts = summary.get("by_add_del")
    add_del_label = _format_counts(add_del_counts)
    event_key = f"{NAV_TRADE_BREAKS_DATASET}:data_ready:{nav_date}:{upload_key}"
    no_trade_breaks = rows_processed == 0
    subject_text = (
        f"No NAV trade breaks found for {_subject_date_label(nav_date)}"
        if no_trade_breaks
        else f"NAV trade breaks ready for review for {_subject_date_label(nav_date)}"
    )
    title = (
        "No NAV Trade Breaks Found"
        if no_trade_breaks
        else "NAV Trade Breaks Ready for Review"
    )
    status_label = (
        "No trade breaks found" if no_trade_breaks else "Ready for review"
    )
    intro = (
        "NAV reported no trade breaks in the attached source workbook "
        f"for {nav_date}."
        if no_trade_breaks
        else "NAV trade breaks are ready for review and the source workbook "
        f"is attached for {nav_date}."
    )
    first_line = (
        f"No NAV trade breaks were found for {nav_date}."
        if no_trade_breaks
        else f"NAV trade breaks are ready for review for {nav_date}."
    )
    review_notes = (
        "The raw NAV trade breaks workbook is attached to this email. "
        "NAV reported no trade break detail rows after filtering the source workbook."
        if no_trade_breaks
        else "The raw NAV trade breaks workbook is attached to this email. "
        "No trade break rows are written to a database table."
    )
    subject = _subject_with_tags(
        subject_text,
        ["HeliosCTA", "NAV", "Trade Breaks"],
    )
    body_text = (
        f"{first_line}\n\n"
        f"Attached workbook: {attachment_name}\n"
        f"Source file: {source_filename}\n"
        "Source system: NAV SFTP\n"
        f"Rows detected: {rows_processed:,}\n"
        f"Add/Del counts: {add_del_label}\n"
        f"SFTP upload: {upload_display}\n"
    )
    body_html = email_templates.render_email(
        title=title,
        preheader=first_line,
        status_label=status_label,
        status_tone="success",
        intro=intro,
        facts=[
            ("NAV date", nav_date),
            ("Rows detected", f"{rows_processed:,}"),
            ("Add/Del counts", add_del_label),
            ("Source file", source_filename),
            ("Attached workbook", attachment_name),
            ("SFTP upload", upload_display),
            ("Source system", "NAV SFTP"),
        ],
        sections=[
            email_templates.bullet_section(
                "Attachments",
                [attachment_name],
                tone="success",
            ),
            email_templates.bullet_section(
                "Source Files",
                [source_filename],
            ),
            email_templates.text_section(
                "Review Notes",
                review_notes,
            )
        ],
    )
    return {
        "notification_key": f"{event_key}:email:file_available",
        "recipient_email": recipient_email,
        "dataset": NAV_TRADE_BREAKS_DATASET,
        "source_event_key": event_key,
        "source_event_id": None,
        "subject": subject,
        "body_text": body_text,
        "body_html": body_html,
        "payload": {
            "nav_date": nav_date,
            "source_filename": source_filename,
            "downloaded_filename": attachment_name,
            "attachment_paths": [attachment],
            "rows_processed": rows_processed,
            "add_del_counts": add_del_counts if isinstance(add_del_counts, dict) else {},
            "sftp_upload_timestamp": upload_timestamp.isoformat(),
        },
    }


def enqueue_email_notification(
    *,
    notification_key: str,
    recipient_email: str,
    subject: str,
    body_text: str,
    body_html: str | None = None,
    dataset: str | None = None,
    source_event_key: str | None = None,
    source_event_id: int | None = None,
    payload: dict[str, Any] | None = None,
    max_attempts: int | None = None,
    database: str | None = None,
) -> dict[str, Any]:
    recipient_email = recipient_email.strip().lower()
    sql = """
        WITH inserted AS (
            INSERT INTO ops.email_notification_outbox (
                notification_key,
                recipient_email,
                dataset,
                source_event_key,
                source_event_id,
                subject,
                body_text,
                body_html,
                max_attempts,
                payload
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb)
            ON CONFLICT (notification_key, recipient_email) DO NOTHING
            RETURNING
                id,
                notification_key,
                recipient_email,
                status,
                attempts,
                max_attempts,
                TRUE AS created
        )
        SELECT
            id,
            notification_key,
            recipient_email,
            status,
            attempts,
            max_attempts,
            created
        FROM inserted
        UNION ALL
        SELECT
            id,
            notification_key,
            recipient_email,
            status,
            attempts,
            max_attempts,
            FALSE AS created
        FROM ops.email_notification_outbox
        WHERE notification_key = %s
          AND recipient_email = %s
          AND NOT EXISTS (SELECT 1 FROM inserted)
        LIMIT 1;
    """
    rows = db.execute_sql(
        sql,
        params=(
            notification_key,
            recipient_email,
            dataset,
            source_event_key,
            source_event_id,
            subject,
            body_text,
            body_html,
            max_attempts or credentials.HELIOS_EMAIL_MAX_ATTEMPTS,
            json.dumps(payload or {}, default=str),
            notification_key,
            recipient_email,
        ),
        database=database,
        fetch=True,
    )
    if not rows:
        raise RuntimeError(
            "Failed to enqueue email notification "
            f"{notification_key} for {recipient_email}"
        )
    return rows[0]


def enqueue_pjm_da_hrl_lmp_release_notifications(
    *,
    event: dict[str, Any],
    database: str | None = None,
) -> list[dict[str, Any]]:
    return enqueue_da_lmp_release_notifications(
        iso="pjm",
        event=event,
        database=database,
    )


def enqueue_caiso_da_lmp_release_notifications(
    *,
    event: dict[str, Any],
    database: str | None = None,
) -> list[dict[str, Any]]:
    return enqueue_da_lmp_release_notifications(
        iso="caiso",
        event=event,
        database=database,
    )


def enqueue_da_lmp_release_notifications(
    *,
    iso: str,
    event: dict[str, Any],
    database: str | None = None,
) -> list[dict[str, Any]]:
    iso = str(iso).strip().lower()
    enqueued = []
    snapshot = fetch_da_lmp_email_snapshot(
        iso=iso,
        business_date=_business_date_from_event(event),
        database=database,
    )
    for recipient_email in credentials.HELIOS_EMAIL_RECIPIENTS:
        recipient_email = recipient_email.strip().lower()
        if not recipient_email:
            continue
        message = build_da_lmp_release_email(
            iso=iso,
            event=event,
            recipient_email=recipient_email,
            snapshot=snapshot,
        )
        enqueued.append(enqueue_email_notification(database=database, **message))
    return enqueued


def send_due_email_notifications(
    *,
    limit: int = 20,
    database: str | None = None,
    now: datetime | None = None,
) -> list[dict[str, Any]]:
    if limit <= 0:
        return []
    if not notifications_enabled():
        logger.info("Email notifications are disabled; no outbox rows claimed")
        return []

    claimed = _claim_due_notifications(
        limit=limit,
        database=database,
        stale_sending_minutes=credentials.HELIOS_EMAIL_STALE_SENDING_MINUTES,
        now=now,
    )
    results = []
    for row in claimed:
        try:
            payload = _coerce_payload(row.get("payload"))
            send_email_via_graph(
                recipient_email=row["recipient_email"],
                subject=row["subject"],
                body_text=row["body_text"],
                body_html=row.get("body_html"),
                attachments=_attachment_paths_from_payload(payload),
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
                "Email notification %s failed for %s: %s",
                row["notification_key"],
                row["recipient_email"],
                exc,
            )
            continue

        sent = _mark_notification_sent(
            notification_id=row["id"],
            provider="microsoft_graph",
            database=database,
        )
        results.append(sent)
        logger.info(
            "Email notification %s sent to %s",
            row["notification_key"],
            row["recipient_email"],
        )
    return results


def send_email_via_graph(
    *,
    recipient_email: str,
    subject: str,
    body_text: str,
    body_html: str | None = None,
    sender_email: str | None = None,
    attachments: list[str | Path] | None = None,
    timeout_seconds: int = 30,
) -> None:
    sender = _required(
        "AZURE_OUTLOOK_SENDER",
        sender_email or credentials.AZURE_OUTLOOK_SENDER,
    )
    token = _graph_access_token(timeout_seconds=timeout_seconds)
    content = body_html or body_text
    content_type = "HTML" if body_html else "Text"
    message: dict[str, Any] = {
        "subject": subject,
        "body": {
            "contentType": content_type,
            "content": content,
        },
        "toRecipients": [
            {"emailAddress": {"address": recipient_email}},
        ],
    }
    if attachments:
        message["attachments"] = [
            _graph_file_attachment(path) for path in attachments
        ]

    response = requests.post(
        GRAPH_SEND_MAIL_URL_TEMPLATE.format(sender=sender),
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
        json={
            "message": message,
            "saveToSentItems": "false",
        },
        timeout=timeout_seconds,
    )
    if response.status_code != 202:
        raise RuntimeError(
            "Microsoft Graph sendMail failed with "
            f"HTTP {response.status_code}: {response.text[:500]}"
        )


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
                FROM ops.email_notification_outbox
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
            UPDATE ops.email_notification_outbox AS outbox
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
                outbox.recipient_email,
                outbox.subject,
                outbox.body_text,
                outbox.body_html,
                outbox.payload,
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
        logger.exception("Failed to claim due email notifications")
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
    database: str | None,
) -> dict[str, Any]:
    rows = db.execute_sql(
        """
        UPDATE ops.email_notification_outbox
        SET
            status = 'sent',
            sent_at = now(),
            provider = %s,
            last_error_type = NULL,
            last_error_message = NULL,
            updated_at = now()
        WHERE id = %s
        RETURNING id, notification_key, recipient_email, status, attempts;
        """,
        params=(provider, notification_id),
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
        UPDATE ops.email_notification_outbox
        SET
            status = %s,
            next_attempt_at = %s,
            last_error_type = %s,
            last_error_message = %s,
            updated_at = now()
        WHERE id = %s
        RETURNING id, notification_key, recipient_email, status, attempts;
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


def _graph_access_token(*, timeout_seconds: int) -> str:
    client_id = _required("AZURE_OUTLOOK_CLIENT_ID", credentials.AZURE_OUTLOOK_CLIENT_ID)
    tenant_id = _required("AZURE_OUTLOOK_TENANT_ID", credentials.AZURE_OUTLOOK_TENANT_ID)
    client_secret = _required(
        "AZURE_OUTLOOK_CLIENT_SECRET",
        credentials.AZURE_OUTLOOK_CLIENT_SECRET,
    )
    response = requests.post(
        GRAPH_TOKEN_URL_TEMPLATE.format(tenant_id=tenant_id),
        data={
            "client_id": client_id,
            "client_secret": client_secret,
            "scope": GRAPH_SCOPE,
            "grant_type": "client_credentials",
        },
        timeout=timeout_seconds,
    )
    if response.status_code != 200:
        raise RuntimeError(
            "Microsoft Graph token request failed with "
            f"HTTP {response.status_code}: {response.text[:500]}"
        )
    payload = response.json()
    token = payload.get("access_token")
    if not token:
        raise RuntimeError("Microsoft Graph token response did not include access_token")
    return str(token)


def _graph_file_attachment(file_path: str | Path) -> dict[str, str]:
    path = Path(file_path)
    if not path.exists():
        raise FileNotFoundError(f"Email attachment not found: {path}")
    return {
        "@odata.type": "#microsoft.graph.fileAttachment",
        "name": path.name,
        "contentBytes": base64.b64encode(path.read_bytes()).decode("utf-8"),
    }


def _da_lmp_email_config(iso: str) -> dict[str, Any]:
    key = str(iso).strip().lower()
    if key not in DA_LMP_EMAIL_CONFIGS:
        raise ValueError(f"Unsupported DA LMP email ISO: {iso}")
    return DA_LMP_EMAIL_CONFIGS[key]


def _da_lmp_latest_query(
    *,
    iso: str,
    hubs: list[str],
) -> tuple[str, tuple[Any, ...]]:
    if iso == "pjm":
        return (
            """
            SELECT MAX(datetime_beginning_ept::date)::text AS latest_date
            FROM pjm.da_hrl_lmps
            WHERE row_is_current = TRUE
              AND pnode_name = ANY(%s::text[]);
            """,
            (hubs,),
        )
    if iso == "isone":
        return (
            """
            SELECT MAX(date)::text AS latest_date
            FROM isone.da_hrl_lmps
            WHERE location_name = ANY(%s::text[])
              AND location_type = 'HUB';
            """,
            (hubs,),
        )
    if iso == "ercot":
        return (
            """
            SELECT MAX(deliverydate)::text AS latest_date
            FROM ercot.dam_stlmnt_pnt_prices
            WHERE settlementpoint = ANY(%s::text[]);
            """,
            (hubs,),
        )
    if iso == "caiso":
        return (
            """
            SELECT MAX(operating_date)::text AS latest_date
            FROM caiso.da_lmps
            WHERE node_id = ANY(%s::text[])
              AND market_run_id = 'DAM';
            """,
            (hubs,),
        )
    raise ValueError(f"Unsupported DA LMP email ISO: {iso}")


def _da_lmp_rows_query(
    *,
    iso: str,
    business_date: str,
    hubs: list[str],
) -> tuple[str, tuple[Any, ...]]:
    if iso == "pjm":
        return (
            """
            WITH params AS (
                SELECT
                    %s::date::timestamp AS start_datetime_ept,
                    (%s::date::timestamp + INTERVAL '1 day') AS end_datetime_ept
            )
            SELECT
                to_char(lmps.datetime_beginning_ept, 'YYYY-MM-DD"T"HH24:MI:SS')
                    AS datetime_beginning,
                lmps.pnode_name AS hub,
                (EXTRACT(HOUR FROM lmps.datetime_beginning_ept)::int + 1)
                    AS hour_ending,
                lmps.system_energy_price_da AS system_energy,
                lmps.total_lmp_da AS total,
                lmps.congestion_price_da AS congestion,
                lmps.marginal_loss_price_da AS marginal_loss,
                to_char(lmps.updated_at, 'YYYY-MM-DD"T"HH24:MI:SS') AS updated_at
            FROM pjm.da_hrl_lmps AS lmps
            CROSS JOIN params
            WHERE lmps.datetime_beginning_ept >= params.start_datetime_ept
              AND lmps.datetime_beginning_ept < params.end_datetime_ept
              AND lmps.pnode_name = ANY(%s::text[])
              AND lmps.row_is_current = TRUE
            ORDER BY array_position(%s::text[], lmps.pnode_name),
                lmps.datetime_beginning_ept;
            """,
            (business_date, business_date, hubs, hubs),
        )
    if iso == "isone":
        return (
            """
            SELECT
                to_char(
                    lmps.date::timestamp + ((lmps.hour_ending - 1) * INTERVAL '1 hour'),
                    'YYYY-MM-DD"T"HH24:MI:SS'
                ) AS datetime_beginning,
                lmps.location_name AS hub,
                lmps.hour_ending,
                lmps.energy_component AS system_energy,
                lmps.locational_marginal_price AS total,
                lmps.congestion_component AS congestion,
                lmps.marginal_loss_component AS marginal_loss,
                to_char(lmps.updated_at, 'YYYY-MM-DD"T"HH24:MI:SS') AS updated_at
            FROM isone.da_hrl_lmps AS lmps
            WHERE lmps.location_name = ANY(%s::text[])
              AND lmps.location_type = 'HUB'
              AND lmps.date = %s::date
            ORDER BY array_position(%s::text[], lmps.location_name),
                lmps.hour_ending;
            """,
            (hubs, business_date, hubs),
        )
    if iso == "ercot":
        return (
            """
            SELECT
                to_char(
                    spp.deliverydate::timestamp + ((spp.hourending - 1) * INTERVAL '1 hour'),
                    'YYYY-MM-DD"T"HH24:MI:SS'
                ) AS datetime_beginning,
                spp.settlementpoint AS hub,
                spp.hourending AS hour_ending,
                NULL::double precision AS system_energy,
                spp.settlementpointprice AS total,
                NULL::double precision AS congestion,
                NULL::double precision AS marginal_loss,
                to_char(spp.updated_at, 'YYYY-MM-DD"T"HH24:MI:SS') AS updated_at
            FROM ercot.dam_stlmnt_pnt_prices AS spp
            WHERE spp.settlementpoint = ANY(%s::text[])
              AND spp.deliverydate = %s::date
            ORDER BY array_position(%s::text[], spp.settlementpoint),
                spp.hourending;
            """,
            (hubs, business_date, hubs),
        )
    if iso == "caiso":
        return (
            """
            SELECT
                to_char(
                    lmps.interval_start_time_utc AT TIME ZONE 'America/Los_Angeles',
                    'YYYY-MM-DD"T"HH24:MI:SS'
                ) AS datetime_beginning,
                lmps.node_id AS hub,
                lmps.operating_hour AS hour_ending,
                lmps.energy_component AS system_energy,
                lmps.locational_marginal_price AS total,
                lmps.congestion_component AS congestion,
                lmps.loss_component AS marginal_loss,
                lmps.greenhouse_gas_component AS greenhouse_gas,
                to_char(lmps.updated_at, 'YYYY-MM-DD"T"HH24:MI:SS') AS updated_at
            FROM caiso.da_lmps AS lmps
            WHERE lmps.node_id = ANY(%s::text[])
              AND lmps.operating_date = %s::date
              AND lmps.market_run_id = 'DAM'
            ORDER BY array_position(%s::text[], lmps.node_id),
                lmps.operating_hour,
                lmps.interval_start_time_utc;
            """,
            (hubs, business_date, hubs),
        )
    raise ValueError(f"Unsupported DA LMP email ISO: {iso}")


def _da_lmp_peak_profile(config: dict[str, Any]) -> dict[str, Any]:
    peak_start_he = int(config["peak_start_he"])
    peak_end_he = int(config["peak_end_he"])
    if peak_start_he < min(DA_LMP_HOURS) or peak_end_he > max(DA_LMP_HOURS):
        raise ValueError(
            "DA LMP peak hour profile must stay within HE1-HE24: "
            f"{peak_start_he}-{peak_end_he}"
        )
    if peak_start_he > peak_end_he:
        raise ValueError(
            "DA LMP peak hour profile start must be before end: "
            f"{peak_start_he}-{peak_end_he}"
        )
    return {
        "peak_start_he": peak_start_he,
        "peak_end_he": peak_end_he,
        "peak_label": str(config["peak_label"]),
        "off_peak_label": str(config["off_peak_label"]),
    }


def _is_da_lmp_peak_hour(
    hour_ending: int,
    *,
    peak_start_he: int,
    peak_end_he: int,
) -> bool:
    return peak_start_he <= hour_ending <= peak_end_he


def _build_da_lmp_snapshot(
    *,
    iso: str,
    rows: list[dict[str, Any]],
    target_date: str,
    latest_date: str | None,
    hubs: list[str],
) -> dict[str, Any]:
    config = _da_lmp_email_config(iso)
    peak_profile = _da_lmp_peak_profile(config)
    as_of = None
    for row in rows:
        updated_at = row.get("updated_at")
        if updated_at and (as_of is None or str(updated_at) > as_of):
            as_of = str(updated_at)

    rows_by_hub: dict[str, list[dict[str, Any]]] = {hub: [] for hub in hubs}
    for row in rows:
        hub = str(row.get("hub") or "")
        if hub not in rows_by_hub:
            continue
        rows_by_hub[hub].append(_da_lmp_hourly_row(row))

    return {
        "iso": iso,
        "iso_label": config["label"],
        "target_date": target_date,
        "latest_date": latest_date,
        "as_of": as_of,
        "source": config["source"],
        "components": config["components"],
        **peak_profile,
        "hubs": [
            _summarize_da_lmp_hub(
                hub=hub,
                hourly=rows_by_hub.get(hub, []),
                peak_start_he=peak_profile["peak_start_he"],
                peak_end_he=peak_profile["peak_end_he"],
            )
            for hub in hubs
        ],
    }


def _da_lmp_hourly_row(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "hour_ending": int(row["hour_ending"]),
        "datetime_beginning": row.get("datetime_beginning"),
        "system_energy": _to_float(row.get("system_energy")),
        "total": _to_float(row.get("total")),
        "congestion": _to_float(row.get("congestion")),
        "marginal_loss": _to_float(row.get("marginal_loss")),
        "greenhouse_gas": _to_float(row.get("greenhouse_gas")),
    }


def _summarize_da_lmp_hub(
    *,
    hub: str,
    hourly: list[dict[str, Any]],
    peak_start_he: int,
    peak_end_he: int,
) -> dict[str, Any]:
    hourly = sorted(hourly, key=lambda row: int(row["hour_ending"]))
    onpeak = [
        row["total"]
        for row in hourly
        if _is_da_lmp_peak_hour(
            int(row["hour_ending"]),
            peak_start_he=peak_start_he,
            peak_end_he=peak_end_he,
        )
    ]
    offpeak = [
        row["total"]
        for row in hourly
        if not _is_da_lmp_peak_hour(
            int(row["hour_ending"]),
            peak_start_he=peak_start_he,
            peak_end_he=peak_end_he,
        )
    ]
    peak = None
    for row in hourly:
        if row["total"] is None:
            continue
        if peak is None or row["total"] > peak["total"]:
            peak = row
    return {
        "hub": hub,
        "hours": len(hourly),
        "on_peak_avg": _avg(onpeak),
        "off_peak_avg": _avg(offpeak),
        "flat_avg": _avg(row["total"] for row in hourly),
        "peak_hour": peak["hour_ending"] if peak else None,
        "peak_price": peak["total"] if peak else None,
        "hourly": hourly,
    }


def _da_lmp_snapshot_sections(snapshot: dict[str, Any] | None) -> list[dict[str, Any]]:
    if not snapshot:
        return [
            email_templates.text_section(
                "Inline Snapshot",
                "No inline DA LMP snapshot was supplied for this notification.",
            )
        ]
    return [
        {
            "title": "Hub Summary",
            "html": _render_da_lmp_summary_table(snapshot),
        },
        {
            "title": "All Hubs Hourly Tables",
            "html": _render_da_lmp_hourly_tables(snapshot),
        },
    ]


def _render_da_lmp_summary_table(snapshot: dict[str, Any]) -> str:
    meta = (
        f"<p style=\"margin:0 0 8px 0; color:#6b7280; font-size:12px; "
        f"line-height:18px;\">"
        f"Target date: {_html(snapshot.get('target_date'))} | "
        f"Latest date: {_html(snapshot.get('latest_date') or '-')} | "
        f"As of: {_html(snapshot.get('as_of') or '-')}"
        "</p>"
    )
    rows = []
    for index, hub in enumerate(snapshot.get("hubs", [])):
        background = "#ffffff" if index % 2 == 0 else "#f9fafb"
        rows.append(
            f"<tr style=\"background-color:{background};\">"
            f"{_td(hub['hub'], align='left', bold=True)}"
            f"{_td(hub['hours'], align='right')}"
            f"{_td(_format_price(hub['on_peak_avg']), align='right')}"
            f"{_td(_format_price(hub['off_peak_avg']), align='right')}"
            f"{_td(_format_price(hub['flat_avg']), align='right')}"
            f"{_td(hub['peak_hour'] or '-', align='right')}"
            f"{_td(_format_price(hub['peak_price']), align='right')}"
            "</tr>"
        )
    if not rows:
        rows.append(f"<tr>{_td('No hub rows found.', colspan=7)}</tr>")
    return (
        meta
        + "<table role=\"presentation\" width=\"100%\" cellspacing=\"0\" "
        "cellpadding=\"0\" border=\"0\" style=\"border:1px solid #e5e7eb; "
        "border-collapse:collapse;\">"
        "<tr>"
        f"{_th('Hub', align='left')}"
        f"{_th('Hours')}"
        f"{_th(snapshot.get('peak_label') or 'Peak')}"
        f"{_th(snapshot.get('off_peak_label') or 'OffPeak')}"
        f"{_th('Flat')}"
        f"{_th('Peak HE')}"
        f"{_th('Peak Price')}"
        "</tr>"
        + "".join(rows)
        + "</table>"
    )


def _render_da_lmp_hourly_tables(snapshot: dict[str, Any]) -> str:
    blocks = []
    for hub in snapshot.get("hubs", []):
        blocks.append(
            f"<h3 style=\"margin:16px 0 6px 0; color:#111827; "
            f"font-size:13px; line-height:18px;\">{_html(hub['hub'])}</h3>"
        )
        if not hub.get("hourly"):
            blocks.append(
                "<p style=\"margin:0 0 10px 0; color:#6b7280; "
                "font-size:12px; line-height:18px;\">No hourly rows found.</p>"
            )
            continue
        blocks.append(_render_da_lmp_hub_component_table(snapshot, hub))
    return "".join(blocks)


def _render_da_lmp_hub_component_table(
    snapshot: dict[str, Any],
    hub: dict[str, Any],
) -> str:
    components = snapshot.get("components") or DA_LMP_COMPONENTS
    peak_start_he = int(snapshot.get("peak_start_he") or 8)
    peak_end_he = int(snapshot.get("peak_end_he") or 23)
    hourly_by_hour = {int(row["hour_ending"]): row for row in hub.get("hourly", [])}
    rows = []
    for index, component in enumerate(components):
        _key, label, value_key = component
        values = [
            (hourly_by_hour.get(hour) or {}).get(value_key)
            for hour in DA_LMP_HOURS
        ]
        onpeak = [
            value
            for hour, value in zip(DA_LMP_HOURS, values)
            if _is_da_lmp_peak_hour(
                hour,
                peak_start_he=peak_start_he,
                peak_end_he=peak_end_he,
            )
        ]
        offpeak = [
            value
            for hour, value in zip(DA_LMP_HOURS, values)
            if not _is_da_lmp_peak_hour(
                hour,
                peak_start_he=peak_start_he,
                peak_end_he=peak_end_he,
            )
        ]
        background = "#ffffff" if index % 2 == 0 else "#f9fafb"
        cells = [
            _td(snapshot.get("target_date"), align="left"),
            _td(label, align="left", bold=True),
            _td(_format_price(_avg(onpeak)), align="right"),
            _td(_format_price(_avg(offpeak)), align="right"),
            _td(_format_price(_avg(values)), align="right"),
        ]
        cells.extend(_td(_format_price(value), align="right") for value in values)
        rows.append(
            f"<tr style=\"background-color:{background};\">" + "".join(cells) + "</tr>"
        )
    hour_headers = "".join(_th(f"HE{hour}") for hour in DA_LMP_HOURS)
    return (
        "<table role=\"presentation\" width=\"100%\" cellspacing=\"0\" "
        "cellpadding=\"0\" border=\"0\" style=\"border:1px solid #e5e7eb; "
        "border-collapse:collapse; margin-bottom:12px;\">"
        "<tr>"
        f"{_th('Date', align='left')}"
        f"{_th('Component', align='left')}"
        f"{_th(snapshot.get('peak_label') or 'Peak')}"
        f"{_th(snapshot.get('off_peak_label') or 'OffPeak')}"
        f"{_th('Flat')}"
        f"{hour_headers}"
        "</tr>"
        + "".join(rows)
        + "</table>"
    )


def _da_lmp_snapshot_text_summary(snapshot: dict[str, Any] | None) -> str:
    if not snapshot:
        return "not supplied"
    hubs = snapshot.get("hubs") or []
    populated = sum(1 for hub in hubs if int(hub.get("hours") or 0) > 0)
    return (
        f"{snapshot.get('iso_label')} {snapshot.get('target_date')} "
        f"{populated}/{len(hubs)} hubs populated; as of "
        f"{snapshot.get('as_of') or 'unknown'}"
    )


def _avg(values: Any) -> float | None:
    numbers = [value for value in values if value is not None]
    if not numbers:
        return None
    return sum(numbers) / len(numbers)


def _to_float(value: Any) -> float | None:
    if value is None:
        return None
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, (int, float)):
        return float(value)
    text = str(value).strip()
    if not text:
        return None
    try:
        return float(text)
    except ValueError:
        return None


def _format_price(value: Any) -> str:
    number = _to_float(value)
    if number is None:
        return "-"
    if number < 0:
        return f"-${abs(number):,.2f}"
    return f"${number:,.2f}"


def _th(value: Any, *, align: str = "right") -> str:
    return (
        f"<th align=\"{align}\" style=\"padding:5px 6px; "
        "background-color:#f3f4f6; border-bottom:1px solid #d1d5db; "
        f"text-align:{align}; color:#4b5563; font-size:10px; "
        f"line-height:14px; white-space:nowrap;\">{_html(value)}</th>"
    )


def _td(
    value: Any,
    *,
    align: str = "left",
    bold: bool = False,
    colspan: int | None = None,
) -> str:
    colspan_attr = f" colspan=\"{colspan}\"" if colspan else ""
    weight = "700" if bold else "400"
    return (
        f"<td{colspan_attr} align=\"{align}\" style=\"padding:5px 6px; "
        "border-bottom:1px solid #e5e7eb; "
        f"text-align:{align}; color:#111827; font-size:10px; "
        f"line-height:14px; font-weight:{weight}; white-space:nowrap;\">"
        f"{_html(value)}</td>"
    )


def _html(value: Any) -> str:
    if value is None:
        return ""
    return html.escape(str(value), quote=True)


def _latest_clear_street_trade_file(summary: dict[str, Any]) -> dict[str, Any]:
    latest = summary.get("latest_trade_file")
    if isinstance(latest, dict):
        return latest
    return {}


def _nav_positions_source_files(summary: dict[str, Any]) -> list[dict[str, Any]]:
    raw_files = summary.get("source_files")
    if not isinstance(raw_files, list):
        return []
    return [item for item in raw_files if isinstance(item, dict)]


def _nav_positions_nav_date(
    summary: dict[str, Any],
    source_files: list[dict[str, Any]],
) -> str:
    value = summary.get("target_nav_date")
    if value:
        return _format_yyyymmdd_date(value)

    for source_file in source_files:
        for key in ("remote_filename", "local_filename"):
            filename = source_file.get(key)
            if not filename:
                continue
            match = str(filename).split("_")
            if len(match) >= 2 and len(match[1]) == 8 and match[1].isdigit():
                return _format_yyyymmdd_date(match[1])

    raise ValueError("NAV positions email summary is missing target_nav_date.")


def _latest_nav_positions_upload_timestamp(
    summary: dict[str, Any],
    source_files: list[dict[str, Any]],
) -> datetime | None:
    values = [
        source_file.get("sftp_upload_timestamp")
        for source_file in source_files
        if source_file.get("sftp_upload_timestamp") is not None
    ]
    if not values and summary.get("latest_sftp_upload_timestamp") is not None:
        values.append(summary["latest_sftp_upload_timestamp"])
    if not values:
        return None
    return max(_coerce_utc_datetime(value) for value in values)


def _nav_positions_source_names(
    source_files: list[dict[str, Any]],
    fallback_names: list[str],
) -> list[str]:
    names = [
        str(source_file.get("remote_filename") or source_file.get("local_filename"))
        for source_file in source_files
        if source_file.get("remote_filename") or source_file.get("local_filename")
    ]
    return names or fallback_names


def _subject_with_tags(subject: str, tags: list[str]) -> str:
    clean_tags = [str(tag).strip() for tag in tags if str(tag).strip()]
    if not clean_tags:
        return subject
    return " | ".join([subject, *clean_tags])


def _subject_date_label(value: Any) -> str:
    text = str(value).strip()
    for fmt in ("%Y-%m-%d", "%Y%m%d"):
        try:
            return datetime.strptime(text, fmt).strftime("%a %b-%d")
        except ValueError:
            continue
    return text


def _format_yyyymmdd_date(value: Any) -> str:
    if value is None:
        raise ValueError("Missing YYYYMMDD date value")
    text = str(value).strip()
    if len(text) == 8 and text.isdigit():
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


def _clear_street_mufg_warning_lines(summary: dict[str, Any]) -> list[str]:
    warnings: list[str] = []
    if bool(summary.get("sql_extract_empty", False)):
        warnings.append("SQL extract returned 0 rows.")
    if bool(summary.get("sql_extract_sftp_date_mismatch", False)):
        expected = summary.get("expected_trade_date_from_sftp") or "unknown"
        actual = summary.get("sftp_date_from_sql") or summary.get("sftp_date")
        warnings.append(
            "SQL extract SFTP date does not match expected Clear Street "
            f"trade date: expected {expected}, actual {actual or 'unknown'}."
        )
    non_ok_rows = int(summary.get("non_ok_trade_status_rows", 0) or 0)
    if non_ok_rows > 0:
        warnings.append(
            f"{non_ok_rows:,} rows have non-ok trade_status: "
            f"{_format_counts(summary.get('trade_status_counts'))}."
        )

    null_check = summary.get("product_code_null_check")
    if isinstance(null_check, dict) and (
        bool(null_check.get("has_nulls"))
        or int(null_check.get("null_rows", 0) or 0) > 0
    ):
        null_rows = int(null_check.get("null_rows", 0) or 0)
        product_count = int(
            null_check.get("affected_product_count")
            or len(null_check.get("affected_products") or [])
        )
        product_word = "product" if product_count == 1 else "products"
        products = _format_email_affected_products(
            null_check.get("affected_products")
        )
        product_text = f": {products}" if products else "."
        warnings.append(
            "Product mapping needed for "
            f"{null_rows:,} rows across {product_count:,} source "
            f"{product_word}{product_text}"
        )
    return warnings


def _format_counts(value: Any) -> str:
    if not isinstance(value, dict):
        return "not supplied"
    parts = [f"{key}={count}" for key, count in value.items()]
    return ", ".join(parts) if parts else "not supplied"


def _format_email_affected_products(value: Any, max_products: int = 8) -> str:
    if not isinstance(value, list):
        return ""
    parts: list[str] = []
    for item in value[:max_products]:
        if not isinstance(item, dict):
            continue
        row_count = int(item.get("row_count") or 0)
        product = str(item.get("product") or "unknown")
        details = _format_email_product_details(item)
        detail_text = f"; {details}" if details else ""
        row_word = "row" if row_count == 1 else "rows"
        parts.append(f"{product} ({row_count:,} {row_word}{detail_text})")
    hidden_count = max(0, len(value) - len(parts))
    if hidden_count:
        parts.append(f"{hidden_count:,} more source products")
    return "; ".join(parts)


def _format_email_product_details(product: dict[str, Any]) -> str:
    source_fields = product.get("source_fields")
    if not isinstance(source_fields, dict):
        source_fields = {}
    parts: list[str] = []
    for label, key in [
        ("futures", "futures_code"),
        ("exch", "exch_comm_cd"),
        ("exchange", "exchange_name"),
        ("symbol", "symbol"),
    ]:
        value = source_fields.get(key)
        if value:
            parts.append(f"{label} {value}")
    months = _coerce_string_list(product.get("contract_year_months"))
    if months:
        parts.append("months " + ", ".join(months[:4]))
    statuses = _coerce_string_list(product.get("trade_statuses"))
    if statuses:
        parts.append("statuses " + ", ".join(statuses[:4]))
    return "; ".join(parts)


def _coerce_payload(value: Any) -> dict[str, Any]:
    if isinstance(value, dict):
        return value
    if isinstance(value, str) and value.strip():
        try:
            payload = json.loads(value)
        except json.JSONDecodeError:
            return {}
        return payload if isinstance(payload, dict) else {}
    return {}


def _attachment_paths_from_payload(payload: dict[str, Any]) -> list[str | Path] | None:
    raw_paths = payload.get("attachment_paths")
    if not isinstance(raw_paths, list):
        return None
    paths = [str(path).strip() for path in raw_paths if str(path).strip()]
    return paths or None


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
    timezone_label = local_value.tzname() or ""
    if timezone_label:
        timezone_label = f" {timezone_label}"
    return local_value.strftime(f"%Y-%m-%d %H:%M{timezone_label}")


def _coerce_string_list(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    return [str(item).strip() for item in value if str(item).strip()]


def _business_date_from_event(event: dict[str, Any]) -> str:
    payload = event.get("payload")
    if isinstance(payload, dict) and payload.get("business_date"):
        return str(payload["business_date"])
    event_key = str(event["event_key"])
    parts = event_key.split(":")
    if len(parts) >= 3 and parts[2]:
        return parts[2]
    raise ValueError(f"Cannot derive business date from event_key: {event_key}")


def _retry_delay_minutes(attempts: int) -> int:
    return min(60, 2 ** max(0, attempts - 1))


def _dict_rows(cursor: Any) -> list[dict[str, Any]]:
    column_names = [desc[0] for desc in cursor.description]
    return [dict(zip(column_names, row)) for row in cursor.fetchall()]


def _required(name: str, value: str | None) -> str:
    if value:
        return value
    raise RuntimeError(f"Missing required email setting: {name}")
