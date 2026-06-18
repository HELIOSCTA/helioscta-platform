"""Helpers for hot-table retention purges."""

from __future__ import annotations

from psycopg2 import sql

from backend.utils import db


def purge_rows_older_than(
    *,
    schema: str,
    table_name: str,
    timestamp_column: str,
    retention_days: int,
    database: str | None = None,
) -> int:
    """Delete rows older than a table's configured hot retention window."""
    if retention_days < 1:
        raise ValueError("retention_days must be >= 1")

    connection = None
    cursor = None
    try:
        connection = db.connect(database=database)
        cursor = connection.cursor()
        cursor.execute(
            """
            SELECT data_type
            FROM information_schema.columns
            WHERE table_schema = %s
              AND table_name = %s
              AND column_name = %s;
            """,
            (schema, table_name, timestamp_column),
        )
        row = cursor.fetchone()
        if row is None:
            raise ValueError(
                f"Retention column {schema}.{table_name}.{timestamp_column} does not exist"
            )

        if row[0] == "date":
            cutoff_expression = sql.SQL("(CURRENT_DATE - %s::int)")
        else:
            cutoff_expression = sql.SQL("(NOW() - (%s::int * INTERVAL '1 day'))")

        query = sql.SQL(
            """
            WITH deleted AS (
                DELETE FROM {}.{}
                WHERE {} < {}
                RETURNING 1
            )
            SELECT COUNT(*) AS deleted_rows
            FROM deleted;
            """
        ).format(
            sql.Identifier(schema),
            sql.Identifier(table_name),
            sql.Identifier(timestamp_column),
            cutoff_expression,
        )
        cursor.execute(query, (retention_days,))
        deleted_rows = int(cursor.fetchone()[0])
        connection.commit()
        return deleted_rows
    except Exception:
        if connection:
            connection.rollback()
        raise
    finally:
        if cursor:
            cursor.close()
        if connection:
            connection.close()
