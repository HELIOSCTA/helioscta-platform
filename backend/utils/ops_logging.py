from __future__ import annotations

import json
import logging
import re
from typing import Any

from backend.utils import db

logger = logging.getLogger(__name__)

APP_NAME = "helioscta-azure-backend"

_SECRET_QUERY_RE = re.compile(
    r"(?i)\b(subscription-key|api[_-]?key|apikey|access[_-]?token|"
    r"refresh[_-]?token|token|password|passwd|secret|account|profile)"
    r"=[^&\s'\"]+"
)


def log_api_fetch(
    *,
    actor_type: str,
    provider: str,
    operation_name: str,
    method: str,
    target_host: str,
    target_path: str,
    status: str,
    elapsed_ms: int,
    pipeline_name: str | None = None,
    run_id: str | None = None,
    content_id: int | None = None,
    feed_name: str | None = None,
    target_table: str | None = None,
    http_status: int | None = None,
    attempt: int = 1,
    max_attempts: int = 1,
    rows_returned: int | None = None,
    rows_written: int | None = None,
    error_type: str | None = None,
    error_message: str | None = None,
    metadata: dict[str, Any] | None = None,
    database: str | None = None,
) -> None:
    sql = """
        INSERT INTO ops.api_fetch_log (
            app_name,
            actor_type,
            provider,
            pipeline_name,
            run_id,
            operation_name,
            content_id,
            feed_name,
            target_table,
            method,
            target_host,
            target_path,
            status,
            http_status,
            attempt,
            max_attempts,
            elapsed_ms,
            rows_returned,
            rows_written,
            error_type,
            error_message,
            metadata
        )
        VALUES (
            %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
            %s, %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb
        );
    """
    params = (
        APP_NAME,
        actor_type,
        provider,
        pipeline_name,
        run_id,
        operation_name,
        content_id,
        feed_name,
        target_table,
        method,
        target_host,
        target_path,
        status,
        http_status,
        attempt,
        max_attempts,
        max(0, int(elapsed_ms)),
        rows_returned,
        rows_written,
        _truncate(error_type, 255),
        _truncate(_redact_secrets(error_message)),
        json.dumps(metadata or {}, default=str),
    )
    try:
        db.execute_sql(sql, params=params, database=database)
    except Exception:
        logger.warning(
            "Failed to write ops.api_fetch_log telemetry for %s %s",
            provider,
            operation_name,
            exc_info=True,
        )


def redact_secrets(value: str | None) -> str | None:
    return _redact_secrets(value)


def _redact_secrets(value: str | None) -> str | None:
    if value is None:
        return None
    return _SECRET_QUERY_RE.sub(r"\1=***", value)


def _truncate(value: str | None, limit: int = 2000) -> str | None:
    if value is None:
        return None
    return value[:limit]
