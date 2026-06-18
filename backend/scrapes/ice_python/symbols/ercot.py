"""ERCOT ICE settlement symbols and products.

Source definitions:
- https://www.ice.com/api/productguide/info/codes/all/csv
- https://www.ice.com/products/71544051
- https://www.ice.com/products/6590453
- https://www.ice.com/products/6590496
- https://www.ice.com/products/6590466
- https://www.ice.com/products/6590337
- https://www.ice.com/products/73051364

ICE product metadata reviewed on 2026-06-01:
- ERCOT North RT/DA peak products use HE 0700-HE 2200 CPT.
- ERCOT North RT off-peak products use HE 0100-HE 0600 and
  HE 2300-HE 2400 CPT.
- ERCOT rows in this module are registry metadata only; no ERCOT
  settlement orchestration is enabled here.
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

CONTRACT_LABEL_BY_CODE = {
    "D1": "Next Day",
    "W0": "Bal Week",
    "W1": "Next Week",
    "W2": "2nd Week",
}


def _ice_product_url(product_id: str | None) -> str | None:
    if not product_id:
        return None
    return f"{ICE_PRODUCT_BASE_URL}/{product_id}"


ERCOT_PRODUCT_METADATA_BY_CC: dict[str, dict[str, object]] = {
    "ERA": {
        "ice_product_id": "71544051",
        "product_name": (
            "ERCOT North 345KV Hub Real-Time Peak Daily Mini Fixed Price Future"
        ),
        "ice_trading_screen_product_name": "Peak Futures",
        "ice_trading_screen_hub_name": (
            "ERCOT - North 345KV Hub Real-Time Daily (16 MWh)"
        ),
        "ice_contract_symbol": "ERA",
        "hub": "ERCOT North 345KV Hub RT",
        "hour_bucket": "ONPEAK",
        "hours": "HE 0700-HE 2200 CPT",
        "market": "RT",
        "shape": "Peak",
        "contract_size": "16 MWh",
        "reference_price": "ELECTRICITY-ERCOT-NORTH 345KV HUB-REAL TIME",
    },
    "END": {
        "ice_product_id": "6590453",
        "product_name": "ERCOT North 345KV Real-Time Peak Daily Fixed Price Future",
        "ice_trading_screen_product_name": "Peak Futures",
        "ice_trading_screen_hub_name": "ERCOT - North 345KV Hub Real-Time Daily",
        "ice_contract_symbol": "END",
        "hub": "ERCOT North 345KV Hub RT",
        "hour_bucket": "ONPEAK",
        "hours": "HE 0700-HE 2200 CPT",
        "market": "RT",
        "shape": "Peak",
        "contract_size": "800 MWh",
        "reference_price": "ELECTRICITY-ERCOT-NORTH 345KV HUB-REAL TIME",
    },
    "NED": {
        "ice_product_id": "6590496",
        "product_name": (
            "ERCOT North 345KV Real-Time Off-Peak Daily Fixed Price Future"
        ),
        "ice_trading_screen_product_name": "Off-Peak Futures",
        "ice_trading_screen_hub_name": (
            "ERCOT - North 345KV Hub Real-Time Off-Peak Daily"
        ),
        "ice_contract_symbol": "NED",
        "hub": "ERCOT North 345KV Hub RT Off-Peak",
        "hour_bucket": "OFFPEAK",
        "hours": "HE 0100-HE 0600, HE 2300-HE 2400 CPT",
        "market": "RT",
        "shape": "Off-Peak",
        "contract_size": "50 MWh",
        "reference_price": "ELECTRICITY-ERCOT-NORTH 345KV HUB-REAL TIME",
    },
    "NDA": {
        "ice_product_id": "6590466",
        "product_name": (
            "ERCOT North 345KV Hub Day-Ahead Peak Daily Fixed Price Future"
        ),
        "ice_trading_screen_product_name": "Peak Futures",
        "ice_trading_screen_hub_name": "ERCOT - North 345KV Hub Day-Ahead Daily",
        "ice_contract_symbol": "NDA",
        "hub": "ERCOT North 345KV Hub DA",
        "hour_bucket": "ONPEAK",
        "hours": "HE 0700-HE 2200 CPT",
        "market": "DA",
        "shape": "Peak",
        "contract_size": "16 MWh",
        "reference_price": "ELECTRICITY-ERCOT-NORTH 345KV HUB-DAY AHEAD",
    },
}

ERCOT_FUTURES_PRODUCT_METADATA_BY_PRODUCT: dict[str, dict[str, object]] = {
    "ERN": {
        "ice_product_id": "6590337",
        "product_name": "ERCOT North 345KV Real-Time Peak Fixed Price Future",
        "ice_trading_screen_product_name": "Peak Futures (1 MW)",
        "ice_trading_screen_hub_name": "ERCOT - North 345KV Hub Real-Time",
        "ice_contract_symbol": "ERN",
        "hub": "ERCOT North 345KV Hub RT",
        "hour_bucket": "ONPEAK",
        "hours": "HE 0700-HE 2200 CPT",
        "market": "RT",
        "shape": "Peak",
        "contract_size": "1 MW",
        "reference_price": "ELECTRICITY-ERCOT-NORTH 345KV HUB-REAL TIME",
    },
    "ECI": {
        "ice_product_id": "73051364",
        "product_name": "ERCOT North 345KV Real-Time 7x8 Fixed Price Future",
        "ice_trading_screen_product_name": "Off-Peak Futures (1 MW)",
        "ice_trading_screen_hub_name": "ERCOT North 345KV Hub RT Off-Peak 7x8",
        "ice_contract_symbol": "ECI",
        "hub": "ERCOT North 345KV Hub RT Off-Peak 7x8",
        "hour_bucket": "OFFPEAK",
        "hours": "HE 0100-HE 0600, HE 2300-HE 2400 CPT",
        "market": "RT",
        "shape": "Off-Peak 7x8",
        "contract_size": "1 MW",
        "reference_price": "ELECTRICITY-ERCOT-NORTH 345KV HUB-REAL TIME",
    },
}


def _symbol_contract_code(symbol: str) -> str:
    return symbol.split()[1].split("-")[0]


def _metadata_note(entry: dict[str, object]) -> str:
    return (
        "ICE metadata reviewed "
        f"{PRODUCT_METADATA_REVIEWED_DATE}; source table "
        f"{entry['source_table']}; hours {entry['hours']}."
    )


def _common_ice_metadata(entry: dict[str, object]) -> dict[str, object]:
    enriched = {
        **entry,
        "ice_product_url": _ice_product_url(str(entry["ice_product_id"])),
        "ice_product_type": str(entry["product_name"]).removeprefix(
            f"{entry['hub']} "
        ),
        "settlement_source": entry.get("settlement_source", "ICE_SETTLEMENT"),
        "settlement_source_key": entry.get("settlement_source_key", "ice_settlement"),
        "settlement_priority": entry.get("settlement_priority", 2),
        "source_table": entry.get("source_table", "ice_python.settlements"),
        "metadata_status": "ice_product_url_verified",
        "active": True,
    }
    enriched["notes"] = _metadata_note(enriched)
    return enriched


def _ercot_lmp_source(metadata: dict[str, object]) -> tuple[str, str]:
    market = str(metadata["market"]).upper()
    hour_bucket = str(metadata["hour_bucket"]).upper()
    if market == "DA":
        return "ERCOT_DA_LMP", "ercot_da_north_onpeak"
    if hour_bucket == "OFFPEAK":
        return "ERCOT_RT_LMP", "ercot_rt_north_offpeak"
    return "ERCOT_RT_LMP", "ercot_rt_north_onpeak"


def _enrich_short_term_symbol(entry: dict[str, object]) -> dict[str, object]:
    symbol = str(entry["symbol"])
    cc = symbol.split()[0]
    contract_code = _symbol_contract_code(symbol)
    metadata = ERCOT_PRODUCT_METADATA_BY_CC[cc]
    settlement_source, settlement_source_key = _ercot_lmp_source(metadata)
    enriched = {
        **entry,
        **metadata,
        "cc": cc,
        "contract_code": contract_code,
        "contract_label": CONTRACT_LABEL_BY_CODE.get(contract_code, contract_code),
        "settlement_source": settlement_source,
        "settlement_source_key": settlement_source_key,
        "settlement_priority": 1,
        "source_table": (
            "ercot.dam_stlmnt_pnt_prices"
            if settlement_source == "ERCOT_DA_LMP"
            else "ercot.rt_spp_all_nodes"
        ),
    }
    return _common_ice_metadata(enriched)


def _enrich_futures_product(entry: dict[str, object]) -> dict[str, object]:
    product = str(entry["product"])
    metadata = ERCOT_FUTURES_PRODUCT_METADATA_BY_PRODUCT[product]
    enriched = {
        **entry,
        **metadata,
        "cc": product,
        "contract_code": "MONTH",
        "contract_label": "Monthly",
    }
    return _common_ice_metadata(enriched)


ERCOT_SYMBOLS: list[dict] = [
    {
        "symbol": "ERA D1-IUS",
        "description": "ERCOT North RT Peak (16 MWh) Next Day",
        "product_type": "power",
        "contract_type": "Daily",
    },
    {
        "symbol": "ERA W0-IUS",
        "description": "ERCOT North RT Peak (16 MWh) Bal Week",
        "product_type": "power",
        "contract_type": "Weekly",
    },
    {
        "symbol": "ERA W1-IUS",
        "description": "ERCOT North RT Peak (16 MWh) Next Week",
        "product_type": "power",
        "contract_type": "Weekly",
    },
    {
        "symbol": "END D1-IUS",
        "description": "ERCOT North RT Peak Next Day",
        "product_type": "power",
        "contract_type": "Daily",
    },
    {
        "symbol": "END W0-IUS",
        "description": "ERCOT North RT Peak Bal Week",
        "product_type": "power",
        "contract_type": "Weekly",
    },
    {
        "symbol": "END W1-IUS",
        "description": "ERCOT North RT Peak Next Week",
        "product_type": "power",
        "contract_type": "Weekly",
    },
    {
        "symbol": "NED D1-IUS",
        "description": "ERCOT North RT Off-Peak Next Day",
        "product_type": "power",
        "contract_type": "Daily",
    },
    {
        "symbol": "NED W0-IUS",
        "description": "ERCOT North RT Off-Peak Bal Week",
        "product_type": "power",
        "contract_type": "Weekly",
    },
    {
        "symbol": "NED W1-IUS",
        "description": "ERCOT North RT Off-Peak Next Week",
        "product_type": "power",
        "contract_type": "Weekly",
    },
    {
        "symbol": "NED W2-IUS",
        "description": "ERCOT North RT Off-Peak 2nd Week",
        "product_type": "power",
        "contract_type": "Weekly",
    },
    {
        "symbol": "NDA D1-IUS",
        "description": "ERCOT North DA Peak Next Day",
        "product_type": "power",
        "contract_type": "Daily",
    },
    {
        "symbol": "NDA W0-IUS",
        "description": "ERCOT North DA Peak Bal Week",
        "product_type": "power",
        "contract_type": "Weekly",
    },
]
ERCOT_SYMBOLS = [_enrich_short_term_symbol(entry) for entry in ERCOT_SYMBOLS]

ERCOT_POWER_FUTURES_PRODUCTS: list[dict] = [
    {
        "product": "ERN",
        "description": "ERCOT North 345 kV Hub RT Peak",
        "product_type": "power",
        "contract_type": "Monthly",
        "region": "ercot",
    },
    {
        "product": "ECI",
        "description": "ERCOT North 345 kV Hub RT Off-Peak 7x8",
        "product_type": "power",
        "contract_type": "Monthly",
        "region": "ercot",
    },
]
ERCOT_POWER_FUTURES_PRODUCTS = [
    _enrich_futures_product(entry) for entry in ERCOT_POWER_FUTURES_PRODUCTS
]


def get_ercot_symbols() -> list[dict]:
    """Return all active ERCOT short-term symbol entries."""
    return list(ERCOT_SYMBOLS)


def get_ercot_symbol_codes(symbol_entries: list[dict] | None = None) -> list[str]:
    """Return ERCOT short-term symbol strings for API calls."""
    entries = symbol_entries or ERCOT_SYMBOLS
    return [entry["symbol"] for entry in entries]


def get_ercot_symbol_map() -> dict[str, dict]:
    """Return ERCOT short-term symbols keyed by ICE symbol code."""
    return {entry["symbol"]: entry for entry in ERCOT_SYMBOLS}


def get_symbols(symbols: list[str] | None = None) -> list[str]:
    """Return validated ERCOT short-term symbol codes."""
    if symbols is None:
        return get_ercot_symbol_codes()
    symbol_map = get_ercot_symbol_map()
    normalized = [symbol.strip() for symbol in symbols if symbol and symbol.strip()]
    unknown = sorted(set(normalized) - set(symbol_map))
    if unknown:
        raise ValueError(f"Unknown ERCOT ICE symbols: {unknown}.")
    return list(dict.fromkeys(normalized))


def get_ercot_power_futures_products() -> list[dict]:
    """Return all active ERCOT power futures product entries."""
    return list(ERCOT_POWER_FUTURES_PRODUCTS)


def get_futures_products() -> list[str]:
    """Return ERCOT power futures product prefixes."""
    return [entry["product"] for entry in ERCOT_POWER_FUTURES_PRODUCTS]


def get_ercot_power_futures_product_map() -> dict[str, dict]:
    """Return ERCOT power futures products keyed by ICE product prefix."""
    return {entry["product"]: entry for entry in ERCOT_POWER_FUTURES_PRODUCTS}


def resolve_futures_products(products: list[str] | None = None) -> list[str]:
    """Return validated ERCOT power futures product prefixes."""
    configured = set(get_futures_products())
    if products is None:
        return get_futures_products()
    normalized = [product.strip().upper() for product in products if product.strip()]
    unknown = sorted(set(normalized) - configured)
    if unknown:
        raise ValueError(f"Unknown ERCOT futures products: {unknown}.")
    return list(dict.fromkeys(normalized))


def resolve_strips(strips: list[str]) -> list[str]:
    """Return validated ICE strip letters for ERCOT futures."""
    normalized = [strip.strip().upper() for strip in strips if strip.strip()]
    unknown = sorted(set(normalized) - VALID_STRIPS)
    if unknown:
        raise ValueError(f"Unknown ERCOT futures strips: {unknown}.")
    return list(dict.fromkeys(normalized))


def build_futures_symbol(
    product: str,
    strip: str,
    contract_year: int,
    suffix: str = "-IUS",
) -> str:
    """Build an ERCOT power futures ICE symbol."""
    return f"{product} {strip}{str(contract_year)[-2:]}{suffix}"


def get_futures_symbols(
    contract_year: int,
    strips: list[str],
    products: list[str] | None = None,
) -> list[str]:
    """Return ERCOT power futures symbols for products, strips, and year."""
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
    """Return ERCOT futures symbols from start month through a bounded horizon."""
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
    """Return frontend-ready ERCOT ICE product dictionary entries."""
    short_term_entries = [
        {
            **entry,
            "source_registry": "ercot_short_term",
            "ice_symbol_pattern": entry["symbol"],
        }
        for entry in ERCOT_SYMBOLS
    ]
    futures_entries = [
        {
            **entry,
            "source_registry": "ercot_futures",
            "ice_symbol_pattern": f"{entry['product']} {{MONTH_CODE}}{{YY}}-IUS",
        }
        for entry in ERCOT_POWER_FUTURES_PRODUCTS
    ]
    return short_term_entries + futures_entries
