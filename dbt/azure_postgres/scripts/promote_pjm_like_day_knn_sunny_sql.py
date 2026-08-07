from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path


SCRIPT_PATH = Path(__file__).resolve()
DBT_PROJECT_ROOT = SCRIPT_PATH.parents[1]
REPO_ROOT = SCRIPT_PATH.parents[3]
DBT_PJM_MODEL_ROOT = DBT_PROJECT_ROOT / "models" / "pjm_da_model"
DBT_INPUT_MODEL_PATHS = (
    DBT_PJM_MODEL_ROOT / "ice_python" / "settlements",
    DBT_PJM_MODEL_ROOT / "pjm" / "da_lmps_hourly",
    DBT_PJM_MODEL_ROOT / "pjm" / "rto_load_hourly",
    DBT_PJM_MODEL_ROOT / "pjm" / "load_forecast_hourly",
    DBT_PJM_MODEL_ROOT / "pjm" / "gen_by_fuel",
    DBT_PJM_MODEL_ROOT / "pjm" / "gen_outages",
    DBT_PJM_MODEL_ROOT / "meteologica" / "pjm_forecast_hourly",
    DBT_PJM_MODEL_ROOT / "weather" / "wsi_hourly_temperature",
)
DBT_COMPILED_ROOT = (
    DBT_PROJECT_ROOT
    / "target"
    / "compiled"
    / "helioscta_platform"
    / "models"
    / "pjm_da_model"
)
RUNTIME_SQL_ROOT = (
    REPO_ROOT
    / "tmp"
    / "data"
    / "pjm_like_day_modelling"
    / "like_day_model_knn_sunny"
)
MANIFEST_PATH = RUNTIME_SQL_ROOT / "manifest.json"
CONTRACT_ID = "pjm_da_model_like_day_knn_sunny"
CONTRACT_DISPLAY_NAME = "PJM DA Model Like-Day KNN Sunny Prototype"
DBT_MODEL_CHANGE_SUMMARY = (
    "Promotes source-specific read-only SQL artifacts for the tmp "
    "helios_prod-backed PJM DA like-day KNN Sunny model family."
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
        artifact_id="ice_python_next_day_gas_hourly",
        display_name="ICE Python Next-Day Gas Hourly",
        name="ICE Python next-day gas hourly",
        model_path=Path(
            "ice_python/settlements/ice_python_next_day_gas_hourly.sql"
        ),
        target_path=RUNTIME_SQL_ROOT / "sql" / "ice_python_next_day_gas_hourly.sql",
        required_markers=(
            "from \"helios_prod\".\"ice_python\".\"settlements\"",
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
        display_name="Actual DA LMPs Hourly History",
        name="PJM DA LMP hourly history labels",
        model_path=Path("pjm/da_lmps_hourly/pjm_da_lmps_hourly_history.sql"),
        target_path=RUNTIME_SQL_ROOT / "sql" / "actual_da_lmps_hourly_history.sql",
        required_markers=(
            "from \"helios_prod\".\"pjm\".\"da_hrl_lmps\"",
            "%(start_date)s::date as start_date",
            "%(end_date)s::date as end_date",
            "%(hub)s::text as hub",
            "row_is_current = true",
            "from FINAL",
        ),
    ),
    SqlArtifact(
        artifact_id="rto_load_hourly_history",
        display_name="PJM RTO Load Hourly History",
        name="PJM RTO hourly load history",
        model_path=Path("pjm/rto_load_hourly/pjm_rto_load_hourly_history.sql"),
        target_path=RUNTIME_SQL_ROOT / "sql" / "rto_load_hourly_history.sql",
        required_markers=(
            "from \"helios_prod\".\"pjm\".\"hrl_load_metered\"",
            "%(load_region)s::text as load_region",
            "load_mw_at_hour",
            "from FINAL",
        ),
    ),
    SqlArtifact(
        artifact_id="rto_load_forecast_hourly_history",
        display_name="PJM RTO Load Forecast Hourly History",
        name="PJM RTO hourly load forecast history",
        model_path=Path(
            "pjm/load_forecast_hourly/pjm_rto_load_forecast_hourly_history.sql"
        ),
        target_path=RUNTIME_SQL_ROOT
        / "sql"
        / "rto_load_forecast_hourly_history.sql",
        required_markers=(
            "from \"helios_prod\".\"pjm\".\"load_frcstd_7_day\"",
            "%(load_region)s::text as load_region",
            "%(lead_days)s::int as lead_days",
            "forecast_load_mw",
            "from FINAL",
        ),
    ),
    SqlArtifact(
        artifact_id="rto_load_latest_forecast_hourly",
        display_name="PJM RTO Load Latest Forecast Hourly",
        name="PJM RTO latest hourly load forecast",
        model_path=Path(
            "pjm/load_forecast_hourly/pjm_rto_load_latest_forecast_hourly.sql"
        ),
        target_path=RUNTIME_SQL_ROOT
        / "sql"
        / "rto_load_latest_forecast_hourly.sql",
        required_markers=(
            "from \"helios_prod\".\"pjm\".\"load_frcstd_7_day\"",
            "%(cutoff_utc)s::timestamptz as cutoff_utc",
            "%(load_region)s::text as load_region",
            "forecast_load_mw",
            "from FINAL",
        ),
    ),
    SqlArtifact(
        artifact_id="renewables_hourly_history",
        display_name="PJM Renewables Hourly History",
        name="PJM generation-by-fuel renewables history",
        model_path=Path(
            "pjm/gen_by_fuel/pjm_gen_by_fuel_renewables_hourly_history.sql"
        ),
        target_path=RUNTIME_SQL_ROOT / "sql" / "renewables_hourly_history.sql",
        required_markers=(
            "from \"helios_prod\".\"pjm\".\"gen_by_fuel\"",
            "from \"helios_prod\".\"pjm\".\"solar_gen\"",
            "from \"helios_prod\".\"pjm\".\"wind_gen\"",
            "from \"helios_prod\".\"pjm\".\"hourly_solar_power_forecast\"",
            "from \"helios_prod\".\"pjm\".\"hourly_wind_power_forecast\"",
            "fuel_type in ('Solar', 'Wind')",
            "solar_pjm_forecast_at_hour",
            "solar_at_hour",
            "wind_at_hour",
            "from FINAL",
        ),
    ),
    SqlArtifact(
        artifact_id="renewables_latest_forecast_hourly",
        display_name="PJM Renewables Latest Forecast Hourly",
        name="PJM latest hourly renewable forecast",
        model_path=Path(
            "pjm/gen_by_fuel/pjm_renewables_latest_forecast_hourly.sql"
        ),
        target_path=RUNTIME_SQL_ROOT
        / "sql"
        / "renewables_latest_forecast_hourly.sql",
        required_markers=(
            "from \"helios_prod\".\"pjm\".\"hourly_solar_power_forecast\"",
            "from \"helios_prod\".\"pjm\".\"hourly_wind_power_forecast\"",
            "%(cutoff_utc)s::timestamptz as cutoff_utc",
            "solar_at_hour",
            "wind_at_hour",
            "from FINAL",
        ),
    ),
    SqlArtifact(
        artifact_id="gen_outages_daily_history",
        display_name="PJM Generation Outages Daily History",
        name="PJM generation outage daily history",
        model_path=Path("pjm/gen_outages/pjm_gen_outages_daily_history.sql"),
        target_path=RUNTIME_SQL_ROOT / "sql" / "gen_outages_daily_history.sql",
        required_markers=(
            "from \"helios_prod\".\"pjm\".\"gen_outages_by_type\"",
            "%(region)s::text as region",
            "%(lead_days)s::int as lead_days",
            "outage_total_mw",
            "from FINAL",
        ),
    ),
    SqlArtifact(
        artifact_id="gen_outages_daily_latest_forecast",
        display_name="PJM Generation Outages Daily Latest Forecast",
        name="PJM generation outage latest forecast",
        model_path=Path(
            "pjm/gen_outages/pjm_gen_outages_daily_latest_forecast.sql"
        ),
        target_path=RUNTIME_SQL_ROOT / "sql" / "gen_outages_daily_latest_forecast.sql",
        required_markers=(
            "from \"helios_prod\".\"pjm\".\"gen_outages_by_type\"",
            "%(cutoff_date)s::date as cutoff_date",
            "%(region)s::text as region",
            "total_outages_mw",
            "from FINAL",
        ),
    ),
    SqlArtifact(
        artifact_id="meteologica_pjm_rto_latest_forecast_hourly",
        display_name="Meteologica PJM RTO Latest Forecast Hourly",
        name="Meteologica PJM RTO latest supply-demand forecast",
        model_path=Path(
            "meteologica/pjm_forecast_hourly/"
            "meteologica_pjm_rto_latest_forecast_hourly.sql"
        ),
        target_path=RUNTIME_SQL_ROOT / "sql" / "meteo_pjm_rto_latest_forecast_hourly.sql",
        required_markers=(
            "from \"helios_prod\".\"meteologica\".\"pjm_forecast_hourly\"",
            "%(forecast_area)s::text as forecast_area",
            "metric in ('load', 'solar', 'wind')",
            "net_load_at_hour",
            "from FINAL",
        ),
    ),
    SqlArtifact(
        artifact_id="meteologica_pjm_rto_forecast_hourly_history",
        display_name="Meteologica PJM RTO Forecast Hourly History",
        name="Meteologica PJM RTO historical supply-demand forecast",
        model_path=Path(
            "meteologica/pjm_forecast_hourly/"
            "meteologica_pjm_rto_forecast_hourly_history.sql"
        ),
        target_path=RUNTIME_SQL_ROOT
        / "sql"
        / "meteo_pjm_rto_forecast_hourly_history.sql",
        required_markers=(
            "from \"helios_prod\".\"meteologica\".\"pjm_forecast_hourly\"",
            "%(forecast_area)s::text as forecast_area",
            "%(lead_days)s::int as lead_days",
            "metric in ('load', 'solar', 'wind')",
            "net_load_at_hour",
            "from FINAL",
        ),
    ),
    SqlArtifact(
        artifact_id="wsi_temperature_hourly_history",
        display_name="WSI Temperature Hourly History",
        name="WSI hourly observed temperature history",
        model_path=Path(
            "weather/wsi_hourly_temperature/weather_wsi_hourly_temperature_history.sql"
        ),
        target_path=RUNTIME_SQL_ROOT / "sql" / "wsi_temperature_hourly_history.sql",
        required_markers=(
            "from \"helios_prod\".\"weather\".\"wsi_hourly_observed_temperatures\"",
            "%(region)s::text as region",
            "temp_at_hour",
            "from FINAL",
        ),
    ),
    SqlArtifact(
        artifact_id="wsi_temperature_hourly_latest_forecast",
        display_name="WSI Temperature Hourly Latest Forecast",
        name="WSI hourly latest temperature forecast",
        model_path=Path(
            "weather/wsi_hourly_temperature/"
            "weather_wsi_hourly_temperature_latest_forecast.sql"
        ),
        target_path=RUNTIME_SQL_ROOT
        / "sql"
        / "wsi_temperature_hourly_latest_forecast.sql",
        required_markers=(
            "from \"helios_prod\".\"weather\".\"wsi_hourly_forecasts\"",
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
            "+path:models/pjm_da_model/ice_python/settlements "
            "+path:models/pjm_da_model/pjm/da_lmps_hourly "
            "+path:models/pjm_da_model/pjm/rto_load_hourly "
            "+path:models/pjm_da_model/pjm/load_forecast_hourly "
            "+path:models/pjm_da_model/pjm/gen_by_fuel "
            "+path:models/pjm_da_model/pjm/gen_outages "
            "+path:models/pjm_da_model/meteologica/pjm_forecast_hourly "
            "+path:models/pjm_da_model/weather/wsi_hourly_temperature "
            "--vars \"{pjm_da_model_param_mode: runtime}\""
        ]

    sql_bytes = source_path.read_bytes()
    sql = sql_bytes.decode("utf-8")
    detail("source_bytes", f"{len(sql_bytes):,}")

    missing_markers = validate_sql(sql, artifact)
    if missing_markers:
        failures = [
            f"{artifact.name}: {relative(source_path)} is missing expected marker: {marker}"
            for marker in missing_markers
        ]
        failures.append(
            "Recompile promotion artifacts with runtime params from dbt/azure_postgres."
        )
        return failures

    artifact.target_path.parent.mkdir(parents=True, exist_ok=True)
    artifact.target_path.write_bytes(sql_bytes)
    print("validation: ok")
    print(f"copied: {relative(artifact.target_path)}")
    return []


def manifest_entry(artifact: SqlArtifact) -> dict[str, str]:
    dbt_model_path = DBT_PJM_MODEL_ROOT / artifact.model_path
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
        "dbtModelFamilyPath": relative_posix(DBT_PJM_MODEL_ROOT),
        "dbtInputModelPaths": [
            relative_posix(path)
            for path in DBT_INPUT_MODEL_PATHS
        ],
        "dbtSourceModelRoots": [
            relative_posix(path)
            for path in DBT_INPUT_MODEL_PATHS
        ],
        "dbtModelChangeSummary": DBT_MODEL_CHANGE_SUMMARY,
        "dbtRuntimeVars": {
            "pjm_da_model_param_mode": "runtime",
        },
        "runtimeSqlRoot": relative_posix(RUNTIME_SQL_ROOT / "sql"),
        "generatedBy": relative_posix(SCRIPT_PATH),
        "artifacts": {
            artifact.artifact_id: manifest_entry(artifact)
            for artifact in ARTIFACTS
        },
        "knownSourceGaps": {
            "nerc_holiday": (
                "No helios_prod calendar/date-dimension source was visible in "
                "readonly catalog inspection on 2026-07-28; Python derives "
                "weekday/weekend features and defaults NERC holiday to 0."
            ),
            "instantaneous_load": (
                "Historical load now prefers metered rows and falls back to "
                "preliminary rows. A separate instantaneous load fallback was "
                "not migrated because no matching helios_prod input contract "
                "was identified for this pass."
            ),
            "outage_actuals": (
                "Outage features use lead-1 and latest-at-cutoff rows from "
                "pjm.gen_outages_by_type. A distinct outage-actual fallback "
                "matching the old parquet contract was not identified in "
                "helios_prod."
            ),
            "ice_gas_non_trading_days": (
                "ICE gas uses a code-owned physical gas non-trading calendar "
                "compiled from dbt macro ice_python_physical_gas_non_trading_day_values; "
                "calendar updates require dbt compile and SQL promotion."
            ),
        },
    }
    MANIFEST_PATH.parent.mkdir(parents=True, exist_ok=True)
    MANIFEST_PATH.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")


def main() -> int:
    section("Promote PJM like-day KNN Sunny SQL")
    detail("repo_root", REPO_ROOT)
    detail("dbt_project_root", DBT_PROJECT_ROOT)
    detail("compiled_root", relative(DBT_COMPILED_ROOT))
    detail("runtime_sql_root", relative(RUNTIME_SQL_ROOT / "sql"))
    detail(
        "input_model_paths",
        ", ".join(relative(path) for path in DBT_INPUT_MODEL_PATHS),
    )
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
