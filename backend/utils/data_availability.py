from __future__ import annotations

import json
import logging
from datetime import date, datetime
from typing import Any

from backend.utils import db

logger = logging.getLogger(__name__)

VALID_COMPLETENESS_STATUSES = {"complete", "partial", "unknown"}


def emit_data_availability_event(
    *,
    event_key: str,
    dataset: str,
    source_system: str,
    availability_type: str,
    business_date: date | None = None,
    window_start: datetime | None = None,
    window_end: datetime | None = None,
    scope: str | None = None,
    grain: str | None = None,
    source_table: str | None = None,
    row_count: int | None = None,
    entity_count: int | None = None,
    period_count: int | None = None,
    completeness_status: str = "unknown",
    run_id: str | None = None,
    payload: dict[str, Any] | None = None,
    database: str | None = None,
) -> dict[str, Any]:
    """Insert one idempotent data availability event and return its metadata."""
    if completeness_status not in VALID_COMPLETENESS_STATUSES:
        raise ValueError(
            f"Invalid completeness_status '{completeness_status}'. "
            f"Expected one of {sorted(VALID_COMPLETENESS_STATUSES)}."
        )

    rows = db.execute_sql(
        """
        WITH inserted AS (
            INSERT INTO ops.data_availability_events (
                event_key,
                dataset,
                source_system,
                availability_type,
                business_date,
                window_start,
                window_end,
                scope,
                grain,
                source_table,
                row_count,
                entity_count,
                period_count,
                completeness_status,
                run_id,
                payload
            )
            VALUES (
                %s, %s, %s, %s, %s, %s, %s, %s,
                %s, %s, %s, %s, %s, %s, %s, %s::jsonb
            )
            ON CONFLICT (event_key) DO NOTHING
            RETURNING id, event_key, TRUE AS created
        )
        SELECT id, event_key, created
        FROM inserted
        UNION ALL
        SELECT id, event_key, FALSE AS created
        FROM ops.data_availability_events
        WHERE event_key = %s
          AND NOT EXISTS (SELECT 1 FROM inserted)
        LIMIT 1;
        """,
        params=(
            event_key,
            dataset,
            source_system,
            availability_type,
            business_date,
            window_start,
            window_end,
            scope,
            grain,
            source_table,
            row_count,
            entity_count,
            period_count,
            completeness_status,
            run_id,
            json.dumps(payload or {}, default=str),
            event_key,
        ),
        database=database,
        fetch=True,
    )

    if not rows:
        raise RuntimeError(
            f"Failed to emit or fetch data availability event '{event_key}'"
        )

    result = rows[0]
    if result["created"]:
        logger.info("Created data availability event %s", event_key)
    else:
        logger.info(
            "Data availability event %s already exists; skipping duplicate emit",
            event_key,
        )
    return result
