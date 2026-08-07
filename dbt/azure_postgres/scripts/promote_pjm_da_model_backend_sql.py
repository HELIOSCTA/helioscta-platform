from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path


SCRIPT_PATH = Path(__file__).resolve()
DBT_PROJECT_ROOT = SCRIPT_PATH.parents[1]
REPO_ROOT = SCRIPT_PATH.parents[3]
DBT_PJM_MODEL_ROOT = DBT_PROJECT_ROOT / "models" / "pjm_da_model"
DBT_COMPILED_ROOT = (
    DBT_PROJECT_ROOT
    / "target"
    / "compiled"
    / "helioscta_platform"
    / "models"
    / "pjm_da_model"
)
BACKEND_SQL_ROOT = (
    REPO_ROOT / "backend" / "modelling" / "pjm_da_models" / "sql_inputs"
)
FRONTEND_SQL_ROOT = REPO_ROOT / "frontend" / "sql" / "pjm_da_model" / "sql_inputs"
SQL_OUTPUT_ROOTS = (BACKEND_SQL_ROOT, FRONTEND_SQL_ROOT)
CONTRACT_ID = "pjm_da_model_backend_sql_inputs"
CONTRACT_DISPLAY_NAME = "PJM DA Model Backend SQL Inputs"
RUNTIME_COMPILE_COMMAND = (
    'dbt compile --profiles-dir . --select +path:models/pjm_da_model '
    '--vars "{pjm_da_model_param_mode: runtime}"'
)


@dataclass(frozen=True)
class SqlArtifact:
    artifact_id: str
    display_name: str
    model_path: Path
    target_filename: str
    consumers: tuple[str, ...]
    required_markers: tuple[str, ...]

    @property
    def target_path(self) -> Path:
        return self.target_path_for(BACKEND_SQL_ROOT)

    def target_path_for(self, sql_root: Path) -> Path:
        return sql_root / self.target_filename


ARTIFACTS = (
    SqlArtifact(
        artifact_id="available_target_dates",
        display_name="Meteologica DA price available target dates",
        model_path=Path(
            "meteologica/da_price_forecast/"
            "meteologica_da_price_forecast_available_dates.sql"
        ),
        target_filename="available_target_dates.sql",
        consumers=("meteo_baseline_price",),
        required_markers=(
            "usa_pjm_western_hub_da_power_price_forecast_hourly",
            "usa_pjm_western_hub_da_power_price_forecast_ecmwf_ens_hourly",
            "%(start_date)s::date as start_date",
            "%(limit)s::int as row_limit",
            "from FINAL",
        ),
    ),
    SqlArtifact(
        artifact_id="meteo_da_price_forecast_hourly",
        display_name="Meteologica DA price forecast hourly",
        model_path=Path(
            "meteologica/da_price_forecast/meteologica_da_price_forecast_hourly.sql"
        ),
        target_filename="meteo_da_price_forecast_hourly.sql",
        consumers=("meteo_baseline_price",),
        required_markers=(
            "usa_pjm_western_hub_da_power_price_forecast_hourly",
            "usa_pjm_western_hub_da_power_price_forecast_ecmwf_ens_hourly",
            "%(target_date)s::date as target_date",
            "%(lead_days)s::int as lead_days",
            "da_price_deterministic",
            "ens_member_values",
            "from FINAL",
        ),
    ),
    SqlArtifact(
        artifact_id="actual_da_lmps_hourly",
        display_name="PJM actual DA LMPs hourly",
        model_path=Path("pjm/da_lmps_hourly/pjm_da_lmps_hourly.sql"),
        target_filename="actual_da_lmps_hourly.sql",
        consumers=("meteo_baseline_price",),
        required_markers=(
            'from "helios_prod"."pjm"."da_hrl_lmps"',
            "%(target_date)s::date as target_date",
            "%(hub)s::text as hub",
            "row_is_current = true",
            "from FINAL",
        ),
    ),
    SqlArtifact(
        artifact_id="ice_python_next_day_gas",
        display_name="ICE Python next-day gas long-form daily",
        model_path=Path("ice_python/settlements/ice_python_next_day_gas.sql"),
        target_filename="ice_python_next_day_gas.sql",
        consumers=("gas_monthly_settles_frontend", "salt_model_frontend"),
        required_markers=(
            'from "helios_prod"."ice_python"."settlements"',
            "%(start_date)s::date as start_date",
            "%(end_date)s::date as end_date",
            "gas_day",
            "trade_date",
            "symbol",
            "hub_name",
            "region",
            "sort_index",
            "gas_price",
            "price_basis",
            "latest_trade_date",
            "XGF D1-IPG",
            "XJZ D1-IPG",
            "from FINAL",
        ),
    ),
    SqlArtifact(
        artifact_id="ice_python_next_day_gas_pjm_features",
        display_name="ICE Python next-day gas PJM features",
        model_path=Path(
            "ice_python/settlements/ice_python_next_day_gas_pjm_features.sql"
        ),
        target_filename="ice_python_next_day_gas_pjm_features.sql",
        consumers=("like_day_model_knn_sunny",),
        required_markers=(
            'from "helios_prod"."ice_python"."settlements"',
            "%(start_date)s::date as start_date",
            "%(end_date)s::date as end_date",
            "gas_day",
            "trade_date",
            "XGF D1-IPG",
            "gas_henry_hub",
            "XZR D1-IPG",
            "gas_m3",
            "from FINAL",
        ),
    ),
    SqlArtifact(
        artifact_id="ice_python_next_day_gas_hourly",
        display_name="ICE Python next-day gas hourly",
        model_path=Path("ice_python/settlements/ice_python_next_day_gas_hourly.sql"),
        target_filename="ice_python_next_day_gas_hourly.sql",
        consumers=("like_day_model_knn_sunny",),
        required_markers=(
            'from "helios_prod"."ice_python"."settlements"',
            "%(start_date)s::date as start_date",
            "%(end_date)s::date as end_date",
            "gas_day",
            "trade_date",
            "XGF D1-IPG",
            "gas_henry_hub",
            "XZR D1-IPG",
            "gas_m3",
            "from FINAL",
        ),
    ),
    SqlArtifact(
        artifact_id="actual_da_lmps_hourly_history",
        display_name="PJM actual DA LMPs hourly history",
        model_path=Path("pjm/da_lmps_hourly/pjm_da_lmps_hourly_history.sql"),
        target_filename="actual_da_lmps_hourly_history.sql",
        consumers=("like_day_model_knn_sunny",),
        required_markers=(
            'from "helios_prod"."pjm"."da_hrl_lmps"',
            "%(start_date)s::date as start_date",
            "%(end_date)s::date as end_date",
            "%(hub)s::text as hub",
            "row_is_current = true",
            "from FINAL",
        ),
    ),
    SqlArtifact(
        artifact_id="rto_load_hourly_history",
        display_name="PJM RTO load hourly history",
        model_path=Path("pjm/rto_load_hourly/pjm_rto_load_hourly_history.sql"),
        target_filename="rto_load_hourly_history.sql",
        consumers=("like_day_model_knn_sunny",),
        required_markers=(
            'from "helios_prod"."pjm"."hrl_load_metered"',
            "%(load_region)s::text as load_region",
            "load_mw_at_hour",
            "from FINAL",
        ),
    ),
    SqlArtifact(
        artifact_id="rto_load_forecast_hourly_history",
        display_name="PJM RTO load forecast hourly history",
        model_path=Path(
            "pjm/load_forecast_hourly/pjm_rto_load_forecast_hourly_history.sql"
        ),
        target_filename="rto_load_forecast_hourly_history.sql",
        consumers=("like_day_model_knn_sunny",),
        required_markers=(
            'from "helios_prod"."pjm"."load_frcstd_7_day"',
            "%(load_region)s::text as load_region",
            "%(lead_days)s::int as lead_days",
            "forecast_load_mw",
            "from FINAL",
        ),
    ),
    SqlArtifact(
        artifact_id="rto_load_latest_forecast_hourly",
        display_name="PJM RTO latest load forecast hourly",
        model_path=Path(
            "pjm/load_forecast_hourly/pjm_rto_load_latest_forecast_hourly.sql"
        ),
        target_filename="rto_load_latest_forecast_hourly.sql",
        consumers=("like_day_model_knn_sunny",),
        required_markers=(
            'from "helios_prod"."pjm"."load_frcstd_7_day"',
            "%(cutoff_utc)s::timestamptz as cutoff_utc",
            "%(load_region)s::text as load_region",
            "forecast_load_mw",
            "from FINAL",
        ),
    ),
    SqlArtifact(
        artifact_id="renewables_hourly_history",
        display_name="PJM renewables hourly history",
        model_path=Path(
            "pjm/gen_by_fuel/pjm_gen_by_fuel_renewables_hourly_history.sql"
        ),
        target_filename="renewables_hourly_history.sql",
        consumers=("like_day_model_knn_sunny",),
        required_markers=(
            'from "helios_prod"."pjm"."gen_by_fuel"',
            'from "helios_prod"."pjm"."solar_gen"',
            'from "helios_prod"."pjm"."wind_gen"',
            'from "helios_prod"."pjm"."hourly_solar_power_forecast"',
            'from "helios_prod"."pjm"."hourly_wind_power_forecast"',
            "fuel_type in ('Solar', 'Wind')",
            "solar_pjm_forecast_at_hour",
            "solar_at_hour",
            "wind_at_hour",
            "from FINAL",
        ),
    ),
    SqlArtifact(
        artifact_id="renewables_latest_forecast_hourly",
        display_name="PJM latest renewables forecast hourly",
        model_path=Path("pjm/gen_by_fuel/pjm_renewables_latest_forecast_hourly.sql"),
        target_filename="renewables_latest_forecast_hourly.sql",
        consumers=("like_day_model_knn_sunny",),
        required_markers=(
            'from "helios_prod"."pjm"."hourly_solar_power_forecast"',
            'from "helios_prod"."pjm"."hourly_wind_power_forecast"',
            "%(cutoff_utc)s::timestamptz as cutoff_utc",
            "solar_at_hour",
            "wind_at_hour",
            "from FINAL",
        ),
    ),
    SqlArtifact(
        artifact_id="gen_outages_daily_history",
        display_name="PJM generation outages daily history",
        model_path=Path("pjm/gen_outages/pjm_gen_outages_daily_history.sql"),
        target_filename="gen_outages_daily_history.sql",
        consumers=("like_day_model_knn_sunny",),
        required_markers=(
            'from "helios_prod"."pjm"."gen_outages_by_type"',
            "%(region)s::text as region",
            "%(lead_days)s::int as lead_days",
            "outage_total_mw",
            "from FINAL",
        ),
    ),
    SqlArtifact(
        artifact_id="gen_outages_daily_latest_forecast",
        display_name="PJM generation outages daily latest forecast",
        model_path=Path("pjm/gen_outages/pjm_gen_outages_daily_latest_forecast.sql"),
        target_filename="gen_outages_daily_latest_forecast.sql",
        consumers=("like_day_model_knn_sunny",),
        required_markers=(
            'from "helios_prod"."pjm"."gen_outages_by_type"',
            "%(cutoff_date)s::date as cutoff_date",
            "%(region)s::text as region",
            "total_outages_mw",
            "from FINAL",
        ),
    ),
    SqlArtifact(
        artifact_id="meteologica_pjm_rto_latest_forecast_hourly",
        display_name="Meteologica PJM RTO latest forecast hourly",
        model_path=Path(
            "meteologica/pjm_forecast_hourly/"
            "meteologica_pjm_rto_latest_forecast_hourly.sql"
        ),
        target_filename="meteo_pjm_rto_latest_forecast_hourly.sql",
        consumers=("like_day_model_knn_sunny",),
        required_markers=(
            'from "helios_prod"."meteologica"."pjm_forecast_hourly"',
            "%(forecast_area)s::text as forecast_area",
            "metric in ('load', 'solar', 'wind')",
            "net_load_at_hour",
            "from FINAL",
        ),
    ),
    SqlArtifact(
        artifact_id="meteologica_pjm_rto_forecast_hourly_history",
        display_name="Meteologica PJM RTO forecast hourly history",
        model_path=Path(
            "meteologica/pjm_forecast_hourly/"
            "meteologica_pjm_rto_forecast_hourly_history.sql"
        ),
        target_filename="meteo_pjm_rto_forecast_hourly_history.sql",
        consumers=("like_day_model_knn_sunny",),
        required_markers=(
            'from "helios_prod"."meteologica"."pjm_forecast_hourly"',
            "%(forecast_area)s::text as forecast_area",
            "%(lead_days)s::int as lead_days",
            "metric in ('load', 'solar', 'wind')",
            "net_load_at_hour",
            "from FINAL",
        ),
    ),
    SqlArtifact(
        artifact_id="wsi_temperature_hourly_history",
        display_name="WSI temperature hourly history",
        model_path=Path(
            "weather/wsi_hourly_temperature/weather_wsi_hourly_temperature_history.sql"
        ),
        target_filename="wsi_temperature_hourly_history.sql",
        consumers=("like_day_model_knn_sunny",),
        required_markers=(
            'from "helios_prod"."weather"."wsi_hourly_observed_temperatures"',
            "%(region)s::text as region",
            "temp_at_hour",
            "from FINAL",
        ),
    ),
    SqlArtifact(
        artifact_id="wsi_temperature_hourly_latest_forecast",
        display_name="WSI temperature hourly latest forecast",
        model_path=Path(
            "weather/wsi_hourly_temperature/"
            "weather_wsi_hourly_temperature_latest_forecast.sql"
        ),
        target_filename="wsi_temperature_hourly_latest_forecast.sql",
        consumers=("like_day_model_knn_sunny",),
        required_markers=(
            'from "helios_prod"."weather"."wsi_hourly_forecasts"',
            "%(cutoff_utc)s::timestamptz as cutoff_utc",
            "America/New_York",
            "temp_at_hour",
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
    failures: list[str] = []
    if "with params as (" not in lowered:
        failures.append("missing runtime params CTE: with params as (")
    if "%(" not in sql:
        failures.append(
            "missing Python DB placeholders; compile with "
            "pjm_da_model_param_mode: runtime"
        )
    for marker in artifact.required_markers:
        if marker.lower() not in lowered:
            failures.append(f"missing expected marker: {marker}")
    return failures


def generated_header(artifact: SqlArtifact) -> str:
    source_compiled = DBT_COMPILED_ROOT / artifact.model_path
    source_model = DBT_PJM_MODEL_ROOT / artifact.model_path
    return "\n".join(
        [
            "-- GENERATED FILE. DO NOT EDIT.",
            f"-- Source dbt model: {relative_posix(source_model)}",
            f"-- Source dbt compiled SQL: {relative(source_compiled)}",
            (
                "-- Promotion script: "
                f"{relative_posix(SCRIPT_PATH)}"
            ),
            "-- Rebuild from dbt/azure_postgres:",
            f"--   {RUNTIME_COMPILE_COMMAND}",
            "--   python scripts/promote_pjm_da_model_backend_sql.py",
            "",
        ]
    )


def promote_artifact(artifact: SqlArtifact) -> list[str]:
    source_path = DBT_COMPILED_ROOT / artifact.model_path
    print()
    print(f"[artifact] {artifact.display_name}")
    detail("source", relative(source_path))
    detail("target", relative(artifact.target_path))

    if not source_path.exists():
        return [
            f"{artifact.display_name}: missing compiled dbt SQL at "
            f"{relative(source_path)}. Run this first from dbt/azure_postgres: "
            f"{RUNTIME_COMPILE_COMMAND}"
        ]

    sql = source_path.read_text(encoding="utf-8-sig")
    detail("source_bytes", f"{source_path.stat().st_size:,}")
    failures = validate_sql(sql, artifact)
    if failures:
        return [
            f"{artifact.display_name}: {relative(source_path)} {failure}"
            for failure in failures
        ]

    promoted_sql = generated_header(artifact) + sql.lstrip()
    for output_root in SQL_OUTPUT_ROOTS:
        target_path = artifact.target_path_for(output_root)
        target_path.parent.mkdir(parents=True, exist_ok=True)
        target_path.write_text(promoted_sql, encoding="utf-8")
        print(f"wrote: {relative(target_path)}")
    print("validation: ok")
    return []


def manifest_entry(artifact: SqlArtifact, sql_root: Path) -> dict[str, object]:
    dbt_model_path = DBT_PJM_MODEL_ROOT / artifact.model_path
    dbt_compiled_path = DBT_COMPILED_ROOT / artifact.model_path
    return {
        "displayName": artifact.display_name,
        "promotedSql": relative_posix(artifact.target_path_for(sql_root)),
        "dbtModel": relative_posix(dbt_model_path),
        "dbtCompiledSql": relative(dbt_compiled_path),
        "consumers": list(artifact.consumers),
    }


def write_manifest(sql_root: Path) -> Path:
    manifest_path = sql_root / "manifest.json"
    manifest = {
        "contractId": CONTRACT_ID,
        "displayName": CONTRACT_DISPLAY_NAME,
        "runtimeSqlRoot": relative_posix(sql_root),
        "generatedBy": relative_posix(SCRIPT_PATH),
        "dbtRuntimeVars": {"pjm_da_model_param_mode": "runtime"},
        "compileCommandFromDbtProjectRoot": RUNTIME_COMPILE_COMMAND,
        "artifacts": {
            artifact.artifact_id: manifest_entry(artifact, sql_root)
            for artifact in ARTIFACTS
        },
        "knownSourceGaps": {
            "nerc_holiday": (
                "The old calendar table is intentionally not migrated. Python "
                "derives weekday/weekend features and defaults NERC holiday to 0."
            ),
            "ice_gas_non_trading_days": (
                "ICE gas uses a code-owned physical gas non-trading calendar "
                "compiled from dbt macro ice_python_physical_gas_non_trading_day_values; "
                "calendar updates require dbt compile and SQL promotion."
            ),
            "output_publication": (
                "Model outputs are not published to database cache tables in "
                "this pass. Meteologica Baseline Pricing can be executed from "
                "frontend TypeScript by reading these promoted SQL inputs with "
                "helios_readonly; backend Python runners remain read-only."
            ),
        },
    }
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    return manifest_path


def main() -> int:
    section("Promote PJM DA model backend SQL")
    detail("repo_root", REPO_ROOT)
    detail("dbt_project_root", DBT_PROJECT_ROOT)
    detail("compiled_root", relative(DBT_COMPILED_ROOT))
    detail("backend_sql_root", relative(BACKEND_SQL_ROOT))
    detail("frontend_sql_root", relative(FRONTEND_SQL_ROOT))
    detail("artifact_count", len(ARTIFACTS))

    section("Validate and write artifacts")
    failures: list[str] = []
    for artifact in ARTIFACTS:
        failures.extend(promote_artifact(artifact))

    if failures:
        section("Promotion failed")
        for failure in failures:
            print(f"  - {failure}")
        print()
        print("No rollback was attempted. Re-run runtime dbt compile and this script.")
        return 1

    manifest_paths = [write_manifest(sql_root) for sql_root in SQL_OUTPUT_ROOTS]
    section("Promotion complete")
    detail("artifacts_promoted", len(ARTIFACTS))
    detail("manifests", ", ".join(relative(path) for path in manifest_paths))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
