"""Gas ICE settlement symbols and products.

Source definitions:
- https://www.ice.com/api/productguide/info/codes/all/csv

ICE product metadata reviewed on 2026-06-01:
- Next-day gas rows use ICE physical gas spot symbols with the `-IPG` suffix.
- BALMO gas rows use ICE swing future symbols with the `B0-IUS` tenor.
- Monthly gas futures use product prefixes and generated
  `{product} {MONTH_CODE}{YY}-IUS` symbols.
- These rows are registry metadata only; no gas settlement orchestration is
  enabled here.
"""
from __future__ import annotations

from datetime import date


ICE_PRODUCT_BASE_URL = "https://www.ice.com/products"
PRODUCT_METADATA_REVIEWED_DATE = "2026-06-01"
ICE_PRODUCT_CODE_DOWNLOAD_URL = (
    "https://www.ice.com/api/productguide/info/codes/all/csv"
)

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


def _ice_product_url(product_id: str | None) -> str | None:
    if not product_id:
        return None
    return f"{ICE_PRODUCT_BASE_URL}/{product_id}"


def _hub_from_description(description: str) -> str:
    return (
        description.removesuffix(" BALMO")
        .removesuffix(" Basis")
        .replace(" (non-G)", "")
    )


def _metadata_note(entry: dict[str, object]) -> str:
    if entry["metadata_status"] == "ice_product_url_verified":
        source = f"ICE product URL {entry['ice_product_url']}"
    else:
        source = (
            f"legacy registry only; not found in {ICE_PRODUCT_CODE_DOWNLOAD_URL}"
        )
    return (
        "ICE metadata reviewed "
        f"{PRODUCT_METADATA_REVIEWED_DATE}; {source}; source table "
        f"{entry['source_table']}."
    )


def _common_metadata(entry: dict[str, object], family: str) -> dict[str, object]:
    product_id = entry.get("ice_product_id")
    hub = str(entry.get("hub") or _hub_from_description(str(entry["description"])))
    enriched = {
        **entry,
        "cc": str(entry.get("cc") or entry.get("product") or entry["symbol"]).split()[0],
        "ice_product_url": _ice_product_url(str(product_id)) if product_id else None,
        "ice_trading_screen_hub_name": entry.get(
            "ice_trading_screen_hub_name",
            hub,
        ),
        "hub": hub,
        "ice_product_type": family,
        "settlement_source": "ICE_SETTLEMENT",
        "settlement_source_key": entry.get("settlement_source_key", "ice_settlement"),
        "settlement_priority": 2,
        "source_table": "ice_python.settlements",
        "metadata_status": (
            "ice_product_url_verified" if product_id else "unverified_legacy_symbol"
        ),
        "active": True,
    }
    enriched["notes"] = _metadata_note(enriched)
    return enriched


NEXT_DAY_GAS_PRODUCTS: list[tuple[str, str | None, str, str]] = [
    ("XGF", "1156", "Henry Physical Fixed Price Spot", "louisiana"),
    ("XVA", "3306646", "Transco Station 85 (Zone 4) Physical Fixed Price Spot", "southeast"),
    ("XLM", "1318", "TGP 500L Physical Fixed Price Spot", "southeast"),
    ("YHV", "69138045", "Florida Gas Zone 3 Physical Fixed Price Spot", "southeast"),
    ("XLA", "1306", "CG Mainline Physical Fixed Price Spot", "southeast"),
    ("XTA", "3306641", "ANR SE (Louisiana) Physical Fixed Price Spot", "southeast"),
    ("YV7", "72764821", "Pine Prairie Physical Fixed Price Spot", "southeast"),
    ("XVM", "3306648", "TETCO WLA Physical Fixed Price Spot", "southeast"),
    ("XYZ", "3306663", "HSC HPL Pool Physical Fixed Price Spot", "east_texas"),
    ("XT6", "34598274", "Waha Physical Fixed Price Spot", "east_texas"),
    ("XIT", "1162", "NGPL TXOK Physical Fixed Price Spot", "east_texas"),
    ("X7F", None, "Algonquin Citygates (non-G)", "northeast"),
    ("XZR", "26209306", "TETCO M3 Physical Fixed Price Spot", "northeast"),
    ("YFF", "60045058", "Transco Z5 South Physical Fixed Price Spot", "northeast"),
    ("Z2Y", None, "Transco Zone 5 North", "northeast"),
    ("YP8", None, "Iroquois Zone 2", "northeast"),
    ("XWK", "26209312", "Transco Z6 (NY) Physical Fixed Price Spot", "northeast"),
    ("XJL", "1155", "Eastern Gas-South Physical Fixed Price Spot", "northeast"),
    ("XIZ", "1161", "TCO Physical Fixed Price Spot", "northeast"),
    ("YAG", "42944123", "TETCO M2 (Receipt) Physical Fixed Price Spot", "northeast"),
    ("Z1Q", None, "Tennessee Z4 (Marcellus)", "northeast"),
    ("YQE", "70466407", "Leidy-Transco Physical Fixed Price Spot", "northeast"),
    ("XTG", "3306642", "NNG Ventura Physical Fixed Price Spot", "midwest"),
    ("YHF", "65657575", "NGPL Nicor Physical Fixed Price Spot", "midwest"),
    ("XKF", "3306638", "Socal Citygate Physical Fixed Price Spot", "southwest"),
    ("XGV", "1160", "PG&E Citygate Physical Fixed Price Spot", "southwest"),
    ("YKL", None, "CIG Mainline", "rockies_northwest"),
    ("XJR", "1158", "NGPL Midcont Physical Fixed Price Spot", "midwest"),
    ("XJZ", "3306637", "Michcon Physical Fixed Price Spot", "midwest"),
]

NEXT_DAY_GAS_DESCRIPTIONS: dict[str, str] = {
    "XGF": "Henry Hub",
    "XVA": "Transco Station 85",
    "XLM": "TGP-500L",
    "YHV": "FGT Zone 3",
    "XLA": "Columbia Gulf (Mainline)",
    "XTA": "ANR SE-T",
    "YV7": "Pine Prairie",
    "XVM": "Tetco WLA",
    "XYZ": "Houston Ship Channel",
    "XT6": "Waha",
    "XIT": "NGPL TX/OK",
    "X7F": "Algonquin Citygates (non-G)",
    "XZR": "Tetco M3",
    "YFF": "Transco Zone 5 South",
    "Z2Y": "Transco Zone 5 North",
    "YP8": "Iroquois Zone 2",
    "XWK": "Transco Zone 6 NY",
    "XJL": "Dominion South (Eastern Gas-South)",
    "XIZ": "Columbia TCO Pool",
    "YAG": "Tetco M2 (Receipt)",
    "Z1Q": "Tennessee Z4 (Marcellus)",
    "YQE": "Transco Leidy",
    "XTG": "Northern Ventura (NNG)",
    "YHF": "Chicago CityGate (NGPL-Nicor)",
    "XKF": "SoCal Citygate",
    "XGV": "PG&E Citygate",
    "YKL": "CIG Mainline",
    "XJR": "NGPL Midcontinent",
    "XJZ": "MichCon",
}

BALMO_GAS_PRODUCTS: list[tuple[str, str, str, str]] = [
    ("HHD", "6590229", "Henry Swing Future", "louisiana"),
    ("TRW", "6590252", "Transco Station 85 (Zone 4) Swing Future", "southeast"),
    ("FTS", "6590228", "Florida Gas Zone 3 Swing Future", "southeast"),
    ("CGR", "6590221", "CG-Mainline Swing Future", "southeast"),
    ("APS", "6590219", "ANR SE (Louisiana) Swing Future", "southeast"),
    ("CVK", "71544009", "Pine Prairie Swing Future", "southeast"),
    ("CVP", "71544034", "TETCO WLA Swing Future", "southeast"),
    ("UCS", "6590255", "HSC Swing Future", "east_texas"),
    ("WAS", "6590256", "Waha Swing Future", "east_texas"),
    ("NTS", "6590236", "NGPL TXOK Swing Future", "east_texas"),
    ("ALS", "6590217", "Algonquin Citygates Swing Future", "northeast"),
    ("TSS", "6590253", "TETCO M3 Swing Future", "northeast"),
    ("DKS", "42944092", "Transco Zone 5 Swing Future", "northeast"),
    ("T5C", "82270890", "Transco Zone 5 South Swing Future", "northeast"),
    ("IZS", "21592921", "Iroquois-Z2 Swing (Platts) Future", "northeast"),
    ("ZSS", "6590257", "Transco Zone 6 (NY) Swing Future", "northeast"),
    ("DSS", "6590227", "Eastern Gas South Swing Future", "northeast"),
    ("SCS", "6590244", "Socal Citygate Swing Future", "southwest"),
    ("PIG", "6590241", "PG&E Citygate Swing Future", "southwest"),
    ("CRS", "6590223", "CIG Rockies Swing Future", "rockies_northwest"),
    ("MTS", "6590232", "NGPL Midcont Swing Future", "midwest"),
    ("NMS", "6590233", "Michcon Swing Future", "midwest"),
]

BALMO_GAS_DESCRIPTIONS: dict[str, str] = {
    "HHD": "Henry Hub BALMO",
    "TRW": "Transco Station 85 BALMO",
    "FTS": "FGT Zone 3 BALMO",
    "CGR": "Columbia Gulf (Mainline) BALMO",
    "APS": "ANR SE-T BALMO",
    "CVK": "Pine Prairie BALMO",
    "CVP": "Tetco WLA BALMO",
    "UCS": "Houston Ship Channel BALMO",
    "WAS": "Waha BALMO",
    "NTS": "NGPL TX/OK BALMO",
    "ALS": "Algonquin Citygates BALMO",
    "TSS": "Tetco M3 BALMO",
    "DKS": "Transco Zone 5 BALMO",
    "T5C": "Transco Zone 5 South BALMO",
    "IZS": "Iroquois Zone 2 BALMO",
    "ZSS": "Transco Zone 6 NY BALMO",
    "DSS": "Dominion South (Eastern Gas-South) BALMO",
    "SCS": "SoCal Citygate BALMO",
    "PIG": "PG&E Citygate BALMO",
    "CRS": "CIG Mainline BALMO",
    "MTS": "NGPL Midcontinent BALMO",
    "NMS": "MichCon BALMO",
}

GAS_FUTURES_PRODUCTS: list[dict] = [
    {"product": "HNG", "ice_product_id": "6590258", "product_name": "Henry LD1 Fixed Price Future", "description": "Henry Hub Natural Gas", "region": "louisiana"},
    {"product": "PHE", "ice_product_id": "6590264", "product_name": "Henry Penultimate Fixed Price Future", "description": "Henry Penultimate Natural Gas", "region": "louisiana"},
    {"product": "TRZ", "ice_product_id": "6590165", "product_name": "Transco Station 85 (Zone 4) Basis Future", "description": "Transco Station 85 Basis", "region": "southeast"},
    {"product": "TFL", "ice_product_id": "6590159", "product_name": "Tennessee 500L Basis Future", "description": "TGP 500L Basis", "region": "southeast"},
    {"product": "CGB", "ice_product_id": "6590126", "product_name": "CG-Mainline Basis Future", "description": "Columbia Gulf Basis", "region": "southeast"},
    {"product": "CGM", "ice_product_id": "6590127", "product_name": "ANR SE (Louisiana) Basis Future", "description": "ANR SE-T Basis", "region": "southeast"},
    {"product": "TWB", "ice_product_id": "6590168", "product_name": "TETCO WLA Basis Future", "description": "Tetco WLA Basis", "region": "southeast"},
    {"product": "HXS", "ice_product_id": "6590137", "product_name": "HSC Basis Future", "description": "Houston Ship Channel Basis", "region": "east_texas"},
    {"product": "WAH", "ice_product_id": "6590171", "product_name": "Waha Basis Future", "description": "Waha Basis", "region": "east_texas"},
    {"product": "NTO", "ice_product_id": "6590143", "product_name": "NGPL TXOK Basis Future", "description": "NGPL TX/OK Basis", "region": "east_texas"},
    {"product": "ALQ", "ice_product_id": "6590124", "product_name": "Algonquin Citygates Basis Future", "description": "Algonquin Citygates Basis", "region": "northeast"},
    {"product": "TMT", "ice_product_id": "6590161", "product_name": "TETCO M3 Basis Future", "description": "Tetco M3 Basis", "region": "northeast"},
    {"product": "T5B", "ice_product_id": "82270888", "product_name": "Transco Zone 5 South Basis Future", "description": "Transco Zone 5 South Basis", "region": "northeast"},
    {"product": "IZB", "ice_product_id": "21587547", "product_name": "Iroquois-Z2 Basis (Platts) Future", "description": "Iroquois Zone 2 Basis", "region": "northeast"},
    {"product": "TZS", "ice_product_id": "6590169", "product_name": "Transco Zone 6 (NY) Basis Future", "description": "Transco Zone 6 NY Basis", "region": "northeast"},
    {"product": "DOM", "ice_product_id": "6590133", "product_name": "Eastern Gas South Basis Future", "description": "Dominion South Basis", "region": "northeast"},
    {"product": "SCB", "ice_product_id": "6590151", "product_name": "Socal Citygate Basis Future", "description": "SoCal Citygate Basis", "region": "southwest"},
    {"product": "PGE", "ice_product_id": "6590150", "product_name": "PG&E Citygate Basis Future", "description": "PG&E Citygate Basis", "region": "southwest"},
    {"product": "CRI", "ice_product_id": "6590129", "product_name": "CIG Rockies Basis Future", "description": "CIG Mainline Basis", "region": "rockies_northwest"},
]


def _build_next_day_entries() -> list[dict]:
    entries: list[dict] = []
    for cc, product_id, product_name, region in NEXT_DAY_GAS_PRODUCTS:
        description = NEXT_DAY_GAS_DESCRIPTIONS[cc]
        entries.append(
            _common_metadata(
                {
                    "symbol": f"{cc} D1-IPG",
                    "description": description,
                    "product_type": "gas",
                    "contract_type": "Next Day",
                    "contract_code": "D1",
                    "contract_label": "Next Day",
                    "region": region,
                    "ice_product_id": product_id,
                    "product_name": product_name,
                    "ice_trading_screen_product_name": "NG Firm Phys, FP",
                    "ice_contract_symbol": cc,
                    "market": "Physical Gas",
                    "shape": "Firm Physical Fixed Price",
                    "contract_size": "100 MMBtus per lot",
                    "settlement_source_key": "ice_next_day_gas",
                },
                family="Next-Day Physical Gas",
            )
        )
    return entries


def _build_balmo_entries() -> list[dict]:
    entries: list[dict] = []
    for cc, product_id, product_name, region in BALMO_GAS_PRODUCTS:
        description = BALMO_GAS_DESCRIPTIONS[cc]
        entries.append(
            _common_metadata(
                {
                    "symbol": f"{cc} B0-IUS",
                    "description": description,
                    "product_type": "gas",
                    "contract_type": "BALMO",
                    "contract_code": "B0",
                    "contract_label": "BALMO",
                    "region": region,
                    "ice_product_id": product_id,
                    "product_name": product_name,
                    "ice_trading_screen_product_name": "NG Swing GDD Futures",
                    "ice_contract_symbol": cc,
                    "market": "Financial Gas",
                    "shape": "Swing Daily",
                    "contract_size": "2500 MMBtus",
                    "settlement_source_key": "ice_balmo_gas",
                },
                family="BALMO Gas Swing Future",
            )
        )
    return entries


def _build_gas_futures_entries() -> list[dict]:
    entries: list[dict] = []
    for entry in GAS_FUTURES_PRODUCTS:
        product = str(entry["product"])
        product_name = str(entry["product_name"])
        is_basis = "Basis" in product_name
        entries.append(
            _common_metadata(
                {
                    **entry,
                    "cc": product,
                    "product_type": "gas",
                    "contract_type": "Monthly",
                    "contract_code": "MONTH",
                    "contract_label": "Monthly",
                    "ice_trading_screen_product_name": (
                        "NG Basis LD1 for IF Futures" if is_basis else "NG LD1 Futures"
                    ),
                    "ice_contract_symbol": product,
                    "market": "Financial Gas",
                    "shape": "Basis" if is_basis else "Fixed Price",
                    "contract_size": "2500 MMBtus",
                    "settlement_source_key": "ice_gas_futures",
                },
                family="Monthly Gas Future",
            )
        )
    return entries


NEXT_DAY_GAS_SYMBOLS = _build_next_day_entries()
BALMO_GAS_SYMBOLS = _build_balmo_entries()
GAS_FUTURES_PRODUCTS = _build_gas_futures_entries()


def get_next_day_gas_symbols() -> list[dict]:
    """Return all active next-day gas symbol entries."""
    return list(NEXT_DAY_GAS_SYMBOLS)


def get_next_day_gas_symbol_codes(symbol_entries: list[dict] | None = None) -> list[str]:
    """Return next-day gas symbol strings for API calls."""
    entries = symbol_entries or NEXT_DAY_GAS_SYMBOLS
    return [entry["symbol"] for entry in entries]


def get_balmo_gas_symbols() -> list[dict]:
    """Return all active BALMO gas symbol entries."""
    return list(BALMO_GAS_SYMBOLS)


def get_balmo_gas_symbol_codes(symbol_entries: list[dict] | None = None) -> list[str]:
    """Return BALMO gas symbol strings for API calls."""
    entries = symbol_entries or BALMO_GAS_SYMBOLS
    return [entry["symbol"] for entry in entries]


def get_gas_futures_products() -> list[dict]:
    """Return all active monthly gas futures product entries."""
    return list(GAS_FUTURES_PRODUCTS)


def get_gas_futures_product_codes(product_entries: list[dict] | None = None) -> list[str]:
    """Return gas futures product prefix strings."""
    entries = product_entries or GAS_FUTURES_PRODUCTS
    return [entry["product"] for entry in entries]


def get_unverified_symbol_codes() -> list[str]:
    """Return migrated gas symbols that still need ICE product URL confirmation."""
    return [
        entry["symbol"]
        for entry in NEXT_DAY_GAS_SYMBOLS + BALMO_GAS_SYMBOLS
        if entry["metadata_status"] != "ice_product_url_verified"
    ]


def resolve_futures_products(products: list[str] | None = None) -> list[str]:
    """Return validated monthly gas futures product prefixes."""
    configured = set(get_gas_futures_product_codes())
    if products is None:
        return get_gas_futures_product_codes()
    normalized = [product.strip().upper() for product in products if product.strip()]
    unknown = sorted(set(normalized) - configured)
    if unknown:
        raise ValueError(f"Unknown gas futures products: {unknown}.")
    return list(dict.fromkeys(normalized))


def resolve_strips(strips: list[str]) -> list[str]:
    """Return validated ICE strip letters for gas futures."""
    normalized = [strip.strip().upper() for strip in strips if strip.strip()]
    unknown = sorted(set(normalized) - VALID_STRIPS)
    if unknown:
        raise ValueError(f"Unknown gas futures strips: {unknown}.")
    return list(dict.fromkeys(normalized))


def build_futures_symbol(
    product: str,
    strip: str,
    contract_year: int,
    suffix: str = "-IUS",
) -> str:
    """Build a monthly gas futures ICE symbol."""
    return f"{product} {strip}{str(contract_year)[-2:]}{suffix}"


def get_futures_symbols(
    contract_year: int,
    strips: list[str],
    products: list[str] | None = None,
) -> list[str]:
    """Return gas futures symbols for products, strips, and year."""
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
    """Return gas futures symbols from start month through a bounded horizon."""
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
    """Return frontend-ready gas ICE product dictionary entries."""
    next_day_entries = [
        {
            **entry,
            "source_registry": "gas_next_day",
            "ice_symbol_pattern": entry["symbol"],
        }
        for entry in NEXT_DAY_GAS_SYMBOLS
    ]
    balmo_entries = [
        {
            **entry,
            "source_registry": "gas_balmo",
            "ice_symbol_pattern": entry["symbol"],
        }
        for entry in BALMO_GAS_SYMBOLS
    ]
    futures_entries = [
        {
            **entry,
            "source_registry": "gas_futures",
            "ice_symbol_pattern": f"{entry['product']} {{MONTH_CODE}}{{YY}}-IUS",
        }
        for entry in GAS_FUTURES_PRODUCTS
    ]
    return next_day_entries + balmo_entries + futures_entries
