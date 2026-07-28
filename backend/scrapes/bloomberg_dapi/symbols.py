from __future__ import annotations

import logging
from dataclasses import asdict, dataclass

from backend.scrapes.bloomberg_dapi.config import DEFAULT_FIELD

logger = logging.getLogger(__name__)

METADATA_COLUMNS = [
    "security",
    "description",
    "category",
    "subcategory",
    "region",
    "market",
    "commodity",
    "unit",
    "frequency",
    "default_data_type",
    "metadata_source",
    "metadata_notes",
]


@dataclass(frozen=True)
class SecurityMetadata:
    security: str
    description: str
    category: str
    subcategory: str
    region: str
    market: str
    commodity: str
    unit: str | None
    metadata_notes: str = ""
    frequency: str = "daily"
    default_data_type: str = DEFAULT_FIELD
    metadata_source: str = "helios_legacy_registry_enriched"


def _meta(
    security: str,
    description: str,
    category: str,
    subcategory: str,
    region: str,
    market: str,
    *,
    commodity: str = "natural_gas",
    unit: str | None = "Bcf/d",
    metadata_notes: str = "",
) -> SecurityMetadata:
    return SecurityMetadata(
        security=security,
        description=description,
        category=category,
        subcategory=subcategory,
        region=region,
        market=market,
        commodity=commodity,
        unit=unit,
        metadata_notes=metadata_notes,
    )


SECURITY_METADATA: list[SecurityMetadata] = [
    # Weather
    _meta(
        "HISTCNGC Index",
        "Gas cooling degree days",
        "weather",
        "cooling_degree_days",
        "us",
        "gas_weather",
        commodity="weather",
        unit="degree_days",
    ),
    _meta(
        "HISTCNGH Index",
        "Gas heating degree days",
        "weather",
        "heating_degree_days",
        "us",
        "gas_weather",
        commodity="weather",
        unit="degree_days",
    ),
    _meta(
        "HISTCNEH Index",
        "Electric heating degree days",
        "weather",
        "heating_degree_days",
        "us",
        "power_weather",
        commodity="weather",
        unit="degree_days",
    ),
    _meta(
        "HISTCNEC Index",
        "Electric cooling degree days",
        "weather",
        "cooling_degree_days",
        "us",
        "power_weather",
        commodity="weather",
        unit="degree_days",
    ),
    # Production
    _meta("GSPRODUS Index", "US dry gas production", "supply", "production", "us", "gas_balances"),
    _meta("GSPRDBAK Index", "Bakken gas production", "supply", "production", "bakken", "gas_balances"),
    _meta("GSPRDHNV Index", "Haynesville gas production", "supply", "production", "haynesville", "gas_balances"),
    _meta("GSPRDGLF Index", "Gulf region gas production", "supply", "production", "gulf", "gas_balances"),
    _meta("GSPRDPRM Index", "Permian gas production", "supply", "production", "permian", "gas_balances"),
    _meta("GSPRDAPP Index", "Appalachia gas production", "supply", "production", "appalachia", "gas_balances"),
    _meta("GSPRDMCN Index", "Midcontinent gas production", "supply", "production", "midcontinent", "gas_balances"),
    _meta("GSPRDMEA Index", "Midwest East gas production", "supply", "production", "midwest_east", "gas_balances"),
    _meta("GSPRDMWE Index", "Midwest West gas production", "supply", "production", "midwest_west", "gas_balances"),
    _meta("GSPRDNEN Index", "Northeast North gas production", "supply", "production", "northeast_north", "gas_balances"),
    _meta("GSPRDNEA Index", "Northeast Appalachia gas production", "supply", "production", "northeast_appalachia", "gas_balances"),
    _meta("GSPRDPNW Index", "Pacific Northwest gas production", "supply", "production", "pacific_northwest", "gas_balances"),
    _meta("GSPRDROC Index", "Rockies gas production", "supply", "production", "rockies", "gas_balances"),
    _meta("GSPRDSEA Index", "Southeast gas production", "supply", "production", "southeast", "gas_balances"),
    _meta("GSPRDSWE Index", "Southwest gas production", "supply", "production", "southwest", "gas_balances"),
    # Canada imports
    _meta("GSFLCTOT Index", "Canada gas imports", "cross_border_flow", "canada_import", "canada_to_us", "gas_balances"),
    _meta("GSFLCANE Index", "Canada imports to Northeast", "cross_border_flow", "canada_import", "northeast", "gas_balances"),
    _meta("GSFLCAEN Index", "Canada imports to New England", "cross_border_flow", "canada_import", "new_england", "gas_balances"),
    _meta("GSFLCAWW Index", "Canada imports to Midwest", "cross_border_flow", "canada_import", "midwest", "gas_balances"),
    _meta("GSFLCAMW Index", "Canada imports to Michigan", "cross_border_flow", "canada_import", "michigan", "gas_balances"),
    _meta("GSFLCABA Index", "Canada imports to Bakken", "cross_border_flow", "canada_import", "bakken", "gas_balances"),
    _meta("GSFLCAPN Index", "Canada imports to Pacific Northwest", "cross_border_flow", "canada_import", "pacific_northwest", "gas_balances"),
    # Demand
    _meta("GSDEDUSP Index", "US natural gas power burn", "demand", "power_burn", "us", "gas_balances"),
    _meta("GSDEDUSI Index", "US industrial natural gas demand", "demand", "industrial", "us", "gas_balances"),
    _meta("GSDEDUSR Index", "US residential and commercial natural gas demand", "demand", "residential_commercial", "us", "gas_balances"),
    _meta("GSDEDUSF Index", "US natural gas plant fuel demand", "demand", "plant_fuel", "us", "gas_balances"),
    _meta("GSDEDUSD Index", "US natural gas pipe loss demand", "demand", "pipe_loss", "us", "gas_balances"),
    # Mexico exports
    _meta("GSFLUSMX Index", "US natural gas exports to Mexico", "cross_border_flow", "mexico_export", "us_to_mexico", "gas_balances"),
    _meta(
        "GSFLSCMX Index",
        "US natural gas exports to Mexico route 1",
        "cross_border_flow",
        "mexico_export",
        "unknown_mexico_route_1",
        "gas_balances",
        metadata_notes="Legacy registry did not include a route label; validate with Bloomberg reference fields.",
    ),
    _meta(
        "GSFLMNMX Index",
        "US natural gas exports to Mexico route 2",
        "cross_border_flow",
        "mexico_export",
        "unknown_mexico_route_2",
        "gas_balances",
        metadata_notes="Legacy registry did not include a route label; validate with Bloomberg reference fields.",
    ),
    _meta(
        "GSFLPAMX Index",
        "US natural gas exports to Mexico route 3",
        "cross_border_flow",
        "mexico_export",
        "unknown_mexico_route_3",
        "gas_balances",
        metadata_notes="Legacy registry did not include a route label; validate with Bloomberg reference fields.",
    ),
    # LNG
    _meta("GSLIQTOT Index", "US LNG feedgas", "demand", "lng_feedgas", "us", "lng"),
    _meta("GSLIQSPI Index", "Sabine Pass LNG feedgas", "demand", "lng_feedgas", "sabine_pass", "lng"),
    _meta("GSLIQCAM Index", "Cameron LNG feedgas", "demand", "lng_feedgas", "cameron", "lng"),
    _meta("GSLIQCCH Index", "Corpus Christi LNG feedgas", "demand", "lng_feedgas", "corpus_christi", "lng"),
    _meta("GSLIQCOV Index", "Cove Point LNG feedgas", "demand", "lng_feedgas", "cove_point", "lng"),
    _meta("GSLIQELB Index", "Elba Island LNG feedgas", "demand", "lng_feedgas", "elba_island", "lng"),
    _meta("GSLIQFPT Index", "Freeport LNG feedgas", "demand", "lng_feedgas", "freeport", "lng"),
    _meta("GSLIQCLC Index", "Calcasieu Pass LNG feedgas", "demand", "lng_feedgas", "calcasieu_pass", "lng"),
    _meta("GSLIQPLQ Index", "Plaquemines LNG feedgas", "demand", "lng_feedgas", "plaquemines", "lng"),
    # Storage
    _meta(
        "GSFLDUSS Index",
        "US natural gas storage",
        "storage",
        "storage",
        "us",
        "gas_balances",
        unit=None,
        metadata_notes="Storage unit should be validated with Bloomberg reference fields before downstream unit-sensitive use.",
    ),
    # Salts
    _meta(
        "GSTMSMPL Index",
        "Salt storage sample",
        "storage",
        "salt_storage",
        "us",
        "gas_balances",
        unit=None,
        metadata_notes="Legacy label was SALT; validate exact Bloomberg description and unit before downstream unit-sensitive use.",
    ),
    # Spot prices
    _meta(
        "NGNEZN5S BNGC Index",
        "Natural gas spot price: NGNEZN5S",
        "spot_price",
        "cash_price",
        "unmapped",
        "natural_gas_cash",
        unit="USD/MMBtu",
        metadata_notes="Legacy registry did not include a market label; Bloomberg reference fields should provide the authoritative name.",
    ),
    _meta(
        "NGCGNYNY Index",
        "Natural gas spot price: NGCGNYNY",
        "spot_price",
        "cash_price",
        "unmapped",
        "natural_gas_cash",
        unit="USD/MMBtu",
        metadata_notes="Legacy registry did not include a market label; Bloomberg reference fields should provide the authoritative name.",
    ),
    _meta(
        "NGGCTR85 BNGC Index",
        "Natural gas spot price: NGGCTR85",
        "spot_price",
        "cash_price",
        "unmapped",
        "natural_gas_cash",
        unit="USD/MMBtu",
        metadata_notes="Legacy registry did not include a market label; Bloomberg reference fields should provide the authoritative name.",
    ),
    _meta("NGUSHHUB BNGC Index", "Henry Hub natural gas spot price", "spot_price", "cash_price", "henry_hub", "natural_gas_cash", unit="USD/MMBtu"),
    _meta(
        "NGGCHOUS BNGC Index",
        "Natural gas spot price: NGGCHOUS",
        "spot_price",
        "cash_price",
        "unmapped",
        "natural_gas_cash",
        unit="USD/MMBtu",
        metadata_notes="Legacy registry did not include a market label; Bloomberg reference fields should provide the authoritative name.",
    ),
    _meta(
        "NGTXOASI BNGC Index",
        "Natural gas spot price: NGTXOASI",
        "spot_price",
        "cash_price",
        "unmapped",
        "natural_gas_cash",
        unit="USD/MMBtu",
        metadata_notes="Legacy registry did not include a market label; Bloomberg reference fields should provide the authoritative name.",
    ),
    _meta(
        "NAGANGPL BNGC Index",
        "Natural gas spot price: NAGANGPL",
        "spot_price",
        "cash_price",
        "unmapped",
        "natural_gas_cash",
        unit="USD/MMBtu",
        metadata_notes="Legacy registry did not include a market label; Bloomberg reference fields should provide the authoritative name.",
    ),
    _meta(
        "NGRMNWRM BNGC Index",
        "Natural gas spot price: NGRMNWRM",
        "spot_price",
        "cash_price",
        "unmapped",
        "natural_gas_cash",
        unit="USD/MMBtu",
        metadata_notes="Legacy registry did not include a market label; Bloomberg reference fields should provide the authoritative name.",
    ),
    _meta(
        "NGWCPGSP BNGC Index",
        "Natural gas spot price: NGWCPGSP",
        "spot_price",
        "cash_price",
        "unmapped",
        "natural_gas_cash",
        unit="USD/MMBtu",
        metadata_notes="Legacy registry did not include a market label; Bloomberg reference fields should provide the authoritative name.",
    ),
    _meta(
        "NGWCPGNE BNGC Index",
        "Natural gas spot price: NGWCPGNE",
        "spot_price",
        "cash_price",
        "unmapped",
        "natural_gas_cash",
        unit="USD/MMBtu",
        metadata_notes="Legacy registry did not include a market label; Bloomberg reference fields should provide the authoritative name.",
    ),
    _meta(
        "NGWCSCAL BNGC Index",
        "Natural gas spot price: NGWCSCAL",
        "spot_price",
        "cash_price",
        "unmapped",
        "natural_gas_cash",
        unit="USD/MMBtu",
        metadata_notes="Legacy registry did not include a market label; Bloomberg reference fields should provide the authoritative name.",
    ),
    _meta(
        "NGWCSCCG BNGC Index",
        "Natural gas spot price: NGWCSCCG",
        "spot_price",
        "cash_price",
        "unmapped",
        "natural_gas_cash",
        unit="USD/MMBtu",
        metadata_notes="Legacy registry did not include a market label; Bloomberg reference fields should provide the authoritative name.",
    ),
    _meta(
        "NGCGBOST BNGC Index",
        "Natural gas spot price: NGCGBOST",
        "spot_price",
        "cash_price",
        "unmapped",
        "natural_gas_cash",
        unit="USD/MMBtu",
        metadata_notes="Legacy registry did not include a market label; Bloomberg reference fields should provide the authoritative name.",
    ),
    _meta(
        "NGNEAGNG BNGC Index",
        "Natural gas spot price: NGNEAGNG",
        "spot_price",
        "cash_price",
        "unmapped",
        "natural_gas_cash",
        unit="USD/MMBtu",
        metadata_notes="Legacy registry did not include a market label; Bloomberg reference fields should provide the authoritative name.",
    ),
]

SECURITY_DESCRIPTIONS: list[tuple[str, str]] = [
    (item.security, item.description) for item in SECURITY_METADATA
]


def get_security_metadata() -> list[dict[str, str | None]]:
    """Return fixed Bloomberg security metadata records."""
    records = [asdict(item) for item in SECURITY_METADATA]
    logger.info("Loaded %d Bloomberg metadata records from fixed symbol list", len(records))
    return records


def get_securities() -> list[str]:
    """Return the fixed Bloomberg ticker universe."""
    tickers = [item.security for item in SECURITY_METADATA]
    logger.info("Loaded %d Bloomberg securities from fixed symbol list", len(tickers))
    return tickers


def get_security_descriptions() -> list[tuple[str, str]]:
    """Return fixed `(security, description)` pairs."""
    return SECURITY_DESCRIPTIONS.copy()


def get_security_fields(data_type: str = DEFAULT_FIELD) -> list[tuple[str, str]]:
    """Return fixed `(security, data_type)` pairs for historical pulls."""
    return [(item.security, data_type) for item in SECURITY_METADATA]
