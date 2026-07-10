"""Python equivalent of the frontend position product rule engine."""

from __future__ import annotations

import calendar
import math
import re
from dataclasses import dataclass
from typing import Any, Mapping

from backend.scrapes.positions_and_trades.rules.engine.product_lookup import (
    ProductLookupMatch,
    normalize_product_text,
    resolve_product_lookup,
)


@dataclass(frozen=True)
class ProductRuleInput:
    source: str = "nav"
    product: str | None = None
    exchange_code: str | None = None
    exchange_name: str | None = None
    month_year: str | None = None
    contract_yyyymm: str | int | None = None
    contract_year: str | int | None = None
    contract_month: str | int | None = None
    contract_day: str | int | None = None
    prompt_day: str | int | None = None
    trade_date: str | None = None
    call_put: str | None = None
    type: str | None = None
    strike_price: str | int | float | None = None

    @classmethod
    def from_mapping(cls, values: Mapping[str, Any]) -> "ProductRuleInput":
        return cls(
            source=str(_mapping_value(values, "source") or "nav"),
            product=_optional_str(_mapping_value(values, "product")),
            exchange_code=_optional_str(
                _mapping_value(values, "exchange_code", "exchangeCode")
            ),
            exchange_name=_optional_str(
                _mapping_value(values, "exchange_name", "exchangeName")
            ),
            month_year=_optional_str(_mapping_value(values, "month_year", "monthYear")),
            contract_yyyymm=_mapping_value(
                values,
                "contract_yyyymm",
                "contractYyyymm",
            ),
            contract_year=_mapping_value(values, "contract_year", "contractYear"),
            contract_month=_mapping_value(values, "contract_month", "contractMonth"),
            contract_day=_mapping_value(values, "contract_day", "contractDay"),
            prompt_day=_mapping_value(values, "prompt_day", "promptDay"),
            trade_date=_optional_str(_mapping_value(values, "trade_date", "tradeDate")),
            call_put=_optional_str(_mapping_value(values, "call_put", "callPut")),
            type=_optional_str(_mapping_value(values, "type")),
            strike_price=_mapping_value(values, "strike_price", "strikePrice"),
        )


@dataclass(frozen=True)
class ContractRuleFields:
    contract_month: str | None
    contract_yyyymm: str | None
    contract_yyyymmdd: str | None
    contract_year: int | None
    contract_month_number: int | None
    contract_day: int | None
    futures_month_code: str | None
    futures_month_code_y: str | None
    futures_month_code_yy: str | None


@dataclass(frozen=True)
class ProductRuleResult:
    lookup: ProductLookupMatch | None
    product_code: str | None
    exchange_name: str | None
    exchange_code: str | None
    rule_group: str | None
    rule_region: str | None
    product_code_underlying: str | None
    bbg_exchange_code: str | None
    is_option: bool
    put_call: str | None
    strike_price: float | None
    contract_month: str | None
    contract_yyyymm: str | None
    contract_yyyymmdd: str | None
    contract_year: int | None
    contract_month_number: int | None
    contract_day: int | None
    futures_month_code: str | None
    futures_month_code_y: str | None
    futures_month_code_yy: str | None
    ice_xl_symbol: str | None
    ice_xl_symbol_underlying: str | None
    cme_excel_symbol: str | None
    bbg_symbol: str | None
    bbg_option_description: str | None


FUTURES_MONTH_CODES = {
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

MONTH_ABBREVIATIONS = {
    "JAN": 1,
    "FEB": 2,
    "MAR": 3,
    "APR": 4,
    "MAY": 5,
    "JUN": 6,
    "JUL": 7,
    "AUG": 8,
    "SEP": 9,
    "OCT": 10,
    "NOV": 11,
    "DEC": 12,
}

SHORT_TERM_POWER_RT_CODES = {"PDP", "PWA", "DDP"}
CME_GAS_FUTURE_CODES = {"HP", "PHH", "HH", "H", "NG"}
CME_GAS_OPTION_CODES = {"LN", "PHE"}
CME_WEEKLY_OPTION_CODES = {"LN1", "LN2", "LN3", "LN4", "LN5"}
CME_DAILY_OPTION_CODES = {"JN1", "KN2", "KN3", "KN4"}
CME_CAL_SPREAD_CODES = {"G3", "G4"}


def parse_contract_fields(
    input_value: ProductRuleInput | Mapping[str, Any],
) -> ContractRuleFields:
    rule_input = coerce_product_rule_input(input_value)
    month_year = _null_if_blank(rule_input.month_year)

    if month_year:
        date_match = re.match(r"^(\d{1,2})/(\d{1,2})/(\d{4})$", month_year)
        if date_match:
            month = int(date_match.group(1))
            day = int(date_match.group(2))
            year = int(date_match.group(3))
            if _is_valid_date_parts(year, month, day):
                return _contract_fields_from_parts(year, month, day)

        month_code_match = re.match(r"^([A-Za-z]{3})(\d{2})$", month_year)
        if month_code_match:
            month = MONTH_ABBREVIATIONS.get(month_code_match.group(1).upper())
            year = _full_year_from_two_digits(int(month_code_match.group(2)))
            if month is not None:
                return _contract_fields_from_parts(year, month, None)

    yyyymm_text = str(rule_input.contract_yyyymm or "").strip()
    if re.match(r"^\d{6}$", yyyymm_text):
        return _contract_fields_from_parts(
            int(yyyymm_text[:4]),
            int(yyyymm_text[4:6]),
            _parse_integer(_coalesce(rule_input.contract_day, rule_input.prompt_day)),
        )

    return _contract_fields_from_parts(
        _parse_integer(rule_input.contract_year),
        _parse_integer(rule_input.contract_month),
        _parse_integer(_coalesce(rule_input.contract_day, rule_input.prompt_day)),
    )


def normalize_put_call(value: str | None) -> str | None:
    normalized = _normalize_code(value)
    if normalized in {"CALL", "C"}:
        return "C"
    if normalized in {"PUT", "P"}:
        return "P"
    return None


def normalize_exchange_name(value: str | None) -> str | None:
    normalized = _normalize_code(value)
    if normalized in {"NYM", "NYME"}:
        return "NYME"
    if normalized in {"IFE", "IPE", "IFED"}:
        return "IFED"
    return None


def find_product_lookup(
    input_value: ProductRuleInput | Mapping[str, Any],
    is_option: bool | None = None,
) -> ProductLookupMatch | None:
    rule_input = coerce_product_rule_input(input_value)
    resolved_is_option = (
        _is_option_input(rule_input, normalize_put_call(rule_input.call_put))
        if is_option is None
        else is_option
    )
    return resolve_product_lookup(
        source=_alias_source_for_rule_source(rule_input.source),
        product_name=rule_input.product,
        exchange_code=rule_input.exchange_code,
        is_option=resolved_is_option,
    )


def normalize_position_product(
    input_value: ProductRuleInput | Mapping[str, Any],
) -> ProductRuleResult:
    rule_input = coerce_product_rule_input(input_value)
    contract = parse_contract_fields(rule_input)
    put_call = normalize_put_call(rule_input.call_put)
    is_option = _is_option_input(rule_input, put_call)
    lookup = find_product_lookup(rule_input, is_option)
    exchange_code = lookup.definition.exchange_code if lookup else None
    strike_price_raw = _parse_number(rule_input.strike_price)
    strike_price = None if strike_price_raw is None else _round_to(strike_price_raw, 3)
    exchange_name = (
        normalize_exchange_name(rule_input.exchange_name)
        or (lookup.definition.default_exchange_name if lookup else None)
    )
    product_code_underlying = (
        lookup.definition.exchange_code_underlying if is_option and lookup else None
    )
    bbg_exchange_code = lookup.definition.bbg_exchange_code if lookup else None

    return ProductRuleResult(
        lookup=lookup,
        product_code=exchange_code,
        exchange_name=exchange_name,
        exchange_code=exchange_code,
        rule_group=lookup.definition.rule_group if lookup else None,
        rule_region=lookup.definition.rule_region if lookup else None,
        product_code_underlying=product_code_underlying,
        bbg_exchange_code=bbg_exchange_code,
        is_option=is_option,
        put_call=put_call,
        strike_price=strike_price,
        contract_month=contract.contract_month,
        contract_yyyymm=contract.contract_yyyymm,
        contract_yyyymmdd=contract.contract_yyyymmdd,
        contract_year=contract.contract_year,
        contract_month_number=contract.contract_month_number,
        contract_day=contract.contract_day,
        futures_month_code=contract.futures_month_code,
        futures_month_code_y=contract.futures_month_code_y,
        futures_month_code_yy=contract.futures_month_code_yy,
        ice_xl_symbol=_build_ice_xl_symbol(
            exchange_code=exchange_code,
            exchange_name=exchange_name,
            is_option=is_option,
            contract_day=contract.contract_day,
            futures_month_code_yy=contract.futures_month_code_yy,
            put_call=put_call,
            strike_price=strike_price,
        ),
        ice_xl_symbol_underlying=_build_ice_xl_symbol_underlying(
            exchange_name=exchange_name,
            is_option=is_option,
            product_code_underlying=product_code_underlying,
            futures_month_code_yy=contract.futures_month_code_yy,
        ),
        cme_excel_symbol=_build_cme_excel_symbol(
            exchange_code=exchange_code,
            contract_yyyymm=contract.contract_yyyymm,
            put_call=put_call,
            strike_price=strike_price,
        ),
        bbg_symbol=(
            _build_nav_bloomberg_symbol(
                bbg_exchange_code=bbg_exchange_code,
                exchange_code=exchange_code,
                is_option=is_option,
                futures_month_code_y=contract.futures_month_code_y,
                put_call=put_call,
                strike_price=strike_price,
            )
            if rule_input.source == "nav"
            else _build_trade_bloomberg_symbol(
                bbg_exchange_code=bbg_exchange_code,
                exchange_code=exchange_code,
                futures_month_code_y=contract.futures_month_code_y,
                futures_month_code_yy=contract.futures_month_code_yy,
                put_call=put_call,
                strike_price=strike_price,
            )
        ),
        bbg_option_description=_build_bbg_option_description(
            source=rule_input.source,
            exchange_code=exchange_code,
            is_option=is_option,
            put_call=put_call,
            strike_price=strike_price,
            contract_year=contract.contract_year,
            contract_month_number=contract.contract_month_number,
        ),
    )


def normalize_nav_position_product(
    input_value: ProductRuleInput | Mapping[str, Any] | None = None,
    **overrides: Any,
) -> ProductRuleResult:
    values = _input_as_mapping(input_value)
    values.update(overrides)
    values["source"] = "nav"
    return normalize_position_product(values)


def coerce_product_rule_input(
    input_value: ProductRuleInput | Mapping[str, Any],
) -> ProductRuleInput:
    if isinstance(input_value, ProductRuleInput):
        return input_value
    return ProductRuleInput.from_mapping(input_value)


def _input_as_mapping(
    input_value: ProductRuleInput | Mapping[str, Any] | None,
) -> dict[str, Any]:
    if input_value is None:
        return {}
    if isinstance(input_value, ProductRuleInput):
        return {
            "source": input_value.source,
            "product": input_value.product,
            "exchange_code": input_value.exchange_code,
            "exchange_name": input_value.exchange_name,
            "month_year": input_value.month_year,
            "contract_yyyymm": input_value.contract_yyyymm,
            "contract_year": input_value.contract_year,
            "contract_month": input_value.contract_month,
            "contract_day": input_value.contract_day,
            "prompt_day": input_value.prompt_day,
            "trade_date": input_value.trade_date,
            "call_put": input_value.call_put,
            "type": input_value.type,
            "strike_price": input_value.strike_price,
        }
    return dict(input_value)


def _null_if_blank(value: str | None) -> str | None:
    trimmed = value.strip() if value is not None else ""
    return trimmed or None


def _normalize_lookup_text(value: str | None) -> str | None:
    return normalize_product_text(value)


def _normalize_code(value: str | None) -> str | None:
    trimmed = _null_if_blank(value)
    return trimmed.upper() if trimmed else None


def _parse_integer(value: str | int | float | None) -> int | None:
    if value is None or value == "":
        return None
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return int(value) if value.is_integer() else None
    match = re.match(r"^[+-]?\d+", str(value).strip())
    return int(match.group(0)) if match else None


def _parse_number(value: str | int | float | None) -> float | None:
    if value is None or value == "":
        return None
    if isinstance(value, bool):
        return None
    if isinstance(value, int | float):
        parsed = float(value)
    else:
        text = str(value).strip()
        if not text:
            return None
        try:
            parsed = float(text)
        except ValueError:
            return None
    return parsed if math.isfinite(parsed) else None


def _round_to(value: float, digits: int) -> float:
    factor = 10**digits
    return _js_round(value * factor) / factor


def _js_round(value: float) -> int:
    return math.floor(value + 0.5)


def _pad2(value: int) -> str:
    return str(value).zfill(2)


def _is_valid_date_parts(year: int, month: int, day: int) -> bool:
    if year < 1900 or year > 2199 or month < 1 or month > 12:
        return False
    return 1 <= day <= calendar.monthrange(year, month)[1]


def _full_year_from_two_digits(year: int) -> int:
    return 1900 + year if year >= 70 else 2000 + year


def _empty_contract_fields() -> ContractRuleFields:
    return ContractRuleFields(
        contract_month=None,
        contract_yyyymm=None,
        contract_yyyymmdd=None,
        contract_year=None,
        contract_month_number=None,
        contract_day=None,
        futures_month_code=None,
        futures_month_code_y=None,
        futures_month_code_yy=None,
    )


def _contract_fields_from_parts(
    year: int | None,
    month: int | None,
    day: int | None,
) -> ContractRuleFields:
    if year is None or month is None or month < 1 or month > 12:
        return _empty_contract_fields()

    valid_day = day if day is not None and _is_valid_date_parts(year, month, day) else None
    month_padded = _pad2(month)
    contract_yyyymm = f"{year}{month_padded}"
    futures_month_code = FUTURES_MONTH_CODES.get(month)
    year_text = str(year)

    return ContractRuleFields(
        contract_month=f"{year}-{month_padded}",
        contract_yyyymm=contract_yyyymm,
        contract_yyyymmdd=(
            f"{contract_yyyymm}{_pad2(valid_day)}" if valid_day is not None else None
        ),
        contract_year=year,
        contract_month_number=month,
        contract_day=valid_day,
        futures_month_code=futures_month_code,
        futures_month_code_y=(
            f"{futures_month_code}{year_text[-1:]}" if futures_month_code else None
        ),
        futures_month_code_yy=(
            f"{futures_month_code}{year_text[-2:]}" if futures_month_code else None
        ),
    )


def _alias_source_for_rule_source(source: str) -> str:
    if source == "marex":
        return "marex"
    if source in {"clear_street", "clearStreet"}:
        return "clear_street"
    return "nav"


def _is_option_input(rule_input: ProductRuleInput, put_call: str | None) -> bool:
    normalized_type = _normalize_lookup_text(rule_input.type)
    return put_call is not None or (
        normalized_type is not None and "OPTION" in normalized_type
    )


def _format_strike(value: float | None) -> str | None:
    if value is None:
        return None
    return f"{value:.3f}".rstrip("0").rstrip(".")


def _format_ice_strike(value: float | None) -> str | None:
    if value is None:
        return None
    return str(_js_round(value))


def _format_option_description_strike(value: float | None) -> str | None:
    if value is None:
        return None
    return f"{value:.2f}"


def _month_name(month: int | None) -> str | None:
    if month is None or month < 1 or month > 12:
        return None
    for name, value in MONTH_ABBREVIATIONS.items():
        if value == month:
            return name
    return None


def _build_ice_xl_symbol(
    *,
    exchange_code: str | None,
    exchange_name: str | None,
    is_option: bool,
    contract_day: int | None,
    futures_month_code_yy: str | None,
    put_call: str | None,
    strike_price: float | None,
) -> str | None:
    if exchange_code is None:
        return None

    if exchange_name == "IFED" and exchange_code == "HHD":
        return f"{exchange_code} B0-IUS"

    if exchange_code in SHORT_TERM_POWER_RT_CODES:
        return f"{exchange_code} D0-IUS"

    if exchange_name != "IFED" or not futures_month_code_yy:
        return None

    if is_option and put_call and strike_price is not None:
        return (
            f"{exchange_code} {futures_month_code_yy}{put_call}"
            f"{_format_ice_strike(strike_price)}-IUS"
        )

    if not is_option and contract_day is None:
        return f"{exchange_code} {futures_month_code_yy}-IUS"

    return None


def _build_ice_xl_symbol_underlying(
    *,
    exchange_name: str | None,
    is_option: bool,
    product_code_underlying: str | None,
    futures_month_code_yy: str | None,
) -> str | None:
    if (
        exchange_name != "IFED"
        or not is_option
        or not product_code_underlying
        or not futures_month_code_yy
    ):
        return None
    return f"{product_code_underlying} {futures_month_code_yy}-IUS"


def _build_cme_excel_symbol(
    *,
    exchange_code: str | None,
    contract_yyyymm: str | None,
    put_call: str | None,
    strike_price: float | None,
) -> str | None:
    if not exchange_code or not contract_yyyymm:
        return None

    if exchange_code in CME_GAS_FUTURE_CODES:
        return f"1|G|XNYM:F:NG:{contract_yyyymm}"

    strike = _format_strike(strike_price)
    if not put_call or strike is None:
        return None

    if exchange_code in CME_GAS_OPTION_CODES:
        return f"1|G|XNYM:O:LN:{contract_yyyymm}:{put_call}:{strike}"

    if exchange_code in CME_WEEKLY_OPTION_CODES:
        return (
            f"1|G|XNYM:O:KN{exchange_code[2:]}:"
            f"{contract_yyyymm}:{put_call}:{strike}"
        )

    if exchange_code in CME_DAILY_OPTION_CODES:
        return f"1|G|XNYM:O:{exchange_code}:{contract_yyyymm}:{put_call}:{strike}"

    if exchange_code in CME_CAL_SPREAD_CODES:
        return "CAL_SPREAD_CME_EXCEL_CODE"

    return None


def _build_nav_bloomberg_symbol(
    *,
    bbg_exchange_code: str | None,
    exchange_code: str | None,
    is_option: bool,
    futures_month_code_y: str | None,
    put_call: str | None,
    strike_price: float | None,
) -> str | None:
    strike = _format_strike(strike_price)
    if (
        not is_option
        or not bbg_exchange_code
        or not exchange_code
        or not futures_month_code_y
        or not put_call
        or strike is None
    ):
        return None

    if exchange_code in CME_GAS_OPTION_CODES:
        return f"{bbg_exchange_code}{futures_month_code_y}{put_call} {strike}"

    return None


def _build_trade_bloomberg_symbol(
    *,
    bbg_exchange_code: str | None,
    exchange_code: str | None,
    futures_month_code_y: str | None,
    futures_month_code_yy: str | None,
    put_call: str | None,
    strike_price: float | None,
) -> str | None:
    if not bbg_exchange_code or not exchange_code:
        return None
    strike = _format_strike(strike_price)

    if exchange_code == "HP" and bbg_exchange_code == "ZA" and futures_month_code_y:
        return f"{bbg_exchange_code}{futures_month_code_y} COMDTY"

    if exchange_code == "HH" and bbg_exchange_code == "IW" and futures_month_code_y:
        return f"{bbg_exchange_code}{futures_month_code_y} COMDTY"

    if exchange_code == "NG" and bbg_exchange_code == "NG" and futures_month_code_yy:
        return f"{bbg_exchange_code}{futures_month_code_yy} COMDTY"

    if (
        exchange_code in CME_GAS_OPTION_CODES
        and bbg_exchange_code == "NG"
        and futures_month_code_y
        and put_call
        and strike
    ):
        return f"{bbg_exchange_code}{futures_month_code_y}{put_call} {strike} COMDTY"

    if (
        exchange_code in CME_WEEKLY_OPTION_CODES
        and futures_month_code_yy
        and put_call
        and strike
    ):
        return (
            f"{bbg_exchange_code}{futures_month_code_yy}{put_call}"
            f"{exchange_code[2:]} {strike} COMB"
        )

    if (
        exchange_code in CME_DAILY_OPTION_CODES
        and futures_month_code_yy
        and put_call
        and strike
    ):
        return (
            f"{bbg_exchange_code}{futures_month_code_yy}{put_call}"
            f"{exchange_code[2:]} {strike} Comdty"
        )

    return None


def _build_bbg_option_description(
    *,
    source: str,
    exchange_code: str | None,
    is_option: bool,
    put_call: str | None,
    strike_price: float | None,
    contract_year: int | None,
    contract_month_number: int | None,
) -> str | None:
    if source != "nav" or not is_option or not exchange_code or not put_call:
        return None

    month = _month_name(contract_month_number)
    strike = _format_option_description_strike(strike_price)
    if not month or contract_year is None or strike is None:
        return None

    direction = "CALL" if put_call == "C" else "PUT"

    if exchange_code in CME_GAS_OPTION_CODES:
        return f"{direction} {month} {contract_year} {strike}"

    if exchange_code in CME_WEEKLY_OPTION_CODES:
        return (
            f"{direction} {month} {contract_year} "
            f"WKLY WEEK{exchange_code[2:]} {strike}"
        )

    if exchange_code in CME_CAL_SPREAD_CODES:
        return (
            f"{direction} {month} {contract_year} CAL SPREAD "
            f"{exchange_code[1:2]} MONTHS {strike}"
        )

    return None


def _mapping_value(values: Mapping[str, Any], *keys: str) -> Any:
    for key in keys:
        if key in values:
            return values[key]
    return None


def _optional_str(value: Any) -> str | None:
    if value is None:
        return None
    return str(value)


def _coalesce(*values: Any) -> Any:
    for value in values:
        if value is not None:
            return value
    return None
