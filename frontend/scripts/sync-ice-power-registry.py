"""Sync backend ICE power registry metadata into frontend artifacts."""
from __future__ import annotations

import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


REPO_ROOT = Path(__file__).resolve().parents[2]
OUTPUT_PATH = REPO_ROOT / "frontend" / "lib" / "powerPricing" / "ice_power_registry.json"

if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from backend.scrapes.ice_python.symbols import east_power, ercot, pjm, west_power  # noqa: E402


SOURCE_MODULES = [
    "backend.scrapes.ice_python.symbols.pjm",
    "backend.scrapes.ice_python.symbols.ercot",
    "backend.scrapes.ice_python.symbols.east_power",
    "backend.scrapes.ice_python.symbols.west_power",
]

TERM_MARKET_ORDER = ["pjm", "ercot", "isone", "caiso", "midc"]
TERM_MARKET_LABELS = {
    "pjm": "PJM",
    "ercot": "ERCOT",
    "isone": "ISO-NE",
    "caiso": "CAISO",
    "midc": "Mid-C",
}
TERM_PRODUCT_ORDER = ["PMI", "OPJ", "ERN", "ECI", "NEP", "SPM", "NPM", "MDC"]
TERM_MARKET_BY_PRODUCT = {
    "PMI": "pjm",
    "OPJ": "pjm",
    "ERN": "ercot",
    "ECI": "ercot",
    "NEP": "isone",
    "SPM": "caiso",
    "NPM": "caiso",
    "MDC": "midc",
}


def serializable_value(value: Any) -> Any:
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    if isinstance(value, list):
        return [serializable_value(item) for item in value]
    if isinstance(value, tuple):
        return [serializable_value(item) for item in value]
    if isinstance(value, dict):
        return {
            str(key): serializable_value(nested_value)
            for key, nested_value in value.items()
            if isinstance(key, (str, int, float, bool))
        }
    return str(value)


def serializable_row(row: dict[str, Any], *, source_registry: str) -> dict[str, Any]:
    return {
        **{
            str(key): serializable_value(value)
            for key, value in row.items()
            if isinstance(key, (str, int, float, bool))
        },
        "source_registry": source_registry,
    }


def readable_subtitle(entry: dict[str, Any]) -> str:
    description = str(entry.get("description") or entry.get("product_name") or "").strip()
    description = re.sub(r"\s*\(1\s*MW\)\s*", " ", description, flags=re.IGNORECASE)
    description = re.sub(r"\bOffPeak\b", "Off-Peak", description)
    description = re.sub(r"\s+", " ", description).strip()
    if not description:
        description = str(entry["product"])
    return f"{description} monthly settles."


def build_term_products(futures_rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    futures_by_product = {
        str(row["product"]): row
        for row in futures_rows
        if row.get("product") in TERM_MARKET_BY_PRODUCT
    }
    missing_products = sorted(set(TERM_PRODUCT_ORDER) - set(futures_by_product))
    if missing_products:
        raise ValueError(f"Missing ICE power term futures products: {missing_products}")

    return [
        {
            "sortOrder": index,
            "root": product,
            "market": TERM_MARKET_BY_PRODUCT[product],
            "title": f"{product} Monthly Matrix",
            "subtitle": readable_subtitle(futures_by_product[product]),
            "productName": futures_by_product[product].get("product_name"),
            "description": futures_by_product[product].get("description"),
            "hub": futures_by_product[product].get("hub"),
            "shape": futures_by_product[product].get("shape"),
            "marketType": futures_by_product[product].get("market"),
            "hourBucket": futures_by_product[product].get("hour_bucket"),
            "iceProductUrl": futures_by_product[product].get("ice_product_url"),
            "sourceRegistry": futures_by_product[product].get("source_registry"),
        }
        for index, product in enumerate(TERM_PRODUCT_ORDER, start=1)
    ]


def build_term_markets(term_products: list[dict[str, Any]]) -> list[dict[str, Any]]:
    product_count_by_market = {
        market: sum(1 for product in term_products if product["market"] == market)
        for market in TERM_MARKET_ORDER
    }
    return [
        {
            "sortOrder": index,
            "id": market,
            "label": TERM_MARKET_LABELS[market],
            "productCount": product_count_by_market[market],
        }
        for index, market in enumerate(TERM_MARKET_ORDER, start=1)
        if product_count_by_market[market] > 0
    ]


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
    short_term = {
        "pjm": [
            serializable_row(row, source_registry="pjm_short_term")
            for row in pjm.get_short_term_entries()
        ],
        "ercot": [
            serializable_row(row, source_registry="ercot_short_term")
            for row in ercot.get_ercot_symbols()
        ],
    }
    daily = {
        "eastPower": [
            serializable_row(row, source_registry="east_power_daily")
            for row in east_power.get_daily_entries()
        ],
        "westPower": [
            serializable_row(row, source_registry="west_power_daily")
            for row in west_power.get_daily_entries()
        ],
    }
    futures = {
        "pjm": [
            serializable_row(row, source_registry="pjm_futures")
            for row in pjm.get_futures_product_entries()
        ],
        "ercot": [
            serializable_row(row, source_registry="ercot_futures")
            for row in ercot.get_ercot_power_futures_products()
        ],
        "eastPower": [
            serializable_row(row, source_registry="east_power_futures")
            for row in east_power.get_east_power_futures_products()
        ],
        "westPower": [
            serializable_row(row, source_registry="west_power_futures")
            for row in west_power.get_west_power_futures_products()
        ],
    }
    futures_rows = [
        *futures["pjm"],
        *futures["ercot"],
        *futures["eastPower"],
        *futures["westPower"],
    ]
    product_dictionary = [
        *[
            serializable_row(row, source_registry="pjm_product_dictionary")
            for row in pjm.get_product_dictionary_entries()
        ],
        *[
            serializable_row(row, source_registry="ercot_product_dictionary")
            for row in ercot.get_product_dictionary_entries()
        ],
        *[
            serializable_row(row, source_registry="east_power_product_dictionary")
            for row in east_power.get_product_dictionary_entries()
        ],
        *[
            serializable_row(row, source_registry="west_power_product_dictionary")
            for row in west_power.get_product_dictionary_entries()
        ],
    ]
    term_products = build_term_products(futures_rows)
    term_markets = build_term_markets(term_products)
    payload = {
        "metadata": {
            "source": SOURCE_MODULES,
            "generatedAt": existing_generated_at(OUTPUT_PATH)
            if check
            else datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
            "shortTermCount": sum(len(rows) for rows in short_term.values()),
            "dailyCount": sum(len(rows) for rows in daily.values()),
            "futuresProductCount": len(futures_rows),
            "productDictionaryCount": len(product_dictionary),
            "termMarketCount": len(term_markets),
            "termProductCount": len(term_products),
        },
        "shortTerm": short_term,
        "daily": daily,
        "futures": futures,
        "productDictionary": product_dictionary,
        "termMarkets": term_markets,
        "termProducts": term_products,
    }
    ok = write_or_check(
        OUTPUT_PATH,
        json.dumps(payload, indent=2, sort_keys=True) + "\n",
        check=check,
    )
    print(
        "Counts: "
        f"short_term={payload['metadata']['shortTermCount']} "
        f"daily={payload['metadata']['dailyCount']} "
        f"futures={payload['metadata']['futuresProductCount']} "
        f"term_products={payload['metadata']['termProductCount']}"
    )
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main(check="--check" in sys.argv[1:]))
