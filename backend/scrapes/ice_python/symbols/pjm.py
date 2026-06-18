"""PJM ICE settlement symbols and products.

Source definitions:
- https://www.ice.com/products/6590471
- https://www.ice.com/products/6590472
- https://www.ice.com/products/6590502
- https://www.ice.com/products/6590503
- https://www.ice.com/products/6590369
- https://www.ice.com/products/6590424
- https://www.ice.com/products/66168788
- https://www.ice.com/products/71544049
- https://www.ice.com/products/82270911

ICE product metadata reviewed on 2026-06-01:
- PJM daily and weekly peak settlements use HE 0800-HE 2300 EPT.
- PJM daily off-peak settlements use HE 0100-HE 0700 and HE 2400 EPT.
- The Western Hub pnode for PJM LMP settlement joins is WESTERN HUB.
- Daily RT/DA products settle from PJM LMP tables. Weekly APO and monthly
  futures use ICE settlement marks.
"""
from __future__ import annotations

import logging
from datetime import date

logger = logging.getLogger(__name__)


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


PJM_SHORT_TERM_PRODUCT_METADATA_BY_CC: dict[str, dict[str, object]] = {
    "PDA": {
        "ice_product_id": "6590471",
        "product_name": "PJM Western Hub Day-Ahead Peak Daily Fixed Price Future",
        "ice_trading_screen_product_name": "Peak Futures",
        "ice_trading_screen_hub_name": "PJM WH DA (Daily)",
        "ice_contract_symbol": "PDA",
        "hub": "PJM WH DA",
        "blotter_hub_aliases": [
            "pjm wh da",
            "pjm wh da (daily)",
            "pjm wh da (daily 16 mwh)",
        ],
        "pjm_pnode_name": "WESTERN HUB",
        "hour_bucket": "ONPEAK",
        "hours": "HE 0800-HE 2300 EPT",
        "ice_product_type": "Daily Fixed Price Future",
        "settlement_source": "PJM_DA_LMP",
        "settlement_source_key": "pjm_da_onpeak",
        "settlement_priority": 1,
        "reference_price": "ELECTRICITY-PJM-WESTERN HUB-DAY AHEAD",
        "pjm_source_table": "pjm.da_hrl_lmps",
    },
    "PDP": {
        "ice_product_id": "6590472",
        "product_name": "PJM Western Hub Real-Time Peak Daily Fixed Price Future",
        "ice_trading_screen_product_name": "Peak Futures",
        "ice_trading_screen_hub_name": "PJM WH RT",
        "ice_contract_symbol": "PDP",
        "hub": "PJM WH RT",
        "blotter_hub_aliases": ["pjm wh rt", "pjm wh rt (16 mwh)"],
        "pjm_pnode_name": "WESTERN HUB",
        "hour_bucket": "ONPEAK",
        "hours": "HE 0800-HE 2300 EPT",
        "ice_product_type": "Daily Fixed Price Future",
        "settlement_source": "PJM_RT_LMP",
        "settlement_source_key": "pjm_rt_onpeak",
        "settlement_priority": 1,
        "reference_price": "ELECTRICITY-PJM-WESTERN HUB-REAL TIME",
        "pjm_source_table": (
            "pjm.rt_settlements_verified_hourly_lmps; "
            "fallback pjm.rt_unverified_hourly_lmps"
        ),
    },
    "PWA": {
        "ice_product_id": "71544049",
        "product_name": "PJM Western Hub Real-Time Peak Daily Mini Fixed Price Future",
        "ice_trading_screen_product_name": "Peak Futures",
        "ice_trading_screen_hub_name": "PJM WH RT (16 MWh)",
        "ice_contract_symbol": "PWA",
        "hub": "PJM WH RT",
        "blotter_hub_aliases": ["pjm wh rt", "pjm wh rt (16 mwh)"],
        "pjm_pnode_name": "WESTERN HUB",
        "hour_bucket": "ONPEAK",
        "hours": "HE 0800-HE 2300 EPT",
        "ice_product_type": "Daily Fixed Price Future",
        "settlement_source": "PJM_RT_LMP",
        "settlement_source_key": "pjm_rt_onpeak",
        "settlement_priority": 1,
        "reference_price": "ELECTRICITY-PJM-WESTERN HUB-REAL TIME",
        "pjm_source_table": (
            "pjm.rt_settlements_verified_hourly_lmps; "
            "fallback pjm.rt_unverified_hourly_lmps"
        ),
    },
    "PJL": {
        "ice_product_id": "82270911",
        "product_name": "PJM Western Hub Day-Ahead Peak Daily Mini Fixed Price Future",
        "ice_trading_screen_product_name": "Peak Futures",
        "ice_trading_screen_hub_name": "PJM WH DA (Daily 16 MWh)",
        "ice_contract_symbol": "PJL",
        "hub": "PJM WH DA",
        "blotter_hub_aliases": [
            "pjm wh da",
            "pjm wh da (daily)",
            "pjm wh da (daily 16 mwh)",
        ],
        "pjm_pnode_name": "WESTERN HUB",
        "hour_bucket": "ONPEAK",
        "hours": "HE 0800-HE 2300 EPT",
        "ice_product_type": "Daily Fixed Price Future",
        "settlement_source": "PJM_DA_LMP",
        "settlement_source_key": "pjm_da_onpeak",
        "settlement_priority": 1,
        "reference_price": "ELECTRICITY-PJM-WESTERN HUB-DAY AHEAD",
        "pjm_source_table": "pjm.da_hrl_lmps",
    },
    "PDO": {
        "ice_product_id": "6590503",
        "product_name": "PJM Western Hub Day-Ahead Off-Peak Daily Fixed Price Future",
        "ice_trading_screen_product_name": "Off-Peak Futures",
        "ice_trading_screen_hub_name": "PJM WH DA Off-Peak",
        "ice_contract_symbol": "PDO",
        "hub": "PJM WH DA Off-Peak",
        "blotter_hub_aliases": ["pjm wh da off-peak", "pjm wh da offpeak"],
        "pjm_pnode_name": "WESTERN HUB",
        "hour_bucket": "OFFPEAK",
        "hours": "HE 0100-HE 0700, HE 2400 EPT",
        "ice_product_type": "Daily Fixed Price Future",
        "settlement_source": "PJM_DA_LMP",
        "settlement_source_key": "pjm_da_offpeak",
        "settlement_priority": 1,
        "reference_price": "ELECTRICITY-PJM-WESTERN HUB-DAY AHEAD",
        "pjm_source_table": "pjm.da_hrl_lmps",
    },
    "ODP": {
        "ice_product_id": "6590502",
        "product_name": "PJM Western Hub Real-Time Off-Peak Daily Fixed Price Future",
        "ice_trading_screen_product_name": "Off-Peak Futures",
        "ice_trading_screen_hub_name": "PJM WH RT Off-Peak",
        "ice_contract_symbol": "ODP",
        "hub": "PJM WH RT Off-Peak",
        "blotter_hub_aliases": ["pjm wh rt off-peak", "pjm wh rt offpeak"],
        "pjm_pnode_name": "WESTERN HUB",
        "hour_bucket": "OFFPEAK",
        "hours": "HE 0100-HE 0700, HE 2400 EPT",
        "ice_product_type": "Daily Fixed Price Future",
        "settlement_source": "PJM_RT_LMP",
        "settlement_source_key": "pjm_rt_offpeak",
        "settlement_priority": 1,
        "reference_price": "ELECTRICITY-PJM-WESTERN HUB-REAL TIME",
        "pjm_source_table": (
            "pjm.rt_settlements_verified_hourly_lmps; "
            "fallback pjm.rt_unverified_hourly_lmps"
        ),
    },
}


PJM_WEEKLY_PRODUCT_METADATA: dict[str, object] = {
    "ice_product_id": "66168788",
    "product_name": (
        "Weekly Average Price on PJM Western Hub Real-Time Peak Fixed Price "
        "Future"
    ),
    "ice_trading_screen_product_name": "Peak Futures Weekly APO",
    "ice_trading_screen_hub_name": "PJM WH RT",
    "ice_contract_symbol": "PJH",
    "hub": "PJM WH RT",
    "blotter_hub_aliases": ["pjm wh rt", "pjm wh rt (16 mwh)"],
    "pjm_pnode_name": "WESTERN HUB",
    "hour_bucket": "ONPEAK",
    "hours": "HE 0800-HE 2300 EPT",
    "ice_product_type": "Weekly Average Price Future",
    "settlement_source": "ICE_SETTLEMENT",
    "settlement_source_key": "ice_settlement",
    "settlement_priority": 1,
    "reference_price": "ELECTRICITY-PJM-WESTERN HUB-REAL TIME",
    "pjm_source_table": "ice_python.settlements",
}


PJM_FUTURES_PRODUCT_METADATA_BY_PRODUCT: dict[str, dict[str, object]] = {
    "PMI": {
        "ice_product_id": "6590369",
        "product_name": "PJM Western Hub Real-Time Peak (1 MW) Fixed Price Future",
        "ice_trading_screen_product_name": "Peak Futures (1 MW)",
        "ice_trading_screen_hub_name": "PJM WH RT",
        "ice_contract_symbol": "PMI",
        "hub": "PJM WH RT",
        "blotter_hub_aliases": ["pjm wh rt", "pjm wh rt (16 mwh)"],
        "pjm_pnode_name": "WESTERN HUB",
        "hour_bucket": "ONPEAK",
        "hours": "HE 0800-HE 2300 EPT",
        "ice_product_type": "Monthly Fixed Price Future",
        "settlement_source": "ICE_SETTLEMENT",
        "settlement_source_key": "ice_settlement",
        "settlement_priority": 2,
        "reference_price": "ELECTRICITY-PJM-WESTERN HUB-REAL TIME",
        "pjm_source_table": "ice_python.settlements",
    },
    "OPJ": {
        "ice_product_id": "6590424",
        "product_name": "PJM Western Hub Real-Time Off-Peak Fixed Price Future",
        "ice_trading_screen_product_name": "Off-Peak Futures (1 MW)",
        "ice_trading_screen_hub_name": "PJM WH RT Off-Peak",
        "ice_contract_symbol": "OPJ",
        "hub": "PJM WH RT Off-Peak",
        "blotter_hub_aliases": ["pjm wh rt off-peak", "pjm wh rt offpeak"],
        "pjm_pnode_name": "WESTERN HUB",
        "hour_bucket": "OFFPEAK",
        "hours": (
            "Weekdays HE 0100-HE 0700 and HE 2400 EPT; "
            "weekends/holidays HE 0100-HE 2400 EPT"
        ),
        "ice_product_type": "Monthly Fixed Price Future",
        "settlement_source": "ICE_SETTLEMENT",
        "settlement_source_key": "ice_settlement",
        "settlement_priority": 2,
        "reference_price": "ELECTRICITY-PJM-WESTERN HUB-REAL TIME",
        "pjm_source_table": "ice_python.settlements",
    },
}


CONTRACT_LABEL_BY_CODE = {
    "D0": "HE 0800-HE 2300",
    "D1": "Next Day",
    "P1": "Weekend 2x16",
    "W0": "Bal Week",
    "W1": "Next Week",
    "W2": "2nd Week",
    "W3": "3rd Week",
    "W4": "4th Week",
}


def _symbol_contract_code(symbol: str) -> str:
    return symbol.split()[1].split("-")[0]


def _metadata_note(entry: dict[str, object]) -> str:
    return (
        "ICE metadata reviewed "
        f"{PRODUCT_METADATA_REVIEWED_DATE}; source table "
        f"{entry['pjm_source_table']}; hub {entry['pjm_pnode_name']}; "
        f"hours {entry['hours']}."
    )


def _enrich_short_term_symbol(entry: dict[str, object]) -> dict[str, object]:
    symbol = str(entry["symbol"])
    cc = symbol.split()[0]
    contract_code = _symbol_contract_code(symbol)
    metadata = (
        PJM_WEEKLY_PRODUCT_METADATA
        if contract_code.startswith("W")
        else PJM_SHORT_TERM_PRODUCT_METADATA_BY_CC[cc]
    )
    enriched = {
        **entry,
        **metadata,
        "cc": cc,
        "ice_product_url": _ice_product_url(str(metadata["ice_product_id"])),
        "contract_code": contract_code,
        "contract_label": CONTRACT_LABEL_BY_CODE.get(contract_code, contract_code),
        "active": True,
    }
    enriched["notes"] = _metadata_note(enriched)
    return enriched


def _enrich_futures_product(entry: dict[str, object]) -> dict[str, object]:
    product = str(entry["product"])
    metadata = PJM_FUTURES_PRODUCT_METADATA_BY_PRODUCT[product]
    enriched = {
        **entry,
        **metadata,
        "cc": product,
        "ice_product_url": _ice_product_url(str(metadata["ice_product_id"])),
        "contract_code": "MONTH",
        "contract_label": "Monthly",
        "active": True,
    }
    enriched["notes"] = _metadata_note(enriched)
    return enriched


PJM_SYMBOLS: list[dict] = [
    {
        "symbol": "PDP D0-IUS",
        "description": "PJM HE 0800-HE 2300",
        "product_type": "power",
        "contract_type": "Daily",
        "market": "RT",
        "shape": "Peak",
        "contract_size": "800 MWh",
    },
    {
        "symbol": "PDP D1-IUS",
        "description": "PJM RT Next Day",
        "product_type": "power",
        "contract_type": "Daily",
        "market": "RT",
        "shape": "Peak",
        "contract_size": "800 MWh",
    },
    {
        "symbol": "PWA D0-IUS",
        "description": "PJM RT Peak Daily Mini HE 0800-HE 2300",
        "product_type": "power",
        "contract_type": "Daily",
        "market": "RT",
        "shape": "Peak",
        "contract_size": "16 MWh",
    },
    {
        "symbol": "PWA D1-IUS",
        "description": "PJM RT Peak Daily Mini Next Day",
        "product_type": "power",
        "contract_type": "Daily",
        "market": "RT",
        "shape": "Peak",
        "contract_size": "16 MWh",
    },
    {
        "symbol": "PDA D1-IUS",
        "description": "PJM DA Next Day",
        "product_type": "power",
        "contract_type": "Daily",
        "market": "DA",
        "shape": "Peak",
        "contract_size": "800 MWh",
    },
    {
        "symbol": "PJL D1-IUS",
        "description": "PJM DA Peak Daily Mini Next Day",
        "product_type": "power",
        "contract_type": "Daily",
        "market": "DA",
        "shape": "Peak",
        "contract_size": "16 MWh",
    },
    {
        "symbol": "PDP W0-IUS",
        "description": "PJM Balance of Week",
        "product_type": "power",
        "contract_type": "Weekly",
        "market": "RT",
        "shape": "Peak",
        "contract_size": "800 MWh x peak days",
    },
    {
        "symbol": "PDP W1-IUS",
        "description": "PJM Week 1",
        "product_type": "power",
        "contract_type": "Weekly",
        "market": "RT",
        "shape": "Peak",
        "contract_size": "800 MWh x peak days",
    },
    {
        "symbol": "PDP W2-IUS",
        "description": "PJM Week 2",
        "product_type": "power",
        "contract_type": "Weekly",
        "market": "RT",
        "shape": "Peak",
        "contract_size": "800 MWh x peak days",
    },
    {
        "symbol": "PDP W3-IUS",
        "description": "PJM Week 3",
        "product_type": "power",
        "contract_type": "Weekly",
        "market": "RT",
        "shape": "Peak",
        "contract_size": "800 MWh x peak days",
    },
    {
        "symbol": "PDP W4-IUS",
        "description": "PJM Week 4",
        "product_type": "power",
        "contract_type": "Weekly",
        "market": "RT",
        "shape": "Peak",
        "contract_size": "800 MWh x peak days",
    },
    {
        "symbol": "PDO P1-IUS",
        "description": "PJM WH DA Off-Peak Weekend 2x16",
        "product_type": "power",
        "contract_type": "Daily",
        "market": "DA",
        "shape": "Off-Peak",
        "contract_size": "50 MWh",
    },
    {
        "symbol": "ODP P1-IUS",
        "description": "PJM WH RT Off-Peak Weekend 2x16",
        "product_type": "power",
        "contract_type": "Daily",
        "market": "RT",
        "shape": "Off-Peak",
        "contract_size": "50 MWh",
    },
]
PJM_SYMBOLS = [_enrich_short_term_symbol(entry) for entry in PJM_SYMBOLS]

PJM_POWER_FUTURES_PRODUCTS: list[dict] = [
    {
        "product": "PMI",
        "description": "PJM Western Hub RT Peak (1 MW)",
        "product_type": "power",
        "contract_type": "Monthly",
        "market": "RT",
        "shape": "Peak",
        "contract_size": "1 MW",
        "region": "pjm",
    },
    {
        "product": "OPJ",
        "description": "PJM Western Hub RT OffPeak (1 MW)",
        "product_type": "power",
        "contract_type": "Monthly",
        "market": "RT",
        "shape": "Off-Peak",
        "contract_size": "1 MW",
        "region": "pjm",
    },
]
PJM_POWER_FUTURES_PRODUCTS = [
    _enrich_futures_product(entry) for entry in PJM_POWER_FUTURES_PRODUCTS
]


def get_pjm_symbols() -> list[dict]:
    """Return all active PJM short-term symbol entries."""
    return list(PJM_SYMBOLS)


def get_pjm_symbol_codes(symbol_entries: list[dict] | None = None) -> list[str]:
    """Return PJM short-term symbol strings for API calls."""
    entries = symbol_entries or PJM_SYMBOLS
    return [entry["symbol"] for entry in entries]


def get_pjm_symbol_map() -> dict[str, dict]:
    """Return PJM short-term symbols keyed by ICE symbol code."""
    return {entry["symbol"]: entry for entry in PJM_SYMBOLS}


def resolve_pjm_symbol_entries(symbols: list[str] | None = None) -> list[dict]:
    """Resolve optional PJM short-term symbol codes against the registry."""
    if symbols is None:
        return list(PJM_SYMBOLS)

    normalized_symbols = [
        symbol.strip()
        for symbol in symbols
        if symbol and symbol.strip()
    ]
    if not normalized_symbols:
        raise ValueError("No valid PJM symbol codes were provided.")

    symbol_map = get_pjm_symbol_map()
    unknown_symbols = sorted(set(normalized_symbols) - set(symbol_map))
    if unknown_symbols:
        raise ValueError(
            "Unknown PJM ICE symbols: "
            f"{unknown_symbols}. Valid symbols must come from "
            "backend.scrapes.ice_python.symbols.pjm."
        )

    unique_symbols = list(dict.fromkeys(normalized_symbols))
    return [symbol_map[symbol] for symbol in unique_symbols]


def get_short_term_entries(symbols: list[str] | None = None) -> list[dict]:
    """Return validated PJM short-term symbol registry entries."""
    return resolve_pjm_symbol_entries(symbols=symbols)


def get_symbols(symbols: list[str] | None = None) -> list[str]:
    """Return validated PJM short-term symbol codes."""
    return get_pjm_symbol_codes(get_short_term_entries(symbols=symbols))


def get_pjm_power_futures_products() -> list[dict]:
    """Return all active PJM power futures product entries."""
    return list(PJM_POWER_FUTURES_PRODUCTS)


def get_pjm_power_futures_product_codes(
    product_entries: list[dict] | None = None,
) -> list[str]:
    """Return PJM power futures product prefix strings."""
    entries = product_entries or PJM_POWER_FUTURES_PRODUCTS
    return [entry["product"] for entry in entries]


def get_pjm_power_futures_product_map() -> dict[str, dict]:
    """Return PJM power futures products keyed by ICE product prefix."""
    return {entry["product"]: entry for entry in PJM_POWER_FUTURES_PRODUCTS}


def get_product_dictionary_entries() -> list[dict]:
    """Return frontend-ready PJM ICE product dictionary entries."""
    short_term_entries = [
        {
            **entry,
            "source_registry": "short_term",
            "ice_symbol_pattern": entry["symbol"],
        }
        for entry in PJM_SYMBOLS
    ]
    futures_entries = [
        {
            **entry,
            "source_registry": "futures",
            "ice_symbol_pattern": f"{entry['product']} {{MONTH_CODE}}{{YY}}-IUS",
        }
        for entry in PJM_POWER_FUTURES_PRODUCTS
    ]
    return short_term_entries + futures_entries


def get_futures_product_entries() -> list[dict]:
    """Return PJM power futures product registry entries."""
    return get_pjm_power_futures_products()


def get_futures_products() -> list[str]:
    """Return PJM power futures product prefixes."""
    return get_pjm_power_futures_product_codes(get_futures_product_entries())


def resolve_futures_products(products: list[str] | None = None) -> list[str]:
    """Return validated PJM power futures product prefixes."""
    configured = set(get_futures_products())
    if products is None:
        return get_futures_products()

    normalized = [product.strip().upper() for product in products if product.strip()]
    if not normalized:
        raise ValueError("No valid PJM futures products were provided.")

    unknown = sorted(set(normalized) - configured)
    if unknown:
        raise ValueError(
            "Unknown PJM futures products: "
            f"{unknown}. Valid products are {sorted(configured)}."
        )
    return list(dict.fromkeys(normalized))


def resolve_strips(strips: list[str]) -> list[str]:
    """Return validated ICE strip letters for PJM futures."""
    normalized = [strip.strip().upper() for strip in strips if strip.strip()]
    if not normalized:
        raise ValueError("At least one PJM futures strip is required.")

    unknown = sorted(set(normalized) - VALID_STRIPS)
    if unknown:
        raise ValueError(
            "Unknown PJM futures strips: "
            f"{unknown}. Valid strips are {sorted(VALID_STRIPS)}."
        )
    return list(dict.fromkeys(normalized))


def build_ice_symbol(
    product: str,
    strip: str,
    contract_year: int,
    suffix: str = "-IUS",
) -> str:
    """Build a full ICE symbol from product prefix, strip letter, and year."""
    return f"{product} {strip}{str(contract_year)[-2:]}{suffix}"


def build_futures_symbol(
    product: str,
    strip: str,
    contract_year: int,
    suffix: str = "-IUS",
) -> str:
    """Build a PJM power futures ICE symbol."""
    return build_ice_symbol(
        product=product,
        strip=strip,
        contract_year=contract_year,
        suffix=suffix,
    )


def get_futures_symbols(
    contract_year: int,
    strips: list[str],
    products: list[str] | None = None,
) -> list[str]:
    """Return PJM power futures symbols for products, strips, and year."""
    selected_products = resolve_futures_products(products=products)
    selected_strips = resolve_strips(strips=strips)
    return [
        build_futures_symbol(
            product=product,
            strip=strip,
            contract_year=contract_year,
        )
        for product in selected_products
        for strip in selected_strips
    ]


def get_futures_symbols_for_horizon(
    products: list[str] | None = None,
    start_date: date | None = None,
    months_forward: int = 36,
) -> list[str]:
    """Return PJM futures symbols from start month through a bounded horizon."""
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


def select_symbols(
    symbols: list[str] | None = None,
    include_short_term: bool = True,
    futures_symbols: list[str] | None = None,
    futures_products: list[str] | None = None,
    futures_strips: list[str] | None = None,
    futures_contract_year: int | None = None,
) -> list[str]:
    """Select PJM short-term and optional futures settlement symbols."""
    selected_symbols: list[str] = []
    if include_short_term:
        selected_symbols.extend(get_symbols(symbols=symbols))
    elif symbols:
        raise ValueError("Explicit symbols require include_short_term=True.")

    if futures_symbols:
        selected_symbols.extend(
            list(
                dict.fromkeys(
                    symbol.strip()
                    for symbol in futures_symbols
                    if symbol and symbol.strip()
                )
            )
        )

    futures_requested = any(
        value is not None
        for value in [futures_products, futures_strips, futures_contract_year]
    )
    if futures_requested:
        if futures_contract_year is None or futures_strips is None:
            raise ValueError(
                "PJM futures selection requires futures_contract_year and "
                "futures_strips."
            )
        selected_symbols.extend(
            get_futures_symbols(
                contract_year=futures_contract_year,
                strips=futures_strips,
                products=futures_products,
            )
        )

    if not selected_symbols:
        raise ValueError("At least one PJM settlement symbol is required.")
    return list(dict.fromkeys(selected_symbols))


def log_all_short_term_symbols(symbol_entries: list[dict] | None = None) -> None:
    """Log all configured PJM short-term symbols."""
    entries = symbol_entries or get_pjm_symbols()
    logger.info("Configured %s PJM short-term symbols", len(entries))
    for entry in entries:
        logger.info(
            "%s | %s | %s | %s",
            entry["symbol"],
            entry["description"],
            entry["product_type"],
            entry["contract_type"],
        )


def log_all_futures_products(product_entries: list[dict] | None = None) -> None:
    """Log all configured PJM power futures products."""
    entries = product_entries or get_pjm_power_futures_products()
    logger.info("Configured %s PJM power futures products", len(entries))
    for entry in entries:
        logger.info(
            "%s | %s | %s",
            entry["product"],
            entry["description"],
            entry["region"],
        )
