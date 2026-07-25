from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path


SCRIPT_PATH = Path(__file__).resolve()
DBT_PROJECT_ROOT = SCRIPT_PATH.parents[1]
REPO_ROOT = SCRIPT_PATH.parents[3]
DBT_MODEL_FAMILY_PATH = (
    DBT_PROJECT_ROOT / "models" / "pjm_da_model" / "meteo_baseline_price"
)
DBT_SOURCE_MODEL_ROOTS = (
    DBT_PROJECT_ROOT / "models" / "pjm_da_model" / "meteologica",
    DBT_PROJECT_ROOT / "models" / "pjm_da_model" / "pjm",
)
DBT_COMPILED_ROOT = (
    DBT_PROJECT_ROOT
    / "target"
    / "compiled"
    / "helioscta_platform"
    / "models"
    / "pjm_da_model"
    / "meteo_baseline_price"
)
RUNTIME_SQL_ROOT = (
    REPO_ROOT
    / "tmp"
    / "data"
    / "pjm_like_day_modelling"
    / "meteo_baseline_price"
)
MANIFEST_PATH = RUNTIME_SQL_ROOT / "manifest.json"
CONTRACT_ID = "pjm_da_model_meteo_baseline_price"
CONTRACT_DISPLAY_NAME = "PJM DA Model Meteologica Baseline Price Prototype"
DBT_MODEL_CHANGE_SUMMARY = (
    "Adds a read-only dbt compile boundary for PJM DA Meteologica baseline "
    "price runtime SQL consumed by the tmp modelling prototype, with source "
    "wrappers split by database schema and index-aligned timestamp range "
    "predicates in runtime marts."
)


@dataclass(frozen=True)
class SqlArtifact:
    artifact_id: str
    display_name: str
    name: str
    model_path: Path
    target_path: Path
    required_markers: tuple[str, ...]


ARTIFACTS = (
    SqlArtifact(
        artifact_id="available_target_dates",
        display_name="Available Target Dates",
        name="PJM Meteo baseline available target dates utility",
        model_path=Path("utils/mbp_available_target_dates.sql"),
        target_path=RUNTIME_SQL_ROOT / "sql" / "available_target_dates.sql",
        required_markers=(
            "__dbt__cte__mbp_00_src_meteologica_det_da_price_forecast_hourly",
            "__dbt__cte__mbp_00_src_meteologica_ens_da_price_forecast_hourly",
            "%(start_date)s::date as start_date",
            "from FINAL",
            "limit %(limit)s",
        ),
    ),
    SqlArtifact(
        artifact_id="meteo_da_price_forecast_hourly",
        display_name="Meteologica DA Price Forecast Hourly",
        name="PJM Meteo baseline hourly forecast",
        model_path=Path("marts/mbp_meteo_da_price_forecast_hourly.sql"),
        target_path=RUNTIME_SQL_ROOT / "sql" / "meteo_da_price_forecast_hourly.sql",
        required_markers=(
            "__dbt__cte__mbp_00_src_meteologica_det_da_price_forecast_hourly",
            "__dbt__cte__mbp_00_src_meteologica_ens_da_price_forecast_hourly",
            "%(target_date)s::date as target_date",
            "%(lead_days)s::int as lead_days",
            "da_price_deterministic",
            "ens_member_values",
            "from FINAL",
        ),
    ),
    SqlArtifact(
        artifact_id="actual_da_lmps_hourly",
        display_name="Actual DA LMPs Hourly",
        name="PJM Meteo baseline actual DA LMPs",
        model_path=Path("marts/mbp_actual_da_lmps_hourly.sql"),
        target_path=RUNTIME_SQL_ROOT / "sql" / "actual_da_lmps_hourly.sql",
        required_markers=(
            "__dbt__cte__mbp_00_src_pjm_da_lmps_hourly",
            "%(target_date)s::date as target_date",
            "%(hub)s::text as hub",
            "row_is_current = true",
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
    detail("target", relative(artifact.target_path))

    if not source_path.exists():
        return [
            f"{artifact.name}: missing compiled dbt SQL at {relative(source_path)}. "
            "Run this first from dbt/azure_postgres: "
            "dbt compile --profiles-dir . --select "
            "+path:models/pjm_da_model/meteo_baseline_price"
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

    artifact.target_path.parent.mkdir(parents=True, exist_ok=True)
    artifact.target_path.write_bytes(sql_bytes)
    print("validation: ok")
    print(f"copied: {relative(artifact.target_path)}")
    return []


def manifest_entry(artifact: SqlArtifact) -> dict[str, str]:
    dbt_model_path = DBT_MODEL_FAMILY_PATH / artifact.model_path
    dbt_compiled_path = DBT_COMPILED_ROOT / artifact.model_path
    return {
        "displayName": artifact.display_name,
        "promotedSql": relative_posix(artifact.target_path),
        "dbtModel": relative_posix(dbt_model_path),
        "dbtCompiledSql": relative_posix(dbt_compiled_path),
    }


def write_manifest() -> None:
    manifest = {
        "contractId": CONTRACT_ID,
        "displayName": CONTRACT_DISPLAY_NAME,
        "dbtModelFamilyPath": relative_posix(DBT_MODEL_FAMILY_PATH),
        "dbtSourceModelRoots": [
            relative_posix(path)
            for path in DBT_SOURCE_MODEL_ROOTS
        ],
        "dbtModelChangeSummary": DBT_MODEL_CHANGE_SUMMARY,
        "runtimeSqlRoot": relative_posix(RUNTIME_SQL_ROOT / "sql"),
        "generatedBy": relative_posix(SCRIPT_PATH),
        "artifacts": {
            artifact.artifact_id: manifest_entry(artifact)
            for artifact in ARTIFACTS
        },
    }
    MANIFEST_PATH.parent.mkdir(parents=True, exist_ok=True)
    MANIFEST_PATH.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")


def main() -> int:
    section("Promote PJM Meteo baseline price SQL")
    detail("repo_root", REPO_ROOT)
    detail("dbt_project_root", DBT_PROJECT_ROOT)
    detail("compiled_root", relative(DBT_COMPILED_ROOT))
    detail("runtime_sql_root", relative(RUNTIME_SQL_ROOT / "sql"))
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
        print("No rollback was attempted. Fix the failures, re-run dbt compile,")
        print("then re-run this promotion script.")
        return 1

    write_manifest()
    section("Promotion complete")
    detail("artifacts_promoted", len(ARTIFACTS))
    detail("manifest", relative(MANIFEST_PATH))
    print("All configured SQL artifacts and metadata now match compiled dbt output.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
