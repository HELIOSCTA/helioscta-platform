"""Sync backend ICE gas registry metadata into a frontend JSON artifact."""
from __future__ import annotations

import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


REPO_ROOT = Path(__file__).resolve().parents[2]
OUTPUT_PATH = REPO_ROOT / "frontend" / "lib" / "gasPricing" / "ice_gas_registry.json"

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


def build_markets(
    next_day_rows: list[dict[str, Any]],
    balmo_rows: list[dict[str, Any]],
    futures_rows: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    balmo_by_hub = by_normalized_hub(balmo_rows, MANUAL_BALMO_HUB_ALIASES)
    futures_by_hub = by_normalized_hub(futures_rows, MANUAL_FUTURES_HUB_ALIASES)
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
            }
        )

    return markets


def main() -> int:
    next_day_rows = [serializable_row(row) for row in gas.get_next_day_gas_symbols()]
    balmo_rows = [serializable_row(row) for row in gas.get_balmo_gas_symbols()]
    futures_rows = [serializable_row(row) for row in gas.get_gas_futures_products()]
    payload = {
        "metadata": {
            "source": "backend.scrapes.ice_python.symbols.gas",
            "generatedAt": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
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
    OUTPUT_PATH.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(f"Wrote {OUTPUT_PATH.relative_to(REPO_ROOT)}")
    print(
        "Counts: "
        f"next_day={payload['metadata']['nextDayCount']} "
        f"balmo={payload['metadata']['balmoCount']} "
        f"futures={payload['metadata']['futuresProductCount']} "
        f"markets={payload['metadata']['marketCount']}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
