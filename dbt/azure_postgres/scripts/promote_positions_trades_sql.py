from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path


SCRIPT_PATH = Path(__file__).resolve()
DBT_PROJECT_ROOT = SCRIPT_PATH.parents[1]
REPO_ROOT = SCRIPT_PATH.parents[3]
FRONTEND_ROOT = REPO_ROOT / "frontend"
DBT_COMPILED_ROOT = (
    DBT_PROJECT_ROOT
    / "target"
    / "compiled"
    / "helioscta_platform"
    / "models"
    / "positions_and_trades_v2"
)


@dataclass(frozen=True)
class SqlArtifact:
    name: str
    model_path: Path
    targets: tuple[Path, ...]
    required_markers: tuple[str, ...]


ARTIFACTS = (
    SqlArtifact(
        name="Clear Street all-history review",
        model_path=Path("clear_street_eod_transactions/marts/cs_65_eod_all_history.sql"),
        targets=(
            FRONTEND_ROOT
            / "sql"
            / "clear-street-trades"
            / "marts"
            / "eod_all_history.sql",
            REPO_ROOT
            / "backend"
            / "scrapes"
            / "positions_and_trades"
            / "sql"
            / "generated"
            / "clear_street_trades"
            / "all_history_validation.sql",
        ),
        required_markers=(
            "__dbt__cte__cs_00_src_eod_txns",
            "rule_status",
            "rule_match_source",
            "from FINAL",
        ),
    ),
    SqlArtifact(
        name="Clear Street MUFG latest export",
        model_path=Path("clear_street_eod_transactions/marts/cs_80_mufg_latest.sql"),
        targets=(
            REPO_ROOT
            / "backend"
            / "scrapes"
            / "positions_and_trades"
            / "sql"
            / "generated"
            / "clear_street_trades"
            / "mufg"
            / "latest.sql",
        ),
        required_markers=(
            "__dbt__cte__cs_70_eod_latest",
            "product_code_grouping",
            "product_code_region",
            "from FINAL",
        ),
    ),
    SqlArtifact(
        name="Clear Street MUFG all-history export",
        model_path=Path("clear_street_eod_transactions/marts/cs_85_mufg_all_history.sql"),
        targets=(
            REPO_ROOT
            / "backend"
            / "scrapes"
            / "positions_and_trades"
            / "sql"
            / "generated"
            / "clear_street_trades"
            / "mufg"
            / "all_history.sql",
        ),
        required_markers=(
            "__dbt__cte__cs_65_eod_all_history",
            "product_code_grouping",
            "product_code_region",
            "from FINAL",
        ),
    ),
    SqlArtifact(
        name="NAV positions all-history review",
        model_path=Path("nav_positions/marts/nav_40_positions_all_history.sql"),
        targets=(
            FRONTEND_ROOT / "sql" / "nav-positions" / "marts" / "all_history.sql",
            REPO_ROOT
            / "backend"
            / "scrapes"
            / "positions_and_trades"
            / "sql"
            / "generated"
            / "nav_positions"
            / "all_history.sql",
        ),
        required_markers=(
            "__dbt__cte__nav_00_src_positions",
            "product_family",
            "market_name",
            "rule_status",
            "from FINAL",
        ),
    ),
    SqlArtifact(
        name="NAV positions latest review",
        model_path=Path("nav_positions/marts/nav_50_positions_latest.sql"),
        targets=(
            FRONTEND_ROOT / "sql" / "nav-positions" / "marts" / "latest.sql",
            REPO_ROOT
            / "backend"
            / "scrapes"
            / "positions_and_trades"
            / "sql"
            / "generated"
            / "nav_positions"
            / "latest.sql",
        ),
        required_markers=(
            "__dbt__cte__nav_00_src_positions",
            "product_family",
            "market_name",
            "rule_status",
            "from FINAL",
        ),
    ),
    SqlArtifact(
        name="Positions/trades rule exceptions",
        model_path=Path("nav_positions/marts/pat_90_rule_exceptions.sql"),
        targets=(
            FRONTEND_ROOT / "sql" / "nav-positions" / "checks" / "rule_exceptions.sql",
        ),
        required_markers=(
            "__dbt__cte__cs_50_int_rules",
            "__dbt__cte__nav_30_int_rules",
            "rule_status",
            "from FINAL",
        ),
    ),
    SqlArtifact(
        name="NAV positions latest rule exceptions",
        model_path=Path("nav_positions/marts/nav_55_rule_exceptions_latest.sql"),
        targets=(
            FRONTEND_ROOT / "sql" / "nav-positions" / "checks" / "rule_exceptions_latest.sql",
        ),
        required_markers=(
            "__dbt__cte__nav_50_positions_latest",
            "rule_status",
            "from FINAL",
        ),
    ),
)


def relative(path: Path) -> str:
    try:
        return str(path.relative_to(REPO_ROOT))
    except ValueError:
        return str(path)


def section(title: str) -> None:
    print()
    print("=" * 78)
    print(title)
    print("=" * 78)


def detail(label: str, value: object) -> None:
    print(f"{label}: {value}")


def validate_sql(sql: str, artifact: SqlArtifact) -> list[str]:
    lowered = sql.lower()
    return [
        marker
        for marker in artifact.required_markers
        if marker.lower() not in lowered
    ]


def promote_artifact(artifact: SqlArtifact) -> list[str]:
    source_path = DBT_COMPILED_ROOT / artifact.model_path
    print()
    print(f"[artifact] {artifact.name}")
    detail("source", relative(source_path))
    detail("targets", len(artifact.targets))

    if not source_path.exists():
        return [
            f"{artifact.name}: missing compiled dbt SQL at {relative(source_path)}. "
            "Run this first from dbt/azure_postgres: "
            f"dbt compile --profiles-dir . --select {source_path.stem}"
        ]

    sql_bytes = source_path.read_bytes()
    sql = sql_bytes.decode("utf-8")
    detail("source_bytes", f"{len(sql_bytes):,}")

    missing_markers = validate_sql(sql, artifact)
    if missing_markers:
        return [
            f"{artifact.name}: {relative(source_path)} is missing expected marker: {marker}"
            for marker in missing_markers
        ]
    print("validation: ok")

    for target_path in artifact.targets:
        target_path.parent.mkdir(parents=True, exist_ok=True)
        target_path.write_bytes(sql_bytes)
        print(f"copied: {relative(target_path)}")

    return []


def main() -> int:
    section("Promote positions/trades dbt SQL")
    detail("repo_root", REPO_ROOT)
    detail("dbt_project_root", DBT_PROJECT_ROOT)
    detail("compiled_root", relative(DBT_COMPILED_ROOT))
    detail("artifact_count", len(ARTIFACTS))

    section("Validate and copy artifacts")
    failures: list[str] = []
    for artifact in ARTIFACTS:
        failures.extend(promote_artifact(artifact))

    if failures:
        section("Promotion failed")
        for failure in failures:
            print(f"  - {failure}")
        print()
        print("No rollback was attempted. Fix the failures, re-run dbt compile if needed,")
        print("then re-run this promotion script.")
        return 1

    section("Promotion complete")
    detail("artifacts_promoted", len(ARTIFACTS))
    print("All configured frontend/backend SQL artifacts now match compiled dbt output.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
