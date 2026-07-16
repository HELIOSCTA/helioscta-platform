"""Verify backend gas symbols against the public ICE product catalog."""
from __future__ import annotations

import csv
import json
import re
import urllib.request
from collections import Counter
from pathlib import Path
from typing import Any

from backend.scrapes.ice_python.symbols import gas


ICE_PRODUCT_CODES_URL = "https://www.ice.com/api/productguide/info/codes/all/csv"
DEFAULT_OUTPUT_DIR = Path(__file__).resolve().parents[1] / "reports"
CATALOG_COLUMNS = (
    "market",
    "region",
    "source_registry",
    "instrument_role",
    "symbol",
    "product",
    "ice_product_id",
    "ice_product_url",
    "product_name",
    "ice_catalog_status",
    "metadata_status",
    "review_status",
)


def download_ice_product_codes(url: str = ICE_PRODUCT_CODES_URL) -> list[dict[str, str]]:
    request = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 HeliosCTA ICE gas catalog verifier",
            "Accept": "text/csv,*/*",
        },
    )
    with urllib.request.urlopen(request, timeout=60) as response:
        text = response.read().decode("utf-8-sig")
    return list(csv.DictReader(text.splitlines()))


def _ice_indexes(rows: list[dict[str, str]]) -> dict[str, set[str]]:
    product_ids: set[str] = set()
    product_codes: set[str] = set()
    for row in rows:
        product_html = row.get("PRODUCT (Click to open in Browser)", "") or ""
        match = re.search(r"/products/(\d+)", product_html)
        if match:
            product_ids.add(match.group(1))
        for column in ("PHYSICAL", "LOGICAL", "SYMBOL CODE"):
            value = (row.get(column) or "").strip()
            if value:
                product_codes.add(value)
    return {"product_ids": product_ids, "product_codes": product_codes}


def _catalog_match(entry: dict[str, Any], indexes: dict[str, set[str]]) -> bool:
    product_id = str(entry.get("ice_product_id") or "").strip()
    code = str(entry.get("cc") or entry.get("product") or entry.get("symbol") or "").split()[0]
    return (
        bool(product_id and product_id in indexes["product_ids"])
        or code in indexes["product_codes"]
    )


def build_gas_catalog_review(
    ice_rows: list[dict[str, str]] | None = None,
) -> list[dict[str, str]]:
    rows = ice_rows or download_ice_product_codes()
    indexes = _ice_indexes(rows)
    review_rows: list[dict[str, str]] = []

    for entry in gas.get_product_dictionary_entries():
        matches_catalog = _catalog_match(entry, indexes)
        review_status = str(entry.get("review_status") or "")
        if not review_status:
            review_status = "verified" if matches_catalog else "legacy_unverified"
        review_rows.append(
            {
                "market": str(entry.get("hub") or entry.get("description") or ""),
                "region": str(entry.get("region") or ""),
                "source_registry": str(entry.get("source_registry") or ""),
                "instrument_role": str(entry.get("instrument_role") or ""),
                "symbol": str(entry.get("symbol") or ""),
                "product": str(entry.get("product") or ""),
                "ice_product_id": str(entry.get("ice_product_id") or ""),
                "ice_product_url": str(entry.get("ice_product_url") or ""),
                "product_name": str(entry.get("product_name") or ""),
                "ice_catalog_status": "verified" if matches_catalog else "not_found",
                "metadata_status": str(entry.get("metadata_status") or ""),
                "review_status": review_status,
            }
        )

    return review_rows


def write_review_artifacts(
    rows: list[dict[str, str]],
    output_dir: Path = DEFAULT_OUTPUT_DIR,
) -> dict[str, str]:
    output_dir.mkdir(parents=True, exist_ok=True)
    csv_path = output_dir / "gas_catalog_review.csv"
    json_path = output_dir / "gas_catalog_review.json"

    with csv_path.open("w", newline="", encoding="utf-8") as file:
        writer = csv.DictWriter(file, fieldnames=CATALOG_COLUMNS)
        writer.writeheader()
        writer.writerows(rows)
    json_path.write_text(json.dumps(rows, indent=2), encoding="utf-8")
    return {"csv": str(csv_path), "json": str(json_path)}


def summarize_review(rows: list[dict[str, str]]) -> dict[str, object]:
    return {
        "row_count": len(rows),
        "catalog_status": dict(Counter(row["ice_catalog_status"] for row in rows)),
        "metadata_status": dict(Counter(row["metadata_status"] for row in rows)),
        "instrument_role": dict(Counter(row["instrument_role"] for row in rows)),
        "needs_review": [
            row
            for row in rows
            if row["ice_catalog_status"] != "verified"
            or row["review_status"].startswith("candidate")
        ],
    }


def main(
    output_dir: Path | None = DEFAULT_OUTPUT_DIR,
    write_artifacts: bool = True,
) -> int:
    rows = build_gas_catalog_review()
    artifacts = write_review_artifacts(rows, output_dir=output_dir) if write_artifacts and output_dir else {}
    summary = summarize_review(rows)
    print(json.dumps({"summary": summary, "artifacts": artifacts}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
