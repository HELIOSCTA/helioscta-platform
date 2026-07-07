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
from backend.utils import db

logger = logging.getLogger(__name__)

GRAPH_TOKEN_URL_TEMPLATE = (
    "https://login.microsoftonline.com/{tenant_id}/oauth2/v2.0/token"
)
GRAPH_SEND_MAIL_URL_TEMPLATE = "https://graph.microsoft.com/v1.0/users/{sender}/sendMail"
GRAPH_SCOPE = "https://graph.microsoft.com/.default"
DEFAULT_PJM_DA_HRL_LMP_HUB = "WESTERN HUB"
DEFAULT_PJM_DA_HRL_LMP_COMPONENT = "all"
MAX_ERROR_MESSAGE_LENGTH = 2000


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
    subject = f"PJM DA HRL LMPs released for {business_date}"
    body_text = (
        f"PJM DA HRL LMPs are available for {business_date}.\n\n"
        f"Report: {report_url}\n\n"
        f"Source event: {event_key}"
    )
    body_html = (
        "<p>PJM DA HRL LMPs are available for "
        f"<strong>{business_date}</strong>.</p>"
        f'<p><a href="{report_url}">Open the single-day report</a></p>'
        f"<p>Source event: <code>{event_key}</code></p>"
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
            send_email_via_graph(
                recipient_email=row["recipient_email"],
                subject=row["subject"],
                body_text=row["body_text"],
                body_html=row.get("body_html"),
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
