"""Eastern power ICE settlement products.

Source definitions:
- https://www.ice.com/api/productguide/info/codes/all/csv
- https://www.ice.com/products/6590357

ICE product metadata reviewed on 2026-06-01:
- ISO New England Massachusetts Hub Day-Ahead Peak Fixed Price Future uses
  product root NEP.
- Rows in this module are monthly financial power futures and settle from
  ICE settlement marks in ``ice_python.settlements``.
- Options on these products are intentionally out of scope for this registry.
"""
from __future__ import annotations

from datetime import date


ICE_PRODUCT_BASE_URL = "https://www.ice.com/products"
PRODUCT_METADATA_REVIEWED_DATE = "2026-06-01"

STRIP_MAPPING: dict[int, str] = {
    1: "F",
    2: "G",
    3: "H",
    4: "J",
    5: "K",
    6: "M",
    7: "N",
    8: "Q",
    9: "U",
    10: "V",
    11: "X",
    12: "Z",
}
VALID_STRIPS = set(STRIP_MAPPING.values())


def _ice_product_url(product_id: str) -> str:
    return f"{ICE_PRODUCT_BASE_URL}/{product_id}"


def _metadata_note(entry: dict[str, object]) -> str:
    return (
        "ICE metadata reviewed "
        f"{PRODUCT_METADATA_REVIEWED_DATE}; source table "
        f"{entry['source_table']}; market type Financial Power."
    )


def _enrich_futures_product(entry: dict[str, object]) -> dict[str, object]:
    product = str(entry["product"])
    enriched = {
        **entry,
        "cc": product,
        "ice_product_url": _ice_product_url(str(entry["ice_product_id"])),
        "ice_contract_symbol": product,
        "contract_code": "MONTH",
        "contract_label": "Monthly",
        "ice_product_type": "Monthly Fixed Price Future",
        "settlement_source": "ICE_SETTLEMENT",
        "settlement_source_key": "ice_settlement",
        "settlement_priority": 2,
        "source_table": "ice_python.settlements",
        "metadata_status": "ice_product_url_verified",
        "active": True,
    }
    enriched["notes"] = _metadata_note(enriched)
    return enriched


EAST_POWER_FUTURES_PRODUCTS: list[dict] = [
    {
        "product": "NEP",
        "ice_product_id": "6590357",
        "product_name": (
            "ISO New England Massachusetts Hub Day-Ahead Peak Fixed Price Future"
        ),
        "description": "ISO New England Massachusetts Hub Day-Ahead Peak",
        "product_type": "power",
        "contract_type": "Monthly",
        "market": "DA",
        "hub": "Nepool MH DA",
        "blotter_hub_aliases": [
            "nepool mh da",
            "iso new england massachusetts hub da",
            "massachusetts hub da",
        ],
        "ice_trading_screen_product_name": "Peak Futures (1 MW)",
        "ice_trading_screen_hub_name": "Nepool MH DA",
        "hour_bucket": "ONPEAK",
        "hours": "Peak hours per ICE contract terms",
        "shape": "Peak",
        "contract_size": "1 MW",
        "reference_price": "ELECTRICITY-ISO-NE-MASS HUB-DAY AHEAD",
        "region": "east_power",
    },
]
EAST_POWER_FUTURES_PRODUCTS = [
    _enrich_futures_product(entry) for entry in EAST_POWER_FUTURES_PRODUCTS
]


def get_east_power_futures_products() -> list[dict]:
    """Return all active eastern power monthly futures product entries."""
    return list(EAST_POWER_FUTURES_PRODUCTS)


def get_east_power_futures_product_codes(
    product_entries: list[dict] | None = None,
) -> list[str]:
    """Return eastern power futures product prefix strings."""
    entries = product_entries or EAST_POWER_FUTURES_PRODUCTS
    return [entry["product"] for entry in entries]


def get_east_power_futures_product_map() -> dict[str, dict]:
    """Return eastern power futures products keyed by ICE product prefix."""
    return {entry["product"]: entry for entry in EAST_POWER_FUTURES_PRODUCTS}


def get_futures_products() -> list[str]:
    """Return eastern power futures product prefixes."""
    return get_east_power_futures_product_codes()


def resolve_futures_products(products: list[str] | None = None) -> list[str]:
    """Return validated eastern power futures product prefixes."""
    configured = set(get_futures_products())
    if products is None:
        return get_futures_products()
    normalized = [product.strip().upper() for product in products if product.strip()]
    unknown = sorted(set(normalized) - configured)
    if unknown:
        raise ValueError(f"Unknown eastern power futures products: {unknown}.")
    return list(dict.fromkeys(normalized))


def resolve_strips(strips: list[str]) -> list[str]:
    """Return validated ICE strip letters for eastern power futures."""
    normalized = [strip.strip().upper() for strip in strips if strip.strip()]
    unknown = sorted(set(normalized) - VALID_STRIPS)
    if unknown:
        raise ValueError(f"Unknown eastern power futures strips: {unknown}.")
    return list(dict.fromkeys(normalized))


def build_futures_symbol(
    product: str,
    strip: str,
    contract_year: int,
    suffix: str = "-IUS",
) -> str:
    """Build a monthly eastern power futures ICE symbol."""
    return f"{product} {strip}{str(contract_year)[-2:]}{suffix}"


def get_futures_symbols(
    contract_year: int,
    strips: list[str],
    products: list[str] | None = None,
) -> list[str]:
    """Return eastern power futures symbols for products, strips, and year."""
    selected_products = resolve_futures_products(products=products)
    selected_strips = resolve_strips(strips=strips)
    return [
        build_futures_symbol(product=product, strip=strip, contract_year=contract_year)
        for product in selected_products
        for strip in selected_strips
    ]


def get_futures_symbols_for_horizon(
    products: list[str] | None = None,
    start_date: date | None = None,
    months_forward: int = 36,
) -> list[str]:
    """Return eastern power futures symbols from start month through a horizon."""
    if months_forward < 0:
        raise ValueError("months_forward must be greater than or equal to 0.")
    selected_products = resolve_futures_products(products=products)
    start = start_date or date.today()
    symbols: list[str] = []
    for month_offset in range(months_forward + 1):
        month_index = start.month - 1 + month_offset
        contract_year = start.year + month_index // 12
        contract_month = month_index % 12 + 1
        strip = STRIP_MAPPING[contract_month]
        for product in selected_products:
            symbols.append(
                build_futures_symbol(
                    product=product,
                    strip=strip,
                    contract_year=contract_year,
                )
            )
    return symbols


def get_product_dictionary_entries() -> list[dict]:
    """Return frontend-ready eastern power ICE product dictionary entries."""
    return [
        {
            **entry,
            "source_registry": "east_power_futures",
            "ice_symbol_pattern": f"{entry['product']} {{MONTH_CODE}}{{YY}}-IUS",
        }
        for entry in EAST_POWER_FUTURES_PRODUCTS
    ]
