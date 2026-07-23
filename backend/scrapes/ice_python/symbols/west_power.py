"""Western power ICE settlement products.

Source definitions:
- https://www.ice.com/api/productguide/info/codes/all/csv
- https://www.ice.com/products/6590351
- https://www.ice.com/products/6590382
- https://www.ice.com/products/6590362
- https://www.ice.com/products/6590477

ICE product metadata reviewed on 2026-07-23:
- Mid-Columbia Day-Ahead Peak Fixed Price Future uses product root MDC.
- CAISO SP-15 Day-Ahead Peak Fixed Price Future uses product root SPM.
- CAISO NP-15 Day-Ahead Peak Fixed Price Future uses product root NPM.
- CAISO SP-15 Day-Ahead Peak Daily Fixed Price Future uses product root SDP.
- Rows in this module are monthly financial power futures and settle from
  ICE settlement marks in ``ice_python.settlements``.
- Daily financial power futures here are product-dictionary metadata for
  exact symbols emitted by promoted positions/trades models.
- Options on these products are intentionally out of scope for this registry.
"""
from __future__ import annotations

from datetime import date


ICE_PRODUCT_BASE_URL = "https://www.ice.com/products"
PRODUCT_METADATA_REVIEWED_DATE = "2026-07-23"

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


def _enrich_daily_symbol(entry: dict[str, object]) -> dict[str, object]:
    product = str(entry["product"])
    enriched = {
        **entry,
        "cc": product,
        "ice_product_url": _ice_product_url(str(entry["ice_product_id"])),
        "ice_contract_symbol": product,
        "contract_code": "D1",
        "contract_label": "Next Day",
        "ice_product_type": "Daily Fixed Price Future",
        "settlement_source": "CAISO_DA_LMP",
        "settlement_source_key": "caiso_sp15_da_onpeak",
        "settlement_priority": 1,
        "source_table": "caiso.da_lmps",
        "metadata_status": "ice_product_url_verified",
        "active": True,
    }
    enriched["notes"] = _metadata_note(enriched)
    return enriched


WEST_POWER_FUTURES_PRODUCTS: list[dict] = [
    {
        "product": "MDC",
        "ice_product_id": "6590351",
        "product_name": "Mid-Columbia Day-Ahead Peak Fixed Price Future",
        "description": "Mid-Columbia Day-Ahead Peak",
        "product_type": "power",
        "contract_type": "Monthly",
        "market": "DA",
        "hub": "Mid C",
        "blotter_hub_aliases": ["mid c", "mid-columbia", "mid columbia"],
        "ice_trading_screen_product_name": "Peak Futures (1 MW)",
        "ice_trading_screen_hub_name": "Mid C",
        "hour_bucket": "ONPEAK",
        "hours": "Peak hours per ICE contract terms",
        "shape": "Peak",
        "contract_size": "1 MW",
        "reference_price": "ELECTRICITY-MID-COLUMBIA-DAY AHEAD",
        "region": "western_power",
    },
    {
        "product": "SPM",
        "ice_product_id": "6590382",
        "product_name": "CAISO SP-15 Day-Ahead Peak Fixed Price Future",
        "description": "CAISO SP-15 Day-Ahead Peak",
        "product_type": "power",
        "contract_type": "Monthly",
        "market": "DA",
        "hub": "SP15 DA",
        "blotter_hub_aliases": ["sp15 da", "sp-15 da", "caiso sp-15 da"],
        "ice_trading_screen_product_name": "Peak Futures (1 MW)",
        "ice_trading_screen_hub_name": "SP15 DA",
        "hour_bucket": "ONPEAK",
        "hours": "Peak hours per ICE contract terms",
        "shape": "Peak",
        "contract_size": "1 MW",
        "reference_price": "ELECTRICITY-CAISO-SP15-DAY AHEAD",
        "region": "western_power",
    },
    {
        "product": "NPM",
        "ice_product_id": "6590362",
        "product_name": "CAISO NP-15 Day-Ahead Peak Fixed Price Future",
        "description": "CAISO NP-15 Day-Ahead Peak",
        "product_type": "power",
        "contract_type": "Monthly",
        "market": "DA",
        "hub": "NP15 DA",
        "blotter_hub_aliases": ["np15 da", "np-15 da", "caiso np-15 da"],
        "ice_trading_screen_product_name": "Peak Futures (1 MW)",
        "ice_trading_screen_hub_name": "NP15 DA",
        "hour_bucket": "ONPEAK",
        "hours": "Peak hours per ICE contract terms",
        "shape": "Peak",
        "contract_size": "1 MW",
        "reference_price": "ELECTRICITY-CAISO-NP15-DAY AHEAD",
        "region": "western_power",
    },
]
WEST_POWER_FUTURES_PRODUCTS = [
    _enrich_futures_product(entry) for entry in WEST_POWER_FUTURES_PRODUCTS
]

WEST_POWER_DAILY_SYMBOLS: list[dict] = [
    {
        "symbol": "SDP D1-IUS",
        "product": "SDP",
        "ice_product_id": "6590477",
        "product_name": "CAISO SP-15 Day-Ahead Peak Daily Fixed Price Future",
        "description": "CAISO SP-15 DA Peak Daily Next Day",
        "product_type": "power",
        "contract_type": "Daily",
        "market": "DA",
        "hub": "SP15 DA",
        "blotter_hub_aliases": ["sp15 da", "sp-15 da", "caiso sp-15 da"],
        "ice_trading_screen_product_name": "Peak Futures",
        "ice_trading_screen_hub_name": "SP15 DA",
        "hour_bucket": "ONPEAK",
        "hours": "Peak hours per ICE contract terms",
        "shape": "Peak",
        "contract_size": "800 MWh",
        "reference_price": "ELECTRICITY-CAISO-SP15-DAY AHEAD",
        "region": "western_power",
    },
]
WEST_POWER_DAILY_SYMBOLS = [
    _enrich_daily_symbol(entry) for entry in WEST_POWER_DAILY_SYMBOLS
]


def get_west_power_futures_products() -> list[dict]:
    """Return all active western power monthly futures product entries."""
    return list(WEST_POWER_FUTURES_PRODUCTS)


def get_west_power_futures_product_codes(
    product_entries: list[dict] | None = None,
) -> list[str]:
    """Return western power futures product prefix strings."""
    entries = product_entries or WEST_POWER_FUTURES_PRODUCTS
    return [entry["product"] for entry in entries]


def get_west_power_futures_product_map() -> dict[str, dict]:
    """Return western power futures products keyed by ICE product prefix."""
    return {entry["product"]: entry for entry in WEST_POWER_FUTURES_PRODUCTS}


def get_west_power_daily_symbols() -> list[dict]:
    """Return active western power daily symbol entries."""
    return list(WEST_POWER_DAILY_SYMBOLS)


def get_west_power_daily_symbol_codes(
    symbol_entries: list[dict] | None = None,
) -> list[str]:
    """Return western power daily exact ICE symbol strings."""
    entries = symbol_entries or WEST_POWER_DAILY_SYMBOLS
    return [entry["symbol"] for entry in entries]


def get_west_power_daily_symbol_map() -> dict[str, dict]:
    """Return western power daily symbols keyed by exact ICE symbol."""
    return {entry["symbol"]: entry for entry in WEST_POWER_DAILY_SYMBOLS}


def resolve_west_power_daily_symbol_entries(
    symbols: list[str] | None = None,
) -> list[dict]:
    """Return validated western power daily symbol registry entries."""
    if symbols is None:
        return list(WEST_POWER_DAILY_SYMBOLS)

    normalized_symbols = [
        symbol.strip()
        for symbol in symbols
        if symbol and symbol.strip()
    ]
    if not normalized_symbols:
        raise ValueError("No valid western power daily symbol codes were provided.")

    symbol_map = get_west_power_daily_symbol_map()
    unknown_symbols = sorted(set(normalized_symbols) - set(symbol_map))
    if unknown_symbols:
        raise ValueError(
            "Unknown western power daily ICE symbols: "
            f"{unknown_symbols}. Valid symbols must come from "
            "backend.scrapes.ice_python.symbols.west_power."
        )

    unique_symbols = list(dict.fromkeys(normalized_symbols))
    return [symbol_map[symbol] for symbol in unique_symbols]


def get_daily_entries(symbols: list[str] | None = None) -> list[dict]:
    """Return validated western power daily symbol registry entries."""
    return resolve_west_power_daily_symbol_entries(symbols=symbols)


def get_daily_symbols(symbols: list[str] | None = None) -> list[str]:
    """Return validated western power daily exact ICE symbol strings."""
    return get_west_power_daily_symbol_codes(get_daily_entries(symbols=symbols))


def get_futures_products() -> list[str]:
    """Return western power futures product prefixes."""
    return get_west_power_futures_product_codes()


def resolve_futures_products(products: list[str] | None = None) -> list[str]:
    """Return validated western power futures product prefixes."""
    configured = set(get_futures_products())
    if products is None:
        return get_futures_products()
    normalized = [product.strip().upper() for product in products if product.strip()]
    unknown = sorted(set(normalized) - configured)
    if unknown:
        raise ValueError(f"Unknown western power futures products: {unknown}.")
    return list(dict.fromkeys(normalized))


def resolve_strips(strips: list[str]) -> list[str]:
    """Return validated ICE strip letters for western power futures."""
    normalized = [strip.strip().upper() for strip in strips if strip.strip()]
    unknown = sorted(set(normalized) - VALID_STRIPS)
    if unknown:
        raise ValueError(f"Unknown western power futures strips: {unknown}.")
    return list(dict.fromkeys(normalized))


def build_futures_symbol(
    product: str,
    strip: str,
    contract_year: int,
    suffix: str = "-IUS",
) -> str:
    """Build a monthly western power futures ICE symbol."""
    return f"{product} {strip}{str(contract_year)[-2:]}{suffix}"


def get_futures_symbols(
    contract_year: int,
    strips: list[str],
    products: list[str] | None = None,
) -> list[str]:
    """Return western power futures symbols for products, strips, and year."""
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
    """Return western power futures symbols from start month through a horizon."""
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
    """Return frontend-ready western power ICE product dictionary entries."""
    daily_entries = [
        {
            **entry,
            "source_registry": "west_power_daily",
            "ice_symbol_pattern": entry["symbol"],
        }
        for entry in WEST_POWER_DAILY_SYMBOLS
    ]
    futures_entries = [
        {
            **entry,
            "source_registry": "west_power_futures",
            "ice_symbol_pattern": f"{entry['product']} {{MONTH_CODE}}{{YY}}-IUS",
        }
        for entry in WEST_POWER_FUTURES_PRODUCTS
    ]
    return daily_entries + futures_entries
