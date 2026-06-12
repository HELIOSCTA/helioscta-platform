from __future__ import annotations

import csv
import io
import logging
import uuid
from datetime import date as datetime_date
from datetime import time as datetime_time
from typing import Any

import numpy as np
import pandas as pd
import psycopg2
from psycopg2 import sql

from backend import credentials

logger = logging.getLogger(__name__)


def connect(database: str | None = None) -> psycopg2.extensions.connection:
    database = database or credentials.AZURE_POSTGRESQL_DB_NAME
    return psycopg2.connect(
        user=credentials.AZURE_POSTGRESQL_DB_USER,
        password=credentials.AZURE_POSTGRESQL_DB_PASSWORD,
        host=credentials.AZURE_POSTGRESQL_DB_HOST,
        port=credentials.AZURE_POSTGRESQL_DB_PORT,
        dbname=database,
        sslmode=credentials.AZURE_POSTGRESQL_DB_SSLMODE,
    )


def fetch_df(query: str, database: str | None = None) -> pd.DataFrame:
    connection = connect(database=database)
    cursor = None
    try:
        cursor = connection.cursor()
        cursor.execute(query)
        columns = [desc[0] for desc in cursor.description]
        return pd.DataFrame(cursor.fetchall(), columns=columns)
    finally:
        if cursor:
            cursor.close()
        connection.close()


def execute_sql(
    query: str,
    params: tuple[Any, ...] | None = None,
    database: str | None = None,
    fetch: bool = False,
) -> list[dict[str, Any]] | None:
    connection = None
    cursor = None
    try:
        connection = connect(database=database)
        cursor = connection.cursor()
        cursor.execute(query, params)

        rows = None
        if fetch:
            column_names = [desc[0] for desc in cursor.description]
            rows = [dict(zip(column_names, row)) for row in cursor.fetchall()]

        connection.commit()
        return rows
    except Exception:
        if connection:
            connection.rollback()
        logger.exception("Error executing SQL against Azure PostgreSQL")
        raise
    finally:
        if cursor:
            cursor.close()
        if connection:
            connection.close()


def infer_sql_data_types(df: pd.DataFrame) -> list[str]:
    def infer_column_type(col: str) -> str:
        series = df[col].dropna()
        if series.empty:
            return "VARCHAR"

        value = series.iloc[0]
        if isinstance(value, str):
            return "VARCHAR"
        if isinstance(value, (bool, np.bool_)):
            return "BOOLEAN"
        if isinstance(value, (int, np.integer)):
            return "INTEGER"
        if isinstance(value, (float, np.floating)):
            return "FLOAT"
        if isinstance(value, pd.Timestamp):
            return "TIMESTAMP"
        if isinstance(value, datetime_date):
            return "DATE"
        if isinstance(value, datetime_time):
            return "VARCHAR"

        raise NotImplementedError(f"Unsupported SQL type for column {col}: {type(value)}")

    return [infer_column_type(col) for col in df.columns]


def upsert_dataframe(
    schema: str,
    table_name: str,
    df: pd.DataFrame,
    columns: list[str],
    primary_key: list[str],
    data_types: list[str] | None = None,
    database: str | None = None,
) -> bool:
    if df.empty:
        logger.info("Skipping empty upsert into %s.%s", schema, table_name)
        return True

    if data_types is None:
        data_types = infer_sql_data_types(df)

    temp_table = f"temp_{table_name}_{uuid.uuid4().hex}"

    connection = None
    cursor = None
    try:
        connection = connect(database=database)
        cursor = connection.cursor()

        cursor.execute(_assert_target_table_sql(schema=schema, table_name=table_name))
        _validate_target_columns(
            cursor=cursor,
            schema=schema,
            table_name=table_name,
            columns=columns,
            audit_columns=["created_at", "updated_at"],
        )
        cursor.execute(
            _create_temp_table_sql(
                table_name=temp_table,
                columns=columns,
                data_types=data_types,
            )
        )

        df_temp = df.copy()
        now_sql = pd.Timestamp.now(tz="UTC")
        df_temp["created_at"] = now_sql
        df_temp["updated_at"] = now_sql

        buffer = io.StringIO()
        df_temp.to_csv(
            buffer,
            index=False,
            header=False,
            quoting=csv.QUOTE_NONNUMERIC,
            sep=",",
            na_rep="",
        )
        buffer.seek(0)

        cursor.copy_expert(_copy_sql(temp_table).as_string(connection), buffer)
        cursor.execute(
            _upsert_sql(
                schema=schema,
                table_name=table_name,
                temp_table=temp_table,
                columns=columns,
                primary_key=primary_key,
            )
        )
        cursor.execute(
            sql.SQL("DROP TABLE IF EXISTS {}").format(
                sql.Identifier(temp_table),
            )
        )
        connection.commit()
        logger.info("Upserted %s rows into %s.%s", len(df), schema, table_name)
        return True
    except Exception:
        if connection:
            connection.rollback()
        logger.exception("Error upserting data into %s.%s", schema, table_name)
        raise
    finally:
        if cursor:
            cursor.close()
        if connection:
            connection.close()


def _assert_target_table_sql(*, schema: str, table_name: str) -> sql.Composed:
    return sql.SQL("SELECT 1 FROM {}.{} LIMIT 0").format(
        sql.Identifier(schema),
        sql.Identifier(table_name),
    )


def _validate_target_columns(
    *,
    cursor: psycopg2.extensions.cursor,
    schema: str,
    table_name: str,
    columns: list[str],
    audit_columns: list[str],
) -> None:
    cursor.execute(
        """
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = %s
          AND table_name = %s;
        """,
        (schema, table_name),
    )
    existing = {row[0] for row in cursor.fetchall()}
    missing = [column for column in columns + audit_columns if column not in existing]
    if missing:
        raise ValueError(
            f"Target table {schema}.{table_name} is missing required columns: {missing}"
        )


def _create_temp_table_sql(
    *,
    table_name: str,
    columns: list[str],
    data_types: list[str],
) -> sql.Composed:
    column_defs = [
        sql.SQL("{} {}").format(sql.Identifier(column), sql.SQL(data_type))
        for column, data_type in zip(columns, data_types)
    ]
    column_defs.extend(
        [
            sql.SQL("created_at TIMESTAMPTZ"),
            sql.SQL("updated_at TIMESTAMPTZ"),
        ]
    )
    return sql.SQL("CREATE TEMP TABLE {} ({}) ON COMMIT DROP").format(
        sql.Identifier(table_name),
        sql.SQL(", ").join(column_defs),
    )


def _copy_sql(table_name: str) -> sql.Composed:
    return sql.SQL("COPY {} FROM STDIN WITH (FORMAT CSV)").format(
        sql.Identifier(table_name),
    )


def _upsert_sql(
    *,
    schema: str,
    table_name: str,
    temp_table: str,
    columns: list[str],
    primary_key: list[str],
) -> sql.Composed:
    update_columns = [column for column in columns if column not in primary_key]
    insert_columns = columns + ["created_at", "updated_at"]
    select_columns = [
        sql.SQL("source.{}").format(sql.Identifier(column))
        for column in columns
    ] + [
        sql.SQL("NOW()"),
        sql.SQL("NOW()"),
    ]
    update_assignments = [
        sql.SQL("{} = EXCLUDED.{}").format(sql.Identifier(column), sql.Identifier(column))
        for column in update_columns
    ]
    update_assignments.append(sql.SQL("updated_at = NOW()"))

    return sql.SQL(
        """
        INSERT INTO {}.{} ({})
        SELECT {} FROM {} AS source
        ON CONFLICT ({})
        DO UPDATE SET {};
        """
    ).format(
        sql.Identifier(schema),
        sql.Identifier(table_name),
        sql.SQL(", ").join(sql.Identifier(column) for column in insert_columns),
        sql.SQL(", ").join(select_columns),
        sql.Identifier(temp_table),
        sql.SQL(", ").join(sql.Identifier(column) for column in primary_key),
        sql.SQL(", ").join(update_assignments),
    )
