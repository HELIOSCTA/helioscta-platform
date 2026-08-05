"""Read-only Postgres access for backend DA-price modelling.

This module intentionally uses read-only credentials. Forecast model runners
read from helios_prod source/input tables and do not write model outputs.
"""

from __future__ import annotations

import os
import warnings
from pathlib import Path
from typing import Iterator, Mapping
from urllib.parse import unquote, urlparse

import pandas as pd
import psycopg2

try:
    from dotenv import load_dotenv
except ImportError:  # pragma: no cover - backend dev env includes python-dotenv.
    load_dotenv = None

REPO_ROOT = Path(__file__).resolve().parents[3]
REQUIRED_DATABASE = "helios_prod"
REQUIRED_USER = "helios_readonly"
DEFAULT_STATEMENT_TIMEOUT_MS = 25_000
DEFAULT_CONNECTION_TIMEOUT_SECONDS = 12


def _load_local_env() -> None:
    if load_dotenv is None:
        return
    for path in (
        REPO_ROOT / "backend" / ".env",
        REPO_ROOT / "frontend" / ".env.local",
    ):
        if path.exists():
            load_dotenv(path, override=False)


_load_local_env()


def _first_env(*names: str, default: str | None = None) -> str | None:
    for name in names:
        value = os.getenv(name)
        if value is not None and value.strip():
            return value.strip()
    return default


def _env_int(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw is None or not raw.strip():
        return default
    try:
        parsed = int(raw)
    except ValueError:
        return default
    return parsed if parsed > 0 else default


def _assert_safe_connection(database: str | None, user: str | None) -> None:
    if database != REQUIRED_DATABASE:
        raise RuntimeError(
            f"Backend model reads must connect to {REQUIRED_DATABASE}, got {database!r}."
        )
    if user != REQUIRED_USER:
        raise RuntimeError(
            f"Backend model reads must use {REQUIRED_USER}, got {user!r}."
        )


def _connection_timeout_seconds() -> int:
    timeout_ms = _env_int(
        "HELIOS_POSTGRES_CONNECTION_TIMEOUT_MS",
        DEFAULT_CONNECTION_TIMEOUT_SECONDS * 1000,
    )
    return max(1, timeout_ms // 1000)


def _statement_timeout_options() -> str:
    timeout_ms = _env_int(
        "HELIOS_POSTGRES_STATEMENT_TIMEOUT_MS",
        DEFAULT_STATEMENT_TIMEOUT_MS,
    )
    return f"-c statement_timeout={timeout_ms}"


def connect() -> psycopg2.extensions.connection:
    """Connect to helios_prod with the read-only role.

    Resolution order:
    1. DATABASE_URL, if present.
    2. HELIOS_POSTGRES_READONLY_* variables used by the frontend.
    3. DBT_POSTGRES_* read-only variables used by backend/dbt checks.
    """
    database_url = os.getenv("DATABASE_URL")
    if database_url:
        parsed = urlparse(database_url)
        database = parsed.path.lstrip("/") or None
        user = unquote(parsed.username or "") or None
        _assert_safe_connection(database, user)
        return psycopg2.connect(
            database_url,
            connect_timeout=_connection_timeout_seconds(),
            options=_statement_timeout_options(),
        )

    host = _first_env("HELIOS_POSTGRES_READONLY_HOST", "DBT_POSTGRES_HOST")
    user = _first_env(
        "HELIOS_POSTGRES_READONLY_USER",
        "DBT_POSTGRES_READONLY_USER",
    )
    password = _first_env(
        "HELIOS_POSTGRES_READONLY_PASSWORD",
        "DBT_POSTGRES_READONLY_PASSWORD",
    )
    port = _first_env(
        "HELIOS_POSTGRES_READONLY_PORT",
        "DBT_POSTGRES_PORT",
        default="5432",
    )
    database = _first_env(
        "HELIOS_POSTGRES_READONLY_DBNAME",
        "DBT_POSTGRES_DBNAME",
        default=REQUIRED_DATABASE,
    )
    sslmode = _first_env(
        "HELIOS_POSTGRES_READONLY_SSLMODE",
        "DBT_POSTGRES_SSLMODE",
        default="require",
    )

    missing = [
        name
        for name, value in {
            "host": host,
            "user": user,
            "password": password,
            "database": database,
        }.items()
        if not value
    ]
    if missing:
        raise RuntimeError(
            "Missing read-only Postgres connection values: "
            + ", ".join(missing)
            + ". Set HELIOS_POSTGRES_READONLY_* or DBT_POSTGRES_* variables."
        )
    _assert_safe_connection(database, user)

    return psycopg2.connect(
        host=host,
        user=user,
        password=password,
        port=port,
        dbname=database,
        sslmode=sslmode,
        connect_timeout=_connection_timeout_seconds(),
        options=_statement_timeout_options(),
    )


SqlParams = tuple[object, ...] | Mapping[str, object]


def fetch_df(query: str, params: SqlParams = ()) -> pd.DataFrame:
    """Run a bounded read-only query and return a DataFrame."""
    connection = connect()
    try:
        with warnings.catch_warnings():
            warnings.filterwarnings(
                "ignore",
                message="pandas only supports SQLAlchemy connectable",
                category=UserWarning,
            )
            return pd.read_sql_query(query, connection, params=params)
    finally:
        connection.close()


def stream_df(
    query: str,
    params: SqlParams = (),
    *,
    chunksize: int = 10_000,
) -> Iterator[pd.DataFrame]:
    """Yield a read-only query as DataFrame chunks.

    Single-day price runs are tiny, but this keeps the backend DB access
    ready for wider modelling windows without reintroducing a cache layer.
    """
    if chunksize <= 0:
        raise ValueError("chunksize must be positive")

    connection = connect()
    try:
        with warnings.catch_warnings():
            warnings.filterwarnings(
                "ignore",
                message="pandas only supports SQLAlchemy connectable",
                category=UserWarning,
            )
            yield from pd.read_sql_query(
                query,
                connection,
                params=params,
                chunksize=chunksize,
            )
    finally:
        connection.close()
