from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path


SCRIPT_PATH = Path(__file__).resolve()
DBT_PROJECT_ROOT = SCRIPT_PATH.parents[1]
REPO_ROOT = SCRIPT_PATH.parents[3]
FRONTEND_ROOT = REPO_ROOT / "frontend"
BACKEND_ROOT = REPO_ROOT / "backend"
MANIFEST_PATH = FRONTEND_ROOT / "sql" / "positions-and-trades" / "manifest.json"
DBT_COMPILED_ROOT = (
    DBT_PROJECT_ROOT
    / "target"
    / "compiled"
    / "helioscta_platform"
    / "models"
    / "positions_and_trades"
    / "2026_07_22_ref_tables"
)
DBT_MODEL_FAMILY = "2026_07_22_ref_tables"
DBT_MODEL_FAMILY_PATH = (
    DBT_PROJECT_ROOT / "models" / "positions_and_trades" / DBT_MODEL_FAMILY
)
DBT_MODEL_CHANGE_SUMMARY = (
    "Moves product catalog, product alias rules, account lookup, and month "
    "codes from SQL-embedded dbt utility models into operator-maintained "
    "Postgres reference tables."
)
DBT_ARCHIVED_MODEL_FAMILIES = (
    {
        "name": "2026_01_01_old_dbt_model",
        "displayName": "Old NAV workbook compatibility model",
        "path": "dbt/azure_postgres/archived_models/positions_and_trades/2026_01_01_old_dbt_model",
    },
    {
        "name": "2026_07_21_sql_embedded",
        "displayName": "SQL-embedded positions/trades model",
        "path": "dbt/azure_postgres/archived_models/positions_and_trades/2026_07_21_sql_embedded",
    },
)
CONTRACT_ID = "positions_and_trades"
CONTRACT_DISPLAY_NAME = "Positions & Trades Reference Model"
REFERENCE_SCHEMA = "positions_and_trades_ref"
REFERENCE_TABLES = (
    "product_catalog",
    "product_alias_rules",
    "account_lookup",
    "month_codes",
)


@dataclass(frozen=True)
class SqlArtifact:
    artifact_id: str
    display_name: str
    name: str
    model_path: Path
    targets: tuple[Path, ...]
    required_markers: tuple[str, ...]
    include_in_manifest: bool = True


ARTIFACTS = (
    SqlArtifact(
        artifact_id="clear_street_trades_review",
        display_name="Clear Street Trades Review Contract",
        name="Clear Street all-history review",
        model_path=Path("clear_street_eod_transactions/marts/cs_ref_65_eod_all_history.sql"),
        targets=(
            FRONTEND_ROOT
            / "sql"
            / "clear-street-trades"
            / "marts"
            / "eod_all_history.sql",
        ),
        required_markers=(
            "__dbt__cte__cs_ref_00_src_eod_txns",
            "account_code",
            "exchange_route_code",
            "route_family",
            "is_product_record",
            "product_code_family",
            "product_code_grouping",
            "rule_status",
            "rule_match_source",
            "from FINAL",
        ),
    ),
    SqlArtifact(
        artifact_id="nav_positions_all_history",
        display_name="NAV Positions All History",
        name="NAV positions all-history review",
        model_path=Path("nav_positions/marts/nav_ref_40_positions_all_history.sql"),
        targets=(
            FRONTEND_ROOT / "sql" / "nav-positions" / "marts" / "all_history.sql",
        ),
        required_markers=(
            "__dbt__cte__nav_ref_00_src_positions",
            "account_code",
            "exchange_route_code",
            "route_family",
            "is_product_record",
            "product_code_family",
            "product_code_grouping",
            "product_family",
            "market_name",
            "rule_status",
            "from FINAL",
        ),
    ),
    SqlArtifact(
        artifact_id="nav_positions_latest",
        display_name="NAV Positions Latest",
        name="NAV positions latest review",
        model_path=Path("nav_positions/marts/nav_ref_50_positions_latest.sql"),
        targets=(
            FRONTEND_ROOT / "sql" / "nav-positions" / "marts" / "latest.sql",
        ),
        required_markers=(
            "__dbt__cte__nav_ref_00_src_positions",
            "account_code",
            "exchange_route_code",
            "route_family",
            "is_product_record",
            "product_code_family",
            "product_code_grouping",
            "product_family",
            "market_name",
            "rule_status",
            "from FINAL",
        ),
    ),
    SqlArtifact(
        artifact_id="nav_frontend_all_history",
        display_name="NAV Positions Frontend All History Contract",
        name="NAV positions frontend all-history contract",
        model_path=Path("nav_positions/frontend/nav_ref_frontend_positions_all_history.sql"),
        targets=(
            FRONTEND_ROOT / "sql" / "nav-positions" / "frontend" / "all_history.sql",
        ),
        required_markers=(
            "__dbt__cte__nav_ref_40_positions_all_history",
            "account_code",
            "exchange_route_code",
            "route_family",
            "is_product_record",
            "product_norm",
            "product_code_family",
            "product_code_grouping",
            "normalization_status",
            "contract_date",
            "from FINAL",
        ),
    ),
    SqlArtifact(
        artifact_id="nav_frontend_latest",
        display_name="NAV Positions Frontend Contract",
        name="NAV positions frontend latest contract",
        model_path=Path("nav_positions/frontend/nav_ref_frontend_positions_latest.sql"),
        targets=(
            FRONTEND_ROOT / "sql" / "nav-positions" / "frontend" / "latest.sql",
        ),
        required_markers=(
            "__dbt__cte__nav_ref_50_positions_latest",
            "account_code",
            "exchange_route_code",
            "route_family",
            "is_product_record",
            "product_norm",
            "product_code_family",
            "product_code_grouping",
            "normalization_status",
            "contract_date",
            "from FINAL",
        ),
    ),
    SqlArtifact(
        artifact_id="positions_trades_rule_exceptions",
        display_name="Positions & Trades Rule Exceptions",
        name="Positions/trades rule exceptions",
        model_path=Path("nav_positions/marts/pat_ref_90_rule_exceptions.sql"),
        targets=(
            FRONTEND_ROOT / "sql" / "nav-positions" / "checks" / "rule_exceptions.sql",
        ),
        required_markers=(
            "__dbt__cte__cs_ref_50_int_rules",
            "__dbt__cte__nav_ref_30_int_rules",
            "account_code",
            "exchange_route_code",
            "route_family",
            "is_product_record",
            "rule_status",
            "from FINAL",
        ),
    ),
    SqlArtifact(
        artifact_id="clear_street_mufg_upload",
        display_name="Clear Street MUFG Upload Contract",
        name="Clear Street MUFG latest upload",
        model_path=Path("clear_street_eod_transactions/mufg/cs_ref_80_mufg_latest.sql"),
        targets=(
            BACKEND_ROOT
            / "orchestration"
            / "positions_and_trades"
            / "sql"
            / "clear_street_mufg_latest.sql",
        ),
        required_markers=(
            "__dbt__cte__cs_ref_70_eod_latest",
            'as "TRADE_DATE"',
            "trade_status",
            "bbg_product_code",
            "product_code_grouping",
            "where give_in_out_firm_num in ('ADU', '905')",
            "from FINAL",
        ),
        include_in_manifest=False,
    ),
    SqlArtifact(
        artifact_id="nav_rule_exceptions_latest",
        display_name="NAV Positions Latest Rule Exceptions",
        name="NAV positions latest rule exceptions",
        model_path=Path("nav_positions/marts/nav_ref_55_rule_exceptions_latest.sql"),
        targets=(
            FRONTEND_ROOT / "sql" / "nav-positions" / "checks" / "rule_exceptions_latest.sql",
        ),
        required_markers=(
            "__dbt__cte__nav_ref_50_positions_latest",
            "account_code",
            "exchange_route_code",
            "route_family",
            "is_product_record",
            "rule_status",
            "from FINAL",
        ),
    ),
    SqlArtifact(
        artifact_id="positions_trades_validation_summary",
        display_name="Positions & Trades Validation Summary",
        name="Positions/trades validation summary",
        model_path=Path("nav_positions/marts/pat_ref_95_validation_summary.sql"),
        targets=(
            FRONTEND_ROOT
            / "sql"
            / "positions-and-trades"
            / "checks"
            / "validation_summary.sql",
        ),
        required_markers=(
            "__dbt__cte__cs_ref_00_src_eod_txns",
            "__dbt__cte__nav_ref_00_src_positions",
            "validation_scope",
            "scope_label",
            "clear_street_vendor_code_failures",
            "nav_vendor_code_failures",
            "sample_failure_reason",
            "from FINAL",
        ),
    ),
    SqlArtifact(
        artifact_id="positions_trades_validation_failures",
        display_name="Positions & Trades Validation Failures",
        name="Positions/trades validation failure rows",
        model_path=Path("nav_positions/marts/pat_ref_96_validation_failures.sql"),
        targets=(
            FRONTEND_ROOT
            / "sql"
            / "positions-and-trades"
            / "checks"
            / "validation_failures.sql",
        ),
        required_markers=(
            "__dbt__cte__cs_ref_00_src_eod_txns",
            "__dbt__cte__nav_ref_00_src_positions",
            "validation_scope",
            "scope_label",
            "source_record_key",
            "source_product",
            "route_exchange",
            "vendor_ice_code",
            "clear_street_vendor_code_failures",
            "nav_vendor_code_failures",
            "from FINAL",
        ),
    ),
)


def relative(path: Path) -> str:
    try:
        return str(path.relative_to(REPO_ROOT))
    except ValueError:
        return str(path)


def relative_posix(path: Path) -> str:
    return relative(path).replace("\\", "/")


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


def manifest_entry(artifact: SqlArtifact) -> dict[str, str]:
    if len(artifact.targets) != 1:
        raise ValueError(
            f"{artifact.artifact_id}: manifest expects exactly one promoted SQL target"
        )

    dbt_model_path = DBT_MODEL_FAMILY_PATH / artifact.model_path
    dbt_compiled_path = DBT_COMPILED_ROOT / artifact.model_path
    return {
        "displayName": artifact.display_name,
        "promotedSql": relative_posix(artifact.targets[0]),
        "dbtModel": relative_posix(dbt_model_path),
        "dbtCompiledSql": relative_posix(dbt_compiled_path),
    }


def write_manifest() -> None:
    manifest = {
        "contractId": CONTRACT_ID,
        "displayName": CONTRACT_DISPLAY_NAME,
        "dbtModelFamily": DBT_MODEL_FAMILY,
        "dbtModelFamilyPath": relative_posix(DBT_MODEL_FAMILY_PATH),
        "dbtModelChangeSummary": DBT_MODEL_CHANGE_SUMMARY,
        "archivedModelFamilies": list(DBT_ARCHIVED_MODEL_FAMILIES),
        "referenceSchema": REFERENCE_SCHEMA,
        "referenceTables": list(REFERENCE_TABLES),
        "generatedBy": relative_posix(SCRIPT_PATH),
        "artifacts": {
            artifact.artifact_id: manifest_entry(artifact)
            for artifact in ARTIFACTS
            if artifact.include_in_manifest
        },
    }

    MANIFEST_PATH.parent.mkdir(parents=True, exist_ok=True)
    MANIFEST_PATH.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")


def main() -> int:
    section("Promote positions/trades SQL")
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
    write_manifest()
    detail("artifacts_promoted", len(ARTIFACTS))
    detail("manifest", relative(MANIFEST_PATH))
    print("All configured SQL artifacts and metadata now match compiled dbt output.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
