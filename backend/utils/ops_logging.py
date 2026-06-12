from __future__ import annotations

import json
import logging
import re
import socket
import time
import uuid
from pathlib import Path
from typing import Any, Optional, Union

import pandas as pd

from backend.utils import db
from backend.utils.script_logging import utc_now

logger = logging.getLogger(__name__)

APP_NAME = "helioscta-azure-backend"
SCHEMA = "ops"
PIPELINE_RUNS_TABLE = "pipeline_runs"

PIPELINE_RUN_COLUMNS = [
    "run_id",
    "pipeline_name",
    "event_type",
    "event_timestamp",
    "duration_seconds",
    "status",
    "error_type",
    "error_message",
    "log_file_content",
    "rows_processed",
    "files_processed",
    "source",
    "priority",
    "tags",
    "hostname",
    "notification_channel",
    "notification_recipient",
    "metadata",
    "target_table",
    "operation_type",
]

PIPELINE_RUN_DATA_TYPES = [
    "VARCHAR",
    "VARCHAR",
    "VARCHAR",
    "TIMESTAMPTZ",
    "FLOAT",
    "VARCHAR",
    "VARCHAR",
    "TEXT",
    "TEXT",
    "INTEGER",
    "INTEGER",
    "VARCHAR",
    "VARCHAR",
    "VARCHAR",
    "VARCHAR",
    "VARCHAR",
    "VARCHAR",
    "JSONB",
    "VARCHAR",
    "VARCHAR",
]

PIPELINE_RUN_PRIMARY_KEY = ["run_id", "event_type", "event_timestamp"]
VALID_OPERATION_TYPES = {"upsert", "consume"}

_SECRET_QUERY_RE = re.compile(
    r"(?i)\b(subscription-key|api[_-]?key|apikey|access[_-]?token|"
    r"refresh[_-]?token|token|password|passwd|secret|account|profile)"
    r"=[^&\s'\"]+"
)


class PipelineRunLogger:
    def __init__(
        self,
        pipeline_name: str,
        source: str = "",
        priority: str = "medium",
        tags: str = "",
        log_file_path: Optional[Union[str, Path]] = None,
        target_table: str = "",
        operation_type: str = "",
        database: str | None = None,
    ) -> None:
        if operation_type and operation_type not in VALID_OPERATION_TYPES:
            raise ValueError(
                f"Invalid operation_type '{operation_type}'. "
                f"Must be one of: {sorted(VALID_OPERATION_TYPES)}"
            )
        if operation_type and not target_table:
            raise ValueError("target_table is required when operation_type is set")

        self.run_id = str(uuid.uuid4())
        self.pipeline_name = pipeline_name
        self.source = source
        self.priority = priority
        self.tags = tags
        self.log_file_path = log_file_path
        self.target_table = target_table
        self.operation_type = operation_type
        self.database = database
        self.hostname = socket.gethostname()
        self._start_time: Optional[float] = None
        self._rows_processed = 0
        self._files_processed = 0

    def start(self) -> None:
        self._start_time = time.time()

    def success(
        self,
        rows_processed: Optional[int] = None,
        files_processed: Optional[int] = None,
        metadata: Optional[dict[str, Any]] = None,
    ) -> None:
        if rows_processed is not None:
            self._rows_processed = rows_processed
        if files_processed is not None:
            self._files_processed = files_processed

        self._write_event(
            event_type="RUN_SUCCESS",
            status="success",
            duration_seconds=self._elapsed(),
            rows_processed=self._rows_processed,
            files_processed=self._files_processed,
            metadata=metadata,
        )

    def failure(
        self,
        error: Optional[Exception] = None,
        log_file_path: Optional[Union[str, Path]] = None,
        rows_processed: Optional[int] = None,
        files_processed: Optional[int] = None,
        metadata: Optional[dict[str, Any]] = None,
    ) -> None:
        if rows_processed is not None:
            self._rows_processed = rows_processed
        if files_processed is not None:
            self._files_processed = files_processed

        error_type = type(error).__name__ if error else ""
        error_message = _redact_secrets(f"{error_type}: {error}" if error else "") or ""
        self._write_event(
            event_type="RUN_FAILURE",
            status="failure",
            duration_seconds=self._elapsed(),
            error_type=error_type,
            error_message=error_message,
            log_file_content=self._read_log_file(log_file_path or self.log_file_path),
            rows_processed=self._rows_processed,
            files_processed=self._files_processed,
            metadata=metadata,
        )

    def _elapsed(self) -> float:
        if self._start_time is None:
            return 0.0
        return round(time.time() - self._start_time, 3)

    @staticmethod
    def _read_log_file(log_file_path: Optional[Union[str, Path]]) -> str:
        if not log_file_path:
            return ""
        path = Path(log_file_path)
        if not path.exists():
            return ""
        try:
            return path.read_text(encoding="utf-8")
        except Exception:
            return ""

    def _write_event(
        self,
        event_type: str,
        status: str,
        duration_seconds: float = 0.0,
        error_type: str = "",
        error_message: str = "",
        log_file_content: str = "",
        rows_processed: int = 0,
        files_processed: int = 0,
        notification_channel: str = "",
        notification_recipient: str = "",
        metadata: Optional[dict[str, Any]] = None,
    ) -> None:
        row = {
            "run_id": self.run_id,
            "pipeline_name": self.pipeline_name,
            "event_type": event_type,
            "event_timestamp": utc_now(),
            "duration_seconds": duration_seconds,
            "status": status,
            "error_type": error_type,
            "error_message": error_message,
            "log_file_content": log_file_content,
            "rows_processed": rows_processed,
            "files_processed": files_processed,
            "source": self.source,
            "priority": self.priority,
            "tags": self.tags,
            "hostname": self.hostname,
            "notification_channel": notification_channel,
            "notification_recipient": notification_recipient,
            "metadata": json.dumps(metadata or {}, default=str),
            "target_table": self.target_table,
            "operation_type": self.operation_type,
        }
        try:
            db.upsert_dataframe(
                database=self.database,
                schema=SCHEMA,
                table_name=PIPELINE_RUNS_TABLE,
                df=pd.DataFrame([row]),
                columns=PIPELINE_RUN_COLUMNS,
                primary_key=PIPELINE_RUN_PRIMARY_KEY,
                data_types=PIPELINE_RUN_DATA_TYPES,
            )
            logger.info(
                "[pipeline_run_logger] %s logged for %s (run_id=%s)",
                event_type,
                self.pipeline_name,
                self.run_id,
            )
        except Exception:
            logger.exception("[pipeline_run_logger] Failed to log %s", event_type)


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
