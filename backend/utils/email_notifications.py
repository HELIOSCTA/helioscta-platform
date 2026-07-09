from __future__ import annotations

import base64
import json
import logging
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
DEFAULT_PJM_DA_HRL_LMP_COMPONENT = "all"
MAX_ERROR_MESSAGE_LENGTH = 2000
CLEAR_STREET_EOD_TRANSACTIONS_DATASET = "clear_street_eod_transactions"
CLEAR_STREET_MUFG_UPLOAD_DATASET = "clear_street_trades_mufg_upload"


def notifications_enabled() -> bool:
    return credentials.HELIOS_EMAIL_NOTIFICATIONS_ENABLED


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


def build_pjm_da_hrl_lmp_release_email(
    *,
    event: dict[str, Any],
    recipient_email: str,
    base_url: str | None = None,
    hub: str = DEFAULT_PJM_DA_HRL_LMP_HUB,
) -> dict[str, Any]:
    event_key = str(event["event_key"])
    business_date = _business_date_from_event(event)
    report_url = build_pjm_da_hrl_lmp_report_url(
        business_date=business_date,
        hub=hub,
        base_url=base_url,
    )
    subject = _subject_with_tags(
        f"PJM DA HRL LMPs released for {_subject_date_label(business_date)}",
        ["HeliosCTA", "PJM", "DA HRL LMPs", "Posted"],
    )
    body_text = (
        f"PJM DA HRL LMPs are available for {business_date}.\n\n"
        f"Report: {report_url}\n\n"
        f"Source event: {event_key}"
    )
    body_html = email_templates.render_email(
        title="PJM DA HRL LMPs Available",
        preheader=f"PJM DA hourly LMPs are available for {business_date}.",
        status_label="Posted",
        status_tone="success",
        intro=f"PJM DA hourly LMPs are available for {business_date}.",
        facts=[
            ("Business date", business_date),
            ("Hub", hub),
            ("Component", DEFAULT_PJM_DA_HRL_LMP_COMPONENT),
            ("Source event", event_key),
        ],
        sections=[
            email_templates.link_section(
                "Report",
                label="Open single-day report",
                url=report_url,
            )
        ],
    )
    return {
        "notification_key": f"{event_key}:email:release",
        "recipient_email": recipient_email,
        "dataset": "pjm_da_hrl_lmps",
        "source_event_key": event_key,
        "source_event_id": event.get("id"),
        "subject": subject,
        "body_text": body_text,
        "body_html": body_html,
        "payload": {
            "business_date": business_date,
            "report_url": report_url,
            "hub": hub,
            "component": DEFAULT_PJM_DA_HRL_LMP_COMPONENT,
        },
    }


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
    enqueued = []
    for recipient_email in credentials.HELIOS_EMAIL_RECIPIENTS:
        recipient_email = recipient_email.strip().lower()
        if not recipient_email:
            continue
        message = build_pjm_da_hrl_lmp_release_email(
            event=event,
            recipient_email=recipient_email,
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


def _latest_clear_street_trade_file(summary: dict[str, Any]) -> dict[str, Any]:
    latest = summary.get("latest_trade_file")
    if isinstance(latest, dict):
        return latest
    return {}


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
