"""Generic backend alert outbox.

Backend pipelines use this module to write durable, structured alert rows.
Email rendering and delivery are intentionally left to the frontend/Vercel
outbox processor.

The ``alerts.events`` table is provisioned out-of-band via
``python -m backend.alerts.ensure_table``; the functions here assume it exists.
"""

from __future__ import annotations

import json
import logging
from typing import Any

from backend.utils import db
from backend.utils.script_logging import utc_now

logger = logging.getLogger(__name__)

SCHEMA = "alerts"
TABLE = "events"

VALID_SEVERITIES = {"info", "warning", "error", "critical"}
VALID_EMAIL_STATUSES = {"pending", "sending", "sent", "failed", "suppressed"}


def alert_exists(alert_key: str) -> bool:
    """Return true when an alert with ``alert_key`` already exists."""
    rows = db.execute_sql(
        """
        SELECT 1 AS exists
        FROM alerts.events
        WHERE alert_key = %s
        LIMIT 1;
        """,
        params=(alert_key,),
        fetch=True,
    )
    return bool(rows)


def emit_alert(
    alert_key: str,
    alert_type: str,
    title: str,
    message: str,
    source_system: str,
    severity: str = "info",
    payload: dict[str, Any] | None = None,
    recipient_emails: list[str] | None = None,
    email_status: str = "pending",
) -> dict[str, Any]:
    """Insert a durable alert row if missing and return the alert metadata.

    ``alert_key`` is the idempotency key. Existing alerts are returned without
    changing email state so retries do not cause duplicate emails.

    Pass ``email_status='suppressed'`` for audit-only rows the email cron
    must never pick up (e.g. backfilled alerts older than the freshness
    window).
    """
    if severity not in VALID_SEVERITIES:
        raise ValueError(
            f"Invalid alert severity '{severity}'. "
            f"Expected one of {sorted(VALID_SEVERITIES)}."
        )
    if email_status not in VALID_EMAIL_STATUSES:
        raise ValueError(
            f"Invalid email_status '{email_status}'. "
            f"Expected one of {sorted(VALID_EMAIL_STATUSES)}."
        )

    now = utc_now()
    recipients = recipient_emails or []

    rows = db.execute_sql(
        """
        WITH inserted AS (
            INSERT INTO alerts.events (
                alert_key,
                alert_type,
                severity,
                title,
                message,
                source_system,
                event_time,
                payload,
                recipient_emails,
                acknowledged_by,
                email_status,
                email_attempts,
                created_at,
                updated_at
            )
            VALUES (
                %s, %s, %s, %s, %s, %s, %s,
                %s::jsonb,
                %s::jsonb,
                '[]'::jsonb,
                %s,
                0,
                %s,
                %s
            )
            ON CONFLICT (alert_key) DO NOTHING
            RETURNING id, alert_key, TRUE AS created
        )
        SELECT id, alert_key, created
        FROM inserted
        UNION ALL
        SELECT id, alert_key, FALSE AS created
        FROM alerts.events
        WHERE alert_key = %s
          AND NOT EXISTS (SELECT 1 FROM inserted)
        LIMIT 1;
        """,
        params=(
            alert_key,
            alert_type,
            severity,
            title,
            message,
            source_system,
            now,
            json.dumps(payload or {}, default=str),
            json.dumps(recipients, default=str),
            email_status,
            now,
            now,
            alert_key,
        ),
        fetch=True,
    )

    if not rows:
        raise RuntimeError(f"Failed to emit or fetch alert '{alert_key}'")

    result = rows[0]
    if result["created"]:
        logger.info("Created alert %s", alert_key)
    else:
        logger.info("Alert %s already exists; skipping duplicate emit", alert_key)
    return result
