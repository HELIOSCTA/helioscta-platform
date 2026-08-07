"""Sync backend ICE gas registry metadata into frontend and dbt artifacts."""
from __future__ import annotations

import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


REPO_ROOT = Path(__file__).resolve().parents[2]
OUTPUT_PATH = REPO_ROOT / "frontend" / "lib" / "gasPricing" / "ice_gas_registry.json"
DBT_SYMBOL_VALUES_MACRO_PATH = (
    REPO_ROOT
    / "dbt"
    / "azure_postgres"
    / "macros"
    / "pjm_da_model"
    / "ice_python_next_day_gas_symbol_values.sql"
)

if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from backend.scrapes.ice_python.symbols import gas  # noqa: E402


MANUAL_FUTURES_HUB_ALIASES = {
    "henryhub": "henryhubnaturalgas",
    "tgp500l": "tgp500l",
    "columbiagulfmainline": "columbiagulf",
    "dominionsoutheasterngassouth": "dominionsouth",
}

MANUAL_BALMO_HUB_ALIASES = {
    "transcozone5north": "transcozone5",
}

CURATED_PIPELINE_GROUPS = [
    {
        "pipelineKey": "transco",
        "pipelineLabel": "Transco",
        "markets": [
            ("transcostation85", "Transco Station 85"),
            ("transcozone5south", "Transco Zone 5 South"),
            ("transcozone5north", "Transco Zone 5 North"),
            ("transcozone6ny", "Transco Zone 6 NY"),
            ("transcoleidy", "Transco Leidy"),
        ],
    },
    {
        "pipelineKey": "tennessee_gas_pipeline",
        "pipelineLabel": "Tennessee Gas Pipeline",
        "markets": [
            ("tgp500l", "TGP-500L"),
            ("tennesseez4marcellus", "Tennessee Z4 (Marcellus)"),
        ],
    },
    {
        "pipelineKey": "florida_gas",
        "pipelineLabel": "Florida Gas",
        "markets": [("fgtzone3", "FGT Zone 3")],
    },
    {
        "pipelineKey": "columbia_gulf",
        "pipelineLabel": "Columbia Gulf",
        "markets": [("columbiagulfmainline", "Columbia Gulf (Mainline)")],
    },
    {
        "pipelineKey": "columbia_gas",
        "pipelineLabel": "Columbia Gas",
        "markets": [("columbiatcopool", "Columbia TCO Pool")],
    },
    {
        "pipelineKey": "anr",
        "pipelineLabel": "ANR",
        "markets": [("anrset", "ANR SE-T")],
    },
    {
        "pipelineKey": "texas_eastern",
        "pipelineLabel": "Texas Eastern",
        "markets": [
            ("tetcowla", "Tetco WLA"),
            ("tetcom3", "Tetco M3"),
            ("tetcom2receipt", "Tetco M2 (Receipt)"),
        ],
    },
    {
        "pipelineKey": "natural_gas_pipeline_of_america",
        "pipelineLabel": "Natural Gas Pipeline of America",
        "markets": [
            ("ngpltxok", "NGPL TX/OK"),
            ("ngplmidcontinent", "NGPL Midcontinent"),
            ("chicagocitygatengplnicor", "Chicago CityGate (NGPL-Nicor)"),
        ],
    },
    {
        "pipelineKey": "algonquin",
        "pipelineLabel": "Algonquin",
        "markets": [("algonquincitygates", "Algonquin Citygates")],
    },
    {
        "pipelineKey": "iroquois",
        "pipelineLabel": "Iroquois",
        "markets": [("iroquoiszone2", "Iroquois Zone 2")],
    },
    {
        "pipelineKey": "northern_natural",
        "pipelineLabel": "Northern Natural",
        "markets": [("northernventuranng", "Northern Ventura (NNG)")],
    },
    {
        "pipelineKey": "colorado_interstate_gas",
        "pipelineLabel": "Colorado Interstate Gas",
        "markets": [("cigmainline", "CIG Mainline")],
    },
    {
        "pipelineKey": "eastern_gas",
        "pipelineLabel": "Eastern Gas",
        "markets": [("dominionsoutheasterngassouth", "Dominion South (Eastern Gas-South)")],
    },
]


def build_pipeline_market_metadata() -> dict[str, dict[str, Any]]:
    metadata: dict[str, dict[str, Any]] = {}
    for pipeline_sort_order, group in enumerate(CURATED_PIPELINE_GROUPS, start=1):
        pipeline_key = str(group["pipelineKey"])
        pipeline_label = str(group["pipelineLabel"])
        for market_sort_order, (hub_key, _market_name) in enumerate(group["markets"], start=1):
            if hub_key in metadata:
                raise ValueError(f"Duplicate pipeline hub mapping: {hub_key}.")
            metadata[hub_key] = {
                "pipelineKey": pipeline_key,
                "pipelineLabel": pipeline_label,
                "pipelineSortOrder": pipeline_sort_order,
                "pipelineMarketSortOrder": market_sort_order,
            }
    return metadata


PIPELINE_MARKET_METADATA = build_pipeline_market_metadata()


def normalize_hub(value: object) -> str:
    normalized = str(value or "").lower()
    normalized = normalized.replace("&", "and")
    normalized = normalized.replace("non-g", "")
    normalized = re.sub(r"[^a-z0-9]+", "", normalized)
    return normalized


def short_label(value: object) -> str:
    text = str(value or "").strip()
    if len(text) <= 14:
        return text
    words = [word for word in re.split(r"[^A-Za-z0-9&]+", text) if word]
    compact = " ".join(words[:3])
    return compact[:18] if compact else text[:18]


def serializable_row(row: dict[str, Any]) -> dict[str, Any]:
    return {
        key: value
        for key, value in row.items()
        if isinstance(value, (str, int, float, bool)) or value is None
    }


def by_normalized_hub(rows: list[dict[str, Any]], aliases: dict[str, str] | None = None) -> dict[str, dict[str, Any]]:
    aliases = aliases or {}
    indexed: dict[str, dict[str, Any]] = {}
    for row in rows:
        key = normalize_hub(row.get("hub"))
        indexed[key] = row
    return {**indexed, **{alias: indexed[target] for alias, target in aliases.items() if target in indexed}}


def pipeline_metadata_for_hub(hub_key: str) -> dict[str, Any]:
    metadata = PIPELINE_MARKET_METADATA.get(hub_key)
    if not metadata:
        return {
            "pipelineKey": None,
            "pipelineLabel": None,
            "pipelineSortOrder": None,
            "pipelineMarketSortOrder": None,
        }
    return metadata


def validate_pipeline_metadata(markets: list[dict[str, Any]]) -> None:
    pipeline_rows = [market for market in markets if market.get("pipelineKey")]
    for market in pipeline_rows:
        missing = [
            key
            for key in (
                "pipelineKey",
                "pipelineLabel",
                "pipelineSortOrder",
                "pipelineMarketSortOrder",
            )
            if market.get(key) is None
        ]
        if missing:
            raise ValueError(f"Pipeline market {market['market']} is missing {missing}.")

    actual_by_pipeline: dict[str, list[str]] = {}
    for market in sorted(
        pipeline_rows,
        key=lambda item: (
            int(item["pipelineSortOrder"]),
            int(item["pipelineMarketSortOrder"]),
        ),
    ):
        actual_by_pipeline.setdefault(str(market["pipelineKey"]), []).append(str(market["market"]))

    expected_by_pipeline = {
        str(group["pipelineKey"]): [market_name for _hub_key, market_name in group["markets"]]
        for group in CURATED_PIPELINE_GROUPS
    }
    if set(actual_by_pipeline) != set(expected_by_pipeline):
        raise ValueError(
            "Pipeline registry group drifted. "
            f"Expected keys {sorted(expected_by_pipeline)}, got {sorted(actual_by_pipeline)}."
        )
    for group in CURATED_PIPELINE_GROUPS:
        pipeline_key = str(group["pipelineKey"])
        expected_markets = expected_by_pipeline[pipeline_key]
        actual_markets = actual_by_pipeline[pipeline_key]
        if actual_markets != expected_markets:
            raise ValueError(
                f"{pipeline_key} pipeline registry mapping drifted. "
                f"Expected {expected_markets}, got {actual_markets}."
            )
        expected_label = str(group["pipelineLabel"])
        actual_labels = {
            str(market["pipelineLabel"])
            for market in pipeline_rows
            if market["pipelineKey"] == pipeline_key
        }
        if actual_labels != {expected_label}:
            raise ValueError(
                f"{pipeline_key} pipeline label drifted. "
                f"Expected {expected_label}, got {sorted(actual_labels)}."
            )


def build_markets(
    next_day_rows: list[dict[str, Any]],
    balmo_rows: list[dict[str, Any]],
    futures_rows: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    balmo_by_hub = by_normalized_hub(balmo_rows, MANUAL_BALMO_HUB_ALIASES)
    active_futures_rows = [
        row
        for row in futures_rows
        if row.get("active", True) and row.get("review_status") != "candidate_verified_not_mapped"
    ]
    futures_by_hub = by_normalized_hub(active_futures_rows, MANUAL_FUTURES_HUB_ALIASES)
    markets: list[dict[str, Any]] = []

    for index, row in enumerate(next_day_rows, start=1):
        hub_key = normalize_hub(row.get("hub"))
        balmo = balmo_by_hub.get(hub_key)
        future = futures_by_hub.get(hub_key)
        futures_product = future.get("product") if future else None
        curve_style = "fixed" if futures_product == "HNG" else "basis" if futures_product else "none"
        market_name = str(row.get("hub") or row.get("description") or row["symbol"])

        markets.append(
            {
                "sortOrder": index,
                "region": row["region"],
                "market": market_name,
                "shortLabel": short_label(market_name),
                "cashSymbol": row["symbol"],
                "balmoSymbol": balmo.get("symbol") if balmo else None,
                "futuresProduct": futures_product,
                "curveStyle": curve_style,
                "registryHubKey": hub_key,
                **pipeline_metadata_for_hub(hub_key),
            }
        )

    validate_pipeline_metadata(markets)
    return markets


def sql_literal(value: object) -> str:
    return "'" + str(value).replace("'", "''") + "'"


def render_dbt_symbol_values_macro(next_day_rows: list[dict[str, Any]]) -> str:
    value_rows = []
    for index, row in enumerate(next_day_rows):
        value_rows.append(
            "        "
            f"({sql_literal(row['symbol'])}::text, "
            f"{sql_literal(row['description'])}::text, "
            f"{sql_literal(row['region'])}::text, "
            f"{index}::int)"
        )

    return "\n".join(
        [
            "-- GENERATED FILE. DO NOT EDIT.",
            "-- Source: backend.scrapes.ice_python.symbols.gas",
            "-- Rebuild: python frontend/scripts/sync-ice-gas-registry.py",
            "",
            "{% macro ice_python_next_day_gas_symbol_values() -%}",
            "values",
            ",\n".join(value_rows),
            "{%- endmacro %}",
            "",
        ]
    )


def existing_generated_at(path: Path) -> str | None:
    if not path.exists():
        return None
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return None
    value = payload.get("metadata", {}).get("generatedAt")
    return str(value) if value else None


def write_or_check(path: Path, content: str, *, check: bool) -> bool:
    if check:
        current = path.read_text(encoding="utf-8") if path.exists() else None
        if current != content:
            print(f"Out of sync: {path.relative_to(REPO_ROOT)}", file=sys.stderr)
            return False
        print(f"Checked {path.relative_to(REPO_ROOT)}")
        return True

    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")
    print(f"Wrote {path.relative_to(REPO_ROOT)}")
    return True


def main(check: bool = False) -> int:
    next_day_rows = [serializable_row(row) for row in gas.get_next_day_gas_symbols()]
    balmo_rows = [serializable_row(row) for row in gas.get_balmo_gas_symbols()]
    futures_rows = [serializable_row(row) for row in gas.get_gas_futures_products()]
    generated_at = existing_generated_at(OUTPUT_PATH) if check else None
    payload = {
        "metadata": {
            "source": "backend.scrapes.ice_python.symbols.gas",
            "generatedAt": generated_at
            or datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
            "nextDayCount": len(next_day_rows),
            "balmoCount": len(balmo_rows),
            "futuresProductCount": len(futures_rows),
            "marketCount": len(next_day_rows),
        },
        "nextDay": next_day_rows,
        "balmo": balmo_rows,
        "futures": futures_rows,
        "markets": build_markets(next_day_rows, balmo_rows, futures_rows),
    }
    ok = True
    ok &= write_or_check(
        OUTPUT_PATH,
        json.dumps(payload, indent=2, sort_keys=True) + "\n",
        check=check,
    )
    ok &= write_or_check(
        DBT_SYMBOL_VALUES_MACRO_PATH,
        render_dbt_symbol_values_macro(next_day_rows),
        check=check,
    )
    print(
        "Counts: "
        f"next_day={payload['metadata']['nextDayCount']} "
        f"balmo={payload['metadata']['balmoCount']} "
        f"futures={payload['metadata']['futuresProductCount']} "
        f"markets={payload['metadata']['marketCount']}"
    )
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main(check="--check" in sys.argv[1:]))
