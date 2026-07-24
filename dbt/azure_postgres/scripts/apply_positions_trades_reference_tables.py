from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any


SCRIPT_PATH = Path(__file__).resolve()
DBT_PROJECT_ROOT = SCRIPT_PATH.parents[1]
REPO_ROOT = SCRIPT_PATH.parents[3]
DEFAULT_REFERENCE_DIR = (
    DBT_PROJECT_ROOT / "reference_tables" / "positions_and_trades"
)


@dataclass(frozen=True)
class SqlStep:
    name: str
    filename: str


TABLE_STEP = SqlStep(
    name="create schema and tables",
    filename="table_positions_and_trades_reference_tables.sql",
)
MIGRATION_STEP = SqlStep(
    name="current-only migration",
    filename="migrate_positions_and_trades_reference_tables_current_only.sql",
)
VALUE_STEP = SqlStep(
    name="sync approved values",
    filename="upsert_positions_and_trades_reference_values.sql",
)
INDEX_STEP = SqlStep(
    name="create indexes",
    filename="index_positions_and_trades_reference_tables.sql",
)
VERIFY_STEP = SqlStep(
    name="verify reference tables",
    filename="verify_positions_and_trades_reference_tables.sql",
)

VERIFY_LABELS = (
    "duplicate alias priorities",
    "duplicate account keys",
    "aliases without product catalog rows",
    "missing month codes",
    "row counts",
)


def _strip_outer_quotes(value: str) -> str:
    clean = value.strip()
    if len(clean) >= 2 and clean[0] == clean[-1] and clean[0] in {"'", '"'}:
        return clean[1:-1]
    return clean


def _load_env_file(path: Path) -> None:
    if not path.exists():
        return

    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        if line.startswith("export "):
            line = line[len("export ") :].strip()
        name, value = line.split("=", 1)
        key = name.strip()
        if key and key not in os.environ:
            os.environ[key] = _strip_outer_quotes(value)


def _load_local_env() -> None:
    _load_env_file(REPO_ROOT / "backend" / ".env")
    _load_env_file(DBT_PROJECT_ROOT / ".env")


def _first_env(*names: str, default: str | None = None) -> str | None:
    for name in names:
        value = os.getenv(name)
        if value is not None and value.strip():
            return value.strip()
    return default


def _bool_env(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    if value is None or not value.strip():
        return default
    return value.strip().lower() in {"1", "true", "yes", "y", "on"}


def _relative(path: Path) -> str:
    try:
        return str(path.relative_to(REPO_ROOT))
    except ValueError:
        return str(path)


def _connection_kwargs(database: str | None = None) -> dict[str, str]:
    kwargs = {
        "host": _first_env(
            "AZURE_POSTGRES_WRITER_HOST",
            "AZURE_POSTGRESQL_DB_HOST",
            "DBT_POSTGRES_HOST",
        ),
        "port": _first_env(
            "AZURE_POSTGRES_WRITER_PORT",
            "AZURE_POSTGRESQL_DB_PORT",
            "DBT_POSTGRES_PORT",
            default="5432",
        ),
        "dbname": database
        or _first_env(
            "AZURE_POSTGRES_WRITER_DBNAME",
            "AZURE_POSTGRESQL_DB_NAME",
            "DBT_POSTGRES_DBNAME",
            default="helios_prod",
        ),
        "user": _first_env(
            "AZURE_POSTGRES_WRITER_USER",
            "AZURE_POSTGRESQL_DB_USER",
            default="helios_admin",
        ),
        "password": _first_env(
            "AZURE_POSTGRES_WRITER_PASSWORD",
            "AZURE_POSTGRESQL_DB_PASSWORD",
        ),
        "sslmode": _first_env(
            "AZURE_POSTGRES_WRITER_SSLMODE",
            "AZURE_POSTGRESQL_DB_SSLMODE",
            "DBT_POSTGRES_SSLMODE",
            default="require",
        ),
    }

    missing = [key for key, value in kwargs.items() if not value]
    if missing:
        env_names = {
            "host": "AZURE_POSTGRES_WRITER_HOST",
            "password": "AZURE_POSTGRES_WRITER_PASSWORD",
        }
        details = ", ".join(env_names.get(key, key) for key in missing)
        raise RuntimeError(f"Missing required Postgres setting(s): {details}")

    if kwargs["user"].lower() == "helios_readonly":
        raise RuntimeError(
            "Refusing to apply reference tables with helios_readonly. "
            "Use AZURE_POSTGRES_WRITER_USER=helios_admin."
        )

    return kwargs


def _connect(kwargs: dict[str, str]):
    try:
        import psycopg2
    except ImportError as exc:
        raise RuntimeError(
            "psycopg2 is required. Run this from the helioscta-azure-backend "
            "environment or install backend requirements."
        ) from exc

    return psycopg2.connect(**kwargs)


def _read_sql(path: Path) -> str:
    if not path.exists():
        raise FileNotFoundError(f"Missing SQL file: {_relative(path)}")
    sql = path.read_text(encoding="utf-8-sig").strip()
    if not sql:
        raise ValueError(f"SQL file is empty: {_relative(path)}")
    return sql


def _split_sql_statements(sql: str) -> list[str]:
    return [statement.strip() for statement in sql.split(";") if statement.strip()]


def _row_dicts(cursor: Any) -> list[dict[str, Any]]:
    columns = [description[0] for description in cursor.description or []]
    return [dict(zip(columns, row)) for row in cursor.fetchall()]


def _print_section(title: str) -> None:
    print()
    print("=" * 78)
    print(title)
    print("=" * 78)


def _execute_file(connection: Any, step: SqlStep, reference_dir: Path) -> None:
    path = reference_dir / step.filename
    sql = _read_sql(path)
    print(f"[apply] {step.name}: {_relative(path)}")
    with connection.cursor() as cursor:
        try:
            cursor.execute(sql)
        except Exception:
            connection.rollback()
            raise


def _verify(connection: Any, reference_dir: Path) -> None:
    path = reference_dir / VERIFY_STEP.filename
    sql = _read_sql(path)
    statements = _split_sql_statements(sql)
    if len(statements) != len(VERIFY_LABELS):
        raise RuntimeError(
            f"{_relative(path)} has {len(statements)} statements; "
            f"expected {len(VERIFY_LABELS)}."
        )

    _print_section("Verification")
    failing_rows = 0
    with connection.cursor() as cursor:
        for label, statement in zip(VERIFY_LABELS, statements):
            cursor.execute(statement)
            rows = _row_dicts(cursor)
            if label == "row counts":
                print("[counts]")
                for row in rows:
                    print(f"  {row['table_name']}: {row['current_row_count']}")
                continue

            print(f"[check] {label}: {len(rows)} failing row(s)")
            failing_rows += len(rows)
            for row in rows[:10]:
                print(f"  {row}")

    if failing_rows:
        raise RuntimeError(
            f"Reference-table verification found {failing_rows} failing row(s)."
        )


def main(
    *,
    reference_dir: str | Path | None = None,
    include_migration: bool | None = None,
    verify: bool = True,
    dry_run: bool = False,
    database: str | None = None,
) -> int:
    _load_local_env()

    resolved_reference_dir = Path(reference_dir or DEFAULT_REFERENCE_DIR).resolve()
    include_migration = (
        _bool_env("POSITIONS_TRADES_REFERENCE_INCLUDE_MIGRATION")
        if include_migration is None
        else include_migration
    )
    steps = [TABLE_STEP]
    if include_migration:
        steps.append(MIGRATION_STEP)
    steps.extend([VALUE_STEP, INDEX_STEP])

    _print_section("Positions/trades reference-table apply")
    print(f"reference_dir: {_relative(resolved_reference_dir)}")
    print(f"include_migration: {include_migration}")
    print(f"verify: {verify}")
    print(f"dry_run: {dry_run}")

    files_to_check = [*steps]
    if verify:
        files_to_check.append(VERIFY_STEP)

    for step in files_to_check:
        path = resolved_reference_dir / step.filename
        _read_sql(path)
        print(f"[found] {_relative(path)}")

    if dry_run:
        print()
        print("Dry run complete. No database connection was opened.")
        return 0

    kwargs = _connection_kwargs(database=database)
    _print_section("Connection")
    print(f"host: {kwargs['host']}")
    print(f"port: {kwargs['port']}")
    print(f"dbname: {kwargs['dbname']}")
    print(f"user: {kwargs['user']}")
    print(f"sslmode: {kwargs['sslmode']}")

    connection = _connect(kwargs)
    connection.autocommit = True
    try:
        _print_section("Apply")
        for step in steps:
            _execute_file(connection, step, resolved_reference_dir)

        if verify:
            _verify(connection, resolved_reference_dir)
    finally:
        connection.close()

    _print_section("Complete")
    print("positions_and_trades_ref tables now match the reference SQL files.")
    return 0


if __name__ == "__main__":
    raise SystemExit(
        main(
            reference_dir=os.getenv("POSITIONS_TRADES_REFERENCE_DIR") or None,
            include_migration=None,
            verify=not _bool_env("POSITIONS_TRADES_REFERENCE_SKIP_VERIFY"),
            dry_run=_bool_env("POSITIONS_TRADES_REFERENCE_DRY_RUN"),
            database=os.getenv("POSITIONS_TRADES_REFERENCE_DBNAME") or None,
        )
    )
