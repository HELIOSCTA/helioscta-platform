from __future__ import annotations

import json
import logging
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


def _dict_rows(cursor: Any) -> list[dict[str, Any]]:
    column_names = [desc[0] for desc in cursor.description]
    return [dict(zip(column_names, row)) for row in cursor.fetchall()]
