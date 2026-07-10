"""Python source of truth for position and trade product aliases."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class ProductAliasSpec:
    source: str
    pattern: str
    exchange_code: str
    match_type: str = "exact"
    option_type: str | None = None

    def as_json_row(self) -> dict[str, str]:
        row = {
            "source": self.source,
            "matchType": self.match_type,
            "pattern": self.pattern,
            "exchangeCode": self.exchange_code,
        }
        if self.option_type is not None:
            row["optionType"] = self.option_type
        return row


def nav(
    pattern: str,
    exchange_code: str,
    *,
    match_type: str = "exact",
    option_type: str | None = None,
) -> ProductAliasSpec:
    return ProductAliasSpec("nav", pattern, exchange_code, match_type, option_type)


def clear_street(
    pattern: str,
    exchange_code: str,
    *,
    match_type: str = "exact",
    option_type: str | None = None,
) -> ProductAliasSpec:
    return ProductAliasSpec(
        "clear_street",
        pattern,
        exchange_code,
        match_type,
        option_type,
    )


GAS_ALIASES = (
    nav("^ICE NGAS HH SWG DLY DAY-[0-9]+$", "HHD", match_type="regex"),
    nav("ICE NGAS HH SWING DAILY", "HHD"),
    nav("NATURAL GAS", "NG"),
    nav("GLOBEX NATURAL GAS LD", "HH"),
    nav("NYMEX HENRY HUB FINANCIAL LDO", "HH"),
    nav("NYMEX HENRY HUB NATURAL GAS", "HP"),
    nav("HENRY PENULTIMATE NATURAL GAS", "HP"),
    nav("NATURAL GAS LD1 FUTURE", "H"),
    nav("HENRY HUB NATURAL GAS", "H"),
    nav("ICE PHH", "PHH"),
    nav("ICE PHE", "PHE", option_type="option"),
    nav("ICE HH EQ", "PHE", option_type="option"),
    nav("ICE NGAS PEN HENRY HUB", "PHE", option_type="option"),
    clear_street(
        "PHE-OPTION ON HENRY PENULTIMATE FIXED PRICE FUTURE",
        "PHE",
        option_type="option",
    ),
    nav("NYM EUR NATURAL GAS", "LN", option_type="option"),
    nav("NATURAL GAS CLEARPORT", "LN", option_type="option"),
    nav("NATURAL GAS FINANCIAL WEEK 1", "LN1", option_type="option"),
    nav("NATURAL GAS FINANCIAL WEEK 2", "LN2", option_type="option"),
    nav("NATURAL GAS FINANCIAL WEEK 3", "LN3", option_type="option"),
    nav("NATURAL GAS FINANCIAL WEEK 4", "LN4", option_type="option"),
    nav("NATURAL GAS FINANCIAL WEEK 5", "LN5", option_type="option"),
    nav("NATURAL GAS 3M CSO", "G3", option_type="option"),
    nav("NATURAL GAS FINANCIAL 1M SO", "G4", option_type="option"),
    nav("NATURAL GAS 1M CSO", "G4", option_type="option"),
)

POWER_ALIASES = (
    nav("ICE PJM WH RTD", "PDP"),
    nav("ICE PWA", "PWA"),
    nav("ICE PJMWHPKDAY", "PDA"),
    nav("ICE PJL", "PJL"),
    nav(
        "^ICE (PJM MINI|MINIPJMRT|PJM WHREAL TYM PK MINI)([-_][0-9]+)?$",
        "PMI",
        match_type="regex",
    ),
    nav("ICE PJM WHRT PEAK OPT_4096", "P1X", option_type="option"),
    clear_street(
        "PMI-OPTION ON PJM WESTERN HUB REAL-TIME PEAK MINI FIXED PRICE FUTURE",
        "P1X",
        option_type="option",
    ),
    nav("^ICE PJM OFF PK[-_][0-9]+$", "OPJ", match_type="regex"),
    nav("ICE ERA", "ERA"),
    nav("ERCOT N 345 KV RT PEAK DLY", "ERN"),
    nav("^ICE ERCOT NORTH 345KV 7X8[-_][0-9]+$", "ECI", match_type="regex"),
    nav(
        "^(ISO ENG MASS HUB D-PK-[0-9]+|ICE NEPOOL PK MNTH-[0-9]+)$",
        "NEP",
        match_type="regex",
    ),
    nav("^ICE SP 15 PEAK([_-][0-9]+)?$", "SPM", match_type="regex"),
    nav("^ICE NP 15 PEAK([_-][0-9]+)?$", "NPM", match_type="regex"),
    nav("^ICE MID-C PEAK([_-][0-9]+)?$", "MDC", match_type="regex"),
)

BASIS_ALIASES = (
    nav("AB NIT BASIS FUTURE", "AEC"),
    nav("ICE ALQCTYGTSW", "ALQ"),
    nav("ICE CIG ROCKIES BASIS", "CRI"),
    nav("ICE CHICAGO BASIS FUT", "DGD"),
    nav("ICE EASTERN GAS SOUTH BASIS FU", "DOM"),
    nav("ICE HSC BASIS", "HXS"),
    nav("NGPL TXOK BASIS FUTURE", "NTO"),
    nav("ICE NGAS NYM NWP RK", "NWR"),
    nav("ICE NGAS NYM PG&E", "PGE"),
    nav("ICE TETCO SWP", "TMT"),
    nav("ICE TRANSCO STATION 85 ZONE 4", "TRZ"),
    nav("ICE TCOZN4BASI", "TRZ"),
)

PRODUCT_ALIAS_SPECS = (
    *GAS_ALIASES,
    *POWER_ALIASES,
    *BASIS_ALIASES,
)


def product_alias_rows() -> list[dict[str, str]]:
    """Return alias rows in the engine input shape."""
    return [spec.as_json_row() for spec in PRODUCT_ALIAS_SPECS]
