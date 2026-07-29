"""Bounded read-only Postgres query helper for scheduled analyst runs."""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from datetime import date, datetime
from decimal import Decimal
from typing import Any
from urllib.parse import urlparse

import psycopg2


REQUIRED_DATABASE = "helios_prod"
REQUIRED_USER = "helios_readonly"
DEFAULT_MAX_ROWS = 200
MAX_ALLOWED_ROWS = 1000
DEFAULT_TIMEOUT_MS = 20_000
MAX_TIMEOUT_MS = 30_000
FORBIDDEN_PATTERNS = re.compile(
    r"\b("
    r"alter|analyze|call|cluster|copy|create|delete|do|drop|execute|grant|"
    r"insert|listen|merge|notify|reassign|refresh|reindex|reset|revoke|"
    r"select\s+into|set|truncate|unlisten|update|vacuum"
    r")\b",
    re.IGNORECASE,
)


def _json_default(value: Any) -> str | float:
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    return str(value)


def _clean_sql(sql: str) -> str:
    without_block_comments = re.sub(r"/\*.*?\*/", " ", sql, flags=re.DOTALL)
    without_line_comments = re.sub(r"--.*?$", " ", without_block_comments, flags=re.MULTILINE)
    return without_line_comments.strip()


def _assert_safe_sql(sql: str) -> str:
    cleaned = _clean_sql(sql)
    normalized = cleaned.rstrip(";").strip()
    if not normalized:
        raise ValueError("SQL is empty.")
    if ";" in normalized:
        raise ValueError("Only one SQL statement is allowed.")
    if not re.match(r"^(select|with)\b", normalized, flags=re.IGNORECASE):
        raise ValueError("Only SELECT/WITH read-only queries are allowed.")
    if FORBIDDEN_PATTERNS.search(normalized):
        raise ValueError("SQL contains a forbidden write/admin keyword.")
    if re.search(r"\bpg_sleep\s*\(", normalized, flags=re.IGNORECASE):
        raise ValueError("pg_sleep is not allowed.")
    return normalized


def _env(name: str, fallback: str | None = None) -> str | None:
    value = os.environ.get(name)
    return value if value not in (None, "") else fallback


def _build_connection_kwargs() -> dict[str, Any]:
    database_url = _env("DATABASE_URL")
    if database_url:
        parsed = urlparse(database_url)
        user = parsed.username or ""
        database = parsed.path.lstrip("/")
        if user != REQUIRED_USER:
            raise ValueError(f"Analyst Postgres user must be {REQUIRED_USER}.")
        if database != REQUIRED_DATABASE:
            raise ValueError(f"Analyst Postgres database must be {REQUIRED_DATABASE}.")
        return {"dsn": database_url}

    host = _env("HELIOS_POSTGRES_READONLY_HOST") or _env("DBT_POSTGRES_HOST")
    user = _env("HELIOS_POSTGRES_READONLY_USER") or _env("DBT_POSTGRES_READONLY_USER")
    password = _env("HELIOS_POSTGRES_READONLY_PASSWORD") or _env(
        "DBT_POSTGRES_READONLY_PASSWORD"
    )
    dbname = _env("HELIOS_POSTGRES_READONLY_DBNAME") or _env("DBT_POSTGRES_DBNAME")
    port = _env("HELIOS_POSTGRES_READONLY_PORT", _env("DBT_POSTGRES_PORT", "5432"))
    sslmode = _env("HELIOS_POSTGRES_READONLY_SSLMODE", _env("DBT_POSTGRES_SSLMODE", "require"))

    missing = [
        name
        for name, value in {
            "host": host,
            "user": user,
            "password": password,
            "dbname": dbname,
            "port": port,
            "sslmode": sslmode,
        }.items()
        if not value
    ]
    if missing:
        raise ValueError(f"Missing read-only Postgres settings: {', '.join(missing)}.")
    if user != REQUIRED_USER:
        raise ValueError(f"Analyst Postgres user must be {REQUIRED_USER}.")
    if dbname != REQUIRED_DATABASE:
        raise ValueError(f"Analyst Postgres database must be {REQUIRED_DATABASE}.")
    if sslmode != "require":
        raise ValueError("Analyst Postgres SSL mode must be require.")

    return {
        "host": host,
        "user": user,
        "password": password,
        "dbname": dbname,
        "port": int(str(port)),
        "sslmode": sslmode,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Run one bounded read-only Postgres query.")
    parser.add_argument("--sql", help="SQL text. If omitted, SQL is read from stdin.")
    parser.add_argument("--max-rows", type=int, default=DEFAULT_MAX_ROWS)
    parser.add_argument("--timeout-ms", type=int, default=DEFAULT_TIMEOUT_MS)
    args = parser.parse_args()

    max_rows = min(max(args.max_rows, 1), MAX_ALLOWED_ROWS)
    timeout_ms = min(max(args.timeout_ms, 1_000), MAX_TIMEOUT_MS)
    raw_sql = args.sql if args.sql is not None else sys.stdin.read()
    safe_sql = _assert_safe_sql(raw_sql)

    conn_kwargs = _build_connection_kwargs()
    conn = psycopg2.connect(**conn_kwargs)
    try:
        with conn:
            with conn.cursor() as cursor:
                cursor.execute("set transaction read only")
                cursor.execute("select set_config('statement_timeout', %s, true)", [str(timeout_ms)])
                cursor.execute(safe_sql)
                columns = [description[0] for description in cursor.description or []]
                fetched = cursor.fetchmany(max_rows + 1)
    finally:
        conn.close()

    rows = [dict(zip(columns, row)) for row in fetched[:max_rows]]
    payload = {
        "row_count": len(rows),
        "truncated": len(fetched) > max_rows,
        "max_rows": max_rows,
        "columns": columns,
        "rows": rows,
    }
    print(json.dumps(payload, default=_json_default, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(
            json.dumps(
                {"error": str(exc), "error_type": exc.__class__.__name__},
                sort_keys=True,
            ),
            file=sys.stderr,
        )
        raise SystemExit(1)
