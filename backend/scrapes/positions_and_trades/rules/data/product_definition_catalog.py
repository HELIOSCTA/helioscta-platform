"""Python source of truth for position and trade product definitions."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class ProductDefinitionSpec:
    exchange_code: str
    rule_group: str
    rule_region: str
    exchange_code_underlying: str | None = None
    bbg_exchange_code: str | None = None
    default_exchange_name: str | None = None

    def as_json_row(self) -> dict[str, str | None]:
        return {
            "exchangeCode": self.exchange_code,
            "ruleGroup": self.rule_group,
            "ruleRegion": self.rule_region,
            "exchangeCodeUnderlying": self.exchange_code_underlying,
            "bbgExchangeCode": self.bbg_exchange_code,
            "defaultExchangeName": self.default_exchange_name,
        }


def product(
    exchange_code: str,
    rule_group: str,
    rule_region: str,
    *,
    underlying: str | None = None,
    bbg: str | None = None,
    exchange: str | None = None,
) -> ProductDefinitionSpec:
    return ProductDefinitionSpec(
        exchange_code,
        rule_group,
        rule_region,
        underlying,
        bbg,
        exchange,
    )


GAS_PRODUCTS = (
    product("HHD", "Gas", "Henry Hub", exchange="IFED"),
    product("NG", "Gas", "Henry Hub", bbg="NG", exchange="NYME"),
    product("HH", "Gas", "Henry Hub", bbg="IW", exchange="NYME"),
    product("HP", "Gas", "Henry Hub", bbg="ZA", exchange="NYME"),
    product("H", "Gas", "Henry Hub", exchange="IFED"),
    product("PHH", "Gas", "Henry Hub", exchange="IFED"),
    product("PHE", "Gas", "Henry Hub", underlying="NG", exchange="IFED"),
    product("LN", "Gas", "Henry Hub", underlying="NG", bbg="NG", exchange="NYME"),
    product("LN1", "Gas", "Henry Hub", underlying="NG", bbg="NGW", exchange="NYME"),
    product("LN2", "Gas", "Henry Hub", underlying="NG", bbg="NGW", exchange="NYME"),
    product("LN3", "Gas", "Henry Hub", underlying="NG", bbg="NGW", exchange="NYME"),
    product("LN4", "Gas", "Henry Hub", underlying="NG", bbg="NGW", exchange="NYME"),
    product("LN5", "Gas", "Henry Hub", underlying="NG", bbg="NGW", exchange="NYME"),
    product("JN1", "Gas", "Henry Hub", underlying="NG", exchange="NYME"),
    product("KN2", "Gas", "Henry Hub", underlying="NG", exchange="NYME"),
    product("KN3", "Gas", "Henry Hub", underlying="NG", exchange="NYME"),
    product("KN4", "Gas", "Henry Hub", underlying="NG", bbg="HZI", exchange="NYME"),
    product("G3", "Gas", "Henry Hub", underlying="NG", exchange="NYME"),
    product("G4", "Gas", "Henry Hub", underlying="NG", exchange="NYME"),
)

POWER_PRODUCTS = (
    product("PDP", "Power", "PJM", exchange="IFED"),
    product("PWA", "Power", "PJM", exchange="IFED"),
    product("DDP", "Power", "PJM", exchange="IFED"),
    product("PDA", "Power", "PJM", exchange="IFED"),
    product("PJL", "Power", "PJM", exchange="IFED"),
    product("PMI", "Power", "PJM", underlying="PMI", exchange="IFED"),
    product("P1X", "Power", "PJM", underlying="PMI", exchange="IFED"),
    product("OPJ", "Power", "PJM", exchange="IFED"),
    product("ODP", "Power", "PJM", exchange="IFED"),
    product("ERA", "Power", "ERCOT", exchange="IFED"),
    product("ERN", "Power", "ERCOT", exchange="IFED"),
    product("END", "Power", "ERCOT", exchange="IFED"),
    product("ECI", "Power", "ERCOT", exchange="IFED"),
    product("NEZ", "Power", "NEPOOL", exchange="IFED"),
    product("NEP", "Power", "NEPOOL", exchange="IFED"),
    product("SPM", "Power", "CAISO", exchange="IFED"),
    product("NPM", "Power", "CAISO", exchange="IFED"),
    product("MDC", "Power", "Mid-C", exchange="IFED"),
)

BASIS_PRODUCTS = (
    product("AEC", "Basis", "AECO", exchange="IFED"),
    product("ALQ", "Basis", "Algonquin", exchange="IFED"),
    product("CRI", "Basis", "CIG Rockies", exchange="IFED"),
    product("DGD", "Basis", "Chicago", exchange="IFED"),
    product("DOM", "Basis", "Eastern Gas South", exchange="IFED"),
    product("HXS", "Basis", "Houston Ship Channel", exchange="IFED"),
    product("UCS", "Basis", "Houston Ship Channel", exchange="IFED"),
    product("NTO", "Basis", "NGPL TXOK", exchange="IFED"),
    product("NWR", "Basis", "Northwest Rockies", exchange="IFED"),
    product("PGE", "Basis", "PG&E Citygate", exchange="IFED"),
    product("TMT", "Basis", "Tetco M3", exchange="IFED"),
    product("TRZ", "Basis", "Transco Zone 4", exchange="IFED"),
)

PRODUCT_DEFINITION_SPECS = (
    *GAS_PRODUCTS,
    *POWER_PRODUCTS,
    *BASIS_PRODUCTS,
)


def product_definition_rows() -> list[dict[str, str | None]]:
    """Return definition rows in the engine input shape."""
    return [spec.as_json_row() for spec in PRODUCT_DEFINITION_SPECS]
