from __future__ import annotations

import logging

from backend import credentials
from backend.utils.slack_notifications import send_due_slack_notifications

logger = logging.getLogger(__name__)

DEFAULT_LIMIT = 20


def main(
    limit: int = DEFAULT_LIMIT,
    database: str | None = None,
) -> int:
    database = database or credentials.AZURE_POSTGRESQL_DB_NAME
    results = send_due_slack_notifications(limit=limit, database=database)
    logger.info("Processed %s Slack notification outbox row(s)", len(results))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
