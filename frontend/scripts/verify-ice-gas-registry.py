from __future__ import annotations

import csv
import json
import re
import ssl
import sys
import urllib.request
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any


ICE_PRODUCT_CODES_URL = "https://www.ice.com/api/productguide/info/codes/all/csv"
REGISTRY_PATH = Path(__file__).resolve().parents[1] / "lib" / "gasPricing" / "ice_gas_registry.json"
ACCEPTED_LEGACY_REVIEW_STATUSES = {"business_verified_legacy_cash"}
CURATED_PIPELINE_GROUPS = [
    {
        "pipelineKey": "transco",
        "pipelineLabel": "Transco",
        "markets": [
            "Transco Station 85",
            "Transco Zone 5 South",
            "Transco Zone 5 North",
            "Transco Zone 6 NY",
            "Transco Leidy",
        ],
    },
    {
        "pipelineKey": "tennessee_gas_pipeline",
        "pipelineLabel": "Tennessee Gas Pipeline",
        "markets": ["TGP-500L", "Tennessee Z4 (Marcellus)"],
    },
    {
        "pipelineKey": "florida_gas",
        "pipelineLabel": "Florida Gas",
        "markets": ["FGT Zone 3"],
    },
    {
        "pipelineKey": "columbia_gulf",
        "pipelineLabel": "Columbia Gulf",
        "markets": ["Columbia Gulf (Mainline)"],
    },
    {
        "pipelineKey": "columbia_gas",
        "pipelineLabel": "Columbia Gas",
        "markets": ["Columbia TCO Pool"],
    },
    {
        "pipelineKey": "anr",
        "pipelineLabel": "ANR",
        "markets": ["ANR SE-T"],
    },
    {
        "pipelineKey": "texas_eastern",
        "pipelineLabel": "Texas Eastern",
        "markets": ["Tetco WLA", "Tetco M3", "Tetco M2 (Receipt)"],
    },
    {
        "pipelineKey": "natural_gas_pipeline_of_america",
        "pipelineLabel": "Natural Gas Pipeline of America",
        "markets": ["NGPL TX/OK", "NGPL Midcontinent", "Chicago CityGate (NGPL-Nicor)"],
    },
    {
        "pipelineKey": "algonquin",
        "pipelineLabel": "Algonquin",
        "markets": ["Algonquin Citygates"],
    },
    {
        "pipelineKey": "iroquois",
        "pipelineLabel": "Iroquois",
        "markets": ["Iroquois Zone 2"],
    },
    {
        "pipelineKey": "northern_natural",
        "pipelineLabel": "Northern Natural",
        "markets": ["Northern Ventura (NNG)"],
    },
    {
        "pipelineKey": "colorado_interstate_gas",
        "pipelineLabel": "Colorado Interstate Gas",
        "markets": ["CIG Mainline"],
    },
    {
        "pipelineKey": "eastern_gas",
        "pipelineLabel": "Eastern Gas",
        "markets": ["Dominion South (Eastern Gas-South)"],
    },
]


def _create_https_context() -> ssl.SSLContext:
    try:
        import certifi  # type: ignore[import-not-found]
    except ImportError:
        return ssl.create_default_context()

    return ssl.create_default_context(cafile=certifi.where())


def _download_ice_product_codes(url: str = ICE_PRODUCT_CODES_URL) -> list[dict[str, str]]:
    request = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 HeliosCTA ICE gas registry verifier",
            "Accept": "text/csv,*/*",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=60, context=_create_https_context()) as response:
            text = response.read().decode("utf-8-sig")
    except ssl.SSLError as exc:
        raise RuntimeError(
            "Unable to establish a verified HTTPS connection to ICE. "
            "Install certifi or set SSL_CERT_FILE to a valid CA bundle."
        ) from exc
    return list(csv.DictReader(text.splitlines()))


def _load_registry(path: Path = REGISTRY_PATH) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def _build_ice_indexes(rows: list[dict[str, str]]) -> dict[str, set[str]]:
    product_ids: set[str] = set()
    physical_codes: set[str] = set()
    logical_codes: set[str] = set()
    symbol_codes: set[str] = set()

    for row in rows:
        product_html = row.get("PRODUCT (Click to open in Browser)", "") or ""
        match = re.search(r"/products/(\d+)", product_html)
        if match:
            product_ids.add(match.group(1))

        for column, target in (
            ("PHYSICAL", physical_codes),
            ("LOGICAL", logical_codes),
            ("SYMBOL CODE", symbol_codes),
        ):
            value = (row.get(column) or "").strip()
            if value:
                target.add(value)

    return {
        "product_ids": product_ids,
        "physical_codes": physical_codes,
        "logical_codes": logical_codes,
        "symbol_codes": symbol_codes,
    }


def _entry_code(entry: dict[str, Any]) -> str:
    identifier = entry.get("symbol") or entry.get("product") or entry.get("cc") or ""
    return str(identifier).split()[0]


def _entry_matches_ice(entry: dict[str, Any], indexes: dict[str, set[str]]) -> bool:
    product_id = str(entry.get("ice_product_id") or "").strip()
    code = _entry_code(entry)
    return (
        bool(product_id and product_id in indexes["product_ids"])
        or code in indexes["physical_codes"]
        or code in indexes["logical_codes"]
        or code in indexes["symbol_codes"]
    )


def _component_status(entry: dict[str, Any] | None) -> str:
    if not entry:
        return "none"
    if entry.get("csv_match"):
        return "verified"
    review_status = str(entry.get("review_status") or "")
    if review_status in ACCEPTED_LEGACY_REVIEW_STATUSES:
        return review_status
    return str(entry.get("metadata_status") or "unverified")


def _validate_pipeline_metadata(registry: dict[str, Any]) -> dict[str, list[str]]:
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for market in registry.get("markets", []):
        pipeline_key = market.get("pipelineKey")
        if not pipeline_key:
            continue
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
            raise RuntimeError(f"Pipeline market {market.get('market')} is missing {missing}.")
        grouped[str(pipeline_key)].append(market)

    pipeline_markets = {
        key: [
            str(market["market"])
            for market in sorted(
                rows,
                key=lambda item: (
                    int(item["pipelineSortOrder"]),
                    int(item["pipelineMarketSortOrder"]),
                ),
            )
        ]
        for key, rows in grouped.items()
    }
    expected_pipeline_markets = {
        str(group["pipelineKey"]): [str(market) for market in group["markets"]]
        for group in CURATED_PIPELINE_GROUPS
    }
    if set(pipeline_markets) != set(expected_pipeline_markets):
        raise RuntimeError(
            "Pipeline registry group drifted. "
            f"Expected keys {sorted(expected_pipeline_markets)}, got {sorted(pipeline_markets)}."
        )
    for group in CURATED_PIPELINE_GROUPS:
        pipeline_key = str(group["pipelineKey"])
        expected_markets = expected_pipeline_markets[pipeline_key]
        actual_markets = pipeline_markets[pipeline_key]
        if actual_markets != expected_markets:
            raise RuntimeError(
                f"{pipeline_key} pipeline registry mapping drifted. "
                f"Expected {expected_markets}, got {actual_markets}."
            )
        expected_label = str(group["pipelineLabel"])
        actual_labels = {
            str(market["pipelineLabel"])
            for market in registry.get("markets", [])
            if market.get("pipelineKey") == pipeline_key
        }
        if actual_labels != {expected_label}:
            raise RuntimeError(
                f"{pipeline_key} pipeline label drifted. "
                f"Expected {expected_label}, got {sorted(actual_labels)}."
            )
    return pipeline_markets


def verify_ice_gas_registry() -> int:
    registry = _load_registry()
    pipeline_markets = _validate_pipeline_metadata(registry)
    ice_rows = _download_ice_product_codes()
    indexes = _build_ice_indexes(ice_rows)

    entry_by_identifier: dict[str, dict[str, Any]] = {}
    status_counts: Counter[tuple[str, str]] = Counter()
    entries_by_group: Counter[str] = Counter()
    unexpected_mismatches: list[dict[str, Any]] = []

    for group in ("nextDay", "balmo", "futures"):
        for entry in registry.get(group, []):
            entries_by_group[group] += 1
            csv_match = _entry_matches_ice(entry, indexes)
            entry["csv_match"] = csv_match
            metadata_status = str(entry.get("metadata_status") or "missing_status")
            status_counts[(metadata_status, "csv_match" if csv_match else "no_csv_match")] += 1

            for identifier in (entry.get("symbol"), entry.get("product"), entry.get("cc")):
                if identifier:
                    entry_by_identifier[str(identifier)] = entry

            if metadata_status == "ice_product_url_verified" and not csv_match:
                unexpected_mismatches.append(entry)

    component_counts: dict[str, Counter[str]] = defaultdict(Counter)
    legacy_market_rows: list[dict[str, str]] = []

    for market in sorted(registry["markets"], key=lambda item: item["sortOrder"]):
        cash_entry = entry_by_identifier.get(market["cashSymbol"])
        balmo_entry = entry_by_identifier.get(market["balmoSymbol"]) if market.get("balmoSymbol") else None
        curve_entry = entry_by_identifier.get(market["futuresProduct"]) if market.get("futuresProduct") else None

        cash_status = _component_status(cash_entry)
        balmo_status = _component_status(balmo_entry)
        curve_status = _component_status(curve_entry)
        component_counts["cash"][cash_status] += 1
        component_counts["balmo"][balmo_status] += 1
        component_counts["curve"][curve_status] += 1

        if cash_status != "verified":
            legacy_market_rows.append(
                {
                    "region": market["region"],
                    "market": market["market"],
                    "cash_symbol": market["cashSymbol"],
                    "status": cash_status,
                }
            )

    print("ICE gas registry verification")
    print(f"Registry: {REGISTRY_PATH}")
    print(f"ICE product rows: {len(ice_rows):,}")
    print(f"Entries by group: {dict(entries_by_group)}")
    print(f"Registry status vs ICE CSV: {dict(status_counts)}")
    print(f"Market component status: { {key: dict(value) for key, value in component_counts.items()} }")
    pipeline_group_counts = {key: len(value) for key, value in pipeline_markets.items()}
    print(
        "Pipeline groups: "
        f"groups={len(pipeline_markets)} "
        f"markets={sum(pipeline_group_counts.values())} "
        f"details={pipeline_group_counts}"
    )

    if legacy_market_rows:
        print("\nLegacy cash symbols retained from settlement source:")
        print("region,market,cash_symbol,status")
        for row in legacy_market_rows:
            print(f"{row['region']},{row['market']},{row['cash_symbol']},{row['status']}")

    if unexpected_mismatches:
        print("\nUnexpected mismatches for entries marked ice_product_url_verified:", file=sys.stderr)
        for entry in unexpected_mismatches:
            print(
                f"- {entry.get('symbol') or entry.get('product')}: {entry.get('product_name')}",
                file=sys.stderr,
            )
        return 1

    return 0


if __name__ == "__main__":
    raise SystemExit(verify_ice_gas_registry())
